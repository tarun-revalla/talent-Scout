"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { InterviewRoundsModal } from "./InterviewRoundsModal";
import type { InterviewRound } from "@/lib/schemas";

export function EditRoundsModal({
  jobId,
  onClose,
  onSaved,
}: {
  jobId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [jobTitle, setJobTitle] = useState("");
  const [rounds, setRounds] = useState<InterviewRound[]>([]);
  const [coolingMonths, setCoolingMonths] = useState(6);
  const [hiresTarget, setHiresTarget] = useState(1);
  const [rationale, setRationale] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch(`/api/jobs/${jobId}/rounds`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load rounds");
        if (!alive) return;
        setJobTitle(json.title ?? "Job");
        setRounds(json.interview_rounds ?? []);
        setCoolingMonths(json.cooling_period_months ?? 6);
        setHiresTarget(json.hires_target ?? 1);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [jobId]);

  async function suggest() {
    setSuggestBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/rounds`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Suggest failed");
      setRounds(json.suggested_rounds ?? []);
      setRationale(json.rationale);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suggest failed");
    } finally {
      setSuggestBusy(false);
    }
  }

  async function save(
    nextRounds: InterviewRound[],
    cooling: number,
    hires: number,
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/rounds`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          interview_rounds: nextRounds,
          cooling_period_months: cooling,
          hires_target: hires,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
        <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm text-slate-600 shadow-lg">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading rounds…
        </div>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 shadow-lg">
          {error}
        </div>
      )}
      <InterviewRoundsModal
        key={`${jobId}-${rounds.length}-${rounds[0]?.name ?? ""}`}
        jobTitle={jobTitle}
        rationale={rationale}
        initialRounds={rounds}
        initialCoolingMonths={coolingMonths}
        initialHiresTarget={hiresTarget}
        busy={busy}
        suggestBusy={suggestBusy}
        onClose={onClose}
        onConfirm={save}
        onSuggest={() => void suggest()}
        confirmLabel="Save rounds"
        cancelLabel="Cancel"
      />
    </>
  );
}
