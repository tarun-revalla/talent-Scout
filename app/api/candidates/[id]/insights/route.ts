import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseServer();

  const { data: bestMatches, error } = await sb
    .from("matches")
    .select("id, job_id, combined_score, match_explanation")
    .eq("candidate_id", id)
    .order("combined_score", { ascending: false, nullsFirst: false })
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const best = bestMatches?.[0];
  if (!best) {
    return NextResponse.json({ rank: null, sentiment: null, bestMatch: null });
  }

  const { count } = await sb
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("job_id", best.job_id)
    .gt("combined_score", best.combined_score ?? 0);

  const rank = (count ?? 0) + 1;
  const fit = (best.match_explanation as { experience_fit?: string } | null)
    ?.experience_fit;
  const sentiment =
    fit === "strong"
      ? "Strong"
      : fit === "partial"
        ? "Moderate"
        : fit === "weak"
          ? "Weak"
          : null;

  return NextResponse.json({
    rank,
    sentiment,
    bestMatch:
      best.combined_score != null ? Math.round(Number(best.combined_score)) : null,
  });
}
