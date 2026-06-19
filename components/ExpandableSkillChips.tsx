"use client";

import { useState, type ReactNode } from "react";

export function ExpandableSkillChips({
  skills,
  limit = 4,
  className = "flex flex-wrap gap-1",
  chipClassName = "px-1.5 py-0.5 rounded bg-slate-100 text-xs text-slate-700",
  moreClassName = "text-xs text-slate-500 px-1 py-0.5 rounded bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:text-slate-700 cursor-pointer transition-colors",
  renderChip,
}: {
  skills: string[];
  limit?: number;
  className?: string;
  chipClassName?: string;
  moreClassName?: string;
  renderChip?: (skill: string, index: number) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!skills.length) return null;

  const hiddenCount = skills.length - limit;
  const visible = expanded || hiddenCount <= 0 ? skills : skills.slice(0, limit);

  return (
    <div className={className}>
      {visible.map((s, i) =>
        renderChip ? (
          <span key={`${s}-${i}`}>{renderChip(s, i)}</span>
        ) : (
          <span key={`${s}-${i}`} className={chipClassName}>
            {s}
          </span>
        ),
      )}
      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
          className={moreClassName}
          aria-label={`Show ${hiddenCount} more skills`}
        >
          +{hiddenCount}
        </button>
      )}
      {expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(false);
          }}
          className={moreClassName}
          aria-label="Show fewer skills"
        >
          Show less
        </button>
      )}
    </div>
  );
}
