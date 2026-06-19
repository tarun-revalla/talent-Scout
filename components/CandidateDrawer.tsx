"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  X,
  Mail,
  Phone,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { Avatar } from "./Avatar";
import { CircularScore } from "./CircularScore";
import { TranscriptPanel, type ConversationRow } from "./TranscriptPanel";
import { ResumeButton } from "./ResumeButton";
import { SendMessageModal } from "./SendMessageModal";
import { useToast } from "./Toast";
import { STAGES } from "@/lib/ui-tokens";
import type { MatchRow, DrawerTab as Tab } from "./MatchTable";
import { ExpandableSkillChips } from "./ExpandableSkillChips";
import { InterviewProgress } from "./InterviewProgress";
import { ScheduleInterviewModal } from "./ScheduleInterviewModal";
import type { InterviewRound, ManualMessageIntent } from "@/lib/schemas";

export function CandidateDrawer({
  match,
  jobId,
  weights,
  jobRounds,
  onClose,
  onChanged,
  initialTab = "overview",
}: {
  match: MatchRow | null;
  jobId: string;
  weights: { match: number; interest: number };
  jobRounds?: InterviewRound[];
  onClose: () => void;
  onChanged?: () => void;
  initialTab?: Tab;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [showFullSummary, setShowFullSummary] = useState(false);
  const [stage, setStage] = useState<string>("new");
  const [stageBusy, setStageBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [composeDraft, setComposeDraft] = useState<{
    subject: string;
    body: string;
    intent: ManualMessageIntent;
  } | null>(null);
  const [prefetchedTranscript, setPrefetchedTranscript] = useState<
    ConversationRow[] | null | undefined
  >(undefined);
  // Drawer width is JS-driven so motion can animate it smoothly. Desktop:
  // 384px (lg:w-96 equivalent). Mobile: full viewport.
  const [drawerWidth, setDrawerWidth] = useState<number>(384);

  useLayoutEffect(() => {
    const compute = () => {
      if (typeof window === "undefined") return;
      setDrawerWidth(window.innerWidth >= 1024 ? 384 : window.innerWidth);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  useEffect(() => {
    setTab(initialTab);
    setShowFullSummary(false);
  }, [match?.id, initialTab]);

  useEffect(() => {
    setStage(match?.pipeline_stage ?? "new");
  }, [match?.id, match?.pipeline_stage]);

  // Prefetch transcript as soon as the drawer opens so Activity tab feels instant.
  useEffect(() => {
    if (!match || match.rounds_sent <= 0) {
      setPrefetchedTranscript(null);
      return;
    }
    let alive = true;
    setPrefetchedTranscript(undefined);
    void fetch(`/api/matches/${match.id}/conversations`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as { conversations?: ConversationRow[] };
        if (!alive) return;
        setPrefetchedTranscript(j.conversations ?? []);
      })
      .catch(() => {
        if (alive) setPrefetchedTranscript(null);
      });
    return () => {
      alive = false;
    };
  }, [match?.id, match?.rounds_sent]);

  useEffect(() => {
    if (!match) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [match, onClose]);

  if (!match) return null;
  const c = match.candidate;
  if (!c) return null;

  async function changeStage(next: string) {
    setStageBusy(true);
    setStage(next);
    try {
      const res = await fetch(`/api/matches/${match!.id}/stage`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: next }),
      });
      if (res.ok) toast(`Moved to ${next}`, "success");
      else toast("Failed to update stage", "error");
      onChanged?.();
    } finally {
      setStageBusy(false);
    }
  }

  const m = match.match_score ?? 0;
  const i = match.interest_score ?? 0;
  const combined =
    match.match_score == null
      ? null
      : Math.round(weights.match * m + weights.interest * i);

  const summary = match.match_explanation?.summary ?? "";
  const summaryShort =
    summary.length > 200 ? summary.slice(0, 200) + "…" : summary;

  return (
    <motion.aside
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      style={{ width: drawerWidth, overflow: "hidden" }}
      className="shrink-0 bg-white border-l border-slate-200 flex flex-col lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)]"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 shrink-0">
        <button
          onClick={onClose}
          aria-label="Back"
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="font-medium text-slate-900 truncate">{c.name ?? "—"}</span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="ml-auto p-1.5 rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 px-4 border-b border-slate-200 shrink-0">
        {(["overview", "activity"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative pt-2.5 pb-3 text-sm capitalize cursor-pointer ${
              tab === t
                ? "text-slate-900 font-medium"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {t}
            {tab === t && (
              <motion.span
                layoutId="drawer-tab-underline"
                className="absolute left-0 right-0 -bottom-px h-0.5 bg-cobalt-600 rounded"
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {tab === "overview" && (
          <>
            <div className="flex items-start gap-4">
              <Avatar name={c.name} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-900 truncate">{c.name ?? "—"}</div>
                {c.email && (
                  <div className="text-xs text-slate-500 mt-0.5 truncate">{c.email}</div>
                )}
                <div className="flex items-center gap-2 mt-2 text-slate-400">
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="p-1 rounded hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                      aria-label="Email"
                    >
                      <Mail className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <span aria-label="Phone (not available)" className="p-1 opacity-40">
                    <Phone className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Score Overview
              </div>
              <div className="grid grid-cols-3 gap-4 items-center">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
                    Match
                  </p>
                  {match.match_score != null ? (
                    <>
                      <p className="text-lg font-bold text-cobalt-600 tabular-nums mb-2">
                        {Math.round(match.match_score)}%
                      </p>
                      <div className="bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-cobalt-600 h-2 rounded-full"
                          style={{ width: `${Math.round(match.match_score)}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </div>
                <div className="flex flex-col items-center">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
                    Interest
                  </p>
                  <CircularScore value={match.interest_score} />
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
                    Combined
                  </p>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">
                    {combined ?? "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Summary */}
            {summary && (
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-1.5">
                  Profile Summary
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {showFullSummary ? summary : summaryShort}
                </p>
                {summary.length > 200 && (
                  <button
                    onClick={() => setShowFullSummary((s) => !s)}
                    className="text-xs text-cobalt-600 hover:text-cobalt-700 mt-1 cursor-pointer"
                  >
                    {showFullSummary ? "Show less" : "Show more"}
                  </button>
                )}
              </div>
            )}

            {/* Skills matched */}
            {!!match.match_explanation?.matched_skills?.length && (
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-1.5">
                  Skills Matched
                </div>
                <ExpandableSkillChips
                  skills={match.match_explanation.matched_skills}
                  limit={8}
                  className="flex flex-wrap gap-1.5"
                  moreClassName="text-xs text-slate-500 px-1.5 py-0.5 rounded-full border border-slate-200 hover:bg-slate-50 hover:text-slate-700 cursor-pointer transition-colors"
                  renderChip={(s) => (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs">
                      <CheckCircle2 className="w-3 h-3" /> {s}
                    </span>
                  )}
                />
              </div>
            )}

            {!!jobRounds?.length && (
              <InterviewProgress
                matchId={match.id}
                interviewState={match.interview_state ?? "not_started"}
                currentRoundIndex={match.current_round_index ?? 0}
                reEligibleAfter={match.re_eligible_after ?? null}
                rejectionReason={match.rejection_reason ?? null}
                jobRounds={jobRounds}
                pipelineStage={match.pipeline_stage ?? "new"}
                onChanged={onChanged}
                onSchedule={() => setScheduling(true)}
              />
            )}

            {/* Gaps */}
            {!!match.match_explanation?.gaps?.length && (
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-1.5">
                  Gaps
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {match.match_explanation.gaps.map((g, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-xs"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Experience */}
            {c.parsed_profile?.years != null && (
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-1.5">
                  Experience
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Total" value={`${c.parsed_profile.years} yrs`} />
                  <Stat label="Skills" value={String(c.parsed_profile.skills?.length ?? 0)} />
                  <Stat label="Source" value={c.source ?? "—"} />
                </div>
              </div>
            )}

            {/* Resume */}
            {(c.source === "pdf" || c.source === "invite_link") && (
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-1.5">
                  Resume
                </div>
                <div className="rounded-lg border border-slate-200 p-3 flex items-center gap-3">
                  <div className="w-10 h-12 rounded bg-red-50 border border-red-200 flex items-center justify-center text-red-700">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      Resume.pdf
                    </div>
                    <div className="text-xs text-slate-500">PDF document</div>
                  </div>
                  <ResumeButton candidateId={c.id} candidateName={c.name} />
                </div>
              </div>
            )}
          </>
        )}

        {tab === "activity" && (
          <div>
            <TranscriptPanel
              matchId={match.id}
              initialRows={prefetchedTranscript}
              matchStatus={match.status}
              showHeader
              onDraftReady={(draft) => {
                setComposeDraft(draft);
                setComposing(true);
              }}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 p-3 flex items-center gap-2 shrink-0">
        <select
          value={stage}
          disabled={stageBusy}
          onChange={(e) => void changeStage(e.target.value)}
          className="flex-1 text-sm rounded-md border border-slate-200 px-2 py-1.5 bg-white disabled:opacity-50 cursor-pointer"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s === "new" ? "New (just added)" : `Move to ${s}`}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            setComposeDraft(null);
            setComposing(true);
          }}
          disabled={!c.email || c.email_invalid === true}
          title={
            !c.email
              ? "No email on file"
              : c.email_invalid
                ? "Email previously bounced"
                : "Send ad-hoc message"
          }
          className="inline-flex items-center gap-1.5 rounded-md bg-cobalt-600 hover:bg-cobalt-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-sm font-medium text-white cursor-pointer transition-colors"
        >
          <Mail className="w-4 h-4" /> Send message
        </button>
      </div>

      <AnimatePresence>
        {scheduling && jobRounds && (
          <ScheduleInterviewModal
            jobId={jobId}
            matchId={match.id}
            candidateName={c.name}
            currentRoundIndex={match.current_round_index ?? 0}
            jobRounds={jobRounds}
            onClose={() => setScheduling(false)}
            onScheduled={() => {
              setScheduling(false);
              onChanged?.();
            }}
          />
        )}
        {composing && (
          <SendMessageModal
            matchId={match.id}
            candidateName={c.name}
            candidateEmail={c.email!}
            initialSubject={composeDraft?.subject ?? ""}
            initialBody={composeDraft?.body ?? ""}
            initialIntent={composeDraft?.intent ?? "general"}
            onClose={() => {
              setComposing(false);
              setComposeDraft(null);
            }}
            onSent={() => {
              setComposing(false);
              toast("Message sent", "success");
              onChanged?.();
            }}
          />
        )}
      </AnimatePresence>
    </motion.aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2 text-center">
      <div className="text-sm font-semibold text-slate-900">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">
        {label}
      </div>
    </div>
  );
}
