import type { LucideIcon } from "lucide-react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/cn";

const variants = {
  info: {
    wrap: "border-slate-200 bg-white text-slate-700",
    icon: Info,
    iconClass: "text-cobalt-600",
  },
  success: {
    wrap: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: CheckCircle2,
    iconClass: "text-emerald-600",
  },
  warning: {
    wrap: "border-amber-200 bg-amber-50 text-amber-900",
    icon: AlertCircle,
    iconClass: "text-amber-600",
  },
  error: {
    wrap: "border-red-200 bg-red-50 text-red-800",
    icon: AlertCircle,
    iconClass: "text-red-600",
  },
} as const;

export function Alert({
  children,
  variant = "info",
  title,
  icon: CustomIcon,
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  title?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  const cfg = variants[variant];
  const Icon = CustomIcon ?? cfg.icon;
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-2xl border px-4 py-3.5 text-sm leading-relaxed shadow-sm",
        cfg.wrap,
        className,
      )}
    >
      <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", cfg.iconClass)} aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}
