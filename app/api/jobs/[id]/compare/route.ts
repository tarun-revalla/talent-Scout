import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: jobId } = await params;
  if (!jobId) {
    return NextResponse.json({ error: "Job ID required" }, { status: 400 });
  }

  try {
    const { matchIds } = await req.json();
    if (!Array.isArray(matchIds) || matchIds.length === 0) {
      return NextResponse.json({ error: "matchIds array required" }, { status: 400 });
    }

    const { supabaseServer } = await import("@/lib/db");
    const { listScorecardsForMatch } = await import("@/lib/scorecard");
    const sb = supabaseServer();

    // Fetch match data with candidate and job info
    const { data: matches, error: matchError } = await sb
      .from("matches")
      .select(
        `id, job_id, candidate_id, match_score, interest_score,
         candidate:candidates ( id, name, email, parsed_profile ),
         job:jobs ( id, title )`,
      )
      .eq("job_id", jobId)
      .in("id", matchIds);

    if (matchError) throw matchError;

    // Fetch scorecards for each match
    const scorecardsMap: Record<string, any[]> = {};
    for (const match of matches ?? []) {
      const scorecards = await listScorecardsForMatch(match.id as string);
      scorecardsMap[match.id as string] = scorecards;
    }

    // Build comparison data
    const comparables = (matches ?? []).map((m) => {
      const cand = Array.isArray(m.candidate) ? m.candidate[0] : m.candidate;
      const profile = cand?.parsed_profile as any;
      const scorecards = scorecardsMap[m.id as string] ?? [];
      const submitted = scorecards.filter((s) => s.status === "submitted");

      // Calculate average ratings
      const avg = (vals: (number | null)[]): number | null => {
        const nums = vals.filter((v): v is number => typeof v === "number");
        if (nums.length === 0) return null;
        return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
      };

      return {
        matchId: m.id,
        candidateId: cand?.id,
        candidateName: cand?.name,
        email: cand?.email,
        skills: profile?.skills ?? [],
        yearsExperience: profile?.years_experience ?? 0,
        education: profile?.education ?? [],
        matchScore: m.match_score,
        interestScore: m.interest_score,
        scorecardCount: submitted.length,
        averageOverall: avg(submitted.map((s) => s.overall_rating)),
        averageTechnical: avg(submitted.map((s) => s.technical_rating)),
        averageCommunication: avg(submitted.map((s) => s.communication_rating)),
        recommendations: {
          strong_yes: submitted.filter((s) => s.recommendation === "strong_yes").length,
          yes: submitted.filter((s) => s.recommendation === "yes").length,
          no: submitted.filter((s) => s.recommendation === "no").length,
          strong_no: submitted.filter((s) => s.recommendation === "strong_no").length,
        },
      };
    });

    return NextResponse.json({ candidates: comparables }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
