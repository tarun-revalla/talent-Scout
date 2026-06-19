import { cn } from "@/lib/cn";

const variants = {
  default: "bg-slate-100 text-slate-600 border-slate-200",
  brand: "bg-cobalt-50 text-cobalt-700 border-cobalt-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  muted: "bg-slate-50 text-slate-500 border-slate-200",
} as const;

export function Badge({
  children,
  variant = "default",
  pulse = false,
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
        "text-[11px] font-semibold uppercase tracking-wide",
        variants[variant],
        className,
      )}
    >
      {pulse && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
      )}
      {children}
    </span>
  );
}
