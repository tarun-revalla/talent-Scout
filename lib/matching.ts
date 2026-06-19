import { supabaseServer } from "./db";
import { jdEmbeddingText, rerankMatch } from "./llm";
import { ParsedJDSchema, ParsedProfileSchema, type ParsedProfile } from "./schemas";
import { log } from "./logger";
import { defaultRoundsForLevel } from "./interview-defaults";
import {
  fetchCandidateIdsReservedOnOtherJobs,
  filterCandidatesAvailableForJob,
  isCandidateReservedOnOtherJobs,
} from "./candidate-availability";
import { isCoolingPeriodActive, normalizeInterviewRounds } from "./interview";
import { enqueueIfAbsent } from "./queue";
import { effectiveShortlistThreshold } from "./matching-utils";
import { generateInviteToken } from "./invite-token";
import { embeddingForDb, parseEmbedding } from "./vector";
import {
  fetchCandidateShortlist,
  fetchOpenJobShortlist,
  fetchUnscoredMatchCandidates,
  mergeShortlistRows,
} from "./vector-search";
import type { SupabaseClient } from "@supabase/supabase-js";

const SHORTLIST_SIZE = 30;
const RERANK_PARALLEL = 5;
const OPEN_JOB_SHORTLIST_SIZE = 50;

/**
 * Promote `pipeline_stage` from 'new' → 'shortlisted' for matches whose
 * match_score crosses the effective threshold. Manual moves
 * (shortlisted/contacted/archived) are preserved because we filter on
 * `pipeline_stage = 'new'` only.
 *
 * Effective threshold:
 *   - autoEnabled === true  → engageThreshold (same value the recruiter set)
 *   - autoEnabled === false → DEFAULT_SHORTLIST_THRESHOLD (85)
 *
 * Returns the number of rows promoted.
 */
async function applyAutoShortlist(
  sb: SupabaseClient,
  jobId: string,
  autoEnabled: boolean,
  engageThreshold: number,
): Promise<number> {
  const cutoff = effectiveShortlistThreshold(autoEnabled, engageThreshold);
  const { data, error } = await sb
    .from("matches")
    .update({ pipeline_stage: "shortlisted" })
    .eq("job_id", jobId)
    .eq("pipeline_stage", "new")
    .gte("match_score", cutoff)
    .select("id");
  if (error) {
    log.warn({ err: error.message, jobId }, "auto-shortlist: query failed");
    return 0;
  }
  const count = data?.length ?? 0;
  log.info({ jobId, autoEnabled, cutoff, autoShortlisted: count }, "auto-shortlist: complete");
  return count;
}

async function parallelMap<T, R>(
  items: T[],
  limit: number,
  fn: (t: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array(Math.min(limit, items.length))
    .fill(0)
    .map(async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!, i);
      }
    });
  await Promise.all(workers);
  return out;
}

export interface MatchRunResult {
  shortlistSize: number;
  reranked: number;
  autoShortlisted: number;
  autoEnqueued: number;
  threshold: number;
  errors: { candidateId: string; error: string }[];
}

export interface AutoEngageResult {
  autoEnqueued: number;
  autoShortlisted: number;
  threshold: number;
  autoEnabled: boolean;
  jobStatus: string;
}

/**
 * Enqueue outreach for discovered matches at or above the job's auto-engage
 * threshold. Called after matching completes AND when auto-engage is toggled on.
 */
export async function autoEngageForJob(jobId: string): Promise<AutoEngageResult> {
  const sb = supabaseServer();
  const { data: job, error: jobErr } = await sb
    .from("jobs")
    .select("auto_engage_threshold, auto_engage_enabled, status")
    .eq("id", jobId)
    .single();
  if (jobErr || !job) throw new Error(jobErr?.message ?? "Job not found");

  const threshold = Number(job.auto_engage_threshold ?? 55);
  const autoEnabled = Boolean(job.auto_engage_enabled);
  const jobStatus = (job.status as string) ?? "open";

  let autoShortlisted = 0;
  if (autoEnabled) {
    autoShortlisted = await applyAutoShortlist(sb, jobId, autoEnabled, threshold);
  }

  let autoEnqueued = 0;
  if (autoEnabled && jobStatus === "open") {
    const { data: toEngage, error: engErr } = await sb
      .from("matches")
      .select(
        "id, candidate_id, match_score, interview_state, re_eligible_after, candidate:candidates ( email, email_invalid )",
      )
      .eq("job_id", jobId)
      .eq("status", "discovered")
      .gte("match_score", threshold);
    if (engErr) {
      log.warn({ err: engErr.message, jobId }, "auto-engage: query failed");
    }
    const reservedElsewhere = await fetchCandidateIdsReservedOnOtherJobs(sb, jobId);
    for (const m of toEngage ?? []) {
      const cand = Array.isArray(m.candidate) ? m.candidate[0] : m.candidate;
      if (!cand?.email || cand?.email_invalid) continue;
      const candidateId = m.candidate_id as string;
      if (isCandidateReservedOnOtherJobs(candidateId, reservedElsewhere)) continue;
      if (
        m.interview_state === "rejected" &&
        isCoolingPeriodActive(m.re_eligible_after as string | null)
      ) {
        continue;
      }
      try {
        const queued = await enqueueIfAbsent(m.id as string, "send_initial");
        if (queued) autoEnqueued++;
      } catch (err) {
        log.warn(
          { matchId: m.id, err: err instanceof Error ? err.message : String(err) },
          "auto-engage: enqueue failed",
        );
      }
    }
  }

  log.info({ jobId, threshold, autoEnabled, jobStatus, autoEnqueued }, "auto-engage: complete");
  return { autoEnqueued, autoShortlisted, threshold, autoEnabled, jobStatus };
}

export async function runMatching(jobId: string): Promise<MatchRunResult> {
  const sb = supabaseServer();

  const { data: job, error: jobErr } = await sb
    .from("jobs")
    .select("id, parsed_jd, embedding, auto_engage_threshold, auto_engage_enabled, status")
    .eq("id", jobId)
    .single();
  if (jobErr || !job) throw new Error(jobErr?.message ?? "Job not found");
  if (job.status === "closed") {
    throw new Error("Job is closed — re-open it before re-running match.");
  }
  const parsedJD = ParsedJDSchema.parse(job.parsed_jd);
  const threshold = Number(job.auto_engage_threshold ?? 55);
  const autoEnabled = Boolean(job.auto_engage_enabled);

  if (!job.embedding) throw new Error("Job has no embedding (parse JD first)");

  const queryEmbedding = parseEmbedding(job.embedding);
  const { rows: vectorRows, source } = await fetchCandidateShortlist(
    sb,
    queryEmbedding,
    SHORTLIST_SIZE,
  );
  const unscoredRows = await fetchUnscoredMatchCandidates(sb, jobId, queryEmbedding);
  const merged = mergeShortlistRows(vectorRows, unscoredRows);
  const reservedElsewhere = await fetchCandidateIdsReservedOnOtherJobs(sb, jobId);
  const rows = filterCandidatesAvailableForJob(merged, reservedElsewhere);

  log.info(
    {
      jobId,
      shortlistSize: rows.length,
      source,
      unscoredMerged: unscoredRows.length,
      excludedReserved: merged.length - rows.length,
    },
    "matching: shortlist obtained",
  );

  const errors: { candidateId: string; error: string }[] = [];

  // Cache check: skip LLM call for any (job, candidate) pair that already
  // has a non-null match_score. This guarantees ±0 stability across re-runs.
  // To force re-scoring, nullify match_score (Edit JD or Force rescore).
  const { data: existingMatches } = await sb
    .from("matches")
    .select("candidate_id, match_score")
    .eq("job_id", jobId);
  const cachedScore = new Map<string, number | null>();
  for (const m of existingMatches ?? []) {
    cachedScore.set(m.candidate_id as string, m.match_score as number | null);
  }

  let scoredCount = 0;
  let cachedCount = 0;

  await parallelMap(rows, RERANK_PARALLEL, async (row) => {
    try {
      const cached = cachedScore.get(row.id);
      if (cached != null) {
        cachedCount++;
        return; // already scored — leave row untouched
      }
      const parseResult = ParsedProfileSchema.safeParse(row.parsed_profile);
      if (!parseResult.success) {
        errors.push({ candidateId: row.id, error: "candidate has no parsed_profile" });
        return;
      }
      const profile: ParsedProfile = parseResult.data;
      const explanation = await rerankMatch(parsedJD, profile, {
        jobId,
        operation: "rerank_match",
      });
      scoredCount++;

      // Don't include status: on insert, schema default is 'discovered';
      // on conflict, we MUST preserve existing status (engaged candidates
      // would otherwise reset to 'discovered' and be re-engaged below).
      const { error: upErr } = await sb
        .from("matches")
        .upsert(
          {
            job_id: jobId,
            candidate_id: row.id,
            match_score: explanation.score,
            match_explanation: explanation,
          },
          { onConflict: "job_id,candidate_id" },
        );
      if (upErr) {
        errors.push({ candidateId: row.id, error: upErr.message });
      }
    } catch (err) {
      errors.push({
        candidateId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
  log.info({ jobId, scoredCount, cachedCount }, "matching: rerank complete");

  const { autoEnqueued, autoShortlisted } = await autoEngageForJob(jobId);

  return {
    shortlistSize: rows.length,
    reranked: scoredCount,
    autoShortlisted,
    autoEnqueued,
    threshold,
    errors,
  };
}

/**
 * Score a candidate against every open job and upsert the match row.
 * Auto-engages where match_score >= job's threshold and candidate has email.
 * Called from the ingest path so newly uploaded candidates are matched
 * against all open jobs without manual intervention.
 */
export async function scoreCandidateAgainstAllOpenJobs(
  candidateId: string,
): Promise<{ jobsScored: number; autoEnqueued: number }> {
  const sb = supabaseServer();

  const { data: candidate, error: cErr } = await sb
    .from("candidates")
    .select("id, email, email_invalid, parsed_profile, embedding")
    .eq("id", candidateId)
    .single();
  if (cErr || !candidate) {
    log.warn({ candidateId, err: cErr?.message }, "auto-match: candidate not found");
    return { jobsScored: 0, autoEnqueued: 0 };
  }
  const profileParse = ParsedProfileSchema.safeParse(candidate.parsed_profile);
  if (!profileParse.success) {
    log.warn({ candidateId }, "auto-match: candidate has no parsed_profile");
    return { jobsScored: 0, autoEnqueued: 0 };
  }
  const profile = profileParse.data;

  if (!candidate.embedding) {
    log.warn({ candidateId }, "auto-match: candidate has no embedding");
    return { jobsScored: 0, autoEnqueued: 0 };
  }

  const queryEmbedding = parseEmbedding(candidate.embedding);

  // Build the job set to score: existing open-job matches (profile may have
  // changed) plus vector shortlist for discovering new job pairings.
  type JobToScore = {
    id: string;
    parsed_jd: unknown;
    auto_engage_threshold: number | null;
    auto_engage_enabled: boolean | null;
    status: string | null;
  };
  const jobsToScore = new Map<string, JobToScore>();

  const { data: existingMatches } = await sb
    .from("matches")
    .select(
      "job_id, job:jobs ( id, parsed_jd, status, auto_engage_threshold, auto_engage_enabled )",
    )
    .eq("candidate_id", candidateId);
  for (const row of existingMatches ?? []) {
    const job = Array.isArray(row.job) ? row.job[0] : row.job;
    if (!job?.id || job.status !== "open") continue;
    jobsToScore.set(job.id as string, {
      id: job.id as string,
      parsed_jd: job.parsed_jd,
      auto_engage_threshold: job.auto_engage_threshold as number | null,
      auto_engage_enabled: job.auto_engage_enabled as boolean | null,
      status: job.status as string | null,
    });
  }

  const { rows: shortlistJobs, source } = await fetchOpenJobShortlist(
    sb,
    queryEmbedding,
    OPEN_JOB_SHORTLIST_SIZE,
  );
  for (const j of shortlistJobs) {
    if (j.status !== "open") continue;
    jobsToScore.set(j.id, j);
  }

  if (jobsToScore.size === 0) return { jobsScored: 0, autoEnqueued: 0 };
  log.info(
    { candidateId, jobsToScore: jobsToScore.size, shortlist: shortlistJobs.length, source },
    "auto-match: job set obtained",
  );

  let autoEnqueued = 0;
  let autoShortlisted = 0;
  let jobsScored = 0;
  for (const j of jobsToScore.values()) {
    try {
      const jdParse = ParsedJDSchema.safeParse(j.parsed_jd);
      if (!jdParse.success) continue;
      const reservedOnOther = await fetchCandidateIdsReservedOnOtherJobs(sb, j.id);
      if (isCandidateReservedOnOtherJobs(candidateId, reservedOnOther)) continue;
      const explanation = await rerankMatch(jdParse.data, profile, {
        jobId: j.id,
        operation: "rerank_match",
      });
      jobsScored++;
      const { data: upserted, error: upErr } = await sb
        .from("matches")
        .upsert(
          {
            job_id: j.id,
            candidate_id: candidate.id as string,
            match_score: explanation.score,
            match_explanation: explanation,
          },
          { onConflict: "job_id,candidate_id" },
        )
        .select("id, status")
        .single();
      if (upErr || !upserted) continue;
      const threshold = Number(j.auto_engage_threshold ?? 55);
      const enabled = Boolean(j.auto_engage_enabled);
      autoShortlisted += await applyAutoShortlist(sb, j.id, enabled, threshold);
      if (
        enabled &&
        upserted.status === "discovered" &&
        explanation.score >= threshold &&
        candidate.email &&
        !candidate.email_invalid
      ) {
        const { data: existing } = await sb
          .from("matches")
          .select("interview_state, re_eligible_after")
          .eq("id", upserted.id as string)
          .single();
        const cooling =
          existing?.interview_state === "rejected" &&
          isCoolingPeriodActive(existing.re_eligible_after as string | null);
        if (!cooling) {
          const queued = await enqueueIfAbsent(upserted.id as string, "send_initial");
          if (queued) autoEnqueued++;
        }
      }
    } catch (err) {
      log.warn(
        { jobId: j.id, candidateId, err: err instanceof Error ? err.message : String(err) },
        "auto-match: per-job error",
      );
    }
  }

  log.info(
    { candidateId, jobsScored, autoShortlisted, autoEnqueued },
    "auto-match: complete",
  );
  return { jobsScored, autoEnqueued };
}

export interface CreateJobArgs {
  rawJD: string;
  parsedJD?: import("./schemas").ParsedJD;
  interviewRounds: import("./schemas").InterviewRound[];
  coolingPeriodMonths?: number;
  hiresTarget?: number;
}

/** Parse a raw JD, embed it, persist interview rounds, and return the new job id. */
export async function createJobFromRawJD(args: CreateJobArgs | string): Promise<string> {
  const rawJD = typeof args === "string" ? args : args.rawJD;
  const roundsInput = typeof args === "string" ? [] : args.interviewRounds;
  const coolingPeriodMonths =
    typeof args === "string" ? 6 : Math.max(1, Math.min(24, args.coolingPeriodMonths ?? 6));
  const hiresTarget =
    typeof args === "string" ? 1 : Math.max(1, Math.min(100, args.hiresTarget ?? 1));
  const preParsed = typeof args === "string" ? undefined : args.parsedJD;

  const sb = supabaseServer();
  const { data: stub, error: stubErr } = await sb
    .from("jobs")
    .insert({
      title: "Parsing…",
      raw_jd: rawJD,
      parsed_jd: {},
      interview_rounds: [],
      cooling_period_months: coolingPeriodMonths,
      hires_target: hiresTarget,
      invite_token: generateInviteToken(),
      invite_enabled: true,
    })
    .select("id")
    .single();
  if (stubErr || !stub) throw new Error(stubErr?.message ?? "job insert failed");
  const jobId = stub.id as string;

  try {
    const { parseJobDescription, embed } = await import("./llm");
    const parsed =
      preParsed ?? (await parseJobDescription(rawJD, { jobId, operation: "parse_jd" }));
    const interviewRounds =
      roundsInput.length > 0
        ? normalizeInterviewRounds(roundsInput)
        : defaultRoundsForLevel(parsed.level);
    const embedding = await embed(jdEmbeddingText(parsed), { jobId, operation: "embed_jd" });
    const { error } = await sb
      .from("jobs")
      .update({
        title: parsed.title,
        parsed_jd: parsed,
        embedding: embeddingForDb(embedding),
        interview_rounds: interviewRounds,
      })
      .eq("id", jobId);
    if (error) throw new Error(error.message);
    return jobId;
  } catch (err) {
    await sb.from("jobs").delete().eq("id", jobId);
    throw err;
  }
}

/**
 * Replace a job's raw JD text. Re-parses, re-embeds, invalidates cached
 * match scores for this job, and re-runs match. Engagement history is
 * preserved (matches.status / conversations untouched).
 */
export async function updateJobRawJD(
  jobId: string,
  rawJD: string,
): Promise<{ title: string }> {
  const { parseJobDescription, embed } = await import("./llm");
  const parsed = await parseJobDescription(rawJD, { jobId, operation: "parse_jd" });
  const embedding = await embed(jdEmbeddingText(parsed), { jobId, operation: "embed_jd" });

  const sb = supabaseServer();
  const { error } = await sb
    .from("jobs")
    .update({
      title: parsed.title,
      raw_jd: rawJD,
      parsed_jd: parsed,
      embedding: embeddingForDb(embedding),
    })
    .eq("id", jobId);
  if (error) throw new Error(error.message);

  // Invalidate cached scores so runMatching re-LLMs every candidate.
  await invalidateJobMatchScores(jobId);
  await runMatching(jobId);
  return { title: parsed.title };
}

/**
 * Nullify match_score / match_explanation for every match on this job so the
 * next runMatching call re-LLMs them. Status, rounds_sent, interest_score,
 * and conversations are preserved.
 */
export async function invalidateJobMatchScores(jobId: string): Promise<void> {
  const sb = supabaseServer();
  const { error } = await sb
    .from("matches")
    .update({ match_score: null, match_explanation: null })
    .eq("job_id", jobId);
  if (error) throw new Error(error.message);
}
