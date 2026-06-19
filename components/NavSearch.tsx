"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Briefcase, User } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Avatar } from "./Avatar";
import { Badge } from "./ui/Badge";

interface JobHit {
  id: string;
  title: string;
  status: string | null;
}
interface CandidateHit {
  id: string;
  name: string | null;
  email: string | null;
}

function NavSearchInner() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [jobs, setJobs] = useState<JobHit[]>([]);
  const [candidates, setCandidates] = useState<CandidateHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setJobs([]);
      setCandidates([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          cache: "no-store",
        });
        const json = await res.json();
        setJobs(json.jobs ?? []);
        setCandidates(json.candidates ?? []);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !inField)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  const hasResults = jobs.length > 0 || candidates.length > 0;
  const showDropdown = open && q.trim().length >= 2;

  return (
    <div ref={wrapRef} className="relative w-full">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            (e.target as HTMLElement).blur();
          }
        }}
        placeholder="Search jobs, candidates…"
        aria-label="Search jobs and candidates"
        aria-expanded={showDropdown}
        aria-controls="nav-search-results"
        className="w-full rounded-xl border border-slate-200/90 bg-white py-2 pl-9 pr-12 text-sm shadow-sm placeholder:text-slate-400 focus:border-cobalt-400 focus:outline-none focus:ring-2 focus:ring-cobalt-500/15"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400 md:inline-flex">
        /
      </kbd>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            id="nav-search-results"
            role="listbox"
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-card-hover"
          >
            {loading && !hasResults && (
              <div className="px-4 py-3 text-xs text-slate-400">Searching…</div>
            )}
            {!loading && !hasResults && (
              <div className="px-4 py-3 text-xs text-slate-400">No results</div>
            )}
            {jobs.length > 0 && (
              <div className="py-1">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Jobs
                </div>
                {jobs.map((j) => (
                  <button
                    key={j.id}
                    role="option"
                    onClick={() => go(`/jobs/${j.id}`)}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                    <span className="flex-1 truncate text-sm text-slate-900">{j.title}</span>
                    <Badge
                      variant={
                        j.status === "closed"
                          ? "muted"
                          : j.status === "draft"
                            ? "warning"
                            : "success"
                      }
                      className="normal-case"
                    >
                      {j.status ?? "open"}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
            {candidates.length > 0 && (
              <div className="border-t border-slate-100 py-1">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Candidates
                </div>
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    role="option"
                    onClick={() => go(`/candidates?focus=${c.id}`)}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <Avatar name={c.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-900">{c.name ?? "—"}</div>
                      {c.email && (
                        <div className="truncate text-[11px] text-slate-500">{c.email}</div>
                      )}
                    </div>
                    <User className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const NavSearch = memo(NavSearchInner);
