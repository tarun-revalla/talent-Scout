"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Loader2, X, Users, FileText, Sparkles } from "lucide-react";
import { formatLocal } from "@/lib/dates";
import type { DuplicateSuggestion } from "@/lib/schemas";

export interface DuplicatePair {
  newId: string;
  newName: string | null;
  email: string;
  existing: { id: string; name: string | null; created_at: string };
}

type Resolution = "merge" | "distinct";

function SuggestionBanner({
  pair,
  suggestion,
  loading,
}: {
  pair: DuplicatePair;
  suggestion: DuplicateSuggestion | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-cobalt-50 border border-cobalt-100 px-3 py-2 text-xs text-cobalt-700">
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        AI is comparing profiles…
      </div>
    );
  }
  if (!suggestion) return null;

  const isMerge = suggestion.recommendation === "merge";
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs ${
        isMerge
          ? "bg-emerald-50 border-emerald-100 text-emerald-800"
          : "bg-amber-50 border-amber-100 text-amber-900"
      }`}
    >
      <div className="flex items-center gap-1.5 font-semibold mb-1">
        <Sparkles className="w-3.5 h-3.5 shrink-0" />
        AI suggests: {isMerge ? "Same person — merge" : "Different people — keep both"}
        <span className="font-normal opacity-70">({suggestion.confidence} confidence)</span>
      </div>
      <p>{suggestion.summary}</p>
      <p className="mt-1 opacity-80">{suggestion.reason}</p>
    </div>
  );
}

export function DuplicatesModal({
  duplicates,
  onClose,
  onResolved,
}: {
  duplicates: DuplicatePair[];
  onClose: () => void;
  onResolved: () => void;
}) {
  const [pending, setPending] = useState(duplicates);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, DuplicateSuggestion>>({});
  const [loadingSuggest, setLoadingSuggest] = useState<Set<string>>(new Set());

  useEffect(() => {
    for (const d of pending) {
      if (suggestions[d.newId] || loadingSuggest.has(d.newId)) continue;
      setLoadingSuggest((s) => new Set(s).add(d.newId));
      void (async () => {
        try {
          const res = await fetch("/api/candidates/duplicate-suggest", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ newId: d.newId, existingId: d.existing.id }),
          });
          const json = await res.json();
          if (res.ok && json.suggestion) {
            setSuggestions((prev) => ({ ...prev, [d.newId]: json.suggestion }));
          }
        } catch {
          /* optional AI assist */
        } finally {
          setLoadingSuggest((s) => {
            const next = new Set(s);
            next.delete(d.newId);
            return next;
          });
        }
      })();
    }
  }, [pending, suggestions, loadingSuggest]);

  async function resolve(d: DuplicatePair, action: Resolution) {
    setBusyIds((s) => new Set(s).add(d.newId));
    setError(null);
    try {
      let url: string;
      let body: Record<string, unknown> | null = null;
      if (action === "merge") {
        url = `/api/candidates/${d.existing.id}/merge`;
        body = { from_id: d.newId };
      } else {
        url = `/api/candidates/${d.newId}/confirm-distinct`;
      }
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Resolution failed");
      setPending((prev) => {
        const next = prev.filter((x) => x.newId !== d.newId);
        if (next.length === 0) {
          onResolved();
          onClose();
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown");
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(d.newId);
        return next;
      });
    }
  }

  if (pending.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 6 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <Users className="w-4 h-4 text-amber-700" />
          <span className="font-medium text-slate-900">
            {pending.length} possible duplicate{pending.length === 1 ? "" : "s"}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto p-1.5 rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <p className="text-sm text-slate-600">
            We found candidates already in the pool with the same email. AI will suggest
            whether each upload is the same person or someone different.
          </p>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {pending.map((d) => {
            const busy = busyIds.has(d.newId);
            const sug = suggestions[d.newId] ?? null;
            const sugLoading = loadingSuggest.has(d.newId);
            return (
              <div
                key={d.newId}
                className="rounded-lg border border-slate-200 bg-white p-3 space-y-3"
              >
                <SuggestionBanner pair={d} suggestion={sug} loading={sugLoading} />
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-mono text-slate-600 text-xs truncate">{d.email}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md border border-slate-200 p-2 bg-slate-50">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1 font-medium">
                      Existing
                    </div>
                    <div className="font-medium text-slate-900">{d.existing.name ?? "—"}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      added {formatLocal(d.existing.created_at)}
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-200 p-2 bg-slate-50">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1 font-medium">
                      Just uploaded
                    </div>
                    <div className="font-medium text-slate-900">{d.newName ?? "—"}</div>
                    <div className="text-xs text-slate-500 mt-0.5">new resume</div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => resolve(d, "merge")}
                    disabled={busy}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-md disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-xs font-medium text-white cursor-pointer transition-colors ${
                      sug?.recommendation === "merge"
                        ? "bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-300"
                        : "bg-slate-900 hover:bg-slate-800"
                    }`}
                  >
                    {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                    Same person — use new resume
                  </button>
                  <button
                    onClick={() => resolve(d, "distinct")}
                    disabled={busy}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                      sug?.recommendation === "keep_both"
                        ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 ring-2 ring-amber-200"
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    Different — keep both
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
