import { NextRequest, NextResponse } from "next/server";
import { isAnalyticsUnlocked } from "@/lib/analytics-unlock";
import { supabaseServer } from "@/lib/db";
import { estimateLlmCostUsd } from "@/lib/llm-pricing";
import { getInviteAnalyticsAggregate } from "@/lib/invite";
import {
  getCohortAnalysis,
  getSourceAttribution,
  getTimeToHireTrend,
} from "@/lib/analytics-enhancements";

export const runtime = "nodejs";

const MATCH_STATUSES = [
  "discovered",
  "outreach_sent",
  "replied",
  "follow_up_sent",
  "scored",
  "declined",
] as const;

const PIPELINE_STAGES = ["new", "shortlisted", "contacted", "archived"] as const;

function countByKey<T extends string>(
  rows: Record<string, unknown>[],
  key: string,
  allowed: readonly T[],
): Record<T, number> {
  const counts = Object.fromEntries(allowed.map((k) => [k, 0])) as Record<T, number>;
  for (const row of rows) {
    const value = row[key] as T | null | undefined;
    if (value && counts[value] != null) counts[value]++;
  }
  return counts;
}

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  const unlocked = await isAnalyticsUnlocked();
  const sb = supabaseServer();

  let matchQuery = sb.from("matches").select(
    "id, status, pipeline_stage, match_score, interest_score, rounds_sent, job_id, interview_state, current_round_index, job:jobs ( id, title )",
  );
  if (jobId) matchQuery = matchQuery.eq("job_id", jobId);

  const usageQuery = (() => {
    let q = unlocked
      ? sb
          .from("llm_usage")
          .select("job_id, total_tokens, prompt_tokens, completion_tokens, cached_prompt_tokens, model")
      : sb.from("llm_usage").select("job_id, total_tokens");
    if (jobId) q = q.eq("job_id", jobId);
    return q;
  })();

  let schedulingSessionQuery = sb
    .from("scheduling_sessions")
    .select("id, status, created_at, updated_at, match_id");
  if (jobId) {
    schedulingSessionQuery = schedulingSessionQuery.eq(
      "match_id",
      sb.from("matches").select("id").eq("job_id", jobId) as unknown as string,
    );
  }

  let confirmedInterviewQuery = sb
    .from("scheduled_interviews")
    .select("id, confirmed_at, starts_at, prep_packet_sent_at, candidate_rescheduled_count, session_id");

  const [matchRes, queueRes, convoRes, jobsRes, usageRes, inviteRes, schedulingRes, confirmedRes, cohortRes, sourceRes, tthRes] =
    await Promise.all([
      matchQuery,
      sb.from("outreach_queue").select("status, action"),
      sb
        .from("conversations")
        .select("direction, match_id, matches!inner(job_id)")
        .eq("direction", "in"),
      sb.from("jobs").select("id, title, status"),
      usageQuery,
      getInviteAnalyticsAggregate(jobId ?? undefined),
      schedulingSessionQuery,
      confirmedInterviewQuery,
      jobId ? getCohortAnalysis(jobId).catch(() => []) : Promise.resolve([]),
      jobId ? getSourceAttribution(jobId).catch(() => []) : Promise.resolve([]),
      jobId ? getTimeToHireTrend(jobId).catch(() => []) : Promise.resolve([]),
    ]);

  if (matchRes.error) {
    return NextResponse.json({ error: matchRes.error.message }, { status: 500 });
  }

  const matches = matchRes.data ?? [];
  const statusCounts = countByKey(matches, "status", MATCH_STATUSES);
  const stageCounts = countByKey(matches, "pipeline_stage", PIPELINE_STAGES);

  const contacted = statusCounts.outreach_sent + statusCounts.replied + statusCounts.follow_up_sent;
  const replied = statusCounts.replied + statusCounts.follow_up_sent + statusCounts.scored;
  const scored = statusCounts.scored;
  const declined = statusCounts.declined;

  const replyRate = contacted > 0 ? Math.round((replied / contacted) * 100) : 0;
  const scoreRate = replied > 0 ? Math.round((scored / replied) * 100) : 0;
  const interestRates = matches
    .map((m) => m.interest_score)
    .filter((s): s is number => typeof s === "number");
  const avgInterest =
    interestRates.length > 0
      ? Math.round(interestRates.reduce((a, b) => a + b, 0) / interestRates.length)
      : null;

  const queueRows = queueRes.data ?? [];
  const queueCounts = {
    pending: queueRows.filter((q) => q.status === "pending").length,
    running: queueRows.filter((q) => q.status === "running").length,
    done: queueRows.filter((q) => q.status === "done").length,
    failed: queueRows.filter((q) => q.status === "failed").length,
  };

  // Scheduling analytics.
  const sessionRows = schedulingRes.data ?? [];
  const confirmedRows = confirmedRes.data ?? [];

  const schedulingCounts = {
    total: sessionRows.length,
    confirmed: sessionRows.filter((s) => s.status === "confirmed").length,
    pending_approval: sessionRows.filter((s) => s.status === "pending_approval").length,
    cancelled: sessionRows.filter((s) => s.status === "cancelled").length,
    expired: sessionRows.filter((s) => s.status === "expired").length,
  };

  // Average time from session created_at → confirmed (updated_at) in hours.
  const confirmTimes: number[] = sessionRows
    .filter((s) => s.status === "confirmed" && s.created_at && s.updated_at)
    .map(
      (s) =>
        (new Date(s.updated_at as string).getTime() - new Date(s.created_at as string).getTime()) /
        3_600_000,
    );
  const avgTimeToConfirmHours =
    confirmTimes.length > 0
      ? Math.round((confirmTimes.reduce((a, b) => a + b, 0) / confirmTimes.length) * 10) / 10
      : null;

  const prepPacketsSent = confirmedRows.filter((r) => r.prep_packet_sent_at != null).length;
  const totalRescheduled = confirmedRows.reduce(
    (sum, r) => sum + ((r.candidate_rescheduled_count as number) ?? 0),
    0,
  );

  const inboundConvos = convoRes.data ?? [];
  const uniqueRepliers = new Set(inboundConvos.map((c) => c.match_id)).size;

  type UsageRow = {
    job_id: string | null;
    total_tokens: number | null;
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    cached_prompt_tokens?: number | null;
    model?: string | null;
  };

  const tokensByJob = new Map<string, number>();
  const costByJob = new Map<string, number>();
  const usageRows: UsageRow[] = usageRes.error
    ? []
    : ((usageRes.data ?? []) as unknown as UsageRow[]);
  for (const row of usageRows) {
    const id = row.job_id;
    if (!id) continue;
    tokensByJob.set(id, (tokensByJob.get(id) ?? 0) + Number(row.total_tokens ?? 0));
    if (unlocked) {
      const cost = estimateLlmCostUsd({
        model: row.model ?? "gpt-4o-mini",
        prompt_tokens: Number(row.prompt_tokens ?? 0),
        completion_tokens: Number(row.completion_tokens ?? 0),
        cached_prompt_tokens: Number(row.cached_prompt_tokens ?? 0),
      });
      costByJob.set(id, (costByJob.get(id) ?? 0) + cost);
    }
  }
  const totalTokens = unlocked
    ? [...tokensByJob.values()].reduce((sum, n) => sum + n, 0)
    : 0;
  const totalCost = unlocked
    ? [...costByJob.values()].reduce((sum, n) => sum + n, 0)
    : 0;

  const interviewTotals = {
    inProgress: 0,
    hired: 0,
    rejected: 0,
    withdrawn: 0,
  };

  const perJob = new Map<
    string,
    {
      jobId: string;
      title: string;
      total: number;
      contacted: number;
      replied: number;
      scored: number;
      declined: number;
      tokens: number;
      cost: number;
      inInterview: number;
      hired: number;
      rejected: number;
    }
  >();

  for (const m of matches) {
    const job = Array.isArray(m.job) ? m.job[0] : m.job;
    const id = (job?.id as string | undefined) ?? (m.job_id as string);
    const title = (job?.title as string | undefined) ?? "Unknown job";
    const bucket = perJob.get(id) ?? {
      jobId: id,
      title,
      total: 0,
      contacted: 0,
      replied: 0,
      scored: 0,
      declined: 0,
      tokens: unlocked ? (tokensByJob.get(id) ?? 0) : 0,
      cost: unlocked ? (costByJob.get(id) ?? 0) : 0,
      inInterview: 0,
      hired: 0,
      rejected: 0,
    };
    bucket.total++;
    const iState = m.interview_state as string | undefined;
    if (iState === "in_progress") {
      bucket.inInterview++;
      interviewTotals.inProgress++;
    }
    if (iState === "hired") {
      bucket.hired++;
      interviewTotals.hired++;
    }
    if (iState === "rejected") {
      bucket.rejected++;
      interviewTotals.rejected++;
    }
    if (iState === "withdrawn") interviewTotals.withdrawn++;
    if (["outreach_sent", "replied", "follow_up_sent", "scored", "declined"].includes(m.status as string)) {
      bucket.contacted++;
    }
    if (["replied", "follow_up_sent", "scored", "declined"].includes(m.status as string)) {
      bucket.replied++;
    }
    if (m.status === "scored") bucket.scored++;
    if (m.status === "declined") bucket.declined++;
    if (unlocked) {
      bucket.tokens = tokensByJob.get(id) ?? bucket.tokens;
      bucket.cost = costByJob.get(id) ?? bucket.cost;
    }
    perJob.set(id, bucket);
  }

  if (unlocked) {
    for (const [id, tokens] of tokensByJob) {
      if (perJob.has(id)) continue;
      const job = (jobsRes.data ?? []).find((j) => j.id === id);
      perJob.set(id, {
        jobId: id,
        title: (job?.title as string | undefined) ?? "Unknown job",
        total: 0,
        contacted: 0,
        replied: 0,
        scored: 0,
        declined: 0,
        tokens,
        cost: costByJob.get(id) ?? 0,
        inInterview: 0,
        hired: 0,
        rejected: 0,
      });
    }
  }

  // Time-to-hire summary stats
  const hiredItems = (tthRes as Awaited<ReturnType<typeof getTimeToHireTrend>>).filter(
    (t) => t.status === "hired" && t.daysToHire != null,
  );
  const hiredDays = hiredItems.map((t) => t.daysToHire as number).sort((a, b) => a - b);
  const medianTimeToHire =
    hiredDays.length > 0 ? hiredDays[Math.floor(hiredDays.length / 2)] : null;
  const avgTimeToHire =
    hiredDays.length > 0
      ? Math.round(hiredDays.reduce((a, b) => a + b, 0) / hiredDays.length)
      : null;

  return NextResponse.json({
    scope: jobId ? "job" : "global",
    jobId,
    usageUnlocked: unlocked,
    invite: inviteRes,
    scheduling: {
      counts: schedulingCounts,
      avgTimeToConfirmHours,
      prepPacketsSent,
      totalRescheduled,
    },
    // Enhanced analytics (only populated when jobId is provided)
    cohorts: cohortRes,
    sourceAttribution: sourceRes,
    timeToHire: {
      data: tthRes,
      medianDays: medianTimeToHire,
      averageDays: avgTimeToHire,
      hiredCount: hiredItems.length,
    },
    totals: {
      matches: matches.length,
      candidatesWithInterest: interestRates.length,
      inboundMessages: inboundConvos.length,
      uniqueRepliers,
      jobs: (jobsRes.data ?? []).length,
      tokens: totalTokens,
      cost: totalCost,
    },
    funnel: {
      discovered: statusCounts.discovered,
      contacted,
      replied,
      scored,
      declined,
      replyRate,
      scoreRate,
      avgInterest,
    },
    statusCounts,
    stageCounts,
    queueCounts,
    interview: interviewTotals,
    perJob: [...perJob.values()].sort((a, b) => b.contacted - a.contacted),
    jobs: jobsRes.data ?? [],
  });
}
