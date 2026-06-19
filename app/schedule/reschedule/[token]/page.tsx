"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

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

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: RescheduleData }
  | { phase: "submitting" }
  | { phase: "done"; label: string };

export default function CandidateReschedulePage() {
  const params = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ phase: "loading" });
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/scheduling/reschedule/${params.token}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) setState({ phase: "error", message: json.error ?? "Failed to load" });
        else setState({ phase: "ready", data: json as RescheduleData });
      })
      .catch((e) => setState({ phase: "error", message: String(e) }));
  }, [params.token]);

  async function handleSubmit() {
    if (!selected) return;
    setState({ phase: "submitting" });
    const res = await fetch(`/api/scheduling/reschedule/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotStart: selected }),
    });
    const json = await res.json();
    if (!res.ok) {
      setState({ phase: "error", message: json.error ?? "Reschedule failed" });
    } else {
      setState({ phase: "done", label: json.newSlot.label });
    }
  }

  if (state.phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading your interview details…</p>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-xl shadow p-8 max-w-md w-full text-center">
          <p className="text-2xl mb-2">⚠️</p>
          <p className="text-gray-700 font-medium">{state.message}</p>
        </div>
      </div>
    );
  }

  if (state.phase === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-xl shadow p-8 max-w-md w-full text-center">
          <p className="text-4xl mb-4">✅</p>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Reschedule requested!</h1>
          <p className="text-gray-600">
            We've proposed <strong>{state.label}</strong> to your interviewer. You'll receive a
            confirmation once they approve.
          </p>
        </div>
      </div>
    );
  }

  if (state.phase === "submitting") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Submitting your reschedule request…</p>
      </div>
    );
  }

  const { data } = state;
  const firstName = data.interview.candidateName?.split(" ")[0] ?? "there";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-lg w-full space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Hi {firstName}, need to reschedule?
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {data.interview.jobTitle} · Round {data.interview.roundIndex + 1} ·{" "}
            {data.interview.durationMinutes} min
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">
            Current time
          </p>
          <p className="text-sm font-medium text-amber-900">{data.current.label}</p>
          <p className="text-xs text-amber-600">({data.current.timezone})</p>
        </div>

        {data.alternatives.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No alternative slots are available right now. Please contact your recruiter directly.
          </p>
        ) : (
          <>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">
                Choose a new time:
              </p>
              <div className="space-y-2">
                {data.alternatives.map((slot) => (
                  <button
                    key={slot.start}
                    onClick={() => setSelected(slot.start)}
                    className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                      selected === slot.start
                        ? "border-blue-500 bg-blue-50 text-blue-800 font-medium"
                        : "border-gray-200 hover:border-gray-300 text-gray-700"
                    }`}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              disabled={!selected}
              onClick={handleSubmit}
              className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-lg font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
            >
              Request reschedule
            </button>
          </>
        )}
      </div>
    </div>
  );
}
