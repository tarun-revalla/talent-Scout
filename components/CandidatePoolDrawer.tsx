"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileText, Mail, X } from "lucide-react";
import { Avatar } from "./Avatar";
import { ResumeButton } from "./ResumeButton";
import type { CandidateRow } from "./CandidateTable";

interface Insights {
  rank: number | null;
  sentiment: string | null;
  bestMatch: number | null;
}

const SKILL_BAR_WIDTHS = [90, 75, 45, 30];

export function CandidatePoolDrawer({
  candidate,
  onClose,
}: {
  candidate: CandidateRow | null;
  onClose: () => void;
}) {
  const [insights, setInsights] = useState<Insights | null>(null);

  useEffect(() => {
    if (!candidate) {
      setInsights(null);
      return;
    }
    let alive = true;
    void fetch(`/api/candidates/${candidate.id}/insights`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (alive) setInsights(j as Insights);
      })
      .catch(() => {
        if (alive) setInsights(null);
      });
    return () => {
      alive = false;
    };
  }, [candidate?.id]);

  useEffect(() => {
    if (!candidate) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [candidate, onClose]);

  const skills = candidate?.parsed_profile?.skills?.slice(0, 4) ?? [];

  return (
    <AnimatePresence>
      {candidate && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[55] bg-slate-900/20"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-0 top-0 bottom-0 z-[60] flex w-full max-w-[400px] flex-col border-l border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 p-6">
              <div className="flex items-center gap-4 min-w-0">
                <Avatar name={candidate.name} size="lg" />
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900 truncate">
                    Candidate Details
                  </h2>
                  <p className="text-xs text-slate-500">Recruitment Overview</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="p-2 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">
                  Quick Stats
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <p className="text-[11px] text-slate-500">Match Rank</p>
                    <p className="text-base font-semibold text-cobalt-600 mt-1">
                      {insights?.rank != null ? `#${insights.rank}` : "—"}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <p className="text-[11px] text-slate-500">Sentiment</p>
                    <p className="text-base font-semibold text-amber-700 mt-1">
                      {insights?.sentiment ?? "—"}
                    </p>
                  </div>
                </div>
                {insights?.bestMatch != null && (
                  <p className="text-xs text-slate-500 mt-3">
                    Best job fit: {insights.bestMatch}%
                  </p>
                )}
              </div>

              {skills.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">
                    Core Skills
                  </h3>
                  <div className="space-y-3">
                    {skills.map((skill, i) => (
                      <div key={skill} className="flex items-center justify-between gap-4">
                        <span className="text-sm text-slate-700 truncate">{skill}</span>
                        <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden shrink-0">
                          <div
                            className="bg-cobalt-600 h-full rounded-full"
                            style={{ width: `${SKILL_BAR_WIDTHS[i] ?? 25}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {candidate.parsed_profile?.summary && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">
                    Summary
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {candidate.parsed_profile.summary}
                  </p>
                </div>
              )}

              {(candidate.source === "pdf" || candidate.source === "invite_link") && (
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
                  <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center text-red-600">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">Resume</p>
                    <p className="text-xs text-slate-500">PDF document</p>
                  </div>
                  <ResumeButton
                    candidateId={candidate.id}
                    candidateName={candidate.name}
                  />
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 bg-slate-50 p-6">
              {candidate.email && !candidate.email_invalid ? (
                <a
                  href={`mailto:${candidate.email}`}
                  className="w-full inline-flex items-center justify-center gap-2 bg-cobalt-600 hover:bg-cobalt-700 text-white py-3 rounded-xl text-sm font-semibold shadow-sm transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  Send message
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-slate-200 text-slate-400 cursor-not-allowed"
                >
                  No email on file
                </button>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
