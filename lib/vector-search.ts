import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "./logger";
import { cosineDistance, formatEmbeddingForRpc, parseEmbedding } from "./vector";

export interface CandidateShortlistRow {
  id: string;
  name: string | null;
  email: string | null;
  parsed_profile: unknown;
  distance: number;
}

export interface OpenJobShortlistRow {
  id: string;
  parsed_jd: unknown;
  auto_engage_threshold: number | null;
  auto_engage_enabled: boolean | null;
  status: string | null;
  distance: number;
}

async function fetchCandidateShortlistViaRpc(
  sb: SupabaseClient,
  queryEmbedding: number[],
  limit: number,
): Promise<CandidateShortlistRow[] | null> {
  const { data, error } = await sb.rpc("match_candidates", {
    query_embedding_text: formatEmbeddingForRpc(queryEmbedding),
    match_count: limit,
  });
  if (error) {
    log.warn({ err: error.message }, "vector-search: match_candidates RPC failed");
    return null;
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: (row.name as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    parsed_profile: row.parsed_profile,
    distance: Number(row.distance),
  }));
}

async function countEmbeddableCandidates(sb: SupabaseClient): Promise<number> {
  const { count, error } = await sb
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .not("embedding", "is", null);
  if (error) {
    log.warn({ err: error.message }, "vector-search: candidate count failed");
    return 0;
  }
  return count ?? 0;
}

async function countEmbeddableOpenJobs(sb: SupabaseClient): Promise<number> {
  const { count, error } = await sb
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .not("embedding", "is", null);
  if (error) {
    log.warn({ err: error.message }, "vector-search: open job count failed");
    return 0;
  }
  return count ?? 0;
}

async function fetchCandidateShortlistViaJs(
  sb: SupabaseClient,
  queryEmbedding: number[],
  limit: number,
): Promise<CandidateShortlistRow[]> {
  const { data: candRows, error } = await sb
    .from("candidates")
    .select("id, name, email, parsed_profile, embedding")
    .not("embedding", "is", null);
  if (error) throw new Error(error.message);

  const scored = (candRows ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string | null,
    email: c.email as string | null,
    parsed_profile: c.parsed_profile,
    distance: cosineDistance(queryEmbedding, parseEmbedding(c.embedding)),
  }));
  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, limit);
}

export async function fetchCandidateShortlist(
  sb: SupabaseClient,
  queryEmbedding: number[],
  limit: number,
): Promise<{ rows: CandidateShortlistRow[]; source: "pgvector" | "js" }> {
  const rpcRows = await fetchCandidateShortlistViaRpc(sb, queryEmbedding, limit);
  if (rpcRows !== null && rpcRows.length > 0) {
    return { rows: rpcRows, source: "pgvector" };
  }
  if (rpcRows !== null && rpcRows.length === 0) {
    const embeddable = await countEmbeddableCandidates(sb);
    if (embeddable === 0) {
      return { rows: [], source: "pgvector" };
    }
    log.warn(
      { embeddableCandidates: embeddable },
      "vector-search: match_candidates RPC returned 0 rows — falling back to JS",
    );
  }
  const jsRows = await fetchCandidateShortlistViaJs(sb, queryEmbedding, limit);
  return { rows: jsRows, source: "js" };
}

async function fetchOpenJobShortlistViaRpc(
  sb: SupabaseClient,
  queryEmbedding: number[],
  limit: number,
): Promise<OpenJobShortlistRow[] | null> {
  const { data, error } = await sb.rpc("match_open_jobs", {
    query_embedding_text: formatEmbeddingForRpc(queryEmbedding),
    match_count: limit,
  });
  if (error) {
    log.warn({ err: error.message }, "vector-search: match_open_jobs RPC failed");
    return null;
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    parsed_jd: row.parsed_jd,
    auto_engage_threshold: row.auto_engage_threshold as number | null,
    auto_engage_enabled: row.auto_engage_enabled as boolean | null,
    status: row.status as string | null,
    distance: Number(row.distance),
  }));
}

async function fetchOpenJobShortlistViaJs(
  sb: SupabaseClient,
  queryEmbedding: number[],
  limit: number,
): Promise<OpenJobShortlistRow[]> {
  const { data: jobs, error } = await sb
    .from("jobs")
    .select("id, parsed_jd, embedding, auto_engage_threshold, auto_engage_enabled, status")
    .eq("status", "open")
    .not("embedding", "is", null);
  if (error) throw new Error(error.message);

  const scored = (jobs ?? []).map((j) => ({
    id: j.id as string,
    parsed_jd: j.parsed_jd,
    auto_engage_threshold: j.auto_engage_threshold as number | null,
    auto_engage_enabled: j.auto_engage_enabled as boolean | null,
    status: j.status as string | null,
    distance: cosineDistance(queryEmbedding, parseEmbedding(j.embedding)),
  }));
  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, limit);
}

export async function fetchOpenJobShortlist(
  sb: SupabaseClient,
  queryEmbedding: number[],
  limit: number,
): Promise<{ rows: OpenJobShortlistRow[]; source: "pgvector" | "js" }> {
  const rpcRows = await fetchOpenJobShortlistViaRpc(sb, queryEmbedding, limit);
  if (rpcRows !== null && rpcRows.length > 0) {
    return { rows: rpcRows, source: "pgvector" };
  }
  if (rpcRows !== null && rpcRows.length === 0) {
    const embeddable = await countEmbeddableOpenJobs(sb);
    if (embeddable === 0) {
      return { rows: [], source: "pgvector" };
    }
    log.warn(
      { embeddableOpenJobs: embeddable },
      "vector-search: match_open_jobs RPC returned 0 rows — falling back to JS",
    );
  }
  const jsRows = await fetchOpenJobShortlistViaJs(sb, queryEmbedding, limit);
  return { rows: jsRows, source: "js" };
}

/** Candidates on this job that still need a match_score (e.g. after JD invalidation). */
export async function fetchUnscoredMatchCandidates(
  sb: SupabaseClient,
  jobId: string,
  queryEmbedding: number[],
): Promise<CandidateShortlistRow[]> {
  const { data, error } = await sb
    .from("matches")
    .select(
      "candidate_id, candidate:candidates ( id, name, email, parsed_profile, embedding )",
    )
    .eq("job_id", jobId)
    .is("match_score", null);
  if (error) {
    log.warn({ err: error.message, jobId }, "vector-search: unscored matches query failed");
    return [];
  }

  const rows: CandidateShortlistRow[] = [];
  for (const m of data ?? []) {
    const c = Array.isArray(m.candidate) ? m.candidate[0] : m.candidate;
    if (!c?.id) continue;
    let distance = 1;
    if (c.embedding) {
      try {
        distance = cosineDistance(queryEmbedding, parseEmbedding(c.embedding));
      } catch {
        distance = 1;
      }
    }
    rows.push({
      id: c.id as string,
      name: (c.name as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      parsed_profile: c.parsed_profile,
      distance,
    });
  }
  return rows;
}

export function mergeShortlistRows(
  primary: CandidateShortlistRow[],
  extra: CandidateShortlistRow[],
): CandidateShortlistRow[] {
  const byId = new Map(primary.map((r) => [r.id, r]));
  for (const row of extra) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) => a.distance - b.distance);
}
