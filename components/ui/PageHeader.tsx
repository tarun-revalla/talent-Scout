import { cn } from "@/lib/cn";
import { Badge } from "./Badge";

export function PageHeader({
  title,
  description,
  badge,
  action,
  className,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: string | number;
  action?: React.ReactNode;
  className?: string;
  eyebrow?: string;
}) {
  return (
    <header className={cn("mb-8 sm:mb-10", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          {eyebrow && (
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-cobalt-600">
              {eyebrow}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl lg:text-[2rem] font-semibold tracking-tight text-slate-900 text-balance">
              {title}
            </h1>
            {badge != null && (
              <Badge variant="muted">{badge}</Badge>
            )}
          </div>
          {description && (
            <p className="mt-2 text-base text-slate-500 leading-relaxed text-pretty">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
      </div>
    </header>
  );
}
