"use client";

import { Mail, FileText, FileJson, FileSpreadsheet, Trash2, Users } from "lucide-react";
import { ResumeButton } from "./ResumeButton";
import { Avatar } from "./Avatar";
import { SkeletonRow, SkeletonCard } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { formatLocalShort } from "@/lib/dates";
import { ExpandableSkillChips } from "./ExpandableSkillChips";

export interface CandidateRow {
  id: string;
  name: string | null;
  email: string | null;
  email_invalid?: boolean | null;
  source: "pdf" | "csv" | "json" | string | null;
  parsed_profile: { skills?: string[]; years?: number | null; summary?: string } | null;
  created_at: string;
}

const SOURCE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  pdf: FileText,
  csv: FileSpreadsheet,
  json: FileJson,
};

export function CandidateTable({
  rows,
  loading,
  onDelete,
  selected,
  onToggleSelected,
  onSelectAll,
  emptyTitle,
  emptyDescription,
  variant = "default",
  view = "table",
  onRowClick,
  showUploadHint,
}: {
  rows: CandidateRow[];
  loading?: boolean;
  onDelete?: (id: string, name: string | null) => void;
  selected?: Set<string>;
  onToggleSelected?: (id: string) => void;
  onSelectAll?: (visibleIds: string[], select: boolean) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  variant?: "default" | "dashboard";
  view?: "table" | "grid";
  onRowClick?: (row: CandidateRow) => void;
  showUploadHint?: boolean;
}) {
  const isDashboard = variant === "dashboard";
  const skillChipClass = isDashboard
    ? "px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs text-slate-600"
    : "px-1.5 py-0.5 rounded bg-slate-100 text-xs text-slate-700";
  const skillMoreClass = isDashboard
    ? "px-2 py-0.5 bg-cobalt-50 text-cobalt-700 rounded text-xs font-bold"
    : "text-xs text-slate-500 px-1 py-0.5 rounded bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:text-slate-700 cursor-pointer transition-colors";
  const showSelection = !!selected && !!onToggleSelected;
  const visibleIds = rows.map((r) => r.id);
  const allSelected =
    showSelection && visibleIds.length > 0 && visibleIds.every((id) => selected!.has(id));
  const someSelected =
    showSelection && !allSelected && visibleIds.some((id) => selected!.has(id));

  if (loading) {
    return (
      <>
        <div
          className={`hidden md:block overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-card ${
            isDashboard ? "" : ""
          }`}
        >
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
              <tr>
                {showSelection && <th className="px-4 py-3 w-8"></th>}
                <th className="text-left px-4 py-3 font-medium">Candidate</th>
                <th className="text-left px-4 py-3 font-medium">Skills</th>
                <th className="text-left px-4 py-3 font-medium w-20">Years</th>
                <th className="text-left px-4 py-3 font-medium w-24">Source</th>
                <th className="text-left px-4 py-3 font-medium w-28">Added</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonRow key={i} cols={showSelection ? 7 : 6} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </>
    );
  }

  if (!rows.length) {
    return (
      <EmptyState
        icon={Users}
        title={emptyTitle ?? "No candidates here"}
        description={
          emptyDescription ??
          "Upload resumes above to start building your candidate pool."
        }
      />
    );
  }

  if (view === "grid") {
    return (
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((c, idx) => {
          const skills = c.parsed_profile?.skills ?? [];
          const Icon = SOURCE_ICON[c.source ?? ""] ?? FileText;
          const isSelected = showSelection && selected!.has(c.id);
          const openCandidate = () => onRowClick?.(c);
          return (
            <div
              key={c.id}
              role={onRowClick ? "button" : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? openCandidate : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openCandidate();
                      }
                    }
                  : undefined
              }
              style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}
              className={`stagger text-left rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-all ${
                onRowClick ? "cursor-pointer" : ""
              } ${
                isSelected ? "border-cobalt-200 bg-cobalt-50/30" : "border-slate-200"
              }`}
            >
              <div className="flex items-start gap-3 mb-3">
                {showSelection && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleSelected!(c.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${c.name ?? "candidate"}`}
                    className="mt-1 accent-cobalt-600 w-4 h-4 cursor-pointer"
                  />
                )}
                <Avatar name={c.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900 truncate">
                    {c.name ?? "—"}
                  </div>
                  {c.email && (
                    <div className="text-xs text-slate-500 truncate mt-0.5">{c.email}</div>
                  )}
                </div>
              </div>
              <ExpandableSkillChips
                skills={skills}
                chipClassName={skillChipClass}
                moreClassName={skillMoreClass}
              />
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Icon className="w-3.5 h-3.5 text-red-500" /> {c.source}
                </span>
                <span>{formatLocalShort(c.created_at)}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div
        className={`hidden md:block overflow-x-auto rounded-xl border border-slate-200 bg-white ${
          isDashboard ? "shadow-sm" : ""
        }`}
      >
        <table className="w-full text-sm">
          <thead
            className={`text-slate-500 text-[11px] uppercase tracking-wider ${
              isDashboard ? "bg-slate-50 border-b border-slate-200" : "bg-slate-50"
            }`}
          >
            <tr>
              {showSelection && (
                <th className={`${isDashboard ? "py-4 px-6" : "px-4 py-3"} w-8`}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={(e) => onSelectAll?.(visibleIds, e.target.checked)}
                    aria-label="Select all visible candidates"
                    className="accent-cobalt-600 w-4 h-4 cursor-pointer"
                  />
                </th>
              )}
              <th className={`text-left font-medium ${isDashboard ? "py-4 px-4" : "px-4 py-3"}`}>
                Candidate
              </th>
              <th className={`text-left font-medium ${isDashboard ? "py-4 px-4" : "px-4 py-3"}`}>
                Skills
              </th>
              <th className={`text-left font-medium w-20 ${isDashboard ? "py-4 px-4" : "px-4 py-3"}`}>
                Years
              </th>
              <th className={`text-left font-medium w-24 ${isDashboard ? "py-4 px-4" : "px-4 py-3"}`}>
                Source
              </th>
              <th className={`text-left font-medium w-28 ${isDashboard ? "py-4 px-4" : "px-4 py-3"}`}>
                Added
              </th>
              <th className={`${isDashboard ? "py-4 px-6" : "px-4 py-3"} w-24`}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, idx) => {
              const Icon = SOURCE_ICON[c.source ?? ""] ?? FileText;
              const skills = c.parsed_profile?.skills ?? [];
              const isSelected = showSelection && selected!.has(c.id);
              return (
                <tr
                  key={c.id}
                  style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}
                  onClick={(e) => {
                    if (
                      onRowClick &&
                      !(e.target as HTMLElement).closest("button, input, a")
                    ) {
                      onRowClick(c);
                    }
                  }}
                  className={`stagger border-t border-slate-100 hover:bg-slate-50/60 ${
                    isSelected ? "bg-cobalt-50/40" : ""
                  } ${onRowClick ? "cursor-pointer" : ""} ${
                    isDashboard ? "group" : ""
                  }`}
                >
                  {showSelection && (
                    <td className={isDashboard ? "py-5 px-6" : "px-4 py-3"}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelected!(c.id)}
                        aria-label={`Select ${c.name ?? "candidate"}`}
                        className="accent-cobalt-600 w-4 h-4 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className={isDashboard ? "py-5 px-4" : "px-4 py-3"}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={c.name} size="sm" />
                      <div className="min-w-0">
                        <div
                          className={`truncate ${
                            isDashboard
                              ? "font-semibold text-[15px] text-slate-900"
                              : "font-medium text-slate-900"
                          }`}
                        >
                          {c.name ?? "—"}
                        </div>
                        <div className="text-xs mt-0.5">
                          {c.email ? (
                            <span className="inline-flex items-center gap-1 text-slate-500">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <span
                                className={
                                  c.email_invalid ? "line-through text-slate-400" : ""
                                }
                              >
                                {c.email}
                              </span>
                              {c.email_invalid && (
                                <span className="ml-1 text-[10px] uppercase px-1 rounded bg-red-50 text-red-700 border border-red-200">
                                  invalid
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-amber-700 text-xs">no email</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className={`max-w-md ${isDashboard ? "py-5 px-4" : "px-4 py-3"}`}>
                    <ExpandableSkillChips
                      skills={skills}
                      chipClassName={skillChipClass}
                      moreClassName={skillMoreClass}
                    />
                  </td>
                  <td
                    className={`text-slate-700 tabular-nums ${
                      isDashboard ? "py-5 px-4" : "px-4 py-3"
                    }`}
                  >
                    {c.parsed_profile?.years ?? "—"}
                  </td>
                  <td className={isDashboard ? "py-5 px-4" : "px-4 py-3"}>
                    <span className="inline-flex items-center gap-1.5 text-slate-600 text-xs">
                      <Icon className="w-3.5 h-3.5 text-red-500" /> {c.source}
                    </span>
                  </td>
                  <td
                    className={`text-xs text-slate-500 whitespace-nowrap ${
                      isDashboard ? "py-5 px-4" : "px-4 py-3"
                    }`}
                  >
                    {formatLocalShort(c.created_at)}
                  </td>
                  <td className={isDashboard ? "py-5 px-6" : "px-4 py-3"}>
                    <div
                      className={`flex items-center gap-2 justify-end text-slate-400 ${
                        isDashboard
                          ? "opacity-0 group-hover:opacity-100 transition-opacity"
                          : ""
                      }`}
                    >
                      {(c.source === "pdf" || c.source === "invite_link") && (
                        <ResumeButton candidateId={c.id} candidateName={c.name} />
                      )}
                      {onDelete && (
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `Delete ${c.name ?? "this candidate"} from the pool? They will be removed from every job too.`,
                              )
                            ) {
                              onDelete(c.id, c.name);
                            }
                          }}
                          aria-label="Delete candidate"
                          title="Delete from pool"
                          className="p-1.5 rounded-md hover:bg-red-50 hover:text-red-600 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {rows.map((c, idx) => {
          const Icon = SOURCE_ICON[c.source ?? ""] ?? FileText;
          const skills = c.parsed_profile?.skills ?? [];
          const isSelected = showSelection && selected!.has(c.id);
          return (
            <div
              key={c.id}
              style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}
              className={`stagger rounded-xl border p-3 hover:shadow-sm ${
                isSelected ? "border-cobalt-200 bg-cobalt-50/40" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                {showSelection && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelected!(c.id)}
                    aria-label={`Select ${c.name ?? "candidate"}`}
                    className="mt-1 accent-cobalt-600 w-4 h-4 cursor-pointer"
                  />
                )}
                <Avatar name={c.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900 truncate">
                    {c.name ?? "—"}
                  </div>
                  <div className="text-xs mt-0.5">
                    {c.email ? (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span
                          className={
                            c.email_invalid
                              ? "line-through text-slate-400"
                              : "text-slate-600"
                          }
                        >
                          {c.email}
                        </span>
                        {c.email_invalid && (
                          <span className="ml-1 text-[10px] uppercase px-1 rounded bg-red-50 text-red-700 border border-red-200">
                            invalid
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-amber-700">no email</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {(c.source === "pdf" || c.source === "invite_link") && (
                    <ResumeButton candidateId={c.id} candidateName={c.name} />
                  )}
                  {onDelete && (
                    <button
                      onClick={() => {
                        if (confirm(`Delete ${c.name ?? "this candidate"}?`))
                          onDelete(c.id, c.name);
                      }}
                      aria-label="Delete candidate"
                      className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2">
                <ExpandableSkillChips
                  skills={skills}
                  chipClassName="px-1.5 py-0.5 rounded bg-slate-100 text-[11px] text-slate-700"
                  moreClassName="text-[11px] text-slate-500 px-1 py-0.5 rounded bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:text-slate-700 cursor-pointer transition-colors"
                />
              </div>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Icon className="w-3 h-3 text-red-500" /> {c.source}
                </span>
                {c.parsed_profile?.years != null && (
                  <span className="tabular-nums">{c.parsed_profile.years} yrs</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
