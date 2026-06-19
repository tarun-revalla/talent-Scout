"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ClipboardList, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import type { InterviewRound } from "@/lib/schemas";

type Recommendation = "strong_yes" | "yes" | "no" | "strong_no";

interface JobScorecardRow {
  id: string;
  round_index: number;
  status: string;
  recommendation: Recommendation | null;
  overall_rating: number | null;
  technical_rating: number | null;
  communication_rating: number | null;
  notes: string | null;
  interviewer_name: string;
  candidate_id: string | null;
  candidate_name: string | null;
}

interface Summary {
  total: number;
  submitted: number;
  pending: number;
  averageOverall: number | null;
  averageTechnical: number | null;
  averageCommunication: number | null;
  recommendationCounts: Record<Recommendation, number>;
}

const REC_DISPLAY: Record<Recommendation, { label: string; cls: string }> = {
  strong_yes: { label: "Strong yes", cls: "bg-emerald-100 text-emerald-700" },
  yes: { label: "Yes", cls: "bg-emerald-50 text-emerald-600" },
  no: { label: "No", cls: "bg-red-50 text-red-600" },
  strong_no: { label: "Strong no", cls: "bg-red-100 text-red-700" },
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-lg font-bold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}

export function ScorecardSummaryPanel({
  jobId,
  jobRounds = [],
}: {
  jobId: string;
  jobRounds?: InterviewRound[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [scorecards, setScorecards] = useState<JobScorecardRow[]>([]);

  const sortedRounds = [...jobRounds].sort((a, b) => a.order - b.order);
  const roundName = (idx1Based: number) =>
    sortedRounds[idx1Based - 1]?.name ?? `Round ${idx1Based}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/scorecards`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setSummary(json.summary ?? null);
        setScorecards(json.scorecards ?? []);
      }
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [jobId]);

  useEffect(() => {
    if (open && !loaded) void load();
  }, [open, loaded, load]);

  // Group submitted/pending scorecards by candidate.
  const byCandidate = new Map<string, { name: string; rows: JobScorecardRow[] }>();
  for (const sc of scorecards) {
    const key = sc.candidate_id ?? sc.id;
    const entry = byCandidate.get(key) ?? {
      name: sc.candidate_name ?? "Candidate",
      rows: [],
    };
    entry.rows.push(sc);
    byCandidate.set(key, entry);
  }
  const candidateGroups = [...byCandidate.values()];

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <ClipboardList className="h-4 w-4 text-cobalt-600" />
          Interview scorecards
          {summary && summary.total > 0 && (
            <span className="rounded-full bg-cobalt-50 px-2 py-0.5 text-xs font-medium text-cobalt-700">
              {summary.submitted}/{summary.total}
            </span>
          )}
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
            <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading scorecards…
                </div>
              ) : !summary || summary.total === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
                  No scorecards yet. They are requested from interviewers automatically when a
                  candidate passes or is rejected in a round.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Stat label="Submitted" value={`${summary.submitted}/${summary.total}`} />
                    <Stat
                      label="Avg overall"
                      value={summary.averageOverall != null ? `${summary.averageOverall}★` : "—"}
                    />
                    <Stat
                      label="Avg technical"
                      value={
                        summary.averageTechnical != null ? `${summary.averageTechnical}★` : "—"
                      }
                    />
                    <Stat
                      label="Avg comm."
                      value={
                        summary.averageCommunication != null
                          ? `${summary.averageCommunication}★`
                          : "—"
                      }
                    />
                  </div>

                  {summary.submitted > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(REC_DISPLAY) as Recommendation[]).map((rec) => {
                        const count = summary.recommendationCounts[rec];
                        if (!count) return null;
                        return (
                          <span
                            key={rec}
                            className={cn(
                              "px-2 py-0.5 rounded-full text-xs font-medium",
                              REC_DISPLAY[rec].cls,
                            )}
                          >
                            {REC_DISPLAY[rec].label}: {count}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-3">
                    {candidateGroups.map((group, gi) => (
                      <div
                        key={gi}
                        className="rounded-lg border border-slate-100 overflow-hidden"
                      >
                        <div className="bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
                          {group.name}
                        </div>
                        <ul className="divide-y divide-slate-50">
                          {group.rows.map((sc) => {
                            const rec = sc.recommendation
                              ? REC_DISPLAY[sc.recommendation]
                              : null;
                            return (
                              <li key={sc.id} className="px-3 py-2 text-[11px]">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-slate-700">
                                    {sc.interviewer_name} · {roundName(sc.round_index)}
                                  </span>
                                  {sc.status === "submitted" && rec ? (
                                    <span
                                      className={cn(
                                        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium",
                                        rec.cls,
                                      )}
                                    >
                                      {rec.label}
                                      {sc.overall_rating ? (
                                        <span className="inline-flex items-center gap-0.5">
                                          · {sc.overall_rating}
                                          <Star className="h-2.5 w-2.5 fill-current" />
                                        </span>
                                      ) : null}
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">
                                      awaiting
                                    </span>
                                  )}
                                </div>
                                {sc.notes && (
                                  <p className="mt-1 text-slate-500 line-clamp-3">{sc.notes}</p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
