"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronUp, ChevronDown, Download } from "lucide-react";
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

export function CandidateComparison({ jobId, matchIds, onClose }: CandidateComparisonProps) {
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

  if (loading) return <div className="py-8 text-center">Loading candidates...</div>;
  if (error) return <Alert variant="warning">Error: {error}</Alert>;
  if (candidates.length === 0) return <div className="py-8 text-center">No candidates to compare</div>;

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
              <th className="px-4 py-3 text-left font-semibold">
                <button
                  onClick={() => handleSort("candidateName")}
                  className="flex items-center gap-1 hover:text-blue-600"
                >
                  Candidate
                  {sortKey === "candidateName" && (sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </button>
              </th>
              <th className="px-4 py-3 text-left font-semibold">Years</th>
              <th className="px-4 py-3 text-right font-semibold">
                <button
                  onClick={() => handleSort("matchScore")}
                  className="flex items-center justify-end gap-1 hover:text-blue-600"
                >
                  Match
                  {sortKey === "matchScore" && (sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </button>
              </th>
              <th className="px-4 py-3 text-right font-semibold">
                <button
                  onClick={() => handleSort("interestScore")}
                  className="flex items-center justify-end gap-1 hover:text-blue-600"
                >
                  Interest
                  {sortKey === "interestScore" && (sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </button>
              </th>
              <th className="px-4 py-3 text-right font-semibold">
                <button
                  onClick={() => handleSort("averageOverall")}
                  className="flex items-center justify-end gap-1 hover:text-blue-600"
                >
                  Rating
                  {sortKey === "averageOverall" && (sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </button>
              </th>
              <th className="px-4 py-3 text-right font-semibold text-blue-600">Composite</th>
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
                <td className="px-4 py-3 text-right font-bold text-blue-600">{candidate.compositeScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-between">
        <div className="text-sm text-slate-600">
          Comparing {candidates.length} candidate{candidates.length !== 1 ? "s" : ""}
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            className="gap-1"
          >
            <Download size={14} />
            Export CSV
          </Button>
          {onClose && (
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
