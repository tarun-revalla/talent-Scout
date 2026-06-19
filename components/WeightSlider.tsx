"use client";

import { useState } from "react";

export function WeightSlider({
  jobId,
  initial,
  onChange,
}: {
  jobId: string;
  initial: { match: number; interest: number };
  onChange: (w: { match: number; interest: number }) => void;
}) {
  const [matchWeight, setMatchWeight] = useState(initial.match);

  function update(v: number) {
    const m = v;
    const i = 1 - v;
    setMatchWeight(m);
    onChange({ match: m, interest: i });
    void fetch(`/api/jobs/${jobId}/weights`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ match: m, interest: i }),
    });
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-500">Weights</span>
      <span className="text-slate-900 font-medium tabular-nums">
        M {Math.round(matchWeight * 100)}
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={matchWeight}
        onChange={(e) => update(parseFloat(e.target.value))}
        aria-label="Match vs interest weighting"
        className="w-28 accent-slate-900 cursor-pointer"
      />
      <span className="text-slate-900 font-medium tabular-nums">
        I {Math.round((1 - matchWeight) * 100)}
      </span>
    </div>
  );
}
