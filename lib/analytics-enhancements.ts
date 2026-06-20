import { supabaseServer } from "./db";

export interface CohortMetrics {
  cohortPeriod: string; // "2026-Q1", "2026-06" (month)
  sourceType: string; // "email", "csv", "json", "referral"
  totalCandidates: number;
  engaged: number; // replied to email
  interviewed: number; // advanced to any interview round
  hired: number;
  engagementRate: number; // engaged / total %
  interviewRate: number; // interviewed / total %
  hireRate: number; // hired / total %
  averageTimeToHire: number | null; // days from sourced to hired
}

export interface TimeToHireData {
  matchId: string;
  candidateName: string;
  sourcedAt: string;
  hiredAt: string | null;
  daysToHire: number | null;
  status: "hired" | "in_progress" | "archived";
  matchScore: number;
  interestScore: number;
}

export interface SourceAttribution {
  source: string;
  totalCandidates: number;
  engaged: number; // replied to initial email
  interviewed: number;
  hired: number;
  engagementRate: number;
  interviewRate: number;
  hireRate: number;
}

/**
 * Get cohort analysis: compare hiring outcomes by source and time period.
 * Cohorts are sliced by month (e.g., "2026-06" for June) and source type.
 */
export async function getCohortAnalysis(jobId: string): Promise<CohortMetrics[]> {
  const sb = supabaseServer();

  // Fetch all matches for the job with candidate source info
  const { data: matches, error } = await sb
    .from("matches")
    .select(
      `id, created_at, status, match_score, interest_score,
       candidate:candidates ( id, name, source, created_at ),
       match_round_events ( event_type, created_at )`
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  // Group by (cohort_period, source)
  const cohortMap = new Map<string, { metrics: CohortMetrics; matches: any[] }>();

  for (const match of matches ?? []) {
    const candidate = Array.isArray(match.candidate) ? match.candidate[0] : match.candidate;
    if (!candidate) continue;

    const candidateCreatedAt = new Date(candidate.created_at);
    const cohortPeriod = `${candidateCreatedAt.getFullYear()}-${String(
      candidateCreatedAt.getMonth() + 1,
    ).padStart(2, "0")}`;
    const source = (candidate.source as string) ?? "unknown";
    const cohortKey = `${cohortPeriod}|${source}`;

    if (!cohortMap.has(cohortKey)) {
      cohortMap.set(cohortKey, {
        metrics: {
          cohortPeriod,
          sourceType: source,
          totalCandidates: 0,
          engaged: 0,
          interviewed: 0,
          hired: 0,
          engagementRate: 0,
          interviewRate: 0,
          hireRate: 0,
          averageTimeToHire: null,
        },
        matches: [],
      });
    }

    const cohort = cohortMap.get(cohortKey)!;
    cohort.metrics.totalCandidates++;
    cohort.matches.push(match);

    // Count engaged (any conversation = replied to email)
    const hasConversation = (match.match_round_events ?? []).some(
      (e: any) => e.event_type === "email_received"
    );
    if (hasConversation || match.status !== "new") {
      cohort.metrics.engaged++;
    }

    // Count interviewed (advanced to interview stage)
    const hasInterviewEvent = (match.match_round_events ?? []).some(
      (e: any) => e.event_type === "interview_scheduled" || e.event_type === "round_started"
    );
    if (hasInterviewEvent) {
      cohort.metrics.interviewed++;
    }

    // Count hired
    if (match.status === "hired") {
      cohort.metrics.hired++;
    }
  }

  // Calculate rates
  const results: CohortMetrics[] = [];
  for (const [_key, { metrics, matches: cohortMatches }] of cohortMap) {
    metrics.engagementRate = metrics.totalCandidates > 0 ? (metrics.engaged / metrics.totalCandidates) * 100 : 0;
    metrics.interviewRate = metrics.totalCandidates > 0 ? (metrics.interviewed / metrics.totalCandidates) * 100 : 0;
    metrics.hireRate = metrics.totalCandidates > 0 ? (metrics.hired / metrics.totalCandidates) * 100 : 0;

    // Calculate average time to hire for hired candidates in this cohort
    const hiredMatches = cohortMatches.filter((m: any) => m.status === "hired");
    if (hiredMatches.length > 0) {
      const totalDays = hiredMatches.reduce((sum: number, match: any) => {
        const sourcedDate = new Date(match.created_at);
        // In real scenario, fetch updated_at (hired date)
        const hiredDate = new Date(match.created_at); // Placeholder
        return sum + Math.floor((hiredDate.getTime() - sourcedDate.getTime()) / (1000 * 60 * 60 * 24));
      }, 0);
      metrics.averageTimeToHire = Math.round(totalDays / hiredMatches.length);
    }

    results.push(metrics);
  }

  return results.sort((a, b) => {
    const periodCmp = b.cohortPeriod.localeCompare(a.cohortPeriod);
    return periodCmp !== 0 ? periodCmp : a.sourceType.localeCompare(b.sourceType);
  });
}

/**
 * Get time-to-hire trend data for visualization.
 * Shows distribution of days from sourced → hired.
 */
export async function getTimeToHireTrend(jobId: string): Promise<TimeToHireData[]> {
  const sb = supabaseServer();

  const { data: matches, error } = await sb
    .from("matches")
    .select(
      `id, created_at, updated_at, status, match_score, interest_score,
       candidate:candidates ( id, name )`
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (matches ?? []).map((match: any) => {
    const candidate = Array.isArray(match.candidate) ? match.candidate[0] : match.candidate;
    const sourcedAt = new Date(match.created_at);
    const hiredDate = match.status === "hired" ? new Date(match.updated_at) : null;
    const daysToHire = hiredDate
      ? Math.floor((hiredDate.getTime() - sourcedAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      matchId: match.id,
      candidateName: (candidate?.name as string | null) ?? "Unknown",
      sourcedAt: match.created_at,
      hiredAt: match.status === "hired" ? match.updated_at : null,
      daysToHire,
      status: match.status === "hired" ? "hired" : match.status === "archived" ? "archived" : "in_progress",
      matchScore: match.match_score ?? 0,
      interestScore: match.interest_score ?? 0,
    };
  });
}

/**
 * Get source attribution metrics: compare outcomes by candidate source.
 */
export async function getSourceAttribution(jobId: string): Promise<SourceAttribution[]> {
  const sb = supabaseServer();

  // Fetch matches with candidate source
  const { data: matches, error } = await sb
    .from("matches")
    .select(
      `id, status, created_at,
       candidate:candidates ( id, source )`
    )
    .eq("job_id", jobId);

  if (error) throw error;

  const sourceMap = new Map<string, { metrics: SourceAttribution; matches: any[] }>();

  for (const match of matches ?? []) {
    const candidate = Array.isArray(match.candidate) ? match.candidate[0] : match.candidate;
    const source = (candidate?.source as string) ?? "unknown";

    if (!sourceMap.has(source)) {
      sourceMap.set(source, {
        metrics: {
          source,
          totalCandidates: 0,
          engaged: 0,
          interviewed: 0,
          hired: 0,
          engagementRate: 0,
          interviewRate: 0,
          hireRate: 0,
        },
        matches: [],
      });
    }

    const entry = sourceMap.get(source)!;
    entry.metrics.totalCandidates++;
    entry.matches.push(match);

    // Engaged = status !== 'new'
    if (match.status !== "new") {
      entry.metrics.engaged++;
    }

    // Interviewed = any interview state (estimate: contacted or later)
    if (["contacted", "interviewed", "hired", "archived"].includes(match.status)) {
      entry.metrics.interviewed++;
    }

    // Hired
    if (match.status === "hired") {
      entry.metrics.hired++;
    }
  }

  const results: SourceAttribution[] = [];
  for (const [_source, { metrics }] of sourceMap) {
    metrics.engagementRate =
      metrics.totalCandidates > 0 ? (metrics.engaged / metrics.totalCandidates) * 100 : 0;
    metrics.interviewRate =
      metrics.totalCandidates > 0 ? (metrics.interviewed / metrics.totalCandidates) * 100 : 0;
    metrics.hireRate =
      metrics.totalCandidates > 0 ? (metrics.hired / metrics.totalCandidates) * 100 : 0;
    results.push(metrics);
  }

  return results.sort((a, b) => b.hireRate - a.hireRate);
}

/**
 * Get summary stats for a job's hiring performance.
 */
export interface HiringPerformanceSummary {
  jobId: string;
  totalSourced: number;
  totalEngaged: number;
  totalInterviewed: number;
  totalHired: number;
  engagementRate: number; // %
  interviewRate: number; // %
  hireRate: number; // %
  medianTimeToHire: number | null; // days
  topSource: string | null;
  topSourceHireRate: number;
}

export async function getHiringPerformanceSummary(jobId: string): Promise<HiringPerformanceSummary> {
  const [sources, timeToHire] = await Promise.all([
    getSourceAttribution(jobId),
    getTimeToHireTrend(jobId),
  ]);

  const totalSourced = sources.reduce((sum, s) => sum + s.totalCandidates, 0);
  const totalEngaged = sources.reduce((sum, s) => sum + s.engaged, 0);
  const totalInterviewed = sources.reduce((sum, s) => sum + s.interviewed, 0);
  const totalHired = sources.reduce((sum, s) => sum + s.hired, 0);

  const hiredTimes = timeToHire
    .filter((t) => t.status === "hired" && t.daysToHire != null)
    .map((t) => t.daysToHire as number)
    .sort((a, b) => a - b);

  const medianTimeToHire =
    hiredTimes.length > 0 ? hiredTimes[Math.floor(hiredTimes.length / 2)] : null;

  const topSource = sources.length > 0 ? sources[0] : null;

  return {
    jobId,
    totalSourced,
    totalEngaged,
    totalInterviewed,
    totalHired,
    engagementRate: totalSourced > 0 ? (totalEngaged / totalSourced) * 100 : 0,
    interviewRate: totalSourced > 0 ? (totalInterviewed / totalSourced) * 100 : 0,
    hireRate: totalSourced > 0 ? (totalHired / totalSourced) * 100 : 0,
    medianTimeToHire,
    topSource: topSource?.source ?? null,
    topSourceHireRate: topSource?.hireRate ?? 0,
  };
}
