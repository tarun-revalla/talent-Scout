"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, AlertCircle, GitCompareArrows } from "lucide-react";
import { CandidateComparison } from "@/components/CandidateComparison";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { LoadingSpinner } from "@/components/ui/LoadingState";
import { useToast } from "@/components/Toast";

const MAX_COMPARE = 5;
const MIN_COMPARE = 2;

interface Match {
  id: string;
  candidate_id: string;
  candidate: { name: string } | null;
  match_score: number | null;
  interest_score: number | null;
  pipeline_stage: string | null;
  interview_state: string | null;
}

interface Job {
  id: string;
  title: string;
}

function isCompareCandidate(m: Match): boolean {
  const stage = m.pipeline_stage ?? "new";
  const interview = m.interview_state ?? "not_started";
  if (["shortlisted", "contacted", "archived"].includes(stage)) return true;
  if (["in_progress", "hired"].includes(interview)) return true;
  return false;
}

export default function ComparePage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();

  const jobId = params.id as string;
  const [job, setJob] = useState<Job | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [jobRes, matchRes] = await Promise.all([
          fetch(`/api/jobs/${jobId}`, { cache: "no-store" }),
          fetch(`/api/jobs/${jobId}/matches`, { cache: "no-store" }),
        ]);
        const [json, matchJson] = await Promise.all([jobRes.json(), matchRes.json()]);
        if (!jobRes.ok) throw new Error(json.error ?? "Failed to load job");
        if (!matchRes.ok) throw new Error(matchJson.error ?? "Failed to load candidates");
        setJob(json.job);
        const all = (matchJson.matches ?? []) as Match[];
        setMatches(all.filter(isCompareCandidate));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, [jobId]);

  const toggleCandidate = useCallback(
    (matchId: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(matchId)) {
          next.delete(matchId);
          return next;
        }
        if (next.size >= MAX_COMPARE) {
          toast(`Select at most ${MAX_COMPARE} candidates`, "info");
          return prev;
        }
        next.add(matchId);
        return next;
      });
    },
    [toast],
  );

  const selectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === matches.length) return new Set();
      return new Set(matches.slice(0, MAX_COMPARE).map((m) => m.id));
    });
  }, [matches]);

  const canCompare =
    selectedIds.size >= MIN_COMPARE && selectedIds.size <= MAX_COMPARE;

  if (loading) {
    return (
      <PageShell>
        <LoadingSpinner label="Loading candidates…" />
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <Alert variant="error">{error}</Alert>
      </PageShell>
    );
  }

  if (!job) {
    return (
      <PageShell>
        <Alert variant="warning">Job not found</Alert>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/jobs/${jobId}`)}
            className="rounded p-2 hover:bg-slate-100"
            aria-label="Back to job"
          >
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <PageHeader
            title="Compare Candidates"
            description={`Side-by-side comparison for ${job.title}`}
            className="mb-0"
          />
        </div>
      </div>

      {!comparing ? (
        <div className="space-y-4">
          <Alert variant="info" className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <div>
              Select {MIN_COMPARE}–{MAX_COMPARE} candidates to compare match scores, interview
              ratings, and interest side-by-side.
            </div>
          </Alert>

          {matches.length === 0 ? (
            <Alert variant="warning">
              No shortlisted or interviewed candidates yet. Shortlist candidates or progress them
              through interviews first.
            </Alert>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {matches.length} candidate{matches.length !== 1 ? "s" : ""} available
                  {selectedIds.size > 0 && (
                    <span className="ml-2 font-normal text-slate-500">
                      · {selectedIds.size} selected
                    </span>
                  )}
                </span>
                <Button variant="secondary" size="sm" onClick={selectAll}>
                  {selectedIds.size === matches.length ? "Clear all" : "Select up to 5"}
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {matches.map((match) => (
                  <button
                    key={match.id}
                    type="button"
                    onClick={() => toggleCandidate(match.id)}
                    className={`rounded-lg border-2 p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-cobalt-600 focus:ring-offset-2 ${
                      selectedIds.has(match.id)
                        ? "border-cobalt-600 bg-cobalt-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="font-semibold">{match.candidate?.name ?? "Unknown"}</div>
                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      <div>
                        Match:{" "}
                        <span className="font-semibold">{match.match_score ?? "—"}</span>
                      </div>
                      <div>
                        Interest:{" "}
                        <span className="font-semibold">{match.interest_score ?? "—"}</span>
                      </div>
                      <div>
                        Stage:{" "}
                        <span className="font-semibold capitalize">
                          {match.pipeline_stage ?? "new"}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="sticky bottom-0 -mx-1 border-t border-slate-200 bg-white/95 px-1 py-4 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-2">
                  <Button
                    disabled={!canCompare}
                    onClick={() => setComparing(true)}
                    className="w-full max-w-xs"
                  >
                    <GitCompareArrows className="h-4 w-4 shrink-0" />
                    Compare {selectedIds.size > 0 ? selectedIds.size : ""} candidate
                    {selectedIds.size === 1 ? "" : "s"}
                  </Button>
                  {selectedIds.size === 1 && (
                    <p className="text-xs text-slate-500">Select at least one more candidate.</p>
                  )}
                  {selectedIds.size === 0 && (
                    <p className="text-xs text-slate-500">
                      Pick {MIN_COMPARE}–{MAX_COMPARE} candidates above.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="secondary" size="sm" onClick={() => setComparing(false)}>
              ← Back to selection
            </Button>
            <span className="text-sm text-slate-600">
              Comparing {selectedIds.size} candidate{selectedIds.size !== 1 ? "s" : ""}
            </span>
          </div>
          <CandidateComparison jobId={jobId} matchIds={Array.from(selectedIds)} />
        </div>
      )}
    </PageShell>
  );
}
