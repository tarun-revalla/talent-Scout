"use client";

import { useEffect, useState } from "react";
import { Clock, TrendingUp, BarChart2 } from "lucide-react";

interface CohortMetrics {
  cohortPeriod: string;
  sourceType: string;
  totalCandidates: number;
  engaged: number;
  interviewed: number;
  hired: number;
  engagementRate: number;
  interviewRate: number;
  hireRate: number;
  averageTimeToHire: number | null;
}

interface SourceAttribution {
  source: string;
  totalCandidates: number;
  engaged: number;
  interviewed: number;
  hired: number;
  engagementRate: number;
  interviewRate: number;
  hireRate: number;
}

interface TimeToHireSummary {
  medianDays: number | null;
  averageDays: number | null;
  hiredCount: number;
  data: { matchId: string; candidateName: string; daysToHire: number | null; status: string }[];
}

interface AnalyticsEnhancementsProps {
  jobId: string;
}

export function AnalyticsEnhancements({ jobId }: AnalyticsEnhancementsProps) {
  const [cohorts, setCohorts] = useState<CohortMetrics[]>([]);
  const [sources, setSources] = useState<SourceAttribution[]>([]);
  const [tth, setTth] = useState<TimeToHireSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/analytics?jobId=${jobId}`);
        const json = await res.json();
        if (res.ok) {
          setCohorts(json.cohorts ?? []);
          setSources(json.sourceAttribution ?? []);
          setTth(json.timeToHire ?? null);
        }
      } catch {
        // silently fail – analytics are non-critical
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [jobId]);

  if (loading) return null;

  const hasData = cohorts.length > 0 || sources.length > 0;
  if (!hasData && !tth?.hiredCount) return null;

  return (
    <div className="space-y-6">
      {/* Time to Hire */}
      {tth && (tth.medianDays != null || tth.hiredCount > 0) && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Clock size={16} className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-800">Time to Hire</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Median days to hire"
              value={tth.medianDays != null ? `${tth.medianDays}d` : "—"}
              sub="from sourced → hired"
            />
            <StatCard
              label="Average days to hire"
              value={tth.averageDays != null ? `${tth.averageDays}d` : "—"}
              sub="across all hires"
            />
            <StatCard
              label="Total hires"
              value={String(tth.hiredCount)}
              sub="confirmed this job"
            />
          </div>

          {/* Days-to-hire distribution */}
          {tth.data.filter((d) => d.status === "hired" && d.daysToHire != null).length > 0 && (
            <div className="mt-3 space-y-1">
              {tth.data
                .filter((d) => d.status === "hired" && d.daysToHire != null)
                .sort((a, b) => (a.daysToHire ?? 0) - (b.daysToHire ?? 0))
                .map((d) => (
                  <div key={d.matchId} className="flex items-center gap-2 text-xs">
                    <span className="w-32 truncate text-slate-700">{d.candidateName}</span>
                    <div className="flex-1 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-blue-500"
                        style={{
                          width: `${Math.min(100, ((d.daysToHire ?? 0) / 90) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-12 text-right font-medium text-slate-600">
                      {d.daysToHire}d
                    </span>
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

      {/* Source Attribution */}
      {sources.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-800">Source Attribution</h3>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {["Source", "Total", "Engaged", "Interviewed", "Hired", "Hire Rate"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-semibold text-slate-600"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sources.map((s, i) => (
                  <tr
                    key={s.source}
                    className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}
                  >
                    <td className="px-3 py-2 font-medium capitalize">{s.source}</td>
                    <td className="px-3 py-2">{s.totalCandidates}</td>
                    <td className="px-3 py-2">
                      {s.engaged}{" "}
                      <span className="text-slate-400">
                        ({s.engagementRate.toFixed(0)}%)
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {s.interviewed}{" "}
                      <span className="text-slate-400">
                        ({s.interviewRate.toFixed(0)}%)
                      </span>
                    </td>
                    <td className="px-3 py-2">{s.hired}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 font-semibold ${
                          s.hireRate >= 10
                            ? "bg-green-100 text-green-700"
                            : s.hireRate >= 3
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {s.hireRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Cohort Analysis */}
      {cohorts.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <BarChart2 size={16} className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-800">Cohort Analysis</h3>
            <span className="text-xs text-slate-500">(by upload month × source)</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {["Cohort", "Source", "Total", "Engaged", "Interviewed", "Hired", "Hire Rate", "Avg Days to Hire"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left font-semibold text-slate-600"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c, i) => (
                  <tr
                    key={`${c.cohortPeriod}-${c.sourceType}`}
                    className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}
                  >
                    <td className="px-3 py-2 font-medium">{c.cohortPeriod}</td>
                    <td className="px-3 py-2 capitalize">{c.sourceType}</td>
                    <td className="px-3 py-2">{c.totalCandidates}</td>
                    <td className="px-3 py-2">
                      {c.engaged}{" "}
                      <span className="text-slate-400">({c.engagementRate.toFixed(0)}%)</span>
                    </td>
                    <td className="px-3 py-2">
                      {c.interviewed}{" "}
                      <span className="text-slate-400">({c.interviewRate.toFixed(0)}%)</span>
                    </td>
                    <td className="px-3 py-2">{c.hired}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 font-semibold ${
                          c.hireRate >= 10
                            ? "bg-green-100 text-green-700"
                            : c.hireRate >= 3
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {c.hireRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {c.averageTimeToHire != null ? `${c.averageTimeToHire}d` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="mt-0.5 text-xs font-medium text-slate-700">{label}</div>
      <div className="text-xs text-slate-500">{sub}</div>
    </div>
  );
}
