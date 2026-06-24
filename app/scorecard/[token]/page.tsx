"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/Button";
import { APP_NAME, BRAND } from "@/lib/brand";

type Recommendation = "strong_yes" | "yes" | "no" | "strong_no";

const RECOMMENDATIONS: { value: Recommendation; label: string; tone: string }[] = [
  { value: "strong_yes", label: "Strong yes", tone: "border-emerald-500 bg-emerald-50 text-emerald-700" },
  { value: "yes", label: "Yes", tone: "border-emerald-300 bg-emerald-50/60 text-emerald-700" },
  { value: "no", label: "No", tone: "border-red-300 bg-red-50/60 text-red-700" },
  { value: "strong_no", label: "Strong no", tone: "border-red-500 bg-red-50 text-red-700" },
];

interface ScorecardData {
  status: string;
  interviewerName: string;
  candidateName: string | null;
  jobTitle: string;
  roundName: string;
  recommendation?: Recommendation | null;
  overallRating?: number | null;
  technicalRating?: number | null;
  communicationRating?: number | null;
  notes?: string | null;
}

function StarRating({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-600">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="cursor-pointer p-0.5"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
          >
            <Star
              className={`h-5 w-5 ${
                n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ScorecardPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<ScorecardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [overall, setOverall] = useState(0);
  const [technical, setTechnical] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/scorecards/${params.token}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Link not found");
      setData(json as ScorecardData);
      if (json.status === "submitted") {
        setDone(true);
      } else {
        if (json.recommendation) setRecommendation(json.recommendation as Recommendation);
        if (json.overallRating) setOverall(json.overallRating);
        if (json.technicalRating) setTechnical(json.technicalRating);
        if (json.communicationRating) setCommunication(json.communicationRating);
        if (json.notes) setNotes(json.notes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [params.token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!recommendation) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/scorecards/${params.token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recommendation,
          overallRating: overall || undefined,
          technicalRating: technical || undefined,
          communicationRating: communication || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to submit");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
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
            style={{
              background: `linear-gradient(135deg, ${BRAND.colors.primary}, ${BRAND.colors.primaryLight})`,
            }}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-white/80 mb-1">
              Interview scorecard
            </p>
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

            {done && (
              <div className="text-center py-6 space-y-3">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
                <p className="font-semibold text-slate-900">Feedback submitted</p>
                <p className="text-sm text-slate-600">
                  Thank you — your scorecard has been recorded.
                </p>
              </div>
            )}

            {data && !done && !loading && (
              <>
                {data.recommendation && (
                  <p className="text-xs text-cobalt-700 bg-cobalt-50 border border-cobalt-100 rounded-lg px-3 py-2">
                    Quick recommendation saved — add ratings and notes below, then submit.
                  </p>
                )}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Candidate
                  </p>
                  <h2 className="text-lg font-bold text-slate-900 mt-1">
                    {data.candidateName ?? "Candidate"}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {data.jobTitle} · {data.roundName}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">Hire recommendation</p>
                  <div className="grid grid-cols-2 gap-2">
                    {RECOMMENDATIONS.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setRecommendation(r.value)}
                        className={`rounded-lg border px-3 py-2.5 text-sm font-medium cursor-pointer transition-colors ${
                          recommendation === r.value
                            ? r.tone + " ring-1"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <StarRating label="Overall" value={overall} onChange={setOverall} />
                  <StarRating label="Technical" value={technical} onChange={setTechnical} />
                  <StarRating
                    label="Communication"
                    value={communication}
                    onChange={setCommunication}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    placeholder="Strengths, concerns, anything the team should know…"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-cobalt-400 focus:outline-none focus:ring-2 focus:ring-cobalt-500/20"
                  />
                </div>

                <Button
                  className="w-full"
                  disabled={busy || !recommendation}
                  onClick={() => void submit()}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Submit feedback
                </Button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
