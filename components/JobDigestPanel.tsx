"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Loader2, Sparkles, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import type { JobDigest } from "@/lib/schemas";

interface DigestResponse {
  digest: JobDigest & { generated_at: string };
  snapshot: { job_id: string; title: string }[];
}

const PRIORITY_STYLE = {
  high: "border-l-red-500 bg-red-50/50",
  medium: "border-l-amber-400 bg-amber-50/30",
  low: "border-l-slate-300 bg-slate-50/50",
} as const;

export function JobDigestPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DigestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/digest", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load digest");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !data && !loading) void load();
  }, [open, data, loading, load]);

  const highCount = data?.digest.items.filter((i) => i.priority === "high").length ?? 0;

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50/80",
          open && "bg-cobalt-50/40",
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <Sun className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Today&apos;s priorities</p>
          <p className="text-xs text-slate-500 truncate">
            {data?.digest.headline ?? "AI digest of what needs your attention"}
          </p>
        </div>
        {highCount > 0 && !open && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
            {highCount} urgent
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 px-4 py-4 space-y-4">
              {loading && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Building your digest…
                </div>
              )}
              {error && (
                <div className="text-sm text-red-600">
                  {error}{" "}
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="underline cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}
              {data && !loading && (
                <>
                  <div className="flex items-start gap-2">
                    <Sparkles className="h-4 w-4 text-cobalt-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-600 leading-relaxed">{data.digest.summary}</p>
                  </div>
                  {data.digest.items.length > 0 ? (
                    <ul className="space-y-2">
                      {data.digest.items.map((item) => (
                        <li
                          key={`${item.job_id}-${item.action}`}
                          className={cn(
                            "border-l-4 rounded-r-lg px-3 py-2 text-sm",
                            PRIORITY_STYLE[item.priority],
                          )}
                        >
                          <Link
                            href={`/jobs/${item.job_id}`}
                            className="font-semibold text-cobalt-700 hover:text-cobalt-800"
                          >
                            {item.job_title}
                          </Link>
                          <p className="text-slate-600 mt-0.5">{item.action}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">All caught up — no urgent actions.</p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-[10px] text-slate-400">
                      Updated {new Date(data.digest.generated_at).toLocaleTimeString()}
                    </p>
                    <button
                      type="button"
                      onClick={() => void load()}
                      className="text-xs font-medium text-cobalt-600 hover:text-cobalt-700 cursor-pointer"
                    >
                      Refresh
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
