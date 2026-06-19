"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Calendar, Check, Loader2, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { formatLocalShort } from "@/lib/dates";
import type { InterviewRound } from "@/lib/schemas";

interface Interviewer {
  id: string;
  name: string;
  email: string;
  round_index: number | null;
}

interface FreeSlot {
  start: string;
  end: string;
}

const DURATIONS = [30, 45, 60] as const;
const MAX_SLOTS = 3;

export function ScheduleInterviewModal({
  jobId,
  matchId,
  candidateName,
  currentRoundIndex,
  jobRounds,
  onClose,
  onScheduled,
}: {
  jobId: string;
  matchId: string;
  candidateName: string | null;
  currentRoundIndex: number;
  jobRounds: InterviewRound[];
  onClose: () => void;
  onScheduled?: () => void;
}) {
  const toast = useToast();
  const sortedRounds = [...jobRounds].sort((a, b) => a.order - b.order);
  const currentRound = sortedRounds[currentRoundIndex];

  const [interviewers, setInterviewers] = useState<Interviewer[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [duration, setDuration] = useState(currentRound?.duration_minutes ?? 60);
  const [slots, setSlots] = useState<FreeSlot[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [loadingIv, setLoadingIv] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [intentText, setIntentText] = useState("");
  const [intentSummary, setIntentSummary] = useState<string | null>(null);

  const loadInterviewers = useCallback(async () => {
    setLoadingIv(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/interviewers`, { cache: "no-store" });
      const json = await res.json();
      const list = (json.interviewers ?? []) as Interviewer[];
      setInterviewers(list);
      const defaults = list.filter(
        (iv) => iv.round_index == null || iv.round_index === currentRoundIndex,
      );
      setSelectedIds(new Set((defaults.length ? defaults : list).map((iv) => iv.id)));
    } finally {
      setLoadingIv(false);
    }
  }, [jobId, currentRoundIndex]);

  const loadSlots = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setLoadingSlots(true);
    setSelectedSlots([]);
    try {
      const res = await fetch("/api/scheduling/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "slots",
          interviewerIds: [...selectedIds],
          durationMinutes: duration,
          intentText: intentText.trim() || undefined,
          matchId,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load slots");
      setSlots(json.slots ?? []);
      setIntentSummary(json.intentSummary ?? null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load slots", "error");
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [selectedIds, duration, intentText, matchId, toast]);

  useEffect(() => {
    void loadInterviewers();
  }, [loadInterviewers]);

  useEffect(() => {
    if (!loadingIv && selectedIds.size > 0) void loadSlots();
  }, [loadingIv, selectedIds, duration, loadSlots]);

  function toggleInterviewer(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSlot(start: string) {
    setSelectedSlots((prev) => {
      if (prev.includes(start)) return prev.filter((s) => s !== start);
      if (prev.length >= MAX_SLOTS) return prev; // cap at MAX_SLOTS
      // Keep chronological order so the first proposed slot is the soonest.
      return [...prev, start].sort();
    });
  }

  async function submit() {
    if (selectedSlots.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/scheduling/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          matchId,
          roundIndex: currentRoundIndex,
          durationMinutes: duration,
          interviewerIds: [...selectedIds],
          slotStarts: selectedSlots,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to schedule");
      toast(
        selectedSlots.length > 1
          ? `${selectedSlots.length} times proposed — awaiting interviewer pick`
          : "Interview proposed — awaiting interviewer approval",
        "success",
      );
      onScheduled?.();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to schedule", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const topSlots = slots.slice(0, 12);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl border border-slate-200"
      >
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-cobalt-600" />
              Schedule interview
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {candidateName ?? "Candidate"} · {currentRound?.name ?? `Round ${currentRoundIndex + 1}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {loadingIv ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading team…
            </div>
          ) : interviewers.length === 0 ? (
            <p className="text-sm text-slate-600 text-center py-6">
              Add interviewers on the job page before scheduling.
            </p>
          ) : (
            <>
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                  Interviewers
                </h3>
                <div className="flex flex-wrap gap-2">
                  {interviewers.map((iv) => (
                    <button
                      key={iv.id}
                      type="button"
                      onClick={() => toggleInterviewer(iv.id)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm font-medium cursor-pointer transition-colors",
                        selectedIds.has(iv.id)
                          ? "border-cobalt-600 bg-cobalt-50 text-cobalt-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      {iv.name}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                  Duration
                </h3>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit">
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDuration(d)}
                      className={cn(
                        "px-4 py-2 text-sm font-medium cursor-pointer",
                        duration === d
                          ? "bg-cobalt-600 text-white"
                          : "bg-white text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      {d} min
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                  Preferences (optional)
                </h3>
                <input
                  type="text"
                  value={intentText}
                  onChange={(e) => setIntentText(e.target.value)}
                  placeholder='e.g. "Tuesday or Wednesday afternoon next week"'
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400"
                />
                {intentSummary && (
                  <p className="mt-1.5 text-xs text-cobalt-600">{intentSummary}</p>
                )}
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                  Available times
                  <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
                    pick up to {MAX_SLOTS} to offer the candidate
                  </span>
                </h3>
                {loadingSlots ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" /> Finding overlap…
                  </div>
                ) : topSlots.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4">
                    No overlapping slots — try different interviewers or duration.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {topSlots.map((s) => {
                      const checked = selectedSlots.includes(s.start);
                      const atCap = !checked && selectedSlots.length >= MAX_SLOTS;
                      return (
                        <button
                          key={s.start}
                          type="button"
                          disabled={atCap}
                          onClick={() => toggleSlot(s.start)}
                          className={cn(
                            "rounded-lg border px-3 py-2.5 text-left text-sm cursor-pointer transition-colors",
                            checked
                              ? "border-cobalt-600 bg-cobalt-50 ring-1 ring-cobalt-600"
                              : atCap
                                ? "border-slate-100 opacity-40 cursor-not-allowed"
                                : "border-slate-200 hover:border-cobalt-200 hover:bg-slate-50",
                          )}
                        >
                          <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                            {checked && <Check className="h-3.5 w-3.5 text-cobalt-600" />}
                            {formatLocalShort(s.start)}
                          </span>
                          <span className="text-[10px] text-slate-400">{duration} minutes</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {selectedSlots.length > 0 && (
          <div className="sticky bottom-0 border-t border-slate-100 bg-slate-50 px-5 py-4 flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="text-slate-500">
                {selectedSlots.length} time{selectedSlots.length > 1 ? "s" : ""} selected
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedSlots([])}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-white cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cobalt-600 px-4 py-2 text-sm font-medium text-white hover:bg-cobalt-700 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {selectedSlots.length > 1 ? "Propose times" : "Propose time"}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
