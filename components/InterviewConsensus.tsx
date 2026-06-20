"use client";

import { useEffect, useState } from "react";
import { AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import { Alert } from "@/components/ui/Alert";

interface ConsensusOutlier {
  interviewerId: string;
  interviewerName: string;
  dimension: "overall" | "technical" | "communication";
  value: number;
  averageValue: number;
  deviation: number;
}

interface RoundConsensus {
  roundIndex: number;
  submittedCount: number;
  pendingCount: number;
  totalCount: number;
  overallAverage: number | null;
  technicalAverage: number | null;
  communicationAverage: number | null;
  recommendationBreakdown: Record<string, number>;
  recommendationConsensus: string | null;
  outliers: ConsensusOutlier[];
  autoRecommendation: string | null;
}

interface InterviewConsensusProps {
  matchId: string;
}

export function InterviewConsensus({ matchId }: InterviewConsensusProps) {
  const [consensuses, setConsensuses] = useState<RoundConsensus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConsensus = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/matches/${matchId}/consensus`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load consensus");
        setConsensuses(json.consensuses ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    fetchConsensus();
  }, [matchId]);

  if (loading) return <div className="text-sm text-slate-600">Loading consensus...</div>;
  if (error) return <Alert variant="warning">Error: {error}</Alert>;
  if (consensuses.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Interview Panel Consensus</h3>

      {consensuses.map((consensus) => (
        <div key={consensus.roundIndex} className="space-y-3 rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">Round {consensus.roundIndex}</span>
            <span className="text-xs text-slate-600">
              {consensus.submittedCount}/{consensus.totalCount} submitted
            </span>
          </div>

          {/* Recommendation Breakdown */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-700">Recommendation</span>
            <div className="flex gap-2">
              {(["strong_yes", "yes", "no", "strong_no"] as const).map((rec) => (
                <div
                  key={rec}
                  className={`flex flex-col items-center rounded px-2 py-1 text-xs ${
                    rec.includes("yes")
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  <span className="font-semibold">{consensus.recommendationBreakdown[rec] ?? 0}</span>
                  <span className="text-xs capitalize">{rec.replace("_", " ")}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Consensus & Auto-recommendation */}
          {consensus.recommendationConsensus && (
            <div className="flex items-center gap-2 rounded bg-blue-50 p-2">
              <TrendingUp size={16} className="text-blue-600" />
              <div className="text-xs">
                <span className="font-semibold text-blue-600">Consensus: </span>
                <span className="capitalize text-blue-700">
                  {consensus.recommendationConsensus === "split" ? "Split opinion" : consensus.recommendationConsensus}
                </span>
              </div>
              {consensus.autoRecommendation && (
                <div className="ml-auto text-xs font-semibold text-blue-700">
                  Suggested: {consensus.autoRecommendation}
                </div>
              )}
            </div>
          )}

          {/* Average Ratings */}
          {(consensus.overallAverage !== null ||
            consensus.technicalAverage !== null ||
            consensus.communicationAverage !== null) && (
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-700">Average Ratings</span>
              <div className="space-y-1 text-xs">
                {consensus.overallAverage !== null && (
                  <div className="flex justify-between">
                    <span>Overall:</span>
                    <span className="font-semibold">{consensus.overallAverage.toFixed(1)}/5</span>
                  </div>
                )}
                {consensus.technicalAverage !== null && (
                  <div className="flex justify-between">
                    <span>Technical:</span>
                    <span className="font-semibold">{consensus.technicalAverage.toFixed(1)}/5</span>
                  </div>
                )}
                {consensus.communicationAverage !== null && (
                  <div className="flex justify-between">
                    <span>Communication:</span>
                    <span className="font-semibold">{consensus.communicationAverage.toFixed(1)}/5</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Outliers */}
          {consensus.outliers.length > 0 && (
            <Alert variant="info" className="flex items-start gap-2 py-2">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-xs font-semibold">
                  {consensus.outliers.length} outlier{consensus.outliers.length !== 1 ? "s" : ""}:
                </span>
                <ul className="mt-1 space-y-1 text-xs">
                  {consensus.outliers.map((outlier, i) => (
                    <li key={i}>
                      <span>{outlier.interviewerName}</span> rated{" "}
                      <span className="font-semibold capitalize">{outlier.dimension}</span>
                      {outlier.deviation > 0 ? " +" : " "}
                      <span className="font-semibold">{outlier.deviation.toFixed(1)}</span> vs avg{" "}
                      <span className="text-slate-600">({outlier.value} vs {outlier.averageValue.toFixed(1)})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Alert>
          )}
        </div>
      ))}
    </div>
  );
}
