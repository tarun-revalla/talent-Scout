import path from "node:path";
import { embed, parseResume, profileEmbeddingText } from "../llm";
import { log } from "../logger";
import type { ParsedProfile } from "../schemas";
import { supabaseServer } from "../db";
import { embeddingForDb } from "../vector";
import { scoreCandidateAgainstAllOpenJobs } from "../matching";
import { csvToProfiles } from "./csv";
import { jsonToProfiles } from "./json";
import { pdfToText } from "./pdf";
import { unzip } from "./zip";

const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20 MB

export interface DuplicatePair {
  newId: string;
  newName: string | null;
  email: string;
  existing: { id: string; name: string | null; created_at: string };
}

export interface IngestResult {
  created: number;
  skipped: number;
  errors: { name: string; error: string }[];
  candidateIds: string[];
  /** Newly created candidates whose email collides with an existing pool member. */
  duplicates: DuplicatePair[];
}

interface PendingCandidate {
  source: "pdf" | "csv" | "json";
  profile: ParsedProfile;
  rawText: string;
  /** PDF only — bytes to upload to storage. */
  pdfBuffer?: Buffer;
  /** PDF only — original filename. */
  pdfName?: string;
}

function detectKind(
  filename: string,
  mime?: string | null,
): "pdf" | "csv" | "json" | "zip" | "unknown" {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf" || mime === "application/pdf") return "pdf";
  if (ext === ".csv" || mime === "text/csv") return "csv";
  if (ext === ".json" || ext === ".ndjson" || mime === "application/json") return "json";
  if (ext === ".zip" || mime === "application/zip" || mime === "application/x-zip-compressed") return "zip";
  return "unknown";
}

function normalizeEmail(e: string | null | undefined): string | null {
  if (!e) return null;
  const t = e.trim().toLowerCase();
  return t.length ? t : null;
}

function profileToRawText(p: ParsedProfile): string {
  return [
    p.name ?? "",
    p.email ?? "",
    p.summary,
    p.skills.join(", "),
    p.experience
      .map((e) => `${e.title} at ${e.company} (${e.start ?? "?"} - ${e.end ?? "?"})`)
      .join("\n"),
    p.education.join(", "),
  ]
    .filter(Boolean)
    .join("\n");
}

async function collectFromBuffer(
  filename: string,
  buf: Buffer,
  mime: string | null,
  out: PendingCandidate[],
  errors: { name: string; error: string }[],
): Promise<void> {
  const kind = detectKind(filename, mime);
  try {
    if (kind === "pdf") {
      if (buf.length > MAX_PDF_SIZE) {
        errors.push({
          name: filename,
          error: `PDF too large (${(buf.length / 1024 / 1024).toFixed(1)} MB > ${MAX_PDF_SIZE / 1024 / 1024} MB)`,
        });
        return;
      }
      let text: string;
      try {
        text = await pdfToText(buf);
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        throw new Error(`Could not parse PDF (${msg}). The file may be corrupted.`);
      }
      if (!text || text.length < 30) {
        throw new Error(
          "No text extracted from PDF — file is likely a scanned image. OCR is not currently supported.",
        );
      }
      const profile = await parseResume(text);
      out.push({ source: "pdf", profile, rawText: text, pdfBuffer: buf, pdfName: filename });
    } else if (kind === "csv") {
      const text = buf.toString("utf8");
      const profiles = csvToProfiles(text);
      for (const profile of profiles) {
        out.push({ source: "csv", profile, rawText: profileToRawText(profile) });
      }
    } else if (kind === "json") {
      const text = buf.toString("utf8");
      const profiles = jsonToProfiles(text);
      for (const profile of profiles) {
        out.push({ source: "json", profile, rawText: profileToRawText(profile) });
      }
    } else if (kind === "zip") {
      for (const entry of unzip(buf)) {
        await collectFromBuffer(entry.name, entry.buffer, null, out, errors);
      }
    } else {
      errors.push({ name: filename, error: `Unsupported file type` });
    }
  } catch (err) {
    errors.push({ name: filename, error: err instanceof Error ? err.message : String(err) });
  }
}

const RESUME_BUCKET = "resumes";

async function persist(c: PendingCandidate): Promise<string> {
  const sb = supabaseServer();
  let resume_url: string | null = null;
  if (c.pdfBuffer && c.pdfName) {
    const key = `${crypto.randomUUID()}-${c.pdfName.replace(/[^A-Za-z0-9._-]/g, "_")}`;
    const { error: upErr } = await sb.storage
      .from(RESUME_BUCKET)
      .upload(key, c.pdfBuffer, { contentType: "application/pdf", upsert: false });
    if (upErr) {
      log.warn({ err: upErr }, "resume upload failed (continuing without storage)");
    } else {
      resume_url = key; // store the object key; sign on read
    }
  }

  const embeddingText = profileEmbeddingText(c.profile);
  const embedding = await embed(embeddingText.length ? embeddingText : c.rawText);

  const { data, error } = await sb
    .from("candidates")
    .insert({
      name: c.profile.name,
      email: normalizeEmail(c.profile.email),
      source: c.source,
      raw_text: c.rawText,
      parsed_profile: c.profile,
      resume_url,
      embedding: embeddingForDb(embedding),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * Find an earlier candidate with the same (lowercased) email. Returns the most
 * recent prior match — the recruiter is shown a confirmation modal to merge.
 */
async function findExistingByEmail(
  email: string | null,
  excludeId: string,
): Promise<{ id: string; name: string | null; created_at: string } | null> {
  if (!email) return null;
  const sb = supabaseServer();
  const { data } = await sb
    .from("candidates")
    .select("id, name, created_at")
    .eq("email", email)
    .neq("id", excludeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data
    ? { id: data.id as string, name: data.name as string | null, created_at: data.created_at as string }
    : null;
}

export async function ingestFiles(
  files: { name: string; buffer: Buffer; mime: string | null }[],
): Promise<IngestResult> {
  const pending: PendingCandidate[] = [];
  const errors: { name: string; error: string }[] = [];
  for (const f of files) {
    await collectFromBuffer(f.name, f.buffer, f.mime, pending, errors);
  }

  const candidateIds: string[] = [];
  const duplicates: DuplicatePair[] = [];
  let skipped = 0;

  for (const c of pending) {
    try {
      if (!c.profile.email && !c.profile.name) {
        skipped++;
        continue;
      }
      const id = await persist(c);
      candidateIds.push(id);

      // Duplicate detection BEFORE auto-match — we don't want to auto-engage
      // a row the recruiter is about to merge or discard.
      const normalized = normalizeEmail(c.profile.email);
      const existing = await findExistingByEmail(normalized, id);
      if (existing && normalized) {
        duplicates.push({
          newId: id,
          newName: c.profile.name,
          email: normalized,
          existing,
        });
        // Skip auto-match — re-ran by /merge or /confirm-distinct after resolution.
        continue;
      }

      try {
        await scoreCandidateAgainstAllOpenJobs(id);
      } catch (err) {
        log.warn(
          { candidateId: id, err: err instanceof Error ? err.message : String(err) },
          "auto-match: failed (continuing upload)",
        );
      }
    } catch (err) {
      errors.push({
        name: c.profile.name ?? c.profile.email ?? "(unnamed)",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { created: candidateIds.length, skipped, errors, candidateIds, duplicates };
}
