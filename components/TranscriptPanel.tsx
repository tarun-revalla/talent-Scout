"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ArrowDownLeft, ArrowUpRight, Loader2, Sparkles } from "lucide-react";
import { supabaseBrowser } from "@/lib/db";
import { formatLocal } from "@/lib/dates";
import { AiComposingBubble } from "./AiComposingBubble";
import type { ManualMessageIntent } from "@/lib/schemas";

export interface ConversationRow {
  id: string;
  direction: "in" | "out";
  subject: string | null;
  body: string | null;
  message_id: string | null;
  sent_at: string | null;
  received_at: string | null;
  llm_analysis: {
    sentiment?: string;
    enthusiasm_score?: number;
    decision?: string;
    ambiguities?: string[];
    candidate_questions?: string[];
    commitments?: {
      availability?: string | null;
      notice_period_weeks?: number | null;
      salary_expectation?: string | null;
      willing_to_interview?: string | null;
    };
  } | null;
}

type OutreachPending = { action: string; status: string } | null;

const BODY_PREVIEW_LEN = 180;

const FETCH_TIMEOUT_MS = 12_000;
const COMPOSE_POLL_MS = 10_000;

function resolveComposingLabel(
  rows: ConversationRow[],
  matchStatus: string | null,
  outreachPending: OutreachPending,
): string | null {
  if (outreachPending?.action === "send_no_show") {
    return "AI is sending reschedule email";
  }
  if (outreachPending?.action === "send_application_ack") {
    return "AI is sending application confirmation";
  }
  if (!rows.length) return null;
  const last = rows[rows.length - 1]!;
  if (last.direction !== "in") return null;

  const queueSending =
    outreachPending?.action === "send_followup" ||
    outreachPending?.action === "send_initial" ||
    outreachPending?.action === "send_round_pass" ||
    outreachPending?.action === "send_application_ack" ||
    outreachPending?.action === "send_no_show";

  if (!last.llm_analysis) {
    return queueSending ? "AI is drafting a reply" : "AI is reviewing the reply";
  }

  if (last.llm_analysis.decision === "follow_up") {
    if (matchStatus === "follow_up_sent" || matchStatus === "scored") return null;
    if (queueSending || matchStatus === "replied") {
      return "AI is drafting a follow-up";
    }
  }

  if (queueSending) {
    if (outreachPending?.action === "send_round_pass") {
      return "AI is sending round confirmation";
    }
    if (outreachPending?.action === "send_application_ack") {
      return "AI is sending application confirmation";
    }
    if (outreachPending?.action === "send_no_show") {
      return "AI is sending reschedule email";
    }
    return outreachPending?.action === "send_followup"
      ? "AI is drafting a follow-up"
      : "AI is drafting a reply";
  }

  return null;
}

function formatSentimentLabel(sentiment: string): string {
  return sentiment.charAt(0).toUpperCase() + sentiment.slice(1).toLowerCase();
}

function formatDecisionLabel(decision: string): string {
  return decision
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function noticeLabel(weeks: number | null | undefined): string | null {
  if (weeks == null) return null;
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
}

function sentimentBadgeClass(sentiment: string): string {
  const s = sentiment.toLowerCase();
  if (s === "positive" || s === "enthusiastic") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (s === "hesitant") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "declining") return "bg-red-50 text-red-700 border-red-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function PendingQuestionsBar({
  matchId,
  rows,
  onDraftReady,
}: {
  matchId: string;
  rows: ConversationRow[];
  onDraftReady: (draft: {
    subject: string;
    body: string;
    intent: ManualMessageIntent;
  }) => void;
}) {
  const [drafting, setDrafting] = useState(false);

  const latestInbound = [...rows].reverse().find((r) => r.direction === "in");
  const questions = latestInbound?.llm_analysis?.candidate_questions ?? [];
  if (!questions.length) return null;

  async function draftReply() {
    setDrafting(true);
    try {
      const res = await fetch(`/api/matches/${matchId}/message/draft`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: "answer_questions", questions }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Draft failed");
      onDraftReady({
        subject: json.subject ?? "",
        body: json.body ?? "",
        intent: "answer_questions",
      });
    } catch {
      /* parent can toast if needed */
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-cobalt-100 bg-cobalt-50/60 p-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-cobalt-700">
        Candidate questions — need your reply
      </p>
      <ul className="space-y-1 text-sm text-slate-700">
        {questions.map((q) => (
          <li key={q} className="flex gap-2">
            <span className="text-cobalt-400 shrink-0">?</span>
            <span>{q}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => void draftReply()}
        disabled={drafting}
        className="inline-flex items-center gap-1.5 rounded-md bg-cobalt-600 hover:bg-cobalt-700 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
      >
        {drafting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Sparkles className="w-3.5 h-3.5" />
        )}
        {drafting ? "Drafting reply…" : "Draft reply with AI"}
      </button>
    </div>
  );
}

function TranscriptMessageCard({
  row,
  expanded,
  onToggleExpand,
  isLast,
}: {
  row: ConversationRow;
  expanded: boolean;
  onToggleExpand: () => void;
  isLast: boolean;
}) {
  const isOut = row.direction === "out";
  const body = row.body?.trim() ?? "";
  const canExpand = body.length > BODY_PREVIEW_LEN;
  const preview = canExpand && !expanded ? `${body.slice(0, BODY_PREVIEW_LEN).trim()}…` : body;
  const timestamp = formatLocal(row.sent_at ?? row.received_at);
  const analysis = row.llm_analysis;

  return (
    <div className="flex gap-3 min-w-0">
      <div className="flex flex-col items-center w-5 shrink-0 pt-1">
        <div
          className={`flex items-center justify-center w-5 h-5 rounded-full ${
            isOut ? "text-cobalt-600" : "text-orange-400"
          }`}
        >
          {isOut ? (
            <ArrowUpRight className="w-4 h-4" strokeWidth={2.5} />
          ) : (
            <ArrowDownLeft className="w-4 h-4" strokeWidth={2.5} />
          )}
        </div>
        {!isLast && (
          <div
            className={`w-px flex-1 min-h-[16px] mt-1 ${
              isOut ? "bg-cobalt-300" : "bg-orange-200"
            }`}
          />
        )}
      </div>

      <div
        className={`flex-1 min-w-0 rounded-2xl border p-4 mb-4 ${
          isOut
            ? "bg-[#eff3fb] border-[#c5d4ef]"
            : "bg-[#fff7f2] border-[#f0d8cc]"
        }`}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <h4 className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2">
            {row.subject ?? "(no subject)"}
          </h4>
          <span className="text-[11px] text-slate-500 whitespace-nowrap shrink-0">
            {timestamp}
          </span>
        </div>

        {isOut ? (
          <>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {preview}
            </p>
            {canExpand && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="mt-2 text-sm font-semibold text-cobalt-600 hover:text-cobalt-700 cursor-pointer"
              >
                {expanded ? "Show less" : "Read more"}
              </button>
            )}
          </>
        ) : (
          <>
            {body && (
              <p className="text-sm text-slate-700 italic leading-relaxed whitespace-pre-wrap">
                &ldquo;{expanded || body.length <= BODY_PREVIEW_LEN ? body : `${body.slice(0, BODY_PREVIEW_LEN).trim()}…`}&rdquo;
              </p>
            )}
            {canExpand && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="mt-2 text-sm font-semibold text-cobalt-600 hover:text-cobalt-700 cursor-pointer"
              >
                {expanded ? "Show less" : "Read more"}
              </button>
            )}

            {analysis && (
              <div className="mt-4 pt-4 border-t border-slate-200/80">
                <div className="grid grid-cols-2 gap-4">
                  {analysis.sentiment && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Sentiment
                      </p>
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${sentimentBadgeClass(analysis.sentiment)}`}
                      >
                        {formatSentimentLabel(analysis.sentiment)}
                      </span>
                    </div>
                  )}
                  {analysis.enthusiasm_score != null && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Enthusiasm
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 tabular-nums">
                          {analysis.enthusiasm_score}
                        </span>
                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden max-w-[72px]">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{
                              width: `${Math.min(100, Math.max(0, analysis.enthusiasm_score))}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {analysis.commitments?.notice_period_weeks != null && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Notice
                      </p>
                      <p className="text-sm font-semibold text-slate-900">
                        {noticeLabel(analysis.commitments.notice_period_weeks)}
                      </p>
                    </div>
                  )}
                  {analysis.decision && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Decision
                      </p>
                      <span className="text-sm font-semibold text-cobalt-600">
                        {formatDecisionLabel(analysis.decision)}
                      </span>
                    </div>
                  )}
                </div>

                {(analysis.commitments?.availability ||
                  analysis.commitments?.salary_expectation ||
                  analysis.commitments?.willing_to_interview) && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    {analysis.commitments.availability && (
                      <span>Availability: {analysis.commitments.availability}</span>
                    )}
                    {analysis.commitments.salary_expectation && (
                      <span>Salary: {analysis.commitments.salary_expectation}</span>
                    )}
                    {analysis.commitments.willing_to_interview && (
                      <span>Interview: {analysis.commitments.willing_to_interview}</span>
                    )}
                  </div>
                )}

                {!!analysis.ambiguities?.length && (
                  <div className="mt-2 text-xs text-amber-700">
                    Open: {analysis.ambiguities.join(" • ")}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function TranscriptPanel({
  matchId,
  initialRows,
  matchStatus: matchStatusProp,
  showHeader = true,
  onDraftReady,
}: {
  matchId: string;
  initialRows?: ConversationRow[] | null;
  matchStatus?: string | null;
  showHeader?: boolean;
  onDraftReady?: (draft: {
    subject: string;
    body: string;
    intent: ManualMessageIntent;
  }) => void;
}) {
  const [rows, setRows] = useState<ConversationRow[]>(initialRows ?? []);
  const [matchStatus, setMatchStatus] = useState<string | null>(matchStatusProp ?? null);
  const [outreachPending, setOutreachPending] = useState<OutreachPending>(null);
  const [initialLoading, setInitialLoading] = useState(initialRows === undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRowsRef = useRef((initialRows?.length ?? 0) > 0);

  const composingLabel = useMemo(
    () => resolveComposingLabel(rows, matchStatus, outreachPending),
    [rows, matchStatus, outreachPending],
  );

  const fetchRows = useCallback(
    async (opts?: { background?: boolean }) => {
      const background = opts?.background ?? hasRowsRef.current;
      if (background) setRefreshing(true);
      else setInitialLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const r = await fetch(`/api/matches/${matchId}/conversations`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const j = (await r.json()) as {
          conversations?: ConversationRow[];
          matchStatus?: string | null;
          outreachPending?: OutreachPending;
          error?: string;
        };
        if (!r.ok) throw new Error(j.error ?? `Failed to load (${r.status})`);
        const next = j.conversations ?? [];
        hasRowsRef.current = next.length > 0;
        setRows(next);
        if (j.matchStatus != null) setMatchStatus(j.matchStatus);
        setOutreachPending(j.outreachPending ?? null);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.name === "AbortError"
              ? "Transcript request timed out — try again"
              : err.message
            : "Failed to load transcript";
        setError(msg);
      } finally {
        clearTimeout(timeout);
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [matchId],
  );

  useEffect(() => {
    if (matchStatusProp != null) setMatchStatus(matchStatusProp);
  }, [matchStatusProp]);

  useEffect(() => {
    if (!Array.isArray(initialRows)) return;
    hasRowsRef.current = initialRows.length > 0;
    setRows(initialRows);
    setInitialLoading(false);
    setError(null);
    void fetchRows({ background: true });
  }, [initialRows, fetchRows]);

  useEffect(() => {
    if (Array.isArray(initialRows)) return;
    void fetchRows({ background: false });
  }, [fetchRows, initialRows]);

  useEffect(() => {
    const sb = supabaseBrowser();
    const channelName = `transcript-${matchId}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = sb
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `match_id=eq.${matchId}`,
        },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            void fetchRows({ background: true });
          }, 400);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          const next = (payload.new as { status?: string }).status;
          if (next) setMatchStatus(next);
          void fetchRows({ background: true });
        },
      )
      .subscribe();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void sb.removeChannel(channel);
    };
  }, [matchId, fetchRows]);

  useEffect(() => {
    if (!composingLabel) return;
    const t = setInterval(() => void fetchRows({ background: true }), COMPOSE_POLL_MS);
    return () => clearInterval(t);
  }, [composingLabel, fetchRows]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (initialLoading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading transcript…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-red-700">{error}</div>
        <button
          type="button"
          onClick={() => void fetchRows({ background: false })}
          className="text-xs text-cobalt-600 hover:text-cobalt-700 cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!rows.length) {
    return <div className="text-xs text-slate-400">No emails yet.</div>;
  }

  return (
    <div>
      {showHeader && (
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">
          Email transcript
        </h3>
      )}

      {onDraftReady && (
        <PendingQuestionsBar matchId={matchId} rows={rows} onDraftReady={onDraftReady} />
      )}

      {refreshing && !composingLabel && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Updating…
        </div>
      )}

      <div>
        {rows.map((c, idx) => (
          <TranscriptMessageCard
            key={c.id}
            row={c}
            isLast={idx === rows.length - 1}
            expanded={expandedIds.has(c.id)}
            onToggleExpand={() => toggleExpand(c.id)}
          />
        ))}
      </div>

      <AnimatePresence>
        {composingLabel && <AiComposingBubble key="composing" label={composingLabel} />}
      </AnimatePresence>
    </div>
  );
}
