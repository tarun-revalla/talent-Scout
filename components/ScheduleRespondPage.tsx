"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, CheckCircle2, Loader2, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/Button";
import { APP_NAME, BRAND } from "@/lib/brand";
import { formatLocalShort } from "@/lib/dates";

interface SlotOption {
  start: string;
  end: string;
}

interface ProposalData {
  status: string;
  slotStart: string;
  slotEnd: string;
  slots: SlotOption[];
  timezone: string;
  durationMinutes: number;
  jobTitle: string;
  roundName: string;
  candidateName: string | null;
  interviewers: string[];
}

export function ScheduleRespondPage({ token }: { token: string }) {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"accept" | "reject" | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/schedule/respond/${token}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Link not found");
      const parsed = json as ProposalData;
      setData(parsed);
      // Preselect the only option when single-slot.
      if (parsed.slots?.length === 1) setSelectedSlot(parsed.slots[0]!.start);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    setMounted(true);
    void load();
  }, [load]);

  const selectedSlotLabel = useMemo(() => {
    if (!selectedSlot) return null;
    return formatLocalShort(selectedSlot);
  }, [selectedSlot]);

  async function respond(action: "accept" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/schedule/respond/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          selectedSlotStart: action === "accept" ? selectedSlot ?? undefined : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to respond");
      setDone(action);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to respond");
    } finally {
      setBusy(false);
    }
  }

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
            style={{ background: `linear-gradient(135deg, ${BRAND.colors.primary}, ${BRAND.colors.primaryLight})` }}
          >
            <div className="flex items-center gap-2 text-white/90 text-sm mb-1">
              {mounted && <Calendar className="h-4 w-4" aria-hidden="true" />}
              Interview scheduling
            </div>
            <h1 className="text-xl font-bold">{APP_NAME}</h1>
          </div>

          <div className="p-6 space-y-5">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading…
              </div>
            )}

            {error && !loading && (
              <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {done === "accept" && (
              <div className="text-center py-6 space-y-3">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
                <p className="font-semibold text-slate-900">Time confirmed</p>
                <p className="text-sm text-slate-600">
                  Thanks! The candidate will receive a calendar invite shortly.
                </p>
              </div>
            )}

            {done === "reject" && (
              <div className="text-center py-6 space-y-3">
                <XCircle className="h-12 w-12 text-amber-500 mx-auto" />
                <p className="font-semibold text-slate-900">Thanks for letting us know</p>
                <p className="text-sm text-slate-600">
                  We&apos;ll propose the next available slot automatically.
                </p>
              </div>
            )}

            {data && !done && !loading && data.status === "pending" && (
              <>
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Role</p>
                  <p className="font-semibold text-slate-900">{data.jobTitle}</p>
                  <p className="text-sm text-slate-600">{data.roundName}</p>
                </div>

                {data.slots.length > 1 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                      Pick a time ({data.durationMinutes} min · {data.timezone})
                    </p>
                    <div className="grid gap-2">
                      {data.slots.map((slot) => (
                        <button
                          key={slot.start}
                          type="button"
                          onClick={() => setSelectedSlot(slot.start)}
                          className={`group flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-cobalt-600 focus:ring-offset-2 ${
                            selectedSlot === slot.start
                              ? "border-cobalt-700 bg-cobalt-700 font-semibold text-white shadow-sm"
                              : "border-slate-300 bg-white text-slate-900 hover:border-cobalt-500 hover:bg-cobalt-50"
                          }`}
                        >
                          <span>{mounted ? formatLocalShort(slot.start) : "Loading time..."}</span>
                          <span
                            className={`ml-3 h-4 w-4 rounded-full border ${
                              selectedSlot === slot.start
                                ? "border-white bg-white shadow-inner"
                                : "border-slate-400 group-hover:border-cobalt-600"
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                      ))}
                    </div>
                    {selectedSlotLabel && (
                      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                        Selected: {selectedSlotLabel}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg bg-slate-900 border border-slate-900 p-4 space-y-2 text-white">
                    <p className="text-xs font-bold uppercase tracking-wide text-cobalt-100">
                      Proposed time
                    </p>
                    <p className="text-lg font-bold">
                      {mounted ? formatLocalShort(data.slotStart) : "Loading time..."}
                    </p>
                    <p className="text-xs text-slate-200">
                      {data.durationMinutes} minutes · {data.timezone}
                    </p>
                  </div>
                )}

                <div className="text-sm text-slate-600 space-y-1">
                  <p>
                    <span className="text-slate-400">Candidate: </span>
                    {data.candidateName ?? "—"}
                  </p>
                  {data.interviewers.length > 0 && (
                    <p>
                      <span className="text-slate-400">Panel: </span>
                      {data.interviewers.join(", ")}
                    </p>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="primary"
                    className="flex-1"
                    disabled={busy || (data.slots.length > 1 && !selectedSlot)}
                    onClick={() => void respond("accept")}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ThumbsUp className="h-4 w-4" />
                    )}
                    {data.slots.length > 1 ? "Confirm selected time" : "Accept"}
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    disabled={busy}
                    onClick={() => void respond("reject")}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ThumbsDown className="h-4 w-4" />
                    )}
                    {data.slots.length > 1 ? "None work" : "Decline"}
                  </Button>
                </div>
              </>
            )}

            {data && !done && !loading && data.status !== "pending" && (
              <div className="text-center py-6 text-sm text-slate-600">
                This proposal was already <strong>{data.status}</strong>.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
