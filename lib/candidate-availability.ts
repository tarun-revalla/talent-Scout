import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "./db";
import { log } from "./logger";

/** Interview states that reserve a candidate for one job at a time. */
export const RESERVED_INTERVIEW_STATES = ["hired", "in_progress"] as const;

/**
 * Candidate IDs who are hired or in an active interview on a different job.
 * They must not appear in matching or match lists for the given job.
 */
export async function fetchCandidateIdsReservedOnOtherJobs(
  sb: SupabaseClient,
  jobId: string,
): Promise<Set<string>> {
  const { data, error } = await sb
    .from("matches")
    .select("candidate_id")
    .neq("job_id", jobId)
    .in("interview_state", [...RESERVED_INTERVIEW_STATES]);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.candidate_id as string));
}

export function isCandidateReservedOnOtherJobs(
  candidateId: string,
  reservedIds: Set<string>,
): boolean {
  return reservedIds.has(candidateId);
}

/** Drop shortlist rows for candidates reserved on another job. */
export function filterCandidatesAvailableForJob<T extends { id: string }>(
  rows: T[],
  reservedOnOtherJobs: Set<string>,
): T[] {
  return rows.filter((r) => !reservedOnOtherJobs.has(r.id));
}

/**
 * Archive match rows on other jobs when a candidate starts or completes hiring
 * on one job — keeps other job pipelines from showing them.
 */
export async function archiveMatchesOnOtherJobs(
  candidateId: string,
  activeJobId: string,
): Promise<number> {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("matches")
    .update({ pipeline_stage: "archived" })
    .eq("candidate_id", candidateId)
    .neq("job_id", activeJobId)
    .select("id");
  if (error) throw new Error(error.message);
  const count = data?.length ?? 0;
  if (count > 0) {
    log.info({ candidateId, activeJobId, archived: count }, "candidate hidden from other jobs");
  }
  return count;
}
