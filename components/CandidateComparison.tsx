"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronUp, ChevronDown, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

interface ComparableCandidate {
  matchId: string;
  candidateId: string;
  candidateName: string;
  email: string;
  skills: string[];
  yearsExperience: number;
  education: Array<{ school?: string; degree?: string; field?: string }>;
  matchScore: number;
  interestScore: number;
  scorecardCount: number;
  averageOverall: number | null;
  averageTechnical: number | null;
  averageCommunication: number | null;
  recommendations: {
    strong_yes: number;
    yes: number;
    no: number;
    strong_no: number;
  };
}

interface CandidateComparisonProps {
  jobId: string;
  matchIds: string[];
  onClose?: () => void;
}

type SortKey =
  | "candidateName"
  | "matchScore"
  | "interestScore"
  | "averageOverall"
  | "averageTechnical"
  | "yearsExperience";

export function CandidateComparison({ jobId, matchIds }: CandidateComparisonProps) {
  const [candidates, setCandidates] = useState<ComparableCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("matchScore");
  const [sortAsc, setSortAsc] = useState(false);
  const [weights, setWeights] = useState({
    matchScore: 0.4,
    interestScore: 0.3,
    averageOverall: 0.3,
  });

  const fetchCandidates = useCallback(async () => {
    if (matchIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to fetch candidates");
      setCandidates(json.candidates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [jobId, matchIds]);

  useEffect(() => {
    void fetchCandidates();
  }, [fetchCandidates]);

  // Sort candidates
  const sorted = useMemo(() => {
    const copy = [...candidates];
    copy.sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      if (sortKey === "candidateName") {
        aVal = a.candidateName ?? "";
        bVal = b.candidateName ?? "";
      } else if (sortKey === "matchScore") {
        aVal = a.matchScore ?? 0;
        bVal = b.matchScore ?? 0;
      } else if (sortKey === "interestScore") {
        aVal = a.interestScore ?? 0;
        bVal = b.interestScore ?? 0;
      } else if (sortKey === "averageOverall") {
        aVal = a.averageOverall ?? 0;
        bVal = b.averageOverall ?? 0;
      } else if (sortKey === "averageTechnical") {
        aVal = a.averageTechnical ?? 0;
        bVal = b.averageTechnical ?? 0;
      } else {
        aVal = a.yearsExperience ?? 0;
        bVal = b.yearsExperience ?? 0;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return copy;
  }, [candidates, sortKey, sortAsc]);

  // Calculate weighted composite score
  const withComposite = useMemo(
    () =>
      sorted.map((c) => {
        const weighted =
          (c.matchScore ?? 0) * weights.matchScore +
          (c.interestScore ?? 0) * weights.interestScore +
          ((c.averageOverall ?? 0) / 5) * 100 * weights.averageOverall;
        return { ...c, compositeScore: Math.round(weighted) };
      }),
    [sorted, weights],
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const handleExport = () => {
    const csv =
      [
        [
          "Name",
          "Email",
          "Years Experience",
          "Match Score",
          "Interest Score",
          "Avg Interview Rating",
          "Composite Score",
        ].join(","),
        ...withComposite.map((c) =>
          [
            c.candidateName ?? "",
            c.email ?? "",
            c.yearsExperience,
            c.matchScore ?? 0,
            c.interestScore ?? 0,
            c.averageOverall?.toFixed(1) ?? "N/A",
            c.compositeScore,
          ].join(","),
        ),
      ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `candidates-comparison-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin text-cobalt-600" aria-hidden />
        <span className="text-sm font-medium">Building comparison…</span>
      </div>
    );
  }
  if (error) return <Alert variant="warning">Error: {error}</Alert>;
  if (candidates.length === 0) {
    return <div className="py-8 text-center text-slate-600">No candidates to compare</div>;
  }

  const SortHeader = ({
    label,
    column,
    align = "left",
  }: {
    label: string;
    column: SortKey;
    align?: "left" | "right";
  }) => (
    <th className={`px-4 py-3 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
      <div className={align === "right" ? "flex justify-end" : undefined}>
        <button
          type="button"
          onClick={() => handleSort(column)}
          className="inline-flex items-center gap-1 hover:text-cobalt-600"
        >
          {label}
          {sortKey === column &&
            (sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
        </button>
      </div>
    </th>
  );

  return (
    <div className="space-y-6">
      {/* Weight Controls */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-4 text-sm font-semibold">Scoring Weights (Composite)</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-600">Match Score ({(weights.matchScore * 100).toFixed(0)}%)</span>
            <input
              type="range"
              min="0"
              max="100"
              value={weights.matchScore * 100}
              onChange={(e) => {
                const val = parseInt(e.target.value) / 100;
                const total = val + weights.interestScore + weights.averageOverall;
                setWeights({
                  matchScore: val / total,
                  interestScore: weights.interestScore / total,
                  averageOverall: weights.averageOverall / total,
                });
              }}
              className="h-2 w-full"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-600">Interest Score ({(weights.interestScore * 100).toFixed(0)}%)</span>
            <input
              type="range"
              min="0"
              max="100"
              value={weights.interestScore * 100}
              onChange={(e) => {
                const val = parseInt(e.target.value) / 100;
                const total = weights.matchScore + val + weights.averageOverall;
                setWeights({
                  matchScore: weights.matchScore / total,
                  interestScore: val / total,
                  averageOverall: weights.averageOverall / total,
                });
              }}
              className="h-2 w-full"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-600">Interview Rating ({(weights.averageOverall * 100).toFixed(0)}%)</span>
            <input
              type="range"
              min="0"
              max="100"
              value={weights.averageOverall * 100}
              onChange={(e) => {
                const val = parseInt(e.target.value) / 100;
                const total = weights.matchScore + weights.interestScore + val;
                setWeights({
                  matchScore: weights.matchScore / total,
                  interestScore: weights.interestScore / total,
                  averageOverall: val / total,
                });
              }}
              className="h-2 w-full"
            />
          </label>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <SortHeader label="Candidate" column="candidateName" />
              <SortHeader label="Years" column="yearsExperience" />
              <SortHeader label="Match" column="matchScore" align="right" />
              <SortHeader label="Interest" column="interestScore" align="right" />
              <SortHeader label="Rating" column="averageOverall" align="right" />
              <th className="px-4 py-3 text-right font-semibold text-cobalt-700">Composite</th>
            </tr>
          </thead>
          <tbody>
            {withComposite.map((candidate, idx) => (
              <tr key={candidate.matchId} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                <td className="px-4 py-3">
                  <div>
                    <div className="font-medium">{candidate.candidateName}</div>
                    <div className="text-xs text-slate-600">{candidate.email}</div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">{candidate.yearsExperience}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${
                    candidate.matchScore >= 75 ? "bg-green-100 text-green-700" :
                    candidate.matchScore >= 50 ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-700"
                  }`}>
                    {candidate.matchScore ?? 0}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${
                    candidate.interestScore >= 75 ? "bg-green-100 text-green-700" :
                    candidate.interestScore >= 50 ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-700"
                  }`}>
                    {candidate.interestScore ?? 0}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {candidate.averageOverall != null ? (
                    <span className="font-medium">{candidate.averageOverall.toFixed(1)}/5</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-bold text-cobalt-700">{candidate.compositeScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-600">
          Comparing {candidates.length} candidate{candidates.length !== 1 ? "s" : ""}
        </div>
        <Button variant="secondary" size="sm" onClick={handleExport}>
          <Download size={14} />
          Export CSV
        </Button>
      </div>
    </div>
  );
}
