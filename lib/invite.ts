import { supabaseServer } from "./db";
import { pdfToText } from "./ingest/pdf";
import { embed, parseResume, profileEmbeddingText, rerankMatch } from "./llm";
import { log } from "./logger";
import { ParsedJDSchema, ParsedProfileSchema, type ParsedProfile } from "./schemas";
import type { InviteAnalytics, InviteEventType, PublicJobPayload } from "./invite-types";
export type { InviteAnalytics, InviteEventType, PublicJobPayload } from "./invite-types";
import { embeddingForDb } from "./vector";
import { enqueueIfAbsent } from "./queue";

const MAX_PDF_SIZE = 20 * 1024 * 1024;
const RESUME_BUCKET = "resumes";

function normalizeEmail(e: string | null | undefined): string | null {
  if (!e) return null;
  const t = e.trim().toLowerCase();
  return t.length ? t : null;
}

export async function fetchJobByInviteToken(token: string) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("jobs")
    .select("id, title, status, raw_jd, parsed_jd, invite_enabled, invite_token")
    .eq("invite_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export function toPublicJobPayload(job: {
  title: string;
  status: string | null;
  raw_jd: string;
  parsed_jd: unknown;
  invite_enabled: boolean | null;
}): PublicJobPayload {
  const parsed = ParsedJDSchema.parse(job.parsed_jd);
  const status = job.status ?? "open";
  const inviteEnabled = job.invite_enabled !== false;
  return {
    title: job.title,
    status,
    inviteEnabled,
    acceptingApplications: status === "open" && inviteEnabled,
    parsedJd: parsed,
    rawJd: job.raw_jd,
  };
}

/** Record a funnel event once per visitor per job per event type. */
export async function recordInviteEvent(
  jobId: string,
  visitorId: string,
  eventType: InviteEventType,
): Promise<{ recorded: boolean }> {
  const vid = visitorId.trim();
  if (!vid || vid.length > 128) return { recorded: false };

  const sb = supabaseServer();
  const { data: existing } = await sb
    .from("job_invite_events")
    .select("id")
    .eq("job_id", jobId)
    .eq("visitor_id", vid)
    .eq("event_type", eventType)
    .limit(1)
    .maybeSingle();
  if (existing) return { recorded: false };

  const { error } = await sb.from("job_invite_events").insert({
    job_id: jobId,
    visitor_id: vid,
    event_type: eventType,
  });
  if (error) {
    log.warn({ jobId, eventType, err: error.message }, "invite event insert failed");
    return { recorded: false };
  }
  return { recorded: true };
}

export async function getInviteAnalytics(jobId: string): Promise<InviteAnalytics> {
  const sb = supabaseServer();
  const [eventsRes, matchesRes] = await Promise.all([
    sb.from("job_invite_events").select("visitor_id, event_type").eq("job_id", jobId),
    sb.from("matches").select("candidate:candidates(source)").eq("job_id", jobId),
  ]);

  const events = eventsRes.data ?? [];
  const opens = new Set<string>();
  const started = new Set<string>();
  const completed = new Set<string>();
  let totalOpens = 0;

  for (const e of events) {
    const vid = e.visitor_id as string;
    const type = e.event_type as InviteEventType;
    if (type === "open") {
      totalOpens++;
      opens.add(vid);
    } else if (type === "started") {
      started.add(vid);
    } else if (type === "completed") {
      completed.add(vid);
    }
  }

  let applicants = 0;
  for (const m of matchesRes.data ?? []) {
    const c = Array.isArray(m.candidate) ? m.candidate[0] : m.candidate;
    if ((c as { source?: string } | null)?.source === "invite_link") applicants++;
  }

  return {
    uniqueOpens: opens.size,
    uniqueStarted: started.size,
    uniqueCompleted: completed.size,
    applicants,
    totalOpens,
  };
}

/** Aggregate invite funnel metrics globally or for one job. */
export async function getInviteAnalyticsAggregate(jobId?: string): Promise<InviteAnalytics> {
  const sb = supabaseServer();
  let eventsQuery = sb.from("job_invite_events").select("job_id, visitor_id, event_type");
  let matchesQuery = sb.from("matches").select("job_id, candidate:candidates(source)");
  if (jobId) {
    eventsQuery = eventsQuery.eq("job_id", jobId);
    matchesQuery = matchesQuery.eq("job_id", jobId);
  }

  const [eventsRes, matchesRes] = await Promise.all([eventsQuery, matchesQuery]);
  const events = eventsRes.data ?? [];
  const opens = new Set<string>();
  const started = new Set<string>();
  const completed = new Set<string>();
  let totalOpens = 0;

  for (const e of events) {
    const key = `${e.job_id as string}:${e.visitor_id as string}`;
    const type = e.event_type as InviteEventType;
    if (type === "open") {
      totalOpens++;
      opens.add(key);
    } else if (type === "started") {
      started.add(key);
    } else if (type === "completed") {
      completed.add(key);
    }
  }

  let applicants = 0;
  for (const m of matchesRes.data ?? []) {
    const c = Array.isArray(m.candidate) ? m.candidate[0] : m.candidate;
    if ((c as { source?: string } | null)?.source === "invite_link") applicants++;
  }

  return {
    uniqueOpens: opens.size,
    uniqueStarted: started.size,
    uniqueCompleted: completed.size,
    applicants,
    totalOpens,
  };
}

async function hasExistingApplication(jobId: string, email: string): Promise<boolean> {
  const sb = supabaseServer();
  const { data: candidates } = await sb.from("candidates").select("id").eq("email", email);
  if (!candidates?.length) return false;
  const ids = candidates.map((c) => c.id as string);
  const { data: match } = await sb
    .from("matches")
    .select("id")
    .eq("job_id", jobId)
    .in("candidate_id", ids)
    .limit(1)
    .maybeSingle();
  return Boolean(match);
}

export interface ApplicationInput {
  name: string;
  email: string;
  linkedin: string;
  phone?: string;
  coverNote?: string;
  resume: { name: string; buffer: Buffer };
  visitorId?: string;
}

export interface ApplicationResult {
  candidateId: string;
  matchId: string;
  matchScore: number;
}

export async function submitJobApplication(
  jobId: string,
  input: ApplicationInput,
): Promise<ApplicationResult> {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("Valid email is required");
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  const linkedin = input.linkedin.trim();
  if (!linkedin) throw new Error("LinkedIn URL is required");
  if (!input.resume.buffer.length) throw new Error("Resume is required");
  if (input.resume.buffer.length > MAX_PDF_SIZE) {
    throw new Error(`Resume too large (max ${MAX_PDF_SIZE / 1024 / 1024} MB)`);
  }

  const sb = supabaseServer();
  const { data: job, error: jobErr } = await sb
    .from("jobs")
    .select("id, status, parsed_jd, invite_enabled")
    .eq("id", jobId)
    .single();
  if (jobErr || !job) throw new Error("Job not found");
  if (job.status !== "open") throw new Error("This job is not accepting applications");
  if (job.invite_enabled === false) throw new Error("Applications are closed for this link");

  if (await hasExistingApplication(jobId, email)) {
    throw new Error("You have already applied for this role");
  }

  let text: string;
  try {
    text = await pdfToText(input.resume.buffer);
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    throw new Error(`Could not parse PDF (${msg})`);
  }
  if (!text || text.length < 30) {
    throw new Error(
      "No text extracted from PDF — file may be a scanned image. Please upload a text-based PDF.",
    );
  }

  let profile: ParsedProfile = await parseResume(text, {
    jobId,
    operation: "parse_resume_application",
  });

  profile = {
    ...profile,
    name,
    email,
    phone: input.phone?.trim() || profile.phone,
  };

  const extraLines = [
    `LinkedIn: ${input.linkedin.trim()}`,
    input.coverNote?.trim() ? `Cover note: ${input.coverNote.trim()}` : "",
  ].filter(Boolean);
  const rawText = [text, ...extraLines].join("\n\n");

  let resume_url: string | null = null;
  const key = `${crypto.randomUUID()}-${input.resume.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
  const { error: upErr } = await sb.storage
    .from(RESUME_BUCKET)
    .upload(key, input.resume.buffer, { contentType: "application/pdf", upsert: false });
  if (upErr) {
    log.warn({ err: upErr }, "application resume upload failed");
  } else {
    resume_url = key;
  }

  const embeddingText = profileEmbeddingText(profile);
  const embedding = await embed(embeddingText.length ? embeddingText : rawText, {
    jobId,
    operation: "embed_application",
  });

  const { data: candidate, error: cErr } = await sb
    .from("candidates")
    .insert({
      name,
      email,
      source: "invite_link",
      raw_text: rawText,
      parsed_profile: profile,
      resume_url,
      embedding: embeddingForDb(embedding),
    })
    .select("id")
    .single();
  if (cErr || !candidate) throw new Error(cErr?.message ?? "Failed to save application");

  const candidateId = candidate.id as string;
  const parsedJD = ParsedJDSchema.parse(job.parsed_jd);
  const profileParsed = ParsedProfileSchema.parse(profile);
  const explanation = await rerankMatch(parsedJD, profileParsed, {
    jobId,
    operation: "rerank_application",
  });

  const { data: match, error: mErr } = await sb
    .from("matches")
    .upsert(
      {
        job_id: jobId,
        candidate_id: candidateId,
        match_score: explanation.score,
        match_explanation: explanation,
        pipeline_stage: "new",
      },
      { onConflict: "job_id,candidate_id" },
    )
    .select("id")
    .single();
  if (mErr || !match) throw new Error(mErr?.message ?? "Failed to create match");

  if (input.visitorId?.trim()) {
    await recordInviteEvent(jobId, input.visitorId.trim(), "completed");
  }

  log.info({ jobId, candidateId, matchScore: explanation.score }, "invite application submitted");

  if (email) {
    try {
      await enqueueIfAbsent(match.id as string, "send_application_ack");
    } catch (err) {
      log.warn(
        { matchId: match.id, err: err instanceof Error ? err.message : String(err) },
        "application ack enqueue failed",
      );
    }
  }

  return {
    candidateId,
    matchId: match.id as string,
    matchScore: explanation.score,
  };
}
