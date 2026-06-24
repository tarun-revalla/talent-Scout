"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/Button";
import { APP_NAME, BRAND } from "@/lib/brand";

interface SlotOption {
  start: string;
  end: string;
  label: string;
}

interface RescheduleData {
  current: { start: string; end: string; label: string; timezone: string };
  interview: {
    jobTitle: string;
    roundIndex: number;
    durationMinutes: number;
    candidateName: string | null;
    interviewers: string[];
  };
  alternatives: SlotOption[];
}

export function CandidateReschedulePage({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RescheduleData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [doneLabel, setDoneLabel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/scheduling/reschedule/${token}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json as RescheduleData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/scheduling/reschedule/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotStart: selected }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Reschedule failed");
      setDoneLabel(json.newSlot.label as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reschedule failed");
    } finally {
      setBusy(false);
    }
  }

  const firstName = data?.interview.candidateName?.split(" ")[0] ?? "there";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: BRAND.colors.surface }}
    >
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <BrandLogo className="h-7" />
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div
            className="px-6 py-5 text-white"
            style={{
              background: `linear-gradient(135deg, ${BRAND.colors.primary}, ${BRAND.colors.primaryLight})`,
            }}
          >
            <div className="flex items-center gap-2 text-white/90 text-sm mb-1">
              <Calendar className="h-4 w-4" aria-hidden="true" />
              Reschedule interview
            </div>
            <h1 className="text-xl font-bold">{APP_NAME}</h1>
          </div>

          <div className="p-6 space-y-5">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading your interview…
              </div>
            )}

            {error && !loading && (
              <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 flex gap-2">
                <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {doneLabel && (
              <div className="text-center py-6 space-y-3">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
                <p className="font-semibold text-slate-900">Reschedule requested</p>
                <p className="text-sm text-slate-600">
                  We&apos;ve proposed <strong>{doneLabel}</strong> to your interviewer.
                  You&apos;ll receive a confirmation once they approve.
                </p>
              </div>
            )}

            {data && !doneLabel && !loading && (
              <>
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Hi {firstName}, need to reschedule?
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {data.interview.jobTitle} · Round {data.interview.roundIndex + 1} ·{" "}
                    {data.interview.durationMinutes} min
                  </p>
                </div>

                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-1">
                    Current time
                  </p>
                  <p className="text-sm font-medium text-amber-900">{data.current.label}</p>
                  <p className="text-xs text-amber-600">({data.current.timezone})</p>
                </div>

                {data.alternatives.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    No alternative slots are available right now. Please contact your recruiter
                    directly.
                  </p>
                ) : (
                  <>
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                        Choose a new time
                      </p>
                      {data.alternatives.map((slot) => (
                        <button
                          key={slot.start}
                          type="button"
                          onClick={() => setSelected(slot.start)}
                          className={`w-full text-left rounded-lg border px-4 py-3 text-sm transition focus:outline-none focus:ring-2 focus:ring-cobalt-600 focus:ring-offset-2 ${
                            selected === slot.start
                              ? "border-cobalt-700 bg-cobalt-700 font-semibold text-white"
                              : "border-slate-300 bg-white text-slate-900 hover:border-cobalt-500 hover:bg-cobalt-50"
                          }`}
                        >
                          {slot.label}
                        </button>
                      ))}
                    </div>

                    <Button
                      className="w-full"
                      disabled={!selected || busy}
                      onClick={() => void handleSubmit()}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Request reschedule"
                      )}
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
