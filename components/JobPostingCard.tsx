"use client";

import Link from "next/link";
import {
  Bot,
  ChevronRight,
  Clock,
  DollarSign,
  MapPin,
  Trash2,
} from "lucide-react";
import { formatLocal } from "@/lib/dates";
import { formatJobLocation, formatJobSalary } from "@/lib/job-display";
import { JOB_STATUS_LABEL, type JobStatus } from "@/lib/ui-tokens";
import type { ParsedJD } from "@/lib/schemas";
import { Badge } from "./ui/Badge";
import { IconButton } from "./ui/IconButton";
import { cn } from "@/lib/cn";

export interface JobPostingRow {
  id: string;
  title: string;
  status: JobStatus | null;
  created_at: string;
  parsed_jd?: ParsedJD | null;
  match_count?: number;
  avg_match?: number | null;
}

const STATUS_VARIANT: Record<JobStatus, "success" | "warning" | "muted"> = {
  open: "success",
  draft: "warning",
  closed: "muted",
};

interface JobPostingCardProps {
  job: JobPostingRow;
  view: "list" | "grid";
  onDelete: (job: JobPostingRow) => void;
  index?: number;
}

export function JobPostingCard({
  job,
  view,
  onDelete,
  index = 0,
}: JobPostingCardProps) {
  const status = job.status ?? "open";
  const location = formatJobLocation(job.parsed_jd);
  const salary = formatJobSalary(job.parsed_jd);
  const staggerStyle = { "--i": Math.min(index, 8) } as React.CSSProperties;

  if (view === "grid") {
    return (
      <Link
        href={`/jobs/${job.id}`}
        style={staggerStyle}
        className="stagger group block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-card-hover"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-all duration-200 group-hover:bg-cobalt-600 group-hover:text-white group-hover:shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <StatusBadge status={status} />
        </div>
        <h3 className="line-clamp-2 font-semibold text-slate-900 transition-colors group-hover:text-cobalt-700">
          {job.title}
        </h3>
        <p className="mt-1 text-xs text-slate-400">{formatLocal(job.created_at)}</p>
        <div className="mt-5 flex justify-between border-t border-slate-100 pt-4 text-center">
          <Stat label="Candidates" value={String(job.match_count ?? 0)} />
          <Stat
            label="Avg Match"
            value={job.avg_match != null ? `${job.avg_match}%` : "—"}
            highlight
          />
        </div>
      </Link>
    );
  }

  return (
    <article
      style={staggerStyle}
      className="stagger group flex flex-col justify-between gap-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-card-hover sm:p-6 md:flex-row md:items-center"
    >
      <Link
        href={`/jobs/${job.id}`}
        className="flex min-w-0 flex-1 items-start gap-4"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-all duration-200 group-hover:bg-cobalt-600 group-hover:text-white group-hover:shadow-sm">
          <Bot className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-3">
            <h3 className="truncate text-base font-semibold text-slate-900 transition-colors group-hover:text-cobalt-700">
              {job.title}
            </h3>
            <StatusBadge status={status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatLocal(job.created_at)}
            </span>
            {location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {location}
              </span>
            )}
            {salary && (
              <span className="inline-flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                {salary}
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="flex items-center gap-4 border-t border-slate-100 pt-4 md:border-t-0 md:pt-0">
        <div className="flex gap-4">
          <Stat label="Candidates" value={String(job.match_count ?? 0)} />
          <div className="border-l border-slate-200 pl-4">
            <Stat
              label="Avg Match"
              value={job.avg_match != null ? `${job.avg_match}%` : "—"}
              highlight
            />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            variant="ghost"
            size="sm"
            onClick={() => onDelete(job)}
            aria-label={`Delete ${job.title}`}
            title="Delete job"
            className="text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </IconButton>
          <Link
            href={`/jobs/${job.id}`}
            className="p-1 text-cobalt-600 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          >
            <ChevronRight className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} pulse={status === "open"}>
      {JOB_STATUS_LABEL[status]}
    </Badge>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="text-center">
      <div
        className={cn(
          "text-base font-semibold tabular-nums",
          highlight ? "text-cobalt-600" : "text-slate-900",
        )}
      >
        {value}
      </div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
