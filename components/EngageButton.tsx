"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";

export function EngageButton({
  jobId,
  matchIds,
  onSent,
}: {
  jobId: string;
  matchIds: string[];
  onSent?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/engage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ match_ids: matchIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={go}
        disabled={busy || matchIds.length === 0}
        title="These rows are below the auto-engage threshold. Reach out anyway."
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-sm font-medium text-white cursor-pointer transition-colors"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {busy ? "Enqueueing…" : `Engage ${matchIds.length} anyway`}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
