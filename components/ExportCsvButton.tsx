"use client";

import Papa from "papaparse";
import { Download } from "lucide-react";
import type { MatchRow } from "./MatchTable";

export function ExportCsvButton({
  rows,
  jobTitle,
  weights,
}: {
  rows: MatchRow[];
  jobTitle: string;
  weights: { match: number; interest: number };
}) {
  function download() {
    const flat = rows.map((m) => ({
      name: m.candidate?.name ?? "",
      email: m.candidate?.email ?? "",
      match_score: m.match_score ?? "",
      interest_score: m.interest_score ?? "",
      combined_score:
        m.match_score != null
          ? Math.round(
              weights.match * (m.match_score ?? 0) +
                weights.interest * (m.interest_score ?? 0),
            )
          : "",
      experience_fit: m.match_explanation?.experience_fit ?? "",
      matched_skills: (m.match_explanation?.matched_skills ?? []).join("; "),
      gaps: (m.match_explanation?.gaps ?? []).join("; "),
      summary: m.match_explanation?.summary ?? "",
      status: m.status,
      rounds_sent: m.rounds_sent,
      last_action_at: m.last_action_at ?? "",
    }));
    const csv = Papa.unparse(flat);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${jobTitle.replace(/[^A-Za-z0-9]+/g, "_")}_shortlist.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={download}
      disabled={!rows.length}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-sm text-slate-700 cursor-pointer transition-colors"
    >
      <Download className="w-4 h-4" /> CSV
    </button>
  );
}
