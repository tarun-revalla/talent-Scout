"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { ExpandableSkillChips } from "@/components/ExpandableSkillChips";
import { type MatchRow, type DrawerTab, combinedScore } from "@/components/MatchTable";
import { TopCandidatesTable } from "@/components/TopCandidatesTable";
import { formatJobLocation, formatJobSalary } from "@/lib/job-display";
import { CandidateDrawer } from "@/components/CandidateDrawer";
import { ViewJDModal } from "@/components/ViewJDModal";
import { JobSetupPanel, JobConfigureMenu } from "@/components/JobSetupPanel";
import { JobStatusToggle } from "@/components/JobStatusToggle";
import { EditJDModal } from "@/components/EditJDModal";
import { EmailTemplateModal } from "@/components/EmailTemplateModal";
import { EditRoundsModal } from "@/components/EditRoundsModal";
import { ScorecardSummaryPanel } from "@/components/ScorecardSummaryPanel";
import { useToast } from "@/components/Toast";
import { Alert } from "@/components/ui/Alert";
import { LoadingSpinner } from "@/components/ui/LoadingState";
import { supabaseBrowser } from "@/lib/db";
import { readRouteCache, writeRouteCache, isRouteCacheFresh } from "@/lib/route-cache";
import { resolveEmailSettings } from "@/lib/email-templates";
import type { EmailSettings, InterviewRound } from "@/lib/schemas";

interface JobDetails {
  id: string;
  title: string;
  raw_jd: string;
  weights: { match: number; interest: number } | null;
  auto_engage_threshold: number | null;
  auto_engage_enabled: boolean | null;
  status: "open" | "closed" | "draft" | null;
  email_settings?: EmailSettings | null;
  interview_rounds?: InterviewRound[] | null;
  cooling_period_months?: number | null;
  hires_target?: number | null;
  parsed_jd: {
    title: string;
    level: string;
    must_have_skills: string[];
    nice_to_have_skills: string[];
    years_min: number | null;
    location: string | null;
    remote: string;
    salary_range: { min: number | null; max: number | null; currency: string | null };
    summary: string;
  };
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const toast = useToast();
  const jobCacheKey = `job-${id}`;
  const matchesCacheKey = `matches-${id}`;
  const CACHE_TTL_MS = 30_000;
  const [job, setJob] = useState<JobDetails | null>(() => readRouteCache(jobCacheKey));
  const [matches, setMatches] = useState<MatchRow[]>(() => readRouteCache(matchesCacheKey) ?? []);
  const [loading, setLoading] = useState(() => readRouteCache(jobCacheKey) == null);
  const [matchesLoading, setMatchesLoading] = useState(
    () => readRouteCache(matchesCacheKey) == null,
  );
  const [matching, setMatching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [weights, setWeights] = useState<{ match: number; interest: number }>({
    match: 0.5,
    interest: 0.5,
  });
  const [threshold, setThreshold] = useState<number>(55);
  const [autoEnabled, setAutoEnabled] = useState<boolean>(false);
  const [jobStatus, setJobStatus] = useState<"open" | "closed" | "draft">("open");
  const [editing, setEditing] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingRounds, setEditingRounds] = useState(false);
  const [drawerMatchId, setDrawerMatchId] = useState<string | null>(null);
  const [drawerInitialTab, setDrawerInitialTab] = useState<DrawerTab>("overview");
  const [matchPage, setMatchPage] = useState(1);
  const [rescoreOpen, setRescoreOpen] = useState(false);
  const [viewingJD, setViewingJD] = useState(false);
  const matchPerPage = 10;

  function closeDrawer() {
    setDrawerMatchId(null);
  }
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyJob = useCallback((j: JobDetails) => {
    setJob(j);
    if (j.weights) {
      const w = j.weights as { match?: number; interest?: number };
      setWeights({
        match: typeof w.match === "number" ? w.match : 0.5,
        interest: typeof w.interest === "number" ? w.interest : 0.5,
      });
    }
    if (typeof j.auto_engage_threshold === "number") {
      setThreshold(j.auto_engage_threshold);
    }
    setAutoEnabled(Boolean(j.auto_engage_enabled));
    if (j.status === "closed" || j.status === "open" || j.status === "draft") {
      setJobStatus(j.status);
    }
  }, []);

  const refreshJob = useCallback(
    async (silent = false) => {
      if (!silent && readRouteCache(jobCacheKey) == null) setLoading(true);
      try {
        const jres = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
        const jjson = await jres.json();
        if (!jres.ok) throw new Error(jjson.error ?? "Failed to load job");
        writeRouteCache(jobCacheKey, jjson.job);
        applyJob(jjson.job);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown");
      } finally {
        setLoading(false);
      }
    },
    [id, jobCacheKey, applyJob],
  );

  const refreshMatches = useCallback(
    async (silent = false) => {
      if (!silent && readRouteCache(matchesCacheKey) == null) setMatchesLoading(true);
      try {
        const mres = await fetch(`/api/jobs/${id}/matches`, { cache: "no-store" });
        const mjson = await mres.json();
        if (mres.ok) {
          writeRouteCache(matchesCacheKey, mjson.matches ?? []);
          setMatches(mjson.matches ?? []);
        }
      } finally {
        setMatchesLoading(false);
      }
    },
    [id, matchesCacheKey],
  );

  const refresh = useCallback(
    async (opts?: { silent?: boolean; force?: boolean }) => {
      const silent = opts?.silent ?? false;
      const force = opts?.force ?? false;
      if (
        !force &&
        isRouteCacheFresh(jobCacheKey, CACHE_TTL_MS) &&
        isRouteCacheFresh(matchesCacheKey, CACHE_TTL_MS)
      ) {
        return;
      }
      setError(null);
      await Promise.all([refreshJob(silent), refreshMatches(silent)]);
    },
    [jobCacheKey, matchesCacheKey, refreshJob, refreshMatches],
  );

  useEffect(() => {
    const cachedJob = readRouteCache<JobDetails>(jobCacheKey);
    const cachedMatches = readRouteCache<MatchRow[]>(matchesCacheKey);
    setJob(cachedJob);
    setMatches(cachedMatches ?? []);
    setLoading(cachedJob == null);
    setMatchesLoading(cachedMatches == null);
    void refresh({ silent: cachedJob != null && cachedMatches != null });
  }, [id, jobCacheKey, matchesCacheKey, refresh]);

  // Live updates via Supabase Realtime.
  useEffect(() => {
    if (!id) return;
    const sb = supabaseBrowser();
    const channelName = `job-${id}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = sb
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `job_id=eq.${id}` },
        () => void refreshMatches(true),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${id}` },
        () => void refreshJob(true),
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [id, refreshJob, refreshMatches]);

  async function runMatch(force: boolean) {
    setMatching(true);
    setError(null);
    setStatus(null);
    try {
      const url = force ? `/api/jobs/${id}/rescore` : `/api/jobs/${id}/match`;
      const res = await fetch(url, { method: "POST" });
      const json = (await res.json()) as {
        shortlistSize?: number;
        autoShortlisted?: number;
        autoEnqueued?: number;
        threshold?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Match run failed");
      const t = Math.round(json.threshold ?? threshold);
      const eng = json.autoEnqueued ?? 0;
      const sl = json.autoShortlisted ?? 0;
      const message =
        `${force ? "Rescored" : "Matched"} ${json.shortlistSize ?? 0}. ` +
        `Auto-shortlisted ${sl}. ` +
        `Auto-engaging ${eng} candidate${eng === 1 ? "" : "s"} ≥ ${t}%.`;
      setStatus(message);
      toast(message, "success");
      await refresh({ force: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown";
      setError(msg);
      toast(msg, "error");
    } finally {
      setMatching(false);
    }
  }
  const findMatches = () => runMatch(false);
  const forceRescore = () => runMatch(true);

  const selectableTopN = useCallback(
    (n: number) => {
      const ids = matches
        .filter((m) => !!m.candidate?.email)
        .slice(0, n)
        .map((m) => m.id);
      setSelected(new Set(ids));
    },
    [matches],
  );

  const subThresholdSelectedIds = useMemo(
    () =>
      matches
        .filter(
          (m) =>
            selected.has(m.id) &&
            !!m.candidate?.email &&
            (m.match_score ?? 0) < threshold &&
            m.status === "discovered",
        )
        .map((m) => m.id),
    [matches, selected, threshold],
  );

  const drawerMatch = useMemo(
    () => matches.find((m) => m.id === drawerMatchId) ?? null,
    [matches, drawerMatchId],
  );

  // Per-job pipeline stage tabs.
  const [stageTab, setStageTab] = useState<string>("all");
  const stageCounts = useMemo(() => {
    const c: Record<string, number> = {
      all: matches.length,
      new: 0,
      shortlisted: 0,
      contacted: 0,
      archived: 0,
    };
    for (const m of matches) {
      const s = m.pipeline_stage ?? "new";
      if (c[s] != null) c[s]++;
    }
    return c;
  }, [matches]);
  const visibleMatches = useMemo(() => {
    if (stageTab === "all") return matches;
    return matches.filter((m) => (m.pipeline_stage ?? "new") === stageTab);
  }, [matches, stageTab]);

  useEffect(() => {
    setMatchPage(1);
  }, [stageTab, matches.length]);

  const targetSkills = useMemo(() => {
    if (!job) return [];
    return [
      ...job.parsed_jd.must_have_skills,
      ...job.parsed_jd.nice_to_have_skills,
    ];
  }, [job]);

  const hiredCount = useMemo(
    () => matches.filter((m) => m.interview_state === "hired").length,
    [matches],
  );

  const topCandidateAvatars = useMemo(() => {
    const sorted = [...matches].sort((a, b) => {
      const sa = combinedScore(a, weights) ?? a.match_score ?? 0;
      const sb = combinedScore(b, weights) ?? b.match_score ?? 0;
      return sb - sa;
    });
    return sorted.filter((m) => m.candidate?.name || m.candidate?.email);
  }, [matches, weights]);

  const avatarPreview = topCandidateAvatars.slice(0, 2);
  const avatarOverflow = Math.max(0, topCandidateAvatars.length - 2);

  const jobLocation = job ? formatJobLocation(job.parsed_jd) : null;
  const jobSalary = job ? formatJobSalary(job.parsed_jd) : null;

  const STAGE_TABS = [
    { id: "all", label: "All" },
    { id: "new", label: "New" },
    { id: "shortlisted", label: "Shortlisted" },
    { id: "contacted", label: "Contacted" },
    { id: "archived", label: "Archived" },
  ] as const;

  async function archiveJob() {
    if (!confirm("Close this job posting? Matching and outreach will be disabled.")) return;
    const res = await fetch(`/api/jobs/${id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    if (res.ok) {
      setJobStatus("closed");
      toast("Job archived (closed)", "success");
    } else {
      toast("Failed to archive job", "error");
    }
  }

  return (
    <div className="flex min-w-0 flex-1 min-h-[calc(100vh-4rem)]">
      <div className="min-w-0 flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <nav className="flex items-center text-sm text-slate-500">
            <Link href="/jobs" className="hover:text-cobalt-700 cursor-pointer">
              Jobs
            </Link>
            <ChevronRight className="w-4 h-4 mx-2 text-slate-400" />
            <span className="font-medium text-slate-900 truncate">
              {job?.title ?? "…"}
            </span>
          </nav>

          {error && <Alert variant="error">{error}</Alert>}
          {status && (
            <Alert variant="success">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> {status}
              </span>
            </Alert>
          )}

          {loading && !job ? (
            <LoadingSpinner label="Loading job…" />
          ) : job ? (
            <>
              <header className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 truncate">
                        {job.title}
                      </h1>
                      <JobStatusToggle
                        jobId={id}
                        status={jobStatus}
                        onChange={setJobStatus}
                      />
                    </div>
                    <p className="mt-1.5 text-sm text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {jobLocation && <span>{jobLocation}</span>}
                      {job.parsed_jd.years_min != null && (
                        <span>{job.parsed_jd.years_min}+ yrs</span>
                      )}
                      {jobSalary && <span>{jobSalary}</span>}
                      {(job.interview_rounds?.length ?? 0) > 0 && (
                        <span>{job.interview_rounds!.length} rounds</span>
                      )}
                      {job.hires_target != null && (
                        <span>
                          {hiredCount}/{job.hires_target} hired
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {topCandidateAvatars.length > 0 && (
                      <div
                        className="hidden sm:flex items-center -space-x-2"
                        title={`${topCandidateAvatars.length} candidates`}
                      >
                        {avatarPreview.map((m) => (
                          <Avatar
                            key={m.id}
                            name={m.candidate?.name ?? m.candidate?.email}
                            size="sm"
                            className="border-2 border-white"
                          />
                        ))}
                        {avatarOverflow > 0 && (
                          <div className="w-7 h-7 rounded-full border-2 border-white bg-slate-100 text-[10px] font-bold text-slate-500 flex items-center justify-center">
                            +{avatarOverflow}
                          </div>
                        )}
                      </div>
                    )}
                    <JobConfigureMenu
                      disabled={jobStatus === "closed"}
                      onEditJd={() => setEditing(true)}
                      onEditEmail={() => setEditingEmail(true)}
                      onEditRounds={() => setEditingRounds(true)}
                      onArchive={() => void archiveJob()}
                    />
                    <div className="relative flex items-stretch shadow-sm">
                      <button
                        onClick={findMatches}
                        disabled={matching || jobStatus === "closed"}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-cobalt-600 hover:bg-cobalt-700 disabled:opacity-40 text-white rounded-l-lg text-sm font-semibold cursor-pointer transition-colors border-r border-cobalt-700"
                      >
                        {matching ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        {matching ? "…" : matches.length ? "Re-match" : "Match"}
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setRescoreOpen((o) => !o)}
                          disabled={matching || jobStatus === "closed" || matches.length === 0}
                          className="h-full px-2.5 bg-cobalt-600 hover:bg-cobalt-700 disabled:opacity-40 text-white rounded-r-lg flex items-center cursor-pointer"
                          aria-label="More match actions"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        {rescoreOpen && (
                          <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                            <button
                              type="button"
                              onClick={() => {
                                setRescoreOpen(false);
                                void forceRescore();
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                            >
                              <Sparkles className="w-4 h-4 text-slate-500" />
                              Force rescore
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {(job.parsed_jd.summary || targetSkills.length > 0) && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {targetSkills.length > 0 && (
                      <ExpandableSkillChips
                        skills={targetSkills}
                        limit={4}
                        className="flex flex-wrap gap-1.5"
                        chipClassName="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-xs font-medium"
                        moreClassName="px-2 py-0.5 text-xs text-cobalt-600 hover:text-cobalt-700 cursor-pointer"
                      />
                    )}
                    {(job.parsed_jd.summary || job.raw_jd) && (
                      <>
                        {targetSkills.length > 0 && (
                          <span className="text-slate-300 hidden sm:inline">·</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setViewingJD(true)}
                          className="text-xs text-cobalt-600 hover:text-cobalt-700 font-medium cursor-pointer"
                        >
                          View full JD
                        </button>
                      </>
                    )}
                  </div>
                )}
              </header>

              <JobSetupPanel
                jobId={id}
                jobTitle={job.title}
                jobStatus={jobStatus}
                jobRounds={job.interview_rounds ?? []}
                matches={matches}
                weights={weights}
                threshold={threshold}
                autoEnabled={autoEnabled}
                subThresholdSelectedIds={subThresholdSelectedIds}
                selectedCount={selected.size}
                onSelectTopN={selectableTopN}
                onClearSelection={() => setSelected(new Set())}
                onWeightsChange={setWeights}
                onThresholdChange={setThreshold}
                onAutoEnabledChange={setAutoEnabled}
                onRefresh={() => void refreshMatches(true)}
                onEngageResult={(result) => {
                  const n = result.autoEnqueued ?? 0;
                  if (n > 0) {
                    const t = Math.round(result.threshold ?? threshold);
                    toast(
                      `Auto-engaging ${n} candidate${n === 1 ? "" : "s"} ≥ ${t}%`,
                      "success",
                    );
                    void refresh({ force: true });
                  }
                }}
              />

              {(job.interview_rounds?.length ?? 0) > 0 && (
                <ScorecardSummaryPanel jobId={id} jobRounds={job.interview_rounds ?? []} />
              )}

              <section className="min-w-0 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-3 sm:px-4 lg:px-5 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <h2 className="text-lg font-bold text-slate-900">
                    Candidates
                    <span className="ml-2 text-sm font-normal text-slate-400 tabular-nums">
                      {visibleMatches.length}
                    </span>
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {STAGE_TABS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setStageTab(t.id)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                          stageTab === t.id
                            ? "bg-cobalt-600 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {t.label}{" "}
                        <span className="tabular-nums opacity-80">{stageCounts[t.id] ?? 0}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <TopCandidatesTable
                  rows={visibleMatches}
                  loading={matchesLoading && matches.length === 0}
                  weights={weights}
                  threshold={threshold}
                  autoEnabled={autoEnabled}
                  jobOpen={jobStatus === "open"}
                  page={matchPage}
                  perPage={matchPerPage}
                  total={visibleMatches.length}
                  onPageChange={setMatchPage}
                  onOpenCandidate={(mid, tab) => {
                    setDrawerInitialTab(tab ?? "overview");
                    setDrawerMatchId(mid);
                  }}
                />
              </section>
            </>
          ) : null}

          <AnimatePresence>
            {editing && job && (
              <EditJDModal
                jobId={id}
                initialJD={job.raw_jd}
                onClose={() => setEditing(false)}
                onSaved={() => {
                  setStatus("JD updated — match re-run.");
                  toast("JD updated — match re-run.", "success");
                  void refresh({ force: true });
                }}
              />
            )}
            {editingEmail && job && (
              <EmailTemplateModal
                jobId={id}
                initialSettings={resolveEmailSettings(job.email_settings)}
                onClose={() => setEditingEmail(false)}
                onSaved={() => {
                  toast("Email templates saved.", "success");
                  void refresh({ force: true });
                }}
              />
            )}
            {editingRounds && job && (
              <EditRoundsModal
                jobId={id}
                onClose={() => setEditingRounds(false)}
                onSaved={() => {
                  toast("Interview rounds saved.", "success");
                  void refresh({ force: true });
                }}
              />
            )}
            {viewingJD && job && (
              <ViewJDModal
                title={job.title}
                rawJD={job.raw_jd}
                onClose={() => setViewingJD(false)}
              />
            )}
          </AnimatePresence>
      </div>

      <AnimatePresence>
        {drawerMatch && (
          <CandidateDrawer
            key={drawerMatch.id}
            match={drawerMatch}
            jobId={id}
            weights={weights}
            jobRounds={job?.interview_rounds ?? []}
            initialTab={drawerInitialTab}
            onClose={closeDrawer}
            onChanged={() => void refreshMatches(true)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
