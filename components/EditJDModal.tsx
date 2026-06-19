"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Loader2, X, Save } from "lucide-react";

export function EditJDModal({
  jobId,
  initialJD,
  onClose,
  onSaved,
}: {
  jobId: string;
  initialJD: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(initialJD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setText(initialJD), [initialJD]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw_jd: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      onSaved();
      onClose();
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
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 6 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <span className="font-medium text-slate-900">Edit JD</span>
          <span className="hidden sm:inline text-xs text-slate-500">
            Saves trigger re-parse, re-embed, and a fresh match run.
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
        <div className="flex-1 overflow-auto p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={20}
            disabled={busy}
            aria-label="Job description"
            className="w-full h-full min-h-[400px] rounded-lg bg-white border border-slate-200 p-3 text-sm font-mono focus:outline-none focus:border-slate-900 disabled:opacity-60"
          />
        </div>
        {error && (
          <div className="px-4 pb-2 text-sm text-red-700">{error}</div>
        )}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-200">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-40 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || text.trim().length < 50}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-sm font-medium text-white cursor-pointer transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {busy ? "Re-running match…" : "Save & re-match"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
