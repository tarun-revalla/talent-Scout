"use client";

import { Zap, ZapOff } from "lucide-react";
import { cn } from "@/lib/cn";

function isCoolingPeriodActive(reEligibleAfter: string | null | undefined): boolean {
  if (!reEligibleAfter) return false;
  return new Date(reEligibleAfter).getTime() > Date.now();
}

export function AutoEngageStatusIcon({
  matchScore,
  threshold,
  autoEnabled,
  jobOpen = true,
  hasEmail,
  emailInvalid,
  status,
  interviewState,
  reEligibleAfter,
  className,
}: {
  matchScore: number | null;
  threshold: number;
  autoEnabled: boolean;
  jobOpen?: boolean;
  hasEmail: boolean;
  emailInvalid?: boolean | null;
  status: string;
  interviewState?: string | null;
  reEligibleAfter?: string | null;
  className?: string;
}) {
  const roundedThreshold = Math.round(threshold);
  const aboveThreshold = matchScore != null && matchScore >= threshold;
  const canEmail = hasEmail && !emailInvalid;
  const cooling =
    interviewState === "rejected" && isCoolingPeriodActive(reEligibleAfter);
  const pendingOutreach = status === "discovered";

  let title: string;
  let icon: "off" | "eligible" | "above" | "blocked" = "off";
  let tone: "muted" | "amber" | "slate" = "muted";

  if (!autoEnabled) {
    title = "Auto-engage is off for this job";
    icon = "off";
    tone = "muted";
  } else if (!jobOpen) {
    title = "Job is closed — auto-engage paused";
    icon = "off";
    tone = "muted";
  } else if (!canEmail) {
    title = "Not auto-engage eligible — no valid email";
    icon = "blocked";
    tone = "slate";
  } else if (cooling) {
    title = "Not auto-engage eligible — re-apply cooldown active";
    icon = "blocked";
    tone = "slate";
  } else if (aboveThreshold && pendingOutreach) {
    title = `Auto-engage eligible (≥ ${roundedThreshold}%)`;
    icon = "eligible";
    tone = "amber";
  } else if (aboveThreshold) {
    title = `Above threshold (≥ ${roundedThreshold}%) — outreach ${status.replace(/_/g, " ")}`;
    icon = "above";
    tone = "amber";
  } else {
    title = `Below auto-engage threshold (${roundedThreshold}%)`;
    icon = "blocked";
    tone = "slate";
  }

  const Icon = icon === "off" ? ZapOff : Zap;

  return (
    <span className={cn("group/engage-tip relative inline-flex shrink-0", className)}>
      <span
        aria-label={title}
        className={cn(
          "inline-flex items-center justify-center rounded-full border p-1",
          tone === "amber" &&
            "border-amber-200 bg-amber-50 text-amber-700",
          tone === "slate" &&
            "border-slate-200 bg-slate-50 text-slate-400",
          tone === "muted" &&
            "border-slate-200 bg-white text-slate-400",
        )}
      >
        <Icon className={cn("h-3.5 w-3.5", icon === "eligible" && "fill-current")} />
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-[calc(100%+6px)] top-1/2 z-50 w-max max-w-[220px] -translate-y-1/2 whitespace-normal rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium leading-snug text-white opacity-0 shadow-lg group-hover/engage-tip:opacity-100"
      >
        {title}
      </span>
    </span>
  );
}
