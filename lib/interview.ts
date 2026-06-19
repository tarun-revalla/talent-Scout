import {
  archiveMatchesOnOtherJobs,
  fetchCandidateIdsReservedOnOtherJobs,
} from "./candidate-availability";
import { supabaseServer } from "./db";
import { enqueue } from "./queue";
import { log } from "./logger";
import {
  InterviewRoundsSchema,
  type InterviewRound,
} from "./schemas";
import type { InterviewState, RejectionReason } from "./ui-tokens";

export function normalizeInterviewRounds(input: unknown): InterviewRound[] {
  const parsed = InterviewRoundsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("interview_rounds must be a non-empty array of valid rounds");
  }
  return sortRounds(parsed.data);
}

/** Read stored rounds; returns [] when unset or invalid (no throw). */
export function parseJobRounds(input: unknown): InterviewRound[] {
  if (!Array.isArray(input) || input.length === 0) return [];
  const parsed = InterviewRoundsSchema.safeParse(input);
  if (!parsed.success) return [];
  return sortRounds(parsed.data);
}

function sortRounds(rounds: InterviewRound[]): InterviewRound[] {
  return rounds
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((r, i) => ({ ...r, order: i + 1 }));
}

export function isCoolingPeriodActive(reEligibleAfter: string | null | undefined): boolean {
  if (!reEligibleAfter) return false;
  return new Date(reEligibleAfter).getTime() > Date.now();
}

export function shouldAutoCloseJob(hiredCount: number, hiresTarget: number): boolean {
  return hiresTarget >= 1 && hiredCount >= hiresTarget;
}

/** Close the job when hired matches reach hires_target. Returns true if closed. */
export async function maybeAutoCloseJobIfHiresFilled(jobId: string): Promise<boolean> {
  const sb = supabaseServer();
  const { data: job, error: jobErr } = await sb
    .from("jobs")
    .select("hires_target, status")
    .eq("id", jobId)
    .single();
  if (jobErr || !job || job.status === "closed") return false;

  const hiresTarget = Number(job.hires_target ?? 1);
  const { count, error: countErr } = await sb
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("interview_state", "hired");
  if (countErr) throw new Error(countErr.message);

  if (!shouldAutoCloseJob(count ?? 0, hiresTarget)) return false;

  const { error: closeErr } = await sb
    .from("jobs")
    .update({ status: "closed" })
    .eq("id", jobId);
  if (closeErr) throw new Error(closeErr.message);

  log.info({ jobId, hiredCount: count, hiresTarget }, "job auto-closed: hire target reached");
  return true;
}

export function computeReEligibleAfter(rejectedAt: Date, coolingMonths: number): string {
  const d = new Date(rejectedAt);
  d.setMonth(d.getMonth() + coolingMonths);
  return d.toISOString();
}

export async function getCoolingBlock(args: {
  jobId: string;
  candidateId: string;
}): Promise<{ blocked: boolean; until: string | null; reason: string | null }> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("matches")
    .select("interview_state, re_eligible_after, rejection_reason")
    .eq("job_id", args.jobId)
    .eq("candidate_id", args.candidateId)
    .maybeSingle();

  if (!data || data.interview_state !== "rejected") {
    return { blocked: false, until: null, reason: null };
  }
  const until = (data.re_eligible_after as string | null) ?? null;
  if (!isCoolingPeriodActive(until)) {
    return { blocked: false, until, reason: null };
  }
  return {
    blocked: true,
    until,
    reason: (data.rejection_reason as string | null) ?? null,
  };
}

export async function assertNotInCooling(matchId: string): Promise<void> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("matches")
    .select("interview_state, re_eligible_after, candidate_id, job_id")
    .eq("id", matchId)
    .single();
  if (!data) throw new Error("Match not found");
  if (data.interview_state === "rejected" && isCoolingPeriodActive(data.re_eligible_after as string)) {
    const until = new Date(data.re_eligible_after as string).toLocaleDateString();
    throw new Error(`Candidate is in cooling period for this job until ${until}`);
  }
}

/** Best-effort scorecard request for a completed round; never blocks the flow. */
async function enqueueScorecardRequest(matchId: string, roundIndex: number): Promise<void> {
  try {
    await enqueue(matchId, "send_scorecard_request", { round_index: roundIndex });
  } catch (err) {
    log.warn(
      { matchId, roundIndex, err: err instanceof Error ? err.message : String(err) },
      "scorecard: enqueue request failed",
    );
  }
}

async function logRoundEvent(
  matchId: string,
  roundIndex: number,
  eventType: string,
  note?: string | null,
): Promise<void> {
  const sb = supabaseServer();
  const { error } = await sb.from("match_round_events").insert({
    match_id: matchId,
    round_index: roundIndex,
    event_type: eventType,
    note: note ?? null,
  });
  if (error) throw new Error(error.message);
}

async function loadMatchContext(matchId: string) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("matches")
    .select(
      `
      id, job_id, candidate_id, pipeline_stage, interview_state,
      current_round_index, interest_score, status,
      job:jobs ( interview_rounds, cooling_period_months, status )
    `,
    )
    .eq("id", matchId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Match not found");
  const job = Array.isArray(data.job) ? data.job[0] : data.job;
  if (!job) throw new Error("Job not found");
  const rounds = parseJobRounds(job.interview_rounds);
  return {
    match: data,
    jobStatus: job.status as string,
    rounds,
    coolingMonths: Number(job.cooling_period_months ?? 6),
  };
}

export async function startInterviewLoop(matchId: string): Promise<{
  interview_state: InterviewState;
  current_round_index: number;
}> {
  const { match, jobStatus, rounds } = await loadMatchContext(matchId);
  if (jobStatus === "closed") throw new Error("Job is closed");
  if (rounds.length === 0) throw new Error("Job has no interview rounds configured");
  if (match.interview_state !== "not_started") {
    throw new Error(`Cannot start interview from state: ${match.interview_state}`);
  }
  if (!["shortlisted", "contacted"].includes(match.pipeline_stage as string)) {
    throw new Error("Candidate must be shortlisted or contacted before starting interviews");
  }

  const sb = supabaseServer();
  const reservedElsewhere = await fetchCandidateIdsReservedOnOtherJobs(
    sb,
    match.job_id as string,
  );
  if (reservedElsewhere.has(match.candidate_id as string)) {
    throw new Error("Candidate is already in an interview process or hired for another job");
  }
  const { error } = await sb
    .from("matches")
    .update({
      interview_state: "in_progress",
      current_round_index: 1,
      last_action_at: new Date().toISOString(),
    })
    .eq("id", matchId);
  if (error) throw new Error(error.message);

  await logRoundEvent(matchId, 1, "started", rounds[0]!.name);
  await archiveMatchesOnOtherJobs(match.candidate_id as string, match.job_id as string);
  return { interview_state: "in_progress", current_round_index: 1 };
}

export async function advanceInterviewRound(
  matchId: string,
  note?: string,
): Promise<{
  interview_state: InterviewState;
  current_round_index: number;
  hired: boolean;
  job_closed?: boolean;
}> {
  const { match, jobStatus, rounds } = await loadMatchContext(matchId);
  if (jobStatus === "closed") throw new Error("Job is closed");
  if (match.interview_state !== "in_progress") {
    throw new Error("Interview is not in progress");
  }
  const idx = Number(match.current_round_index ?? 0);
  if (idx < 1 || idx > rounds.length) throw new Error("Invalid current round");

  await logRoundEvent(matchId, idx, "passed", note ?? rounds[idx - 1]!.name);

  // Request scorecards from this round's interviewers (best-effort).
  await enqueueScorecardRequest(matchId, idx);

  const sb = supabaseServer();
  if (idx >= rounds.length) {
    const { error } = await sb
      .from("matches")
      .update({
        interview_state: "hired",
        current_round_index: idx,
        pipeline_stage: "archived",
        last_action_at: new Date().toISOString(),
      })
      .eq("id", matchId);
    if (error) throw new Error(error.message);
    await logRoundEvent(matchId, idx, "hired", "Completed all interview rounds");
    await archiveMatchesOnOtherJobs(match.candidate_id as string, match.job_id as string);
    const jobClosed = await maybeAutoCloseJobIfHiresFilled(match.job_id as string);
    return {
      interview_state: "hired",
      current_round_index: idx,
      hired: true,
      job_closed: jobClosed,
    };
  }

  const next = idx + 1;
  const { error } = await sb
    .from("matches")
    .update({
      current_round_index: next,
      last_action_at: new Date().toISOString(),
    })
    .eq("id", matchId);
  if (error) throw new Error(error.message);
  await logRoundEvent(matchId, next, "started", rounds[next - 1]!.name);

  try {
    await enqueue(matchId, "send_round_pass", {
      passed_round_index: idx,
      passed_round_name: rounds[idx - 1]!.name,
      next_round_index: next,
      next_round_name: rounds[next - 1]!.name,
    });
  } catch (err) {
    log.warn(
      { matchId, err: err instanceof Error ? err.message : String(err) },
      "round-pass: enqueue email failed",
    );
  }

  return { interview_state: "in_progress", current_round_index: next, hired: false };
}

export async function rejectInInterview(
  matchId: string,
  reason: RejectionReason,
  note?: string,
): Promise<{
  interview_state: InterviewState;
  re_eligible_after: string;
}> {
  const { match, jobStatus, coolingMonths } = await loadMatchContext(matchId);
  if (jobStatus === "closed") throw new Error("Job is closed");
  if (!["in_progress", "not_started"].includes(match.interview_state as string)) {
    throw new Error("Can only reject candidates not already hired or rejected");
  }

  const rejectedAt = new Date();
  const reEligible = computeReEligibleAfter(rejectedAt, coolingMonths);
  const roundIdx = Math.max(1, Number(match.current_round_index ?? 0));

  const sb = supabaseServer();
  const { error } = await sb
    .from("matches")
    .update({
      interview_state: "rejected",
      rejected_at: rejectedAt.toISOString(),
      rejected_at_round: match.interview_state === "in_progress" ? roundIdx : null,
      rejection_reason: reason,
      re_eligible_after: reEligible,
      pipeline_stage: "archived",
      last_action_at: rejectedAt.toISOString(),
    })
    .eq("id", matchId);
  if (error) throw new Error(error.message);

  if (match.interview_state === "in_progress") {
    await logRoundEvent(matchId, roundIdx, "failed", note ?? reason);
    // Capture interviewer feedback on the round the candidate was rejected in.
    await enqueueScorecardRequest(matchId, roundIdx);
  }

  // Send a kind decline email when the job has opted in (best-effort; the
  // handler re-checks the flag and rejected state before sending).
  try {
    await enqueue(matchId, "send_decline", { reason });
  } catch (err) {
    log.warn(
      { matchId, err: err instanceof Error ? err.message : String(err) },
      "reject: enqueue decline email failed",
    );
  }

  return { interview_state: "rejected", re_eligible_after: reEligible };
}

export async function withdrawFromInterview(
  matchId: string,
  note?: string,
): Promise<{ interview_state: InterviewState }> {
  const { match, jobStatus } = await loadMatchContext(matchId);
  if (jobStatus === "closed") throw new Error("Job is closed");
  if (!["in_progress", "not_started"].includes(match.interview_state as string)) {
    throw new Error("Cannot withdraw from current state");
  }

  const sb = supabaseServer();
  const { error } = await sb
    .from("matches")
    .update({
      interview_state: "withdrawn",
      pipeline_stage: "archived",
      last_action_at: new Date().toISOString(),
    })
    .eq("id", matchId);
  if (error) throw new Error(error.message);

  const roundIdx = Math.max(1, Number(match.current_round_index ?? 1));
  await logRoundEvent(matchId, roundIdx, "withdrawn", note ?? "Candidate withdrew");
  return { interview_state: "withdrawn" };
}

export async function recordInterviewNoShow(
  matchId: string,
  note?: string,
): Promise<{ queued: boolean }> {
  const { match, jobStatus, rounds } = await loadMatchContext(matchId);
  if (jobStatus === "closed") throw new Error("Job is closed");
  if (match.interview_state !== "in_progress") {
    throw new Error("No-show can only be recorded during an active interview");
  }
  const idx = Number(match.current_round_index ?? 0);
  if (idx < 1 || idx > rounds.length) throw new Error("Invalid current round");

  const roundName = rounds[idx - 1]!.name;
  await logRoundEvent(matchId, idx, "no_show", note ?? `No-show for ${roundName}`);

  try {
    await enqueue(matchId, "send_no_show", {
      round_index: idx,
      round_name: roundName,
    });
    return { queued: true };
  } catch (err) {
    log.warn(
      { matchId, err: err instanceof Error ? err.message : String(err) },
      "no_show: enqueue email failed",
    );
    return { queued: false };
  }
}

export async function clearExpiredRejection(matchId: string): Promise<boolean> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("matches")
    .select("interview_state, re_eligible_after")
    .eq("id", matchId)
    .single();
  if (!data || data.interview_state !== "rejected") return false;
  if (isCoolingPeriodActive(data.re_eligible_after as string)) return false;

  const { error } = await sb
    .from("matches")
    .update({
      interview_state: "not_started",
      current_round_index: 0,
      rejected_at: null,
      rejected_at_round: null,
      rejection_reason: null,
      re_eligible_after: null,
      pipeline_stage: "new",
    })
    .eq("id", matchId);
  if (error) throw new Error(error.message);
  return true;
}

export async function getInterviewTimeline(matchId: string) {
  const sb = supabaseServer();
  const [{ data: events }, ctx] = await Promise.all([
    sb
      .from("match_round_events")
      .select("id, round_index, event_type, note, created_at")
      .eq("match_id", matchId)
      .order("created_at", { ascending: true }),
    loadMatchContext(matchId).catch(() => null),
  ]);
  return {
    events: events ?? [],
    rounds: ctx?.rounds ?? [],
    match: ctx?.match ?? null,
    coolingMonths: ctx?.coolingMonths ?? 6,
  };
}

export { defaultRoundsForLevel } from "./interview-defaults";
