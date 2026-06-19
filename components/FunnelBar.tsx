"use client";

import { cn } from "@/lib/cn";

export function FunnelBar({
  label,
  value,
  max,
  color = "bg-cobalt-500",
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
  suffix?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const width = `${Math.max(pct, value > 0 ? 4 : 0)}%`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-slate-900">
          {value}
          {suffix ? ` ${suffix}` : ""}
          {max > 0 && value !== max ? (
            <span className="ml-1 font-normal text-slate-400">({pct}%)</span>
          ) : null}
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-700 ease-out", color)}
          style={{ width }}
        />
      </div>
    </div>
  );
}
