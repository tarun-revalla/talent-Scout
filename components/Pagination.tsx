"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "./ui/IconButton";

interface Props {
  page: number;
  perPage: number;
  total: number;
  onPageChange: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
  perPageOptions?: number[];
}

const PER_PAGE_DEFAULT = [10, 25, 50, 100];

export function Pagination({
  page,
  perPage,
  total,
  onPageChange,
  onPerPageChange,
  perPageOptions = PER_PAGE_DEFAULT,
}: Props) {
  if (total === 0) return null;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);
  const prevDisabled = page <= 1;
  const nextDisabled = page >= lastPage;

  const pages: number[] = [];
  const window = 2;
  let lo = Math.max(1, page - window);
  let hi = Math.min(lastPage, page + window);
  while (hi - lo < 4 && (lo > 1 || hi < lastPage)) {
    if (lo > 1) lo--;
    else if (hi < lastPage) hi++;
  }
  for (let p = lo; p <= hi; p++) pages.push(p);

  return (
    <nav
      aria-label="Pagination"
      className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm sm:px-5"
    >
      <p>
        Showing{" "}
        <span className="font-semibold tabular-nums text-slate-900">{start}</span>–
        <span className="font-semibold tabular-nums text-slate-900">{end}</span> of{" "}
        <span className="font-semibold tabular-nums text-slate-900">{total}</span>
      </p>

      <div className="flex items-center gap-1">
        <IconButton
          size="sm"
          variant="default"
          onClick={() => onPageChange(page - 1)}
          disabled={prevDisabled}
          aria-label="Previous page"
          className="h-8 w-8"
        >
          <ChevronLeft className="h-4 w-4" />
        </IconButton>
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "min-h-8 min-w-8 rounded-lg px-2 text-xs font-semibold tabular-nums transition-all duration-200",
              p === page
                ? "bg-cobalt-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {p}
          </button>
        ))}
        <IconButton
          size="sm"
          variant="default"
          onClick={() => onPageChange(page + 1)}
          disabled={nextDisabled}
          aria-label="Next page"
          className="h-8 w-8"
        >
          <ChevronRight className="h-4 w-4" />
        </IconButton>
      </div>

      {onPerPageChange && (
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <span>Rows</span>
          <select
            value={perPage}
            onChange={(e) => onPerPageChange(Number(e.target.value))}
            aria-label="Rows per page"
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-700 hover:border-slate-300"
          >
            {perPageOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      )}
    </nav>
  );
}
