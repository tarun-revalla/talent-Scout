import { NextRequest, NextResponse } from "next/server";
import { getConsensusForRound } from "@/lib/scorecard";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const matchId = params.id;
  if (!matchId) {
    return NextResponse.json({ error: "Match ID required" }, { status: 400 });
  }

  try {
    // Get all rounds that have scorecards for this match
    const { supabaseServer } = await import("@/lib/db");
    const sb = supabaseServer();

    // De-duplication of round_index happens below via Set — Supabase has no
    // .distinct(); selecting the column for all rows and uniquing is correct.
    const { data: roundIndices, error: roundError } = await sb
      .from("interviewer_scorecards")
      .select("round_index")
      .eq("match_id", matchId);

    if (roundError) throw roundError;

    const rounds = Array.from(new Set((roundIndices ?? []).map((r) => r.round_index as number))).sort(
      (a, b) => a - b,
    );

    const consensuses = await Promise.all(
      rounds.map((roundIndex) => getConsensusForRound(matchId, roundIndex)),
    );

    return NextResponse.json({ consensuses }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
