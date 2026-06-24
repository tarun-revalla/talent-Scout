"use client";

import { useMemo } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { Avatar } from "./Avatar";
import { CircularScore } from "./CircularScore";
import { SkeletonRow } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { ResumeButton } from "./ResumeButton";
import { AutoEngageStatusIcon } from "./AutoEngageStatusIcon";
import {
  combinedScore,
  type MatchRow,
  type DrawerTab,
} from "./MatchTable";
import { INTERVIEW_STATE_LABEL } from "@/lib/ui-tokens";

const STATUS_LABEL: Record<string, string> = {
  discovered: "New match",
  outreach_sent: "Outreach sent",
  replied: "Replied",
  follow_up_sent: "Follow-up sent",
  scored: "Scored",
  declined: "Declined",
  bounced: "Bounced",
};

function statusBadgeClass(
  status: string,
  interviewState?: string | null,
  roundIndex?: number | null,
): string {
  if (interviewState === "in_progress" && roundIndex) {
    return "bg-blue-100 text-blue-700";
  }
  if (interviewState === "hired") return "bg-emerald-100 text-emerald-700";
  if (status === "follow_up_sent") return "bg-slate-100 text-slate-600";
  if (status === "replied" || status === "outreach_sent") {
    return "bg-blue-50 text-blue-700";
  }
  return "bg-slate-100 text-slate-600";
}

function statusLabel(
  status: string,
  interviewState?: string | null,
  roundIndex?: number | null,
): string {
  if (interviewState === "in_progress" && roundIndex) {
    return `L${roundIndex} Interview`;
  }
  if (interviewState === "hired") {
    return INTERVIEW_STATE_LABEL.hired;
  }
  if (interviewState === "rejected") {
    return INTERVIEW_STATE_LABEL.rejected;
  }
  return STATUS_LABEL[status] ?? status;
}

function MatchScoreBar({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-300 text-xs">—</span>;
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex max-w-[6.5rem] items-center gap-1.5">
      <div className="h-1.5 w-10 shrink-0 rounded-full bg-slate-200 sm:h-2 sm:w-12">
        <div
          className="bg-cobalt-600 h-full rounded-full transition-all"
          style={{ width: `${v}%` }}
        />
      </div>
      <span className="shrink-0 text-xs font-bold text-cobalt-600 tabular-nums">
        {v}%
      </span>
    </div>
  );
}

const TABLE_GRID =
  "grid w-full min-w-0 grid-cols-[minmax(0,1.55fr)_6.5rem_5rem_4rem_minmax(5.5rem,auto)_4.75rem] items-center gap-x-2 sm:gap-x-3 px-3 sm:px-4 lg:px-5";

const HEADER_CELL =
  "min-w-0 truncate text-[10px] font-bold uppercase tracking-wide text-slate-500";

const HEADER_NUMERIC =
  "text-center text-[10px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap";

const BODY_COMBINED =
  "text-center text-sm font-bold tabular-nums text-slate-900 sm:text-base";

function CandidateIdentity({
  m,
  threshold,
  autoEnabled,
  jobOpen,
}: {
  m: MatchRow;
  threshold: number;
  autoEnabled: boolean;
  jobOpen: boolean;
}) {
  const c = m.candidate;
  return (
    <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
      <Avatar name={c?.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="min-w-0 truncate font-bold text-slate-900 text-sm sm:text-base">
            {c?.name ?? "—"}
          </p>
          {c?.source === "invite_link" && (
            <span className="shrink-0 rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700 ring-1 ring-sky-100">
              Applied
            </span>
          )}
          <AutoEngageStatusIcon
            matchScore={m.match_score}
            threshold={threshold}
            autoEnabled={autoEnabled}
            jobOpen={jobOpen}
            hasEmail={!!c?.email}
            emailInvalid={c?.email_invalid}
            status={m.status}
            interviewState={m.interview_state}
            reEligibleAfter={m.re_eligible_after}
          />
        </div>
        <p className="truncate text-[11px] text-slate-500 sm:text-xs">
          {c?.email ? (
            <span className={c.email_invalid ? "line-through" : ""}>{c.email}</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <AlertCircle className="w-3 h-3 shrink-0" /> no email
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function MobileCandidateCard({
  m,
  combined,
  threshold,
  autoEnabled,
  jobOpen,
  onOpen,
}: {
  m: MatchRow;
  combined: number | null;
  threshold: number;
  autoEnabled: boolean;
  jobOpen: boolean;
  onOpen: () => void;
}) {
  const c = m.candidate;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="md:hidden px-4 py-4 text-left hover:bg-slate-50 transition-colors cursor-pointer"
    >
      <CandidateIdentity
        m={m}
        threshold={threshold}
        autoEnabled={autoEnabled}
        jobOpen={jobOpen}
      />
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Match</p>
          <div className="mt-1 flex justify-center">
            <MatchScoreBar value={m.match_score} />
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Interest</p>
          <div className="mt-1 flex justify-center">
            <CircularScore value={m.interest_score} size="sm" />
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Combined</p>
          <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">{combined ?? "—"}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className={`truncate rounded-full px-2 py-1 text-[10px] font-semibold ${statusBadgeClass(
            m.status,
            m.interview_state,
            m.current_round_index,
          )}`}
        >
          {statusLabel(m.status, m.interview_state, m.current_round_index)}
        </span>
        {(c?.source === "pdf" || c?.source === "invite_link") && c && (
          <div onClick={(e) => e.stopPropagation()}>
            <ResumeButton candidateId={c.id} candidateName={c.name} compact />
          </div>
        )}
      </div>
    </div>
  );
}

export function TopCandidatesTable({
  rows,
  loading,
  weights,
  threshold,
  autoEnabled,
  jobOpen = true,
  onOpenCandidate,
  page,
  perPage,
  total,
  onPageChange,
}: {
  rows: MatchRow[];
  loading?: boolean;
  weights: { match: number; interest: number };
  threshold: number;
  autoEnabled: boolean;
  jobOpen?: boolean;
  onOpenCandidate: (matchId: string, tab?: DrawerTab) => void;
  page: number;
  perPage: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ca = combinedScore(a, weights) ?? -1;
      const cb = combinedScore(b, weights) ?? -1;
      if (cb !== ca) return cb - ca;
      return (b.match_score ?? 0) - (a.match_score ?? 0);
    });
  }, [rows, weights]);

  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, lastPage);
  const start = (safePage - 1) * perPage;
  const pageRows = sorted.slice(start, start + perPage);
  const showingEnd = Math.min(start + pageRows.length, total);

  if (loading) {
    return (
      <>
        <div className="md:hidden divide-y divide-slate-200">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-4 py-4 animate-pulse space-y-3">
              <div className="h-10 rounded-lg bg-slate-100" />
              <div className="h-8 rounded-lg bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} cols={5} />
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  if (!sorted.length) {
    return (
      <EmptyState
        icon={Users}
        title="No matches yet"
        description="Run match to score candidates against this job."
      />
    );
  }

  return (
    <>
      <div
        className={`${TABLE_GRID} hidden md:grid py-2.5 bg-slate-50 border-b border-slate-200`}
      >
        <div className={HEADER_CELL}>Candidate</div>
        <div className={HEADER_CELL}>Match Score</div>
        <div className={HEADER_NUMERIC}>Interest</div>
        <div className={`${HEADER_NUMERIC} truncate`}>Combined</div>
        <div className={HEADER_NUMERIC}>Status</div>
        <div className={HEADER_NUMERIC}>Actions</div>
      </div>

      <div className="divide-y divide-slate-200 min-w-0">
        {pageRows.map((m, idx) => {
          const c = m.candidate;
          const combined = combinedScore(m, weights);
          const openCandidate = () => onOpenCandidate(m.id);
          return (
            <div key={m.id}>
              <MobileCandidateCard
                m={m}
                combined={combined}
                threshold={threshold}
                autoEnabled={autoEnabled}
                jobOpen={jobOpen}
                onOpen={openCandidate}
              />
              <div
                role="button"
                tabIndex={0}
                onClick={openCandidate}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openCandidate();
                  }
                }}
                style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}
                className={`${TABLE_GRID} hidden md:grid stagger py-3 text-left hover:bg-slate-50 transition-colors cursor-pointer`}
              >
                <CandidateIdentity
                  m={m}
                  threshold={threshold}
                  autoEnabled={autoEnabled}
                  jobOpen={jobOpen}
                />
                <div className="min-w-0">
                  <MatchScoreBar value={m.match_score} />
                </div>
                <div className="flex justify-center">
                  <CircularScore value={m.interest_score} size="sm" />
                </div>
                <div className={BODY_COMBINED}>{combined ?? "—"}</div>
                <div className="flex min-w-0 justify-center">
                  <span
                    className={`max-w-full truncate rounded-full px-2 py-1 text-[10px] font-semibold sm:px-2.5 sm:py-1 sm:text-xs ${statusBadgeClass(
                      m.status,
                      m.interview_state,
                      m.current_round_index,
                    )}`}
                  >
                    {statusLabel(m.status, m.interview_state, m.current_round_index)}
                  </span>
                </div>
                <div
                  className="flex justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  {(c?.source === "pdf" || c?.source === "invite_link") && c && (
                    <ResumeButton candidateId={c.id} candidateName={c.name} compact />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {total > perPage && (
        <div className="px-3 sm:px-4 lg:px-5 py-3 flex justify-between items-center border-t border-slate-200 bg-white gap-3">
          <span className="text-sm text-slate-500 font-medium">
            Showing{" "}
            <span className="text-slate-900">
              {total === 0 ? 0 : start + 1}–{showingEnd}
            </span>{" "}
            of <span className="text-slate-900">{total}</span> candidates
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => onPageChange(safePage - 1)}
              aria-label="Previous page"
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              disabled={safePage >= lastPage}
              onClick={() => onPageChange(safePage + 1)}
              aria-label="Next page"
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
