"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { CandidateComparison } from "@/components/CandidateComparison";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useToast } from "@/components/Toast";

interface Match {
  id: string;
  candidate_id: string;
  candidate: { name: string } | null;
  match_score: number;
  interest_score: number;
  pipeline_stage: string;
}

interface Job {
  id: string;
  title: string;
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

  // Fetch job and matches
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load job");
        setJob(json.job);

        // Fetch matches for this job (filter to contacted/archived stage - final candidates)
        const matchRes = await fetch(`/api/jobs/${jobId}/matches?stage=contacted,archived`);
        const matchJson = await matchRes.json();
        if (!matchRes.ok) throw new Error(matchJson.error ?? "Failed to load candidates");
        setMatches(matchJson.matches ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [jobId]);

  const toggleCandidate = useCallback((matchId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedIds.size === matches.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(matches.map((m) => m.id)));
    }
  }, [matches, selectedIds.size]);

  const hasSelection = selectedIds.size > 0;

  if (loading) return <PageShell><div className="py-8 text-center">Loading...</div></PageShell>;
  if (error) return (
    <PageShell>
      <Alert variant="warning">Error: {error}</Alert>
    </PageShell>
  );
  if (!job) return (
    <PageShell>
      <Alert variant="warning">Job not found</Alert>
    </PageShell>
  );

  return (
    <PageShell>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="rounded p-2 hover:bg-slate-100"
          >
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <PageHeader
            title="Compare Candidates"
            description={`Final round candidates for ${job.title}`}
            className="mb-0"
          />
        </div>
      </div>

      {!hasSelection ? (
        <div className="space-y-4">
          <Alert variant="info" className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <div>
              Select 2–5 candidates to compare side-by-side. Compare match scores, interview ratings, interest, and build a weighted composite score.
            </div>
          </Alert>

          {matches.length === 0 ? (
            <Alert variant="warning">
              No candidates in final rounds. Progress some candidates through interviews first.
            </Alert>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {matches.length} candidate{matches.length !== 1 ? "s" : ""} available
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={selectAll}
                >
                  {selectedIds.size === matches.length ? "Clear All" : "Select All"}
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {matches.map((match) => (
                  <button
                    key={match.id}
                    onClick={() => toggleCandidate(match.id)}
                    className={`rounded-lg border-2 p-4 text-left transition ${
                      selectedIds.has(match.id)
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="font-semibold">{match.candidate?.name ?? "Unknown"}</div>
                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      <div>Match: <span className="font-semibold">{match.match_score ?? 0}</span></div>
                      <div>Interest: <span className="font-semibold">{match.interest_score ?? 0}</span></div>
                      <div>Stage: <span className="font-semibold">{match.pipeline_stage}</span></div>
                    </div>
                  </button>
                ))}
              </div>

              {selectedIds.size >= 2 && selectedIds.size <= 5 && (
                <div className="mt-6 flex justify-center">
                  <Button onClick={() => {}} disabled className="opacity-50">
                    Ready to compare {selectedIds.size} candidates
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Back to Selection
            </Button>
            <span className="text-sm text-slate-600">
              Comparing {selectedIds.size} candidate{selectedIds.size !== 1 ? "s" : ""}
            </span>
          </div>
          <CandidateComparison
            jobId={jobId}
            matchIds={Array.from(selectedIds)}
            onClose={() => setSelectedIds(new Set())}
          />
        </div>
      )}
    </PageShell>
  );
}
