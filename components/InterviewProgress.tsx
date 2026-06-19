"use client";

import { useCallback, useEffect, useState } from "react";
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

const RECOMMENDATION_DISPLAY: Record<string, { label: string; cls: string }> = {
  strong_yes: { label: "Strong yes", cls: "bg-emerald-100 text-emerald-700" },
  yes: { label: "Yes", cls: "bg-emerald-50 text-emerald-600" },
  no: { label: "No", cls: "bg-red-50 text-red-600" },
  strong_no: { label: "Strong no", cls: "bg-red-100 text-red-700" },
};

export function InterviewProgress({
  matchId,
  interviewState,
  currentRoundIndex,
  reEligibleAfter,
  rejectionReason,
  jobRounds,
  pipelineStage,
  onChanged,
  onSchedule,
}: {
  matchId: string;
  interviewState: InterviewState | string;
  currentRoundIndex: number;
  reEligibleAfter: string | null;
  rejectionReason: string | null;
  jobRounds: InterviewRound[];
  pipelineStage: string;
  onChanged?: () => void;
  onSchedule?: () => void;
}) {
  const [events, setEvents] = useState<RoundEvent[]>([]);
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
  }, [load, interviewState, currentRoundIndex]);

  async function act(action: string, extra?: Record<string, string>) {
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
  const rounds = jobRounds.slice().sort((a, b) => a.order - b.order);
  const canStart =
    state === "not_started" &&
    rounds.length > 0 &&
    ["shortlisted", "contacted"].includes(pipelineStage);
  const inProgress = state === "in_progress";
  const coolingActive =
    state === "rejected" &&
    reEligibleAfter &&
    new Date(reEligibleAfter).getTime() > Date.now();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs uppercase tracking-wider text-slate-500 font-medium">
          Interview loop
        </h3>
        <span
          className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
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
            const done =
              state === "hired" ||
              (inProgress && idx < currentRoundIndex) ||
              (state === "rejected" && idx < (currentRoundIndex || 1));
            const current = inProgress && idx === currentRoundIndex;
            const failed =
              state === "rejected" && idx === currentRoundIndex && currentRoundIndex > 0;
            return (
              <li
                key={round.order}
                className={`flex items-start gap-2 text-xs rounded-lg px-2 py-1.5 ${
                  current ? "bg-cobalt-50 border border-cobalt-100" : ""
                }`}
              >
                {done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : failed ? (
                  <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                ) : current ? (
                  <Circle className="w-4 h-4 text-cobalt-600 fill-cobalt-100 shrink-0 mt-0.5" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{round.name}</div>
                  <div className="text-slate-500">
                    {ROUND_TYPE_LABEL[round.type] ?? round.type}
                    {round.duration_minutes ? ` · ${round.duration_minutes} min` : ""}
                    {round.interviewer_role ? ` · ${round.interviewer_role}` : ""}
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

      <div className="flex flex-wrap gap-2">
        {canStart && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("start")}
            className="inline-flex items-center gap-1 rounded-md bg-cobalt-600 hover:bg-cobalt-700 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Start interview loop
          </button>
        )}
        {inProgress && (
          <>
            {onSchedule && (
              <button
                type="button"
                disabled={busy}
                onClick={onSchedule}
                className="inline-flex items-center gap-1 rounded-md border border-cobalt-200 text-cobalt-700 hover:bg-cobalt-50 disabled:opacity-50 px-3 py-1.5 text-xs font-medium cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" /> Schedule
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("advance")}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              Pass round
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("no_show")}
              className="inline-flex items-center gap-1 rounded-md border border-amber-200 text-amber-800 hover:bg-amber-50 disabled:opacity-50 px-3 py-1.5 text-xs font-medium cursor-pointer"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UserX className="w-3.5 h-3.5" />
              )}
              No-show
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejectOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 px-3 py-1.5 text-xs font-medium cursor-pointer"
            >
              <Ban className="w-3.5 h-3.5" /> Reject
            </button>
          </>
        )}
      </div>

      {rejectOpen && inProgress && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <select
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value as RejectionReason)}
            className="text-xs rounded-md border border-slate-200 px-2 py-1.5"
          >
            {REJECTION_REASONS.map((r) => (
              <option key={r} value={r}>
                {REJECTION_REASON_LABEL[r]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("reject", { reason: rejectReason })}
            className="text-xs rounded-md bg-red-600 text-white px-3 py-1.5 hover:bg-red-700 cursor-pointer"
          >
            Confirm reject
          </button>
        </div>
      )}

      {!loading && scorecards.length > 0 && (
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Scorecards</div>
          {scorecards.map((sc) => {
            const rec = sc.recommendation
              ? RECOMMENDATION_DISPLAY[sc.recommendation]
              : null;
            return (
              <div
                key={sc.id}
                className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 text-[11px]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-700">
                    {sc.interviewer_name} · R{sc.round_index}
                  </span>
                  {sc.status === "submitted" && rec ? (
                    <span className={`px-1.5 py-0.5 rounded-full font-medium ${rec.cls}`}>
                      {rec.label}
                      {sc.overall_rating ? ` · ${sc.overall_rating}★` : ""}
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">
                      awaiting
                    </span>
                  )}
                </div>
                {sc.notes && <p className="mt-1 text-slate-500 line-clamp-3">{sc.notes}</p>}
              </div>
            );
          })}
        </div>
      )}

      {!loading && events.length > 0 && (
        <div className="pt-2 border-t border-slate-100 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">History</div>
          {events.slice(-5).map((e) => (
            <div key={e.id} className="text-[11px] text-slate-500">
              {formatLocalShort(e.created_at)} · R{e.round_index} · {e.event_type}
              {e.note ? ` — ${e.note}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
