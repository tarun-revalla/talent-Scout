import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ViewToggleOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
  ariaLabel?: string;
}

export function ViewToggle<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ViewToggleOption<T>[];
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="View mode"
      className={cn(
        "inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1",
        className,
      )}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-label={opt.ariaLabel ?? opt.label}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200",
              active
                ? "bg-white text-cobalt-700 shadow-sm"
                : "text-slate-500 hover:text-slate-900",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Compact icon-only toggle for grid/list switches. */
export function ViewToggleIcons<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ViewToggleOption<T>[];
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="View mode"
      className={cn("inline-flex items-center gap-1", className)}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-label={opt.ariaLabel ?? opt.label}
            aria-pressed={active}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-200",
              active
                ? "border-cobalt-200 bg-cobalt-50 text-cobalt-700 shadow-sm"
                : "border-slate-200 text-slate-500 hover:bg-white hover:border-slate-300",
            )}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}
