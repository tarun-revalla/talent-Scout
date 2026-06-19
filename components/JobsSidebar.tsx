"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useState } from "react";
import { Search, Plus } from "lucide-react";
import { formatLocal } from "@/lib/dates";
import { readRouteCache, writeRouteCache, isRouteCacheFresh } from "@/lib/route-cache";
import {
  JOB_STATUS_TAG,
  JOB_STATUS_DOT,
  JOB_STATUS_LABEL,
  type JobStatus,
} from "@/lib/ui-tokens";

interface JobRow {
  id: string;
  title: string;
  status: JobStatus | null;
  created_at: string;
  match_count?: number;
}

const CACHE_KEY = "jobs-list";
const CACHE_TTL_MS = 45_000;

function JobsSidebarInner({ activeJobId }: { activeJobId: string }) {
  const cached = readRouteCache<JobRow[]>(CACHE_KEY);
  const [jobs, setJobs] = useState<JobRow[]>(cached ?? []);
  const [loading, setLoading] = useState(cached == null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (isRouteCacheFresh(CACHE_KEY, CACHE_TTL_MS)) return;

    let alive = true;
    if (cached == null) setLoading(true);

    fetch("/api/jobs", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const list = (j.jobs ?? []) as JobRow[];
        writeRouteCache(CACHE_KEY, list);
        setJobs(list);
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once; cache shared with jobs page
  }, []);

  const filtered = useMemo(
    () => jobs.filter((j) => j.title.toLowerCase().includes(query.trim().toLowerCase())),
    [jobs, query],
  );

  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-72 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="border-b border-slate-200 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Jobs <span className="font-normal text-slate-400">({jobs.length})</span>
          </h2>
          <Link
            href="/jobs/new"
            className="inline-flex items-center gap-1 rounded-md bg-cobalt-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-cobalt-700"
          >
            <Plus className="h-3 w-3" /> New
          </Link>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search jobs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-xs focus:border-cobalt-400 focus:outline-none focus:ring-2 focus:ring-cobalt-500/15"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && jobs.length === 0 ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton-shimmer h-12 rounded-lg" />
            ))}
          </div>
        ) : (
          filtered.map((j) => {
            const active = j.id === activeJobId;
            const status = j.status ?? "open";
            return (
              <Link
                key={j.id}
                href={`/jobs/${j.id}`}
                className={`mb-1 block rounded-lg px-3 py-2.5 transition-colors ${
                  active
                    ? "border border-cobalt-200 bg-cobalt-50"
                    : "border border-transparent hover:bg-slate-50"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`line-clamp-2 text-sm font-medium ${
                      active ? "text-cobalt-800" : "text-slate-900"
                    }`}
                  >
                    {j.title}
                  </span>
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${JOB_STATUS_DOT[status]}`}
                    title={JOB_STATUS_LABEL[status]}
                  />
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{formatLocal(j.created_at)}</span>
                  {j.match_count != null && j.match_count > 0 && (
                    <span>· {j.match_count} matches</span>
                  )}
                </div>
                <span
                  className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${JOB_STATUS_TAG[status]}`}
                >
                  {JOB_STATUS_LABEL[status]}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </aside>
  );
}

export const JobsSidebar = memo(JobsSidebarInner);
