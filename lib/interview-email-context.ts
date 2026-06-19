import type { InterviewRound } from "./schemas";
import { parseJobRounds } from "./interview";
import { ROUND_TYPE_LABEL } from "./ui-tokens";

export interface InterviewProgressContext {
  interview_state: string;
  current_round_index: number;
}

/** Compact round facts safe to pass into follow-up email composition. */
export function interviewRoundsForEmail(raw: unknown): InterviewRound[] {
  return parseJobRounds(raw);
}

/** Rounds shaped for follow-up emails — mirrors UI field "What this round covers". */
export function formatRoundsForCandidateReply(rounds: InterviewRound[]) {
  return rounds
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((r) => ({
      order: r.order,
      name: r.name,
      type: ROUND_TYPE_LABEL[r.type] ?? r.type,
      duration_minutes: r.duration_minutes,
      interviewer_role: r.interviewer_role,
      what_this_round_covers: r.description?.trim() || null,
    }));
}

export function buildInterviewProgressSummary(
  rounds: InterviewRound[],
  progress: InterviewProgressContext,
): string {
  if (!rounds.length) return "No interview rounds configured for this job yet.";
  const sorted = rounds.slice().sort((a, b) => a.order - b.order);
  const lines = sorted.map((r) => {
    const type = ROUND_TYPE_LABEL[r.type] ?? r.type;
    const dur = r.duration_minutes ? `${r.duration_minutes} min` : "duration TBD";
    const role = r.interviewer_role ? `Interviewer: ${r.interviewer_role}` : null;
    const covers = r.description?.trim()
      ? `Covers: ${r.description.trim()}`
      : "Covers: (not specified)";
    const meta = [type, dur, role].filter(Boolean).join(" · ");
    return `Round ${r.order}: ${r.name}\n  ${meta}\n  ${covers}`;
  });
  const status =
    progress.interview_state === "in_progress"
      ? `Candidate is currently on round ${progress.current_round_index} of ${sorted.length}.`
      : progress.interview_state === "not_started"
        ? "Interview loop has not started yet for this candidate."
        : `Interview status: ${progress.interview_state}.`;
  return `${status}\n${lines.join("\n")}`;
}
