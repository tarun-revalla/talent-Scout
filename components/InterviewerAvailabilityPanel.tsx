"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { formatLocalShort } from "@/lib/dates";

import type { InterviewRound } from "@/lib/schemas";

interface Interviewer {
  id: string;
  name: string;
  round_index: number | null;
}

interface FreeSlot {
  start: string;
  end: string;
}

const DURATIONS = [30, 45, 60] as const;

export function InterviewerAvailabilityPanel({
  jobId,
  jobRounds = [],
}: {
  jobId: string;
  jobRounds?: InterviewRound[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [interviewers, setInterviewers] = useState<Interviewer[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [duration, setDuration] = useState<number>(60);
  const [slots, setSlots] = useState<FreeSlot[]>([]);
  const [timezone, setTimezone] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const loadInterviewers = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}/interviewers`, { cache: "no-store" });
    const json = await res.json();
    const list = (json.interviewers ?? []) as Interviewer[];
    setInterviewers(list);
    if (list.length && !selectedId) setSelectedId(list[0].id);
  }, [jobId, selectedId]);

  const loadAvailability = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/interviewers/${selectedId}/availability?duration=${duration}&days=14`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load availability");
      setSlots(json.slots ?? []);
      setTimezone(json.timezone ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [selectedId, duration]);

  useEffect(() => {
    if (open) void loadInterviewers();
  }, [open, loadInterviewers]);

  useEffect(() => {
    if (open && selectedId) void loadAvailability();
  }, [open, selectedId, duration, loadAvailability]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, FreeSlot[]>();
    for (const s of slots.slice(0, 48)) {
      const day = s.start.slice(0, 10);
      const arr = map.get(day) ?? [];
      arr.push(s);
      map.set(day, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [slots]);

  const sortedRounds = [...jobRounds].sort((a, b) => a.order - b.order);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <CalendarDays className="h-4 w-4 text-cobalt-600" />
          Interviewer availability
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
              {interviewers.length === 0 ? (
                <p className="text-sm text-slate-500 py-2">
                  Add interviewers above to preview their open slots.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      value={selectedId}
                      onChange={(e) => setSelectedId(e.target.value)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm bg-white cursor-pointer"
                    >
                      {interviewers.map((iv) => (
                        <option key={iv.id} value={iv.id}>
                          {iv.name}
                          {iv.round_index != null && sortedRounds[iv.round_index]
                            ? ` (${sortedRounds[iv.round_index].name})`
                            : ""}
                        </option>
                      ))}
                    </select>
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                      {DURATIONS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDuration(d)}
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors",
                            duration === d
                              ? "bg-cobalt-600 text-white"
                              : "bg-white text-slate-600 hover:bg-slate-50",
                          )}
                        >
                          {d}m
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadAvailability()}
                      disabled={loading}
                      className="inline-flex items-center gap-1 text-xs text-cobalt-600 hover:text-cobalt-700 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                      Refresh
                    </button>
                    {timezone && (
                      <span className="text-[10px] text-slate-400 ml-auto">{timezone}</span>
                    )}
                  </div>

                  {error && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
                  )}

                  {loading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
                      <Loader2 className="h-4 w-4 animate-spin" /> Reading calendar…
                    </div>
                  ) : slotsByDay.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">
                      No open {duration}-minute slots in the next 14 days.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto">
                      {slotsByDay.map(([day, daySlots]) => (
                        <div
                          key={day}
                          className="rounded-lg border border-slate-100 bg-slate-50/80 p-2.5"
                        >
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                            {new Date(day + "T12:00:00").toLocaleDateString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {daySlots.map((s) => (
                              <span
                                key={s.start}
                                className="inline-block rounded-md bg-white border border-cobalt-100 px-2 py-0.5 text-[11px] font-medium text-cobalt-700 tabular-nums"
                              >
                                {formatLocalShort(s.start).split(", ").pop()}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
