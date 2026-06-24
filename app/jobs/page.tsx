"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { JobsFiltersSidebar } from "@/components/JobsFiltersSidebar";
import { JobPostingCard, type JobPostingRow } from "@/components/JobPostingCard";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { JobDigestPanel } from "@/components/JobDigestPanel";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { ViewToggleIcons } from "@/components/ui/ViewToggle";
import { AddMoreCard } from "@/components/EmptyState";
import { GridSkeleton } from "@/components/ui/LoadingState";
import { SkeletonJobCard } from "@/components/Skeleton";
import { readRouteCache, writeRouteCache, invalidateRouteCache, isRouteCacheFresh } from "@/lib/route-cache";
import { type JobStatus } from "@/lib/ui-tokens";

const DEFAULT_STATUS_FILTER = new Set<JobStatus>(["open", "draft", "closed"]);

const CACHE_KEY = "jobs-list";
const CACHE_TTL_MS = 45_000;

export default function JobsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [jobs, setJobs] = useState<JobPostingRow[]>(() => readRouteCache(CACHE_KEY) ?? []);
  const [loading, setLoading] = useState(() => readRouteCache(CACHE_KEY) == null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Set<JobStatus>>(
    () => new Set(DEFAULT_STATUS_FILTER),
  );
  const [view, setView] = useState<"list" | "grid">("list");

  const refresh = useCallback(async (force = false) => {
    if (!force && isRouteCacheFresh(CACHE_KEY, CACHE_TTL_MS)) return;
    const hasCached = readRouteCache(CACHE_KEY) != null;
    if (!hasCached) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load jobs");
      const list = json.jobs ?? [];
      writeRouteCache(CACHE_KEY, list);
      setJobs(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(
    () =>
      jobs.filter((j) => statusFilter.has((j.status ?? "open") as JobStatus)),
    [jobs, statusFilter],
  );

  const activeCount = useMemo(
    () => jobs.filter((j) => (j.status ?? "open") === "open").length,
    [jobs],
  );

  const createdThisMonth = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    return jobs.filter((j) => {
      const d = new Date(j.created_at);
      return d.getMonth() === month && d.getFullYear() === year;
    }).length;
  }, [jobs]);

  function toggleStatus(status: JobStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        if (next.size === 1) return prev;
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }

  async function handleDelete(j: JobPostingRow) {
    if (
      !(await confirm(
        `Delete "${j.title}"? All matches and email transcripts for this job will be deleted.`,
        {
          title: "Delete job",
          confirmLabel: "Delete",
          variant: "danger",
        },
      ))
    )
      return;
    setJobs((prev) => prev.filter((x) => x.id !== j.id));
    const res = await fetch(`/api/jobs/${j.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast("Failed to delete job", "error");
      void refresh(true);
    } else {
      invalidateRouteCache(CACHE_KEY);
      toast(`Deleted "${j.title}"`, "success");
    }
  }

  return (
    <PageShell>
      {error && (
        <Alert variant="warning" title="Couldn't load jobs" className="mb-8">
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-12 gap-x-6 gap-y-8 lg:gap-x-8">
        <div className="col-span-12 lg:col-span-3">
          <PageHeader
            eyebrow="Recruiting"
            title="Jobs"
            description="Paste a JD, score candidates, and run real outreach."
            className="mb-0 lg:mb-6"
          />
          <JobsFiltersSidebar
            statusFilter={statusFilter}
            onToggleStatus={toggleStatus}
            activeCount={activeCount}
            createdThisMonth={createdThisMonth}
          />
        </div>

        <div className="col-span-12 lg:col-span-9">
          <div className="mb-6">
            <JobDigestPanel />
          </div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <PageHeader
              title="All Postings"
              badge={`${filtered.length} total`}
              className="mb-0"
            />
            <ViewToggleIcons
              value={view}
              onChange={setView}
              options={[
                { value: "grid", label: "Grid", icon: LayoutGrid, ariaLabel: "Grid view" },
                { value: "list", label: "List", icon: List, ariaLabel: "List view" },
              ]}
            />
          </div>

          {loading && jobs.length === 0 &&
            (view === "grid" ? (
              <GridSkeleton count={4} />
            ) : (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonJobCard key={i} />
                ))}
              </div>
            ))}

          {!loading && !error && filtered.length === 0 && jobs.length > 0 && (
            <Alert variant="info">No jobs match the selected filters.</Alert>
          )}

          {!loading && !error && (
            <div
              className={
                view === "grid"
                  ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-2"
                  : "space-y-4"
              }
            >
                {filtered.map((j, idx) => (
                  <JobPostingCard
                    key={j.id}
                    job={j}
                    view={view}
                    onDelete={handleDelete}
                    index={loading ? 0 : idx}
                  />
                ))}

              {!loading && (
                <AddMoreCard
                  href="/jobs/new"
                  title="Ready for more?"
                  description="Add your next job description to start sourcing world-class talent with AI-powered scoring."
                  cta="Upload a JD"
                  className={view === "grid" ? "col-span-full" : ""}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
