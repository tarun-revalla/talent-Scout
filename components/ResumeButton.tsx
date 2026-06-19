"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { FileText, Loader2, X, ExternalLink } from "lucide-react";

export function ResumeButton({
  candidateId,
  candidateName,
  compact = false,
}: {
  candidateId: string;
  candidateName: string | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Portal target — ssr-safe (window only exists after mount).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function show() {
    setOpen(true);
    if (url) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/resume`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setUrl(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown");
    } finally {
      setLoading(false);
    }
  }

  const overlay = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-4xl h-[85vh] flex flex-col"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
              <FileText className="w-4 h-4 text-slate-500" />
              <span className="font-medium text-slate-900 truncate">
                Resume{candidateName ? ` — ${candidateName}` : ""}
              </span>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
                >
                  <ExternalLink className="w-3 h-3" /> open in tab
                </a>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="ml-auto p-1.5 rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden bg-slate-50">
              {loading && (
                <div className="h-full flex items-center justify-center text-slate-500 gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating signed URL…
                </div>
              )}
              {error && (
                <div className="h-full flex items-center justify-center text-amber-700 text-sm px-4 text-center">
                  {error}
                </div>
              )}
              {url && !loading && (
                <iframe src={url} title="Resume" className="w-full h-full bg-white" />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          void show();
        }}
        className={`inline-flex items-center rounded-md border border-slate-200 hover:bg-slate-50 text-xs text-slate-700 cursor-pointer transition-colors ${
          compact
            ? "gap-0 p-1.5 lg:gap-1 lg:px-2 lg:py-1"
            : "gap-1 px-2 py-1"
        }`}
        title="View resume PDF"
        aria-label={`View resume${candidateName ? ` for ${candidateName}` : ""}`}
      >
        <FileText className="w-3.5 h-3.5 shrink-0" />
        <span className={compact ? "hidden lg:inline" : undefined}>Resume</span>
      </button>
      {/* Portal escapes any transformed ancestor (e.g. table rows mid-stagger) so
          the modal always covers the viewport. */}
      {mounted && createPortal(overlay, document.body)}
    </>
  );
}
