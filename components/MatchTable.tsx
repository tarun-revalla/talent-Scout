"use client";

import { Fragment, useMemo } from "react";
import { Eye, Mail, Trash2, Zap, AlertCircle, Users } from "lucide-react";
import { INTERVIEW_STATE_LABEL, INTERVIEW_STATE_PILL } from "@/lib/ui-tokens";
import { Avatar } from "./Avatar";
import { SkeletonRow, SkeletonCard } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { useConfirm } from "@/components/ui/ConfirmDialog";

export type DrawerTab = "overview" | "activity" | "feedback";

export function combinedScore(
  row: { match_score: number | null; interest_score: number | null },
  weights: { match: number; interest: number },
): number | null {
  if (row.match_score == null) return null;
  const m = row.match_score ?? 0;
  const i = row.interest_score ?? 0;
  return Math.round(weights.match * m + weights.interest * i);
}

export interface MatchRow {
  id: string;
  match_score: number | null;
  match_explanation: {
    score?: number;
    matched_skills?: string[];
    gaps?: string[];
    experience_fit?: "strong" | "partial" | "weak";
    summary?: string;
  } | null;
  status: string;
  rounds_sent: number;
  interest_score: number | null;
  interest_breakdown: unknown;
  combined_score: number | null;
  last_action_at: string | null;
  /** Per-match pipeline stage (Shortlisted / Contacted / Archived). */
  pipeline_stage?: string | null;
  interview_state?: string | null;
  current_round_index?: number | null;
  re_eligible_after?: string | null;
  rejection_reason?: string | null;
  candidate: {
    id: string;
    name: string | null;
    email: string | null;
    email_invalid?: boolean | null;
    source: string | null;
    parsed_profile: { skills?: string[]; years?: number | null } | null;
  } | null;
}

const STATUS_BADGE: Record<string, string> = {
  discovered: "bg-slate-100 text-slate-700",
  outreach_sent: "bg-blue-50 text-blue-700",
  replied: "bg-cobalt-50 text-cobalt-700",
  follow_up_sent: "bg-blue-50 text-blue-700",
  scored: "bg-emerald-50 text-emerald-700",
  declined: "bg-red-50 text-red-700",
  bounced: "bg-amber-50 text-amber-700",
};

const STATUS_LABEL: Record<string, string> = {
  discovered: "Discovered",
  outreach_sent: "Sent",
  replied: "Replied",
  follow_up_sent: "Follow-up sent",
  scored: "Scored",
  declined: "Declined",
  bounced: "Bounced",
};

function ScoreBar({
  value,
  color,
  compact = false,
}: {
  value: number | null;
  color: "match" | "interest" | "combined";
  compact?: boolean;
}) {
  if (value == null) {
    return <span className="text-slate-300">—</span>;
  }
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const fill =
    color === "match"
      ? "bg-emerald-500"
      : color === "interest"
        ? "bg-blue-500"
        : "bg-cobalt-600";
  const text =
    v >= 80
      ? "text-emerald-700"
      : v >= 60
        ? "text-amber-700"
        : "text-slate-700";
  return (
    <div className={`flex items-center gap-1.5 ${compact ? "" : "min-w-[110px]"}`}>
      <span className={`font-semibold tabular-nums w-9 text-right ${text}`}>
        {v}%
      </span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[16px]">
        <div className={`h-full ${fill} rounded-full`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export function MatchTable({
  rows,
  loading,
  selected,
  onToggleSelected,
  weights,
  threshold,
  onOpenCandidate,
  onDelete,
  compact = false,
}: {
  rows: MatchRow[];
  loading?: boolean;
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
  weights: { match: number; interest: number };
  threshold: number;
  onOpenCandidate: (matchId: string, tab?: DrawerTab) => void;
  onDelete?: (matchId: string, candidateName: string | null) => void;
  /** When the drawer is open we hide Match / Interest columns so the table fits. */
  compact?: boolean;
}) {
  const confirm = useConfirm();
  // Column widths flex when the drawer is open: bars shrink, score numbers stay legible.
  const scoreColW = compact ? "w-28" : "w-44";
  const actionsColW = compact ? "w-20" : "w-28";
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ca = combinedScore(a, weights) ?? -1;
      const cb = combinedScore(b, weights) ?? -1;
      if (cb !== ca) return cb - ca;
      return (b.match_score ?? 0) - (a.match_score ?? 0);
    });
  }, [rows, weights]);

  if (loading) {
    return (
      <>
        <div className="hidden md:block rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-3 w-8"></th>
                <th className="text-left px-3 py-3 font-medium">Candidate</th>
                <th className={`text-left px-3 py-3 font-medium ${scoreColW}`}>Match</th>
                <th className={`text-left px-3 py-3 font-medium ${scoreColW}`}>Interest</th>
                <th className={`text-left px-3 py-3 font-medium ${scoreColW}`}>Combined</th>
                <th className="text-left px-3 py-3 font-medium">Status</th>
                <th className={`px-3 py-3 ${actionsColW}`}></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonRow key={i} cols={7} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </>
    );
  }

  if (!sorted.length) {
    return (
      <EmptyState
        icon={Users}
        title="No matches yet"
        description="Click Find matches to score the candidate pool against this JD. New candidates added to the pool will be matched automatically."
      />
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="px-3 py-3 w-8"></th>
              <th className="text-left px-3 py-3 font-medium">Candidate</th>
              <th className={`text-left px-3 py-3 font-medium ${scoreColW}`}>Match</th>
              <th className={`text-left px-3 py-3 font-medium ${scoreColW}`}>Interest</th>
              <th className={`text-left px-3 py-3 font-medium ${scoreColW}`}>Combined</th>
              <th className="text-left px-3 py-3 font-medium">Status</th>
              <th className={`px-3 py-3 ${actionsColW}`}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, idx) => {
              const c = m.candidate;
              const canEngage = !!c?.email;
              const combined = combinedScore(m, weights);
              const aboveThreshold =
                m.match_score != null && m.match_score >= threshold;
              return (
                <Fragment key={m.id}>
                  <tr
                    style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}
                    className="stagger border-t border-slate-100 cursor-pointer hover:bg-slate-50/60"
                    onClick={() => onOpenCandidate(m.id)}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        disabled={!canEngage}
                        checked={selected.has(m.id)}
                        onChange={() => onToggleSelected(m.id)}
                        aria-label={`Select ${c?.name ?? "candidate"}`}
                        className="accent-cobalt-600 w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={c?.name} size="md" />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">
                            {c?.name ?? "—"}
                          </div>
                          <div className="text-xs text-slate-500 inline-flex items-center gap-1.5 mt-0.5">
                            {canEngage ? (
                              <>
                                <span
                                  className={
                                    c?.email_invalid
                                      ? "line-through text-slate-400"
                                      : ""
                                  }
                                >
                                  {c?.email}
                                </span>
                                {c?.email_invalid && (
                                  <span
                                    title="Previous outreach bounced"
                                    className="text-[9px] font-medium uppercase tracking-wide px-1 rounded bg-red-50 text-red-700 border border-red-200"
                                  >
                                    invalid
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-700">
                                <AlertCircle className="w-3 h-3" /> no email
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <ScoreBar value={m.match_score} color="match" compact={compact} />
                    </td>
                    <td className="px-3 py-3">
                      <ScoreBar value={m.interest_score} color="interest" compact={compact} />
                    </td>
                    <td className="px-3 py-3">
                      <ScoreBar value={combined} color="combined" compact={compact} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                            STATUS_BADGE[m.status] ?? "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {STATUS_LABEL[m.status] ?? m.status}
                        </span>
                        {aboveThreshold && canEngage && (
                          <span
                            title={`Above auto-engage threshold (${Math.round(threshold)}%)`}
                            className="inline-flex items-center text-[10px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 shrink-0"
                          >
                            <Zap className="w-2.5 h-2.5" />
                          </span>
                        )}
                        {m.interview_state && m.interview_state !== "not_started" && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              INTERVIEW_STATE_PILL[m.interview_state as keyof typeof INTERVIEW_STATE_PILL] ??
                              "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {INTERVIEW_STATE_LABEL[m.interview_state as keyof typeof INTERVIEW_STATE_LABEL] ??
                              m.interview_state}
                            {m.interview_state === "in_progress" && m.current_round_index
                              ? ` R${m.current_round_index}`
                              : ""}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-0.5 justify-end text-slate-400">
                        <button
                          onClick={() => onOpenCandidate(m.id, "overview")}
                          title="View profile"
                          aria-label="View profile"
                          className="p-1.5 rounded-md hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canEngage && (
                          <button
                            onClick={() => onOpenCandidate(m.id, "activity")}
                            title="Open email transcript"
                            aria-label="Open email transcript"
                            className="p-1.5 rounded-md hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => {
                              void (async () => {
                                if (
                                  await confirm(
                                    `Remove ${c?.name ?? "this candidate"} from this job?`,
                                    {
                                      title: "Remove from job",
                                      confirmLabel: "Remove",
                                      variant: "danger",
                                    },
                                  )
                                ) {
                                  onDelete(m.id, c?.name ?? null);
                                }
                              })();
                            }}
                            title="Remove from this job"
                            aria-label="Remove from this job"
                            className="p-1.5 rounded-md hover:bg-red-50 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {sorted.map((m, idx) => {
          const c = m.candidate;
          const canEngage = !!c?.email;
          const combined = combinedScore(m, weights);
          return (
            <button
              key={m.id}
              style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}
              onClick={() => onOpenCandidate(m.id)}
              className="stagger w-full text-left rounded-xl border border-slate-200 bg-white p-3 cursor-pointer hover:bg-slate-50/60 hover:shadow-sm"
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  disabled={!canEngage}
                  checked={selected.has(m.id)}
                  onChange={() => onToggleSelected(m.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${c?.name ?? "candidate"}`}
                  className="mt-1 accent-cobalt-600 w-4 h-4 cursor-pointer"
                />
                <Avatar name={c?.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-slate-900 truncate">
                      {c?.name ?? "—"}
                    </div>
                    <span
                      className={`ml-auto text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        STATUS_BADGE[m.status] ?? "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {STATUS_LABEL[m.status] ?? m.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                    {c?.email ?? "no email"}
                  </div>
                  <div className="space-y-1.5 mt-2.5">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-slate-500 w-14">Match</span>
                      <ScoreBar value={m.match_score} color="match" />
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-slate-500 w-14">Interest</span>
                      <ScoreBar value={m.interest_score} color="interest" />
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-slate-500 w-14">Combined</span>
                      <ScoreBar value={combined} color="combined" />
                    </div>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
