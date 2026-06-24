"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  Play,
  ChevronRight,
  Ban,
  UserX,
  Calendar,
  SkipForward,
  RefreshCw,
} from "lucide-react";
import type { InterviewRound } from "@/lib/schemas";
import {
  INTERVIEW_STATE_LABEL,
  INTERVIEW_STATE_PILL,
  REJECTION_REASONS,
  REJECTION_REASON_LABEL,
  ROUND_TYPE_LABEL,
  type InterviewState,
  type RejectionReason,
} from "@/lib/ui-tokens";
import { formatLocalShort } from "@/lib/dates";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface RoundEvent {
  id: string;
  round_index: number;
  event_type: string;
  note: string | null;
  created_at: string;
}

interface Scorecard {
  id: string;
  round_index: number;
  status: string;
  recommendation: string | null;
  overall_rating: number | null;
  notes: string | null;
  interviewer_name: string;
}

interface RoundScheduling {
  session_id: string | null;
  session_status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  schedule_locked: boolean;
  can_reschedule: boolean;
}

const RECOMMENDATION_DISPLAY: Record<string, { label: string; cls: string }> = {
  strong_yes: { label: "Strong yes", cls: "bg-emerald-100 text-emerald-700" },
  yes: { label: "Yes", cls: "bg-emerald-50 text-emerald-600" },
  no: { label: "No", cls: "bg-red-50 text-red-600" },
  strong_no: { label: "Strong no", cls: "bg-red-100 text-red-700" },
};

function roundWasPassed(events: RoundEvent[], roundIndex: number): boolean {
  return events.some(
    (e) => e.round_index === roundIndex && e.event_type === "passed",
  );
}

function roundWasSkipped(events: RoundEvent[], roundIndex: number): boolean {
  return events.some(
    (e) =>
      e.round_index === roundIndex &&
      e.event_type === "passed" &&
      (e.note?.toLowerCase().includes("skipped") ?? false),
  );
}

function roundSubtitle(round: InterviewRound): string {
  const parts = [
    ROUND_TYPE_LABEL[round.type] ?? round.type,
    round.duration_minutes ? `${round.duration_minutes} min` : null,
    round.interviewer_role ?? null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function ActionBtn({
  children,
  onClick,
  disabled,
  variant = "secondary",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  title?: string;
}) {
  const styles = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-700",
    secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
    ghost: "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
  };
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export function InterviewProgress({
  matchId,
  interviewState,
  currentRoundIndex,
  reEligibleAfter,
  rejectionReason,
  jobRounds,
  pipelineStage,
  schedulingRefreshKey = 0,
  onChanged,
  onSchedule,
  onReschedule,
}: {
  matchId: string;
  interviewState: InterviewState | string;
  currentRoundIndex: number;
  reEligibleAfter: string | null;
  rejectionReason: string | null;
  jobRounds: InterviewRound[];
  pipelineStage: string;
  schedulingRefreshKey?: number;
  onChanged?: () => void;
  onSchedule?: () => void;
  onReschedule?: (roundIndex: number, sessionId: string) => void;
}) {
  const confirm = useConfirm();
  const [events, setEvents] = useState<RoundEvent[]>([]);
  const [scheduling, setScheduling] = useState<Record<number, RoundScheduling>>({});
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState<RejectionReason>("skills_gap");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, scRes] = await Promise.all([
        fetch(`/api/matches/${matchId}/interview`, { cache: "no-store" }),
        fetch(`/api/matches/${matchId}/scorecards`, { cache: "no-store" }),
      ]);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setEvents(json.events ?? []);
      setScheduling(json.scheduling ?? {});
      if (scRes.ok) {
        const scJson = await scRes.json();
        setScorecards(scJson.scorecards ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load, interviewState, currentRoundIndex, schedulingRefreshKey]);

  async function act(
    action: string,
    extra?: { reason?: string },
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/interview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      setRejectOpen(false);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const state = interviewState as InterviewState;
  const rounds = useMemo(
    () => jobRounds.slice().sort((a, b) => a.order - b.order),
    [jobRounds],
  );

  const canStart =
    state === "not_started" &&
    rounds.length > 0 &&
    ["shortlisted", "contacted"].includes(pipelineStage);
  const inProgress = state === "in_progress";
  const allRoundsComplete =
    inProgress &&
    rounds.length > 0 &&
    currentRoundIndex >= rounds.length &&
    roundWasPassed(events, rounds.length);

  const activeRoundIndex = useMemo(() => {
    if (canStart) return 1;
    if (inProgress && allRoundsComplete) return rounds.length;
    if (inProgress && currentRoundIndex >= 1) return currentRoundIndex;
    return null;
  }, [canStart, inProgress, allRoundsComplete, currentRoundIndex, rounds.length]);

  const onFinalRound =
    inProgress &&
    rounds.length > 0 &&
    currentRoundIndex === rounds.length &&
    !roundWasPassed(events, rounds.length);

  const coolingActive =
    state === "rejected" &&
    reEligibleAfter &&
    new Date(reEligibleAfter).getTime() > Date.now();

  const scorecardsByRound = useMemo(() => {
    const map = new Map<number, Scorecard[]>();
    for (const sc of scorecards) {
      const list = map.get(sc.round_index) ?? [];
      list.push(sc);
      map.set(sc.round_index, list);
    }
    return map;
  }, [scorecards]);

  function isRoundDone(roundIndex: number): boolean {
    if (state === "hired") return true;
    if (roundWasPassed(events, roundIndex) || roundWasSkipped(events, roundIndex)) return true;
    if (inProgress && roundIndex < currentRoundIndex) return true;
    if (state === "rejected" && roundIndex < (currentRoundIndex || 1)) return true;
    return false;
  }

  function renderRoundSchedule(roundIndex: number) {
    const scheduleInfo = scheduling[roundIndex];
    if (!scheduleInfo?.starts_at && !scheduleInfo?.can_reschedule) return null;

    const showReschedule =
      scheduleInfo.can_reschedule &&
      !isRoundDone(roundIndex) &&
      scheduleInfo.session_id &&
      onReschedule;

    return (
      <div className="flex flex-wrap items-center gap-2">
        {scheduleInfo.starts_at && (
          <p className="text-[11px] text-cobalt-700 flex items-center gap-1">
            <Calendar className="h-3 w-3 shrink-0" />
            Scheduled {formatLocalShort(scheduleInfo.starts_at)}
          </p>
        )}
        {showReschedule && (
          <ActionBtn
            disabled={busy}
            onClick={() => onReschedule(roundIndex, scheduleInfo.session_id!)}
          >
            <RefreshCw className="h-3 w-3" />
            Reschedule
          </ActionBtn>
        )}
      </div>
    );
  }

  function renderRoundActions(roundIndex: number) {
    const scheduleInfo = scheduling[roundIndex];
    const scheduleLocked = scheduleInfo?.schedule_locked ?? false;

    if (canStart && roundIndex === 1) {
      return (
        <div className="flex flex-wrap gap-1.5">
          <ActionBtn
            variant="primary"
            disabled={busy}
            onClick={() => void act("start")}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Start loop
          </ActionBtn>
        </div>
      );
    }

    if (!inProgress || activeRoundIndex !== roundIndex) return null;

    if (allRoundsComplete) {
      return (
        <div className="space-y-2">
          <p className="text-[11px] text-emerald-700">
            All rounds complete — mark as hired when ready.
          </p>
          <ActionBtn
            variant="primary"
            disabled={busy}
            onClick={() => {
              void (async () => {
                if (
                  !(await confirm(
                    "Mark this candidate as hired? This updates the pipeline and may close the job if the hire target is reached.",
                    { title: "Mark as hired", confirmLabel: "Mark as hired" },
                  ))
                ) {
                  return;
                }
                await act("hire");
              })();
            }}
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            Mark as hired
          </ActionBtn>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {scheduleLocked && !scheduleInfo?.starts_at && (
          <p className="text-[11px] text-slate-500">Scheduling in progress…</p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {onSchedule && (
            <ActionBtn
              disabled={busy || scheduleLocked}
              onClick={onSchedule}
              title={
                scheduleLocked
                  ? "A meeting is already scheduled or pending for this round"
                  : undefined
              }
            >
              <Calendar className="h-3 w-3" />
              {scheduleLocked ? "Scheduled" : "Schedule"}
            </ActionBtn>
          )}
          <ActionBtn
            variant="primary"
            disabled={busy}
            onClick={() => void act("advance")}
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {onFinalRound ? "Pass final" : "Pass"}
          </ActionBtn>
          <ActionBtn
            disabled={busy}
            onClick={() => {
              void (async () => {
                if (
                  !(await confirm("Skip this round without holding the interview?", {
                    title: "Skip round",
                    confirmLabel: "Skip",
                  }))
                ) {
                  return;
                }
                await act("skip");
              })();
            }}
          >
            <SkipForward className="h-3 w-3" />
            Skip
          </ActionBtn>
          <ActionBtn disabled={busy} onClick={() => void act("no_show")}>
            <UserX className="h-3 w-3" />
            No-show
          </ActionBtn>
          <ActionBtn
            variant="danger"
            disabled={busy}
            onClick={() => setRejectOpen((v) => !v)}
          >
            <Ban className="h-3 w-3" />
            Reject
          </ActionBtn>
        </div>

        {rejectOpen && (
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value as RejectionReason)}
              className="text-[11px] rounded-md border border-slate-200 px-2 py-1.5 bg-white"
            >
              {REJECTION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REJECTION_REASON_LABEL[r]}
                </option>
              ))}
            </select>
            <ActionBtn
              variant="danger"
              disabled={busy}
              onClick={() => void act("reject", { reason: rejectReason })}
            >
              Confirm reject
            </ActionBtn>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
          Interview loop
        </h3>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            INTERVIEW_STATE_PILL[state] ?? "bg-slate-100 text-slate-600"
          }`}
        >
          {INTERVIEW_STATE_LABEL[state] ?? state}
        </span>
      </div>

      {rounds.length === 0 ? (
        <p className="text-xs text-slate-500">No interview rounds configured for this job.</p>
      ) : (
        <ol className="space-y-2">
          {rounds.map((round, i) => {
            const idx = i + 1;
            const passed = roundWasPassed(events, idx);
            const skipped = roundWasSkipped(events, idx);
            const done =
              state === "hired" ||
              (inProgress && idx < currentRoundIndex) ||
              (inProgress && passed) ||
              (state === "rejected" && idx < (currentRoundIndex || 1));
            const isActive = activeRoundIndex === idx;
            const failed =
              state === "rejected" && idx === currentRoundIndex && currentRoundIndex > 0;
            const roundScorecards = scorecardsByRound.get(idx) ?? [];

            return (
              <li key={round.order}>
                <div
                  className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-xs transition-colors ${
                    isActive ? "bg-cobalt-50/80 ring-1 ring-cobalt-100" : ""
                  }`}
                >
                  {done ? (
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 mt-0.5 ${skipped ? "text-slate-400" : "text-emerald-600"}`}
                    />
                  ) : failed ? (
                    <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  ) : isActive ? (
                    <Circle className="w-4 h-4 text-cobalt-600 fill-cobalt-100 shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1 flex flex-col gap-2.5">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{round.name}</span>
                        {skipped && (
                          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                            Skipped
                          </span>
                        )}
                        {isActive && !done && (
                          <span className="text-[10px] font-semibold text-cobalt-600 uppercase tracking-wide">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500">{roundSubtitle(round)}</div>
                    </div>

                    {renderRoundSchedule(idx)}

                    {renderRoundActions(idx)}

                    {roundScorecards.length > 0 && (
                      <div className="space-y-1.5">
                        {roundScorecards.map((sc) => {
                          const rec = sc.recommendation
                            ? RECOMMENDATION_DISPLAY[sc.recommendation]
                            : null;
                          return (
                            <div
                              key={sc.id}
                              className="flex items-center justify-between gap-2 rounded-md bg-white/80 px-2 py-1 text-[10px] ring-1 ring-slate-100"
                            >
                              <span className="text-slate-600 truncate">{sc.interviewer_name}</span>
                              {sc.status === "submitted" && rec ? (
                                <span className={`shrink-0 px-1.5 py-0.5 rounded-full font-medium ${rec.cls}`}>
                                  {rec.label}
                                  {sc.overall_rating ? ` · ${sc.overall_rating}★` : ""}
                                </span>
                              ) : (
                                <span className="shrink-0 text-slate-400">awaiting</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {coolingActive && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          Rejected
          {rejectionReason
            ? ` (${REJECTION_REASON_LABEL[rejectionReason as RejectionReason] ?? rejectionReason})`
            : ""}
          . Eligible to re-apply after {formatLocalShort(reEligibleAfter!)}.
        </div>
      )}

      {error && (
        <div className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</div>
      )}

      {!loading && events.length > 0 && (
        <details className="group pt-1 border-t border-slate-100">
          <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-slate-400 font-semibold list-none">
            History
          </summary>
          <div className="mt-2 space-y-0.5">
            {events.slice(-6).map((e) => (
              <div key={e.id} className="text-[10px] text-slate-500">
                {formatLocalShort(e.created_at)} · R{e.round_index} · {e.event_type}
                {e.note ? ` — ${e.note}` : ""}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
