"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, BarChart3, Mail, MessageSquare, Target, DollarSign, Link2 } from "lucide-react";
import { FunnelBar } from "@/components/FunnelBar";
import { AnalyticsEnhancements } from "@/components/AnalyticsEnhancements";
import { formatUsdCost } from "@/lib/llm-pricing";
import { readRouteCache, writeRouteCache } from "@/lib/route-cache";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingState";

interface SchedulingAnalytics {
  counts: {
    total: number;
    confirmed: number;
    pending_approval: number;
    cancelled: number;
    expired: number;
  };
  avgTimeToConfirmHours: number | null;
  prepPacketsSent: number;
  totalRescheduled: number;
}

interface AnalyticsData {
  scope: string;
  jobId: string | null;
  usageUnlocked?: boolean;
  scheduling?: SchedulingAnalytics;
  totals: {
    matches: number;
    candidatesWithInterest: number;
    inboundMessages: number;
    uniqueRepliers: number;
    jobs: number;
    tokens: number;
    cost: number;
  };
  funnel: {
    discovered: number;
    contacted: number;
    replied: number;
    scored: number;
    declined: number;
    replyRate: number;
    scoreRate: number;
    avgInterest: number | null;
  };
  statusCounts: Record<string, number>;
  stageCounts: Record<string, number>;
  queueCounts: {
    pending: number;
    running: number;
    done: number;
    failed: number;
  };
  interview: {
    inProgress: number;
    hired: number;
    rejected: number;
    withdrawn: number;
  };
  invite: {
    uniqueOpens: number;
    uniqueStarted: number;
    uniqueCompleted: number;
    applicants: number;
    totalOpens: number;
  };
  perJob: {
    jobId: string;
    title: string;
    total: number;
    contacted: number;
    replied: number;
    scored: number;
    declined: number;
    tokens: number;
    cost: number;
    inInterview: number;
    hired: number;
    rejected: number;
  }[];
  jobs: { id: string; title: string; status: string | null }[];
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function MetricSummaryCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string | number; highlight?: boolean }[];
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-cobalt-600">
        {title}
      </h3>
      <dl className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 text-sm">
            <dt className="text-slate-600">{row.label}</dt>
            <dd
              className={`font-semibold tabular-nums shrink-0 ${
                row.highlight ? "text-emerald-600" : "text-slate-900"
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition-all duration-200 hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cobalt-50 text-cobalt-600">
          {icon}
        </span>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const cacheKey = "analytics-global";
  const [data, setData] = useState<AnalyticsData | null>(() => readRouteCache(cacheKey));
  const [jobId, setJobId] = useState<string>("");
  const [loading, setLoading] = useState(() => readRouteCache(cacheKey) == null);
  const [error, setError] = useState<string | null>(null);
  const [iconClicks, setIconClicks] = useState(0);
  const [showPasswordBar, setShowPasswordBar] = useState(false);
  const [password, setPassword] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const clickResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const cacheKeyForRequest = jobId ? `analytics-${jobId}` : cacheKey;
    const cached = readRouteCache<AnalyticsData>(cacheKeyForRequest);
    if (!cached) setLoading(true);
    setError(null);
    try {
      const url = jobId ? `/api/analytics?jobId=${jobId}` : "/api/analytics";
      const res = await fetch(url, { cache: "no-store", credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load analytics");
      writeRouteCache(cacheKeyForRequest, json);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (clickResetRef.current) clearTimeout(clickResetRef.current);
    };
  }, []);

  async function lockUsage() {
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      const res = await fetch("/api/analytics/unlock", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Lock failed");
      }
      setShowPasswordBar(false);
      setPassword("");
      await load();
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Lock failed");
    } finally {
      setUnlockBusy(false);
    }
  }

  function handleChartIconClick() {
    if (data?.usageUnlocked) {
      void lockUsage();
      return;
    }
    if (clickResetRef.current) clearTimeout(clickResetRef.current);
    const next = iconClicks + 1;
    if (next >= 5) {
      setShowPasswordBar(true);
      setIconClicks(0);
      setUnlockError(null);
    } else {
      setIconClicks(next);
      clickResetRef.current = setTimeout(() => setIconClicks(0), 2000);
    }
  }

  async function submitUnlock(e: React.FormEvent) {
    e.preventDefault();
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      const res = await fetch("/api/analytics/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Unlock failed");
      setShowPasswordBar(false);
      setPassword("");
      await load();
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Unlock failed");
    } finally {
      setUnlockBusy(false);
    }
  }

  const usageUnlocked = data?.usageUnlocked === true;

  const funnelMax = data?.funnel.discovered
    ? Math.max(data.funnel.discovered, data.funnel.contacted, 1)
    : 1;

  return (
    <PageShell narrow mainClassName="space-y-6">
        <PageHeader
          eyebrow="Insights"
          title={
            <span className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={handleChartIconClick}
                className="inline-flex rounded-xl p-1 text-cobalt-600 transition-colors hover:bg-cobalt-50"
                aria-label="Outreach analytics chart"
              >
                <BarChart3 className="w-6 h-6" />
              </button>
              Outreach analytics
            </span>
          }
          description="Funnel from discovery through reply and interest scoring."
          action={
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600" htmlFor="job-filter">
                Job
              </label>
              <select
                id="job-filter"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="min-w-[200px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-cobalt-400 focus:outline-none focus:ring-2 focus:ring-cobalt-500/15"
              >
                <option value="">All jobs</option>
                {(data?.jobs ?? []).map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </div>
          }
        />

        {showPasswordBar && !usageUnlocked && (
          <form
            onSubmit={(e) => void submitUnlock(e)}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-card"
          >
            <label htmlFor="analytics-unlock-password" className="text-sm text-slate-600 shrink-0">
              Password
            </label>
            <input
              id="analytics-unlock-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              placeholder="Enter unlock password"
              className="flex-1 min-w-[180px] rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
            />
            <Button type="submit" size="sm" disabled={unlockBusy || !password.trim()}>
              {unlockBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              Unlock usage
            </Button>
            <button
              type="button"
              onClick={() => {
                setShowPasswordBar(false);
                setPassword("");
                setUnlockError(null);
              }}
              className="text-sm text-slate-500 hover:text-slate-800 cursor-pointer px-2"
            >
              Cancel
            </button>
            {unlockError && (
              <p className="w-full text-sm text-red-600">{unlockError}</p>
            )}
          </form>
        )}

        {error && <Alert variant="error">{error}</Alert>}

        {loading && !data ? (
          <LoadingSpinner label="Loading analytics…" />
        ) : data ? (
          <>
            <section
              className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
                usageUnlocked ? "lg:grid-cols-6" : "lg:grid-cols-4"
              }`}
            >
              <StatCard
                label="Total matches"
                value={data.totals.matches}
                sub={`Across ${data.totals.jobs} jobs`}
                icon={<Target className="w-4 h-4" />}
              />
              <StatCard
                label="Reply rate"
                value={`${data.funnel.replyRate}%`}
                sub={`${data.funnel.replied} replied of ${data.funnel.contacted} contacted`}
                icon={<MessageSquare className="w-4 h-4" />}
              />
              <StatCard
                label="Scored"
                value={data.funnel.scored}
                sub={
                  data.funnel.avgInterest != null
                    ? `Avg interest ${data.funnel.avgInterest}%`
                    : "No interest scores yet"
                }
                icon={<BarChart3 className="w-4 h-4" />}
              />
              <StatCard
                label="Queue"
                value={data.queueCounts.pending + data.queueCounts.running}
                sub={`${data.queueCounts.failed} failed · ${data.queueCounts.done} done`}
                icon={<Mail className="w-4 h-4" />}
              />
              {usageUnlocked && (
                <>
                  <StatCard
                    label="Tokens used"
                    value={formatTokens(data.totals.tokens)}
                    sub={
                      jobId
                        ? `${data.totals.tokens.toLocaleString()} for selected job`
                        : `${data.totals.tokens.toLocaleString()} across all jobs`
                    }
                    icon={<BarChart3 className="w-4 h-4" />}
                  />
                  <StatCard
                    label="Estimated cost"
                    value={formatUsdCost(data.totals.cost ?? 0)}
                    sub="OpenAI API (USD)"
                    icon={<DollarSign className="w-4 h-4" />}
                  />
                </>
              )}
            </section>

            <Card padding="md" className="space-y-4">
              <div className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-cobalt-600" />
                <h2 className="font-semibold text-slate-900">Invite link funnel</h2>
              </div>
              <p className="text-sm text-slate-500">
                Public application links — unique visitors who opened, started, and completed the
                form.
              </p>
              <FunnelBar
                label="Unique opens"
                value={data.invite?.uniqueOpens ?? 0}
                max={Math.max(data.invite?.uniqueOpens ?? 0, 1)}
                color="bg-cobalt-500"
              />
              <FunnelBar
                label="Started form"
                value={data.invite?.uniqueStarted ?? 0}
                max={Math.max(data.invite?.uniqueOpens ?? 0, 1)}
                color="bg-sky-500"
              />
              <FunnelBar
                label="Completed"
                value={data.invite?.uniqueCompleted ?? 0}
                max={Math.max(data.invite?.uniqueOpens ?? 0, 1)}
                color="bg-emerald-500"
              />
              <FunnelBar
                label="Applicants (via invite)"
                value={data.invite?.applicants ?? 0}
                max={Math.max(data.invite?.uniqueOpens ?? 0, 1)}
                color="bg-amber-500"
              />
            </Card>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card padding="md" className="space-y-4">
                <h2 className="font-semibold text-slate-900">Outreach funnel</h2>
                <FunnelBar
                  label="Discovered (not yet contacted)"
                  value={data.funnel.discovered}
                  max={funnelMax}
                  color="bg-slate-400"
                />
                <FunnelBar
                  label="Contacted (email sent)"
                  value={data.funnel.contacted}
                  max={funnelMax}
                  color="bg-blue-500"
                />
                <FunnelBar
                  label="Replied"
                  value={data.funnel.replied}
                  max={funnelMax}
                  color="bg-cobalt-500"
                />
                <FunnelBar
                  label="Scored (interest finalised)"
                  value={data.funnel.scored}
                  max={funnelMax}
                  color="bg-emerald-500"
                />
                <FunnelBar
                  label="Declined"
                  value={data.funnel.declined}
                  max={funnelMax}
                  color="bg-red-400"
                />
              </Card>

              <Card padding="md" className="space-y-4">
                <h2 className="font-semibold text-slate-900">Pipeline stages</h2>
                {(["new", "shortlisted", "contacted", "archived"] as const).map((stage) => (
                  <FunnelBar
                    key={stage}
                    label={stage.charAt(0).toUpperCase() + stage.slice(1)}
                    value={data.stageCounts[stage] ?? 0}
                    max={data.totals.matches}
                    color={
                      stage === "shortlisted"
                        ? "bg-cobalt-500"
                        : stage === "contacted"
                          ? "bg-blue-500"
                          : stage === "archived"
                            ? "bg-slate-400"
                            : "bg-slate-300"
                    }
                  />
                ))}
                <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <MetricSummaryCard
                    title="Inbound"
                    rows={[
                      {
                        label: "Inbound messages:",
                        value: data.totals.inboundMessages,
                      },
                      {
                        label: "Unique repliers:",
                        value: data.totals.uniqueRepliers,
                        highlight: data.totals.uniqueRepliers > 0,
                      },
                      {
                        label: "Score conversion:",
                        value: `${data.funnel.scoreRate}%`,
                      },
                    ]}
                  />
                  <MetricSummaryCard
                    title="Interview loop"
                    rows={[
                      {
                        label: "In progress:",
                        value: data.interview?.inProgress ?? 0,
                      },
                      {
                        label: "Hired:",
                        value: data.interview?.hired ?? 0,
                        highlight: (data.interview?.hired ?? 0) > 0,
                      },
                      {
                        label: "Rejected:",
                        value: data.interview?.rejected ?? 0,
                      },
                    ]}
                  />
                  {data.scheduling && (
                    <MetricSummaryCard
                      title="Scheduling"
                      rows={[
                        {
                          label: "Sessions confirmed:",
                          value: data.scheduling.counts.confirmed,
                          highlight: data.scheduling.counts.confirmed > 0,
                        },
                        {
                          label: "Pending approval:",
                          value: data.scheduling.counts.pending_approval,
                        },
                        {
                          label: "Cancelled / expired:",
                          value:
                            (data.scheduling.counts.cancelled ?? 0) +
                            (data.scheduling.counts.expired ?? 0),
                        },
                        {
                          label: "Avg time to confirm:",
                          value:
                            data.scheduling.avgTimeToConfirmHours != null
                              ? `${data.scheduling.avgTimeToConfirmHours}h`
                              : "—",
                        },
                        {
                          label: "Prep packets sent:",
                          value: data.scheduling.prepPacketsSent,
                        },
                        {
                          label: "Candidate reschedules:",
                          value: data.scheduling.totalRescheduled,
                        },
                      ]}
                    />
                  )}
                </div>
              </Card>
            </section>

            {data.perJob.length > 0 && (
              <Card padding="none" className="overflow-hidden">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="font-semibold text-slate-900">Per-job breakdown</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-left">
                      <tr>
                        <th className="px-5 py-2 font-medium">Job</th>
                        <th className="px-3 py-2 font-medium text-right">Matches</th>
                        <th className="px-3 py-2 font-medium text-right">Contacted</th>
                        <th className="px-3 py-2 font-medium text-right">Replied</th>
                        <th className="px-3 py-2 font-medium text-right">Scored</th>
                        <th className="px-3 py-2 font-medium text-right">Declined</th>
                        {usageUnlocked && (
                          <>
                            <th className="px-3 py-2 font-medium text-right">Tokens</th>
                            <th className="px-3 py-2 font-medium text-right">Cost</th>
                          </>
                        )}
                        <th className="px-3 py-2 font-medium text-right">In interview</th>
                        <th className="px-3 py-2 font-medium text-right">Hired</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.perJob.map((row) => (
                        <tr key={row.jobId} className="border-t border-slate-100">
                          <td className="px-5 py-2.5">
                            <Link
                              href={`/jobs/${row.jobId}`}
                              className="text-cobalt-600 hover:text-cobalt-700 font-medium"
                            >
                              {row.title}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{row.total}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{row.contacted}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{row.replied}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{row.scored}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{row.declined}</td>
                          {usageUnlocked && (
                            <>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                                {row.tokens > 0 ? formatTokens(row.tokens) : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                                {row.cost > 0 ? formatUsdCost(row.cost) : "—"}
                              </td>
                            </>
                          )}
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {row.inInterview ?? 0}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                            {row.hired ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          {/* Enhanced analytics: cohort analysis, source attribution, time-to-hire */}
          {jobId && (
            <div className="mt-8">
              <AnalyticsEnhancements jobId={jobId} />
            </div>
          )}
          </>
        ) : null}
    </PageShell>
  );
}
