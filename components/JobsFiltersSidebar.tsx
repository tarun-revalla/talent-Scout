"use client";

import { Briefcase, TrendingUp } from "lucide-react";
import { JOB_STATUS_LABEL, type JobStatus } from "@/lib/ui-tokens";
import { Card } from "./ui/Card";

const STATUS_OPTIONS: JobStatus[] = ["open", "draft", "closed"];

const STATUS_FILTER_LABEL: Record<JobStatus, string> = {
  open: "Active / Open",
  draft: "Drafts",
  closed: "Closed",
};

interface JobsFiltersSidebarProps {
  statusFilter: Set<JobStatus>;
  onToggleStatus: (status: JobStatus) => void;
  activeCount: number;
  createdThisMonth: number;
}

export function JobsFiltersSidebar({
  statusFilter,
  onToggleStatus,
  activeCount,
  createdThisMonth,
}: JobsFiltersSidebarProps) {
  return (
    <aside className="space-y-5">
      <Card padding="md">
        <h3 className="mb-4 text-base font-semibold text-slate-900">Filters</h3>
        <fieldset>
          <legend className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
            Status
          </legend>
          <div className="space-y-2.5">
            {STATUS_OPTIONS.map((status) => (
              <label
                key={status}
                className="group flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={statusFilter.has(status)}
                  onChange={() => onToggleStatus(status)}
                  className="h-4 w-4 rounded border-slate-300 text-cobalt-600 focus:ring-cobalt-500/30"
                />
                <span className="text-sm text-slate-700 transition-colors group-hover:text-cobalt-700">
                  {STATUS_FILTER_LABEL[status]}
                </span>
                <span className="sr-only">{JOB_STATUS_LABEL[status]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cobalt-600 to-cobalt-800 p-6 text-white shadow-glow">
        <div className="relative z-10">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-cobalt-100/90">
            Total Active Jobs
          </span>
          <div className="mt-1 text-5xl font-bold tracking-tight tabular-nums">{activeCount}</div>
          {createdThisMonth > 0 && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 backdrop-blur-sm">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-[11px] font-semibold">
                +{createdThisMonth} this month
              </span>
            </div>
          )}
        </div>
        <Briefcase
          className="absolute -bottom-4 -right-4 h-32 w-32 rotate-12 opacity-10"
          strokeWidth={1}
          aria-hidden
        />
      </div>
    </aside>
  );
}
