"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Loader2, X, Send, Sparkles } from "lucide-react";
import type { ManualMessageIntent } from "@/lib/schemas";

export function SendMessageModal({
  matchId,
  candidateName,
  candidateEmail,
  initialSubject = "",
  initialBody = "",
  initialIntent = "general" as ManualMessageIntent,
  onClose,
  onSent,
}: {
  matchId: string;
  candidateName: string | null;
  candidateEmail: string;
  initialSubject?: string;
  initialBody?: string;
  initialIntent?: ManualMessageIntent;
  onClose: () => void;
  onSent: () => void;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [intent, setIntent] = useState<ManualMessageIntent>(initialIntent);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSubject(initialSubject);
    setBody(initialBody);
    setIntent(initialIntent);
  }, [initialSubject, initialBody, initialIntent, matchId]);

  async function generateDraft() {
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/message/draft`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Draft failed");
      setSubject(json.subject ?? "");
      setBody(json.body ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setDrafting(false);
    }
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Send failed");
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown");
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 6 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-xl flex flex-col"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <span className="font-medium text-slate-900">Send message</span>
          <span className="text-xs text-slate-500 truncate">
            to {candidateName ?? "—"} · {candidateEmail}
          </span>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="ml-auto p-1.5 rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[140px]">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                Draft type
              </label>
              <select
                value={intent}
                onChange={(e) => setIntent(e.target.value as ManualMessageIntent)}
                disabled={busy || drafting}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm bg-white cursor-pointer"
              >
                <option value="general">General message</option>
                <option value="answer_questions">Answer their questions</option>
                <option value="nudge">Gentle nudge</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => void generateDraft()}
              disabled={busy || drafting}
              className="inline-flex items-center gap-1.5 rounded-md border border-cobalt-200 bg-cobalt-50 px-3 py-2 text-sm font-medium text-cobalt-700 hover:bg-cobalt-100 disabled:opacity-50 cursor-pointer"
            >
              {drafting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {drafting ? "Drafting…" : "AI draft"}
            </button>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
              Subject
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={busy || drafting}
              placeholder="e.g. Quick follow-up on your interview"
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-cobalt-400 placeholder:text-slate-400"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
              Message
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={busy || drafting}
              rows={10}
              placeholder="Write a message or use AI draft…"
              className="mt-1 w-full rounded-md border border-slate-200 p-3 text-sm focus:outline-none focus:border-cobalt-400 placeholder:text-slate-400"
            />
          </div>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-200">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-40 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={send}
            disabled={busy || drafting || subject.trim().length < 2 || body.trim().length < 5}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-cobalt-600 hover:bg-cobalt-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-sm font-medium text-white cursor-pointer transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
