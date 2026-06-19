"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { GripVertical, Loader2, Plus, Trash2, X, Layers } from "lucide-react";
import type { InterviewRound, InterviewRoundType } from "@/lib/schemas";
import { ROUND_TYPE_LABEL } from "@/lib/ui-tokens";

const ROUND_TYPES: InterviewRoundType[] = [
  "phone_screen",
  "technical",
  "system_design",
  "hiring_manager",
  "culture",
  "panel",
  "other",
];

function emptyRound(order: number): InterviewRound {
  return {
    order,
    name: "",
    type: "other",
    duration_minutes: 45,
    description: null,
    interviewer_role: null,
  };
}

export function InterviewRoundsModal({
  jobTitle,
  rationale,
  initialRounds,
  initialCoolingMonths,
  initialHiresTarget = 1,
  busy,
  suggestBusy,
  onClose,
  onConfirm,
  onSuggest,
  confirmLabel = "Create job & match",
  cancelLabel = "Back",
}: {
  jobTitle: string;
  rationale?: string;
  initialRounds: InterviewRound[];
  initialCoolingMonths: number;
  initialHiresTarget?: number;
  busy?: boolean;
  suggestBusy?: boolean;
  onClose: () => void;
  onConfirm: (
    rounds: InterviewRound[],
    coolingMonths: number,
    hiresTarget: number,
  ) => void;
  onSuggest?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  const [rounds, setRounds] = useState<InterviewRound[]>(
    initialRounds.map((r, i) => ({ ...r, order: i + 1 })),
  );
  const [coolingMonths, setCoolingMonths] = useState(initialCoolingMonths);
  const [hiresTarget, setHiresTarget] = useState(initialHiresTarget);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    setRounds(initialRounds.map((r, i) => ({ ...r, order: i + 1 })));
  }, [initialRounds]);

  useEffect(() => {
    setCoolingMonths(initialCoolingMonths);
  }, [initialCoolingMonths]);

  useEffect(() => {
    setHiresTarget(initialHiresTarget);
  }, [initialHiresTarget]);

  function updateRound(index: number, patch: Partial<InterviewRound>) {
    setRounds((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  function addRound() {
    setRounds((prev) => [...prev, emptyRound(prev.length + 1)]);
  }

  function removeRound(index: number) {
    setRounds((prev) =>
      prev.filter((_, i) => i !== index).map((r, i) => ({ ...r, order: i + 1 })),
    );
  }

  function reorderRounds(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setRounds((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return prev;
      next.splice(toIndex, 0, moved);
      return next.map((r, i) => ({ ...r, order: i + 1 }));
    });
  }

  const valid =
    rounds.length > 0 &&
    rounds.every((r) => r.name.trim().length > 0) &&
    hiresTarget >= 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl flex flex-col"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
          <Layers className="w-5 h-5 text-cobalt-600" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-slate-900">Interview rounds</h2>
            <p className="text-xs text-slate-500 truncate">{jobTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Define each step in your interview process. Drag the handle to reorder rounds.
            The AI uses these details when candidates ask about rounds by email.
          </p>

          {rationale && (
            <p className="text-xs text-slate-600 bg-cobalt-50 border border-cobalt-100 rounded-lg px-3 py-2">
              {rationale}
            </p>
          )}

          {onSuggest && (
            <button
              type="button"
              disabled={suggestBusy || busy}
              onClick={onSuggest}
              className="inline-flex items-center gap-1.5 text-xs text-cobalt-600 hover:text-cobalt-700 disabled:opacity-50 cursor-pointer"
            >
              {suggestBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Re-suggest rounds from JD
            </button>
          )}

          <div className="space-y-3">
            {rounds.map((round, index) => (
              <div
                key={`round-${round.order}-${index}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverIndex(index);
                }}
                onDragLeave={() => {
                  setDragOverIndex((v) => (v === index ? null : v));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromRaw = e.dataTransfer.getData("text/plain");
                  const from = dragIndex ?? Number(fromRaw);
                  if (!Number.isNaN(from)) reorderRounds(from, index);
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                className={`rounded-lg border p-3 space-y-2 bg-slate-50/50 transition-shadow ${
                  dragIndex === index ? "opacity-50 border-slate-300" : "border-slate-200"
                } ${
                  dragOverIndex === index && dragIndex !== index
                    ? "ring-2 ring-cobalt-400 border-cobalt-300"
                    : ""
                }`}
              >
                <div className="flex items-center gap-2">
                <button
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(index));
                      e.dataTransfer.effectAllowed = "move";
                      setDragIndex(index);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing touch-none"
                    aria-label={`Drag to reorder round ${index + 1}`}
                  >
                    <GripVertical className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold text-cobalt-700 w-16 shrink-0">
                    Round {index + 1}
                  </span>
                  <div className="flex-1 min-w-0" />
                  <button
                    type="button"
                    onClick={() => removeRound(index)}
                    disabled={rounds.length <= 1}
                    className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                    aria-label="Remove round"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <label className="block space-y-1">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                    Round name
                  </span>
                  <input
                    value={round.name}
                    onChange={(e) => updateRound(index, { name: e.target.value })}
                    placeholder="e.g. Technical interview"
                    className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                      Round type
                    </span>
                    <select
                      value={round.type}
                      onChange={(e) =>
                        updateRound(index, { type: e.target.value as InterviewRoundType })
                      }
                      className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 bg-white"
                    >
                      {ROUND_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {ROUND_TYPE_LABEL[t] ?? t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                      Duration (minutes)
                    </span>
                    <input
                      type="number"
                      min={15}
                      max={480}
                      value={round.duration_minutes ?? ""}
                      onChange={(e) =>
                        updateRound(index, {
                          duration_minutes: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      placeholder="45"
                      className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400"
                    />
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                    Who interviews (optional)
                  </span>
                  <input
                    value={round.interviewer_role ?? ""}
                    onChange={(e) =>
                      updateRound(index, {
                        interviewer_role: e.target.value || null,
                      })
                    }
                    placeholder="e.g. Senior engineer, Hiring manager"
                    className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                    What this round covers (optional)
                  </span>
                  <textarea
                    value={round.description ?? ""}
                    onChange={(e) =>
                      updateRound(index, { description: e.target.value || null })
                    }
                    placeholder="e.g. Live coding on algorithms and system design basics"
                    rows={2}
                    className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 resize-none"
                  />
                </label>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addRound}
            className="inline-flex items-center gap-1 text-xs text-cobalt-600 hover:text-cobalt-700 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add round
          </button>

          <div className="pt-2 border-t border-slate-200 space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium block">
              Candidates to hire
            </span>
            <p className="text-xs text-slate-500">
              The job closes automatically once this many candidates are marked hired.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number"
                min={1}
                max={100}
                value={hiresTarget}
                onChange={(e) => setHiresTarget(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900"
              />
              <span className="text-sm text-slate-600">hires</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium block">
              Re-apply cooling period after rejection
            </span>
            <p className="text-xs text-slate-500">
              How long before a rejected candidate can be considered again for this job.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number"
                min={1}
                max={24}
                value={coolingMonths}
                onChange={(e) => setCoolingMonths(Number(e.target.value))}
                className="w-20 rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900"
              />
              <span className="text-sm text-slate-600">months</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() =>
              onConfirm(
                rounds.map((r, i) => ({ ...r, order: i + 1, name: r.name.trim() })),
                coolingMonths,
                hiresTarget,
              )
            }
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-40 px-4 py-2 text-sm font-medium text-white cursor-pointer"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
