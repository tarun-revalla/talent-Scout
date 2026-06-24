import { supabaseServer } from "./db";
import { generateSchedulingToken } from "./scheduling-token";
import { listInterviewers } from "./interviewers";

export type ScorecardRecommendation = "strong_yes" | "yes" | "no" | "strong_no";
export type ScorecardStatus = "pending" | "submitted" | "expired";

export interface ScorecardRow {
  id: string;
  match_id: string;
  round_index: number;
  interviewer_id: string;
  response_token: string;
  status: ScorecardStatus;
  recommendation: ScorecardRecommendation | null;
  overall_rating: number | null;
  technical_rating: number | null;
  communication_rating: number | null;
  notes: string | null;
  submitted_at: string | null;
  created_at: string;
}

export const RECOMMENDATION_LABEL: Record<ScorecardRecommendation, string> = {
  strong_yes: "Strong yes",
  yes: "Yes",
  no: "No",
  strong_no: "Strong no",
};

export function buildScorecardUrl(token: string, origin?: string): string {
  const base = origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/scorecard/${token}`;
}

/**
 * Create scorecard rows for every interviewer assigned to a round (round_index
 * stored 1-based; interviewers use 0-based round_index, null = all rounds).
 * Idempotent: existing rows for (match, round, interviewer) are left untouched.
 * Returns the rows that were freshly created (so callers can email only those).
 */
export async function createScorecardsForRound(
  matchId: string,
  jobId: string,
  roundIndex1Based: number,
): Promise<ScorecardRow[]> {
  const sb = supabaseServer();
  const interviewers = await listInterviewers(jobId);
  const zeroBased = roundIndex1Based - 1;
  const relevant = interviewers.filter(
    (iv) => iv.round_index === null || iv.round_index === zeroBased,
  );

  const created: ScorecardRow[] = [];
  for (const iv of relevant) {
    const { data: existing } = await sb
      .from("interviewer_scorecards")
      .select("id")
      .eq("match_id", matchId)
      .eq("round_index", roundIndex1Based)
      .eq("interviewer_id", iv.id)
      .maybeSingle();
    if (existing) continue;

    const token = generateSchedulingToken();
    const { data, error } = await sb
      .from("interviewer_scorecards")
      .insert({
        match_id: matchId,
        round_index: roundIndex1Based,
        interviewer_id: iv.id,
        response_token: token,
        status: "pending",
      })
      .select("*")
      .single();
    if (error) {
      // Unique race — skip silently.
      continue;
    }
    created.push(data as ScorecardRow);
  }
  return created;
}

export interface ScorecardContext {
  scorecard: ScorecardRow;
  interviewerName: string;
  candidateName: string | null;
  jobTitle: string;
  roundName: string;
}

const QUICK_SLACK_NOTE = "Submitted from Slack quick action.";

export function isQuickSlackScorecard(scorecard: ScorecardRow): boolean {
  return (
    scorecard.status === "submitted" &&
    scorecard.overall_rating == null &&
    scorecard.technical_rating == null &&
    scorecard.communication_rating == null &&
    scorecard.notes === QUICK_SLACK_NOTE
  );
}

export function effectiveScorecardStatus(scorecard: ScorecardRow): string {
  return isQuickSlackScorecard(scorecard) ? "pending" : scorecard.status;
}

export async function getScorecardByToken(token: string): Promise<ScorecardContext | null> {
  const sb = supabaseServer();
  const { data: scorecard } = await sb
    .from("interviewer_scorecards")
    .select("*")
    .eq("response_token", token)
    .maybeSingle();
  if (!scorecard) return null;

  const [{ data: interviewer }, { data: match }] = await Promise.all([
    sb.from("interviewers").select("name").eq("id", scorecard.interviewer_id).maybeSingle(),
    sb
      .from("matches")
      .select("candidate:candidates ( name ), job:jobs ( title, interview_rounds )")
      .eq("id", scorecard.match_id)
      .maybeSingle(),
  ]);

  const candidate = Array.isArray(match?.candidate) ? match?.candidate[0] : match?.candidate;
  const job = Array.isArray(match?.job) ? match?.job[0] : match?.job;
  const rounds = (job?.interview_rounds as { name: string; order: number }[] | null) ?? [];
  const sorted = [...rounds].sort((a, b) => a.order - b.order);
  const roundName =
    sorted[scorecard.round_index - 1]?.name ?? `Round ${scorecard.round_index}`;

  return {
    scorecard: scorecard as ScorecardRow,
    interviewerName: (interviewer?.name as string | null) ?? "Interviewer",
    candidateName: (candidate?.name as string | null) ?? null,
    jobTitle: (job?.title as string | null) ?? "the role",
    roundName,
  };
}

export interface ScorecardSubmission {
  recommendation: ScorecardRecommendation;
  overall_rating?: number | null;
  technical_rating?: number | null;
  communication_rating?: number | null;
  notes?: string | null;
}

export async function submitScorecard(
  token: string,
  input: ScorecardSubmission,
  opts?: { partial?: boolean },
): Promise<ScorecardRow> {
  const sb = supabaseServer();
  const { data: scorecard } = await sb
    .from("interviewer_scorecards")
    .select("*")
    .eq("response_token", token)
    .maybeSingle();
  if (!scorecard) throw new Error("Invalid or expired scorecard link");
  const quickOnly = isQuickSlackScorecard(scorecard as ScorecardRow);
  if (scorecard.status === "submitted" && !opts?.partial && !quickOnly) {
    throw new Error("This scorecard was already submitted");
  }
  if (scorecard.status === "submitted" && opts?.partial) {
    throw new Error("This scorecard was already submitted");
  }

  const clamp = (n: number | null | undefined): number | null => {
    if (n == null) return null;
    return Math.max(1, Math.min(5, Math.round(n)));
  };

  const now = new Date().toISOString();
  const partial = opts?.partial === true;
  const { data, error } = await sb
    .from("interviewer_scorecards")
    .update({
      status: partial ? "pending" : "submitted",
      recommendation: input.recommendation,
      overall_rating: partial ? scorecard.overall_rating : clamp(input.overall_rating),
      technical_rating: partial ? scorecard.technical_rating : clamp(input.technical_rating),
      communication_rating: partial
        ? scorecard.communication_rating
        : clamp(input.communication_rating),
      notes: partial
        ? scorecard.notes
        : input.notes?.slice(0, 4000) ?? scorecard.notes,
      submitted_at: partial ? scorecard.submitted_at : now,
      updated_at: now,
    })
    .eq("id", scorecard.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (!partial) {
    await sb.from("match_round_events").insert({
      match_id: scorecard.match_id,
      round_index: scorecard.round_index,
      event_type: "note",
      note: `Scorecard submitted: ${RECOMMENDATION_LABEL[input.recommendation]}`,
    });
  }

  return data as ScorecardRow;
}

export interface ScorecardWithInterviewer extends ScorecardRow {
  interviewer_name: string;
}

export interface JobScorecardRow extends ScorecardWithInterviewer {
  candidate_id: string | null;
  candidate_name: string | null;
}

export interface JobScorecardSummary {
  total: number;
  submitted: number;
  pending: number;
  averageOverall: number | null;
  averageTechnical: number | null;
  averageCommunication: number | null;
  recommendationCounts: Record<ScorecardRecommendation, number>;
}

export interface JobScorecardsResult {
  summary: JobScorecardSummary;
  scorecards: JobScorecardRow[];
}

/** All scorecards across every candidate in a job, plus aggregate stats. */
export async function listScorecardsForJob(jobId: string): Promise<JobScorecardsResult> {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("interviewer_scorecards")
    .select(
      "*, interviewer:interviewers ( name ), match:matches!inner ( job_id, candidate:candidates ( id, name ) )",
    )
    .eq("match.job_id", jobId)
    .order("round_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows: JobScorecardRow[] = (data ?? []).map((r) => {
    const iv = Array.isArray(r.interviewer) ? r.interviewer[0] : r.interviewer;
    const match = Array.isArray(r.match) ? r.match[0] : r.match;
    const cand = match
      ? Array.isArray(match.candidate)
        ? match.candidate[0]
        : match.candidate
      : null;
    return {
      ...(r as ScorecardRow),
      interviewer_name: (iv?.name as string | null) ?? "Interviewer",
      candidate_id: (cand?.id as string | null) ?? null,
      candidate_name: (cand?.name as string | null) ?? null,
    };
  });

  const submitted = rows.filter((r) => r.status === "submitted");
  const avg = (vals: (number | null)[]): number | null => {
    const nums = vals.filter((v): v is number => typeof v === "number");
    if (nums.length === 0) return null;
    return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
  };

  const recommendationCounts: Record<ScorecardRecommendation, number> = {
    strong_yes: 0,
    yes: 0,
    no: 0,
    strong_no: 0,
  };
  for (const r of submitted) {
    if (r.recommendation) recommendationCounts[r.recommendation]++;
  }

  return {
    summary: {
      total: rows.length,
      submitted: submitted.length,
      pending: rows.length - submitted.length,
      averageOverall: avg(submitted.map((r) => r.overall_rating)),
      averageTechnical: avg(submitted.map((r) => r.technical_rating)),
      averageCommunication: avg(submitted.map((r) => r.communication_rating)),
      recommendationCounts,
    },
    scorecards: rows,
  };
}

export async function listScorecardsForMatch(
  matchId: string,
): Promise<ScorecardWithInterviewer[]> {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("interviewer_scorecards")
    .select("*, interviewer:interviewers ( name )")
    .eq("match_id", matchId)
    .order("round_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const iv = Array.isArray(r.interviewer) ? r.interviewer[0] : r.interviewer;
    return {
      ...(r as ScorecardRow),
      interviewer_name: (iv?.name as string | null) ?? "Interviewer",
    };
  });
}

export interface ConsensusOutlier {
  interviewerId: string;
  interviewerName: string;
  dimension: "overall" | "technical" | "communication";
  value: number;
  averageValue: number;
  deviation: number;
}

export interface RoundConsensus {
  roundIndex: number;
  submittedCount: number;
  pendingCount: number;
  totalCount: number;
  overallAverage: number | null;
  technicalAverage: number | null;
  communicationAverage: number | null;
  recommendationBreakdown: Record<ScorecardRecommendation, number>;
  recommendationConsensus: ScorecardRecommendation | "split" | null;
  outliers: ConsensusOutlier[];
  autoRecommendation: "advance" | "hold" | "reject" | "hire" | null;
}

export async function getConsensusForRound(
  matchId: string,
  roundIndex: number,
): Promise<RoundConsensus> {
  const scorecards = await listScorecardsForMatch(matchId);
  const roundCards = scorecards.filter((s) => s.round_index === roundIndex && s.status === "submitted");

  const avg = (vals: (number | null)[]): number | null => {
    const nums = vals.filter((v): v is number => typeof v === "number");
    if (nums.length === 0) return null;
    return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
  };

  const overallAvg = avg(roundCards.map((s) => s.overall_rating));
  const technicalAvg = avg(roundCards.map((s) => s.technical_rating));
  const communicationAvg = avg(roundCards.map((s) => s.communication_rating));

  const recommendationBreakdown: Record<ScorecardRecommendation, number> = {
    strong_yes: 0,
    yes: 0,
    no: 0,
    strong_no: 0,
  };

  for (const card of roundCards) {
    if (card.recommendation) {
      recommendationBreakdown[card.recommendation]++;
    }
  }

  // Determine consensus recommendation
  let recommendationConsensus: ScorecardRecommendation | "split" | null = null;
  if (roundCards.length > 0) {
    const maxCount = Math.max(...Object.values(recommendationBreakdown));
    const consensusRecs = Object.entries(recommendationBreakdown)
      .filter(([_, count]) => count === maxCount)
      .map(([rec]) => rec as ScorecardRecommendation);

    if (consensusRecs.length === 1) {
      recommendationConsensus = consensusRecs[0];
    } else if (consensusRecs.length > 1) {
      recommendationConsensus = "split";
    }
  }

  // Find outliers (ratings > 1 point away from average)
  const outliers: ConsensusOutlier[] = [];
  if (overallAvg != null) {
    for (const card of roundCards) {
      if (card.overall_rating != null && Math.abs(card.overall_rating - overallAvg) > 1) {
        outliers.push({
          interviewerId: card.interviewer_id,
          interviewerName: card.interviewer_name,
          dimension: "overall",
          value: card.overall_rating,
          averageValue: overallAvg,
          deviation: card.overall_rating - overallAvg,
        });
      }
    }
  }

  if (technicalAvg != null) {
    for (const card of roundCards) {
      if (card.technical_rating != null && Math.abs(card.technical_rating - technicalAvg) > 1) {
        outliers.push({
          interviewerId: card.interviewer_id,
          interviewerName: card.interviewer_name,
          dimension: "technical",
          value: card.technical_rating,
          averageValue: technicalAvg,
          deviation: card.technical_rating - technicalAvg,
        });
      }
    }
  }

  // Auto-recommendation logic: based on consensus + some thresholds
  let autoRecommendation: "advance" | "hold" | "reject" | "hire" | null = null;
  if (recommendationConsensus === "strong_yes") {
    autoRecommendation = "advance";
  } else if (recommendationConsensus === "yes" && roundCards.length >= 2) {
    autoRecommendation = "advance";
  } else if (recommendationConsensus === "strong_no") {
    autoRecommendation = "reject";
  } else if (recommendationConsensus === "no" && roundCards.length >= 2) {
    autoRecommendation = "reject";
  } else if (recommendationConsensus === "split" && roundCards.length >= 3) {
    // For split recommendations with 3+ interviewers, check majority
    const yesVotes = (recommendationBreakdown.strong_yes ?? 0) + (recommendationBreakdown.yes ?? 0);
    const noVotes = (recommendationBreakdown.strong_no ?? 0) + (recommendationBreakdown.no ?? 0);
    if (yesVotes > noVotes) {
      autoRecommendation = "hold"; // Hold for manual review due to disagreement
    } else if (noVotes > yesVotes) {
      autoRecommendation = "hold";
    }
  }

  return {
    roundIndex,
    submittedCount: roundCards.length,
    pendingCount: scorecards.filter((s) => s.round_index === roundIndex && s.status === "pending").length,
    totalCount: scorecards.filter((s) => s.round_index === roundIndex).length,
    overallAverage: overallAvg,
    technicalAverage: technicalAvg,
    communicationAverage: communicationAvg,
    recommendationBreakdown,
    recommendationConsensus,
    outliers,
    autoRecommendation,
  };
}
