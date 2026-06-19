"use client";

import { useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";

export function ThresholdSlider({
  jobId,
  initial,
  initialEnabled,
  onChange,
  onEnabledChange,
  onEngageResult,
}: {
  jobId: string;
  initial: number;
  initialEnabled: boolean;
  onChange: (v: number) => void;
  onEnabledChange: (e: boolean) => void;
  onEngageResult?: (result: { autoEnqueued?: number; threshold?: number }) => void;
}) {
  const [value, setValue] = useState(initial);
  const [enabled, setEnabled] = useState(initialEnabled);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setValue(initial), [initial]);
  useEffect(() => setEnabled(initialEnabled), [initialEnabled]);

  async function patch(payload: { threshold?: number; enabled?: boolean }, immediate = false) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const run = async () => {
      const res = await fetch(`/api/jobs/${jobId}/threshold`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { autoEnqueued?: number; threshold?: number };
      if (res.ok) onEngageResult?.(json);
    };
    if (immediate) {
      await run();
    } else {
      debounceRef.current = setTimeout(() => void run(), 300);
    }
  }

  function updateThreshold(v: number) {
    setValue(v);
    onChange(v);
    patch({ threshold: v });
  }

  function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    onEnabledChange(next);
    void patch({ enabled: next }, true);
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        onClick={toggleEnabled}
        title={
          enabled
            ? "Auto-engage is ON — click to disable"
            : "Auto-engage is OFF — click to enable for this job"
        }
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border transition-colors cursor-pointer ${
          enabled
            ? "border-amber-300 bg-amber-50 text-amber-800"
            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
        }`}
      >
        <Zap className={`w-3 h-3 ${enabled ? "" : "opacity-50"}`} />
        Auto-engage {enabled ? "ON" : "OFF"}
      </button>
      <span className={enabled ? "text-slate-500" : "text-slate-300"}>at ≥</span>
      <span
        className={`font-medium tabular-nums w-9 text-right ${
          enabled ? "text-amber-800" : "text-slate-300"
        }`}
      >
        {Math.round(value)}%
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => updateThreshold(parseFloat(e.target.value))}
        disabled={!enabled}
        aria-label="Auto-engage threshold"
        className="w-28 accent-amber-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      />
    </div>
  );
}
