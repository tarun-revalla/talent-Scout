import { NextRequest, NextResponse } from "next/server";
import {
  getScorecardByToken,
  submitScorecard,
  type ScorecardRecommendation,
} from "@/lib/scorecard";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const RECOMMENDATIONS: ScorecardRecommendation[] = ["strong_yes", "yes", "no", "strong_no"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ctx = await getScorecardByToken(token);
  if (!ctx) {
    return NextResponse.json({ error: "Invalid or expired scorecard link" }, { status: 404 });
  }
  return NextResponse.json({
    status: ctx.scorecard.status,
    interviewerName: ctx.interviewerName,
    candidateName: ctx.candidateName,
    jobTitle: ctx.jobTitle,
    roundName: ctx.roundName,
    recommendation: ctx.scorecard.recommendation,
    overallRating: ctx.scorecard.overall_rating,
    technicalRating: ctx.scorecard.technical_rating,
    communicationRating: ctx.scorecard.communication_rating,
    notes: ctx.scorecard.notes,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = (await req.json()) as {
      recommendation?: string;
      overallRating?: number;
      technicalRating?: number;
      communicationRating?: number;
      notes?: string;
    };

    if (!body.recommendation || !RECOMMENDATIONS.includes(body.recommendation as ScorecardRecommendation)) {
      return NextResponse.json(
        { error: "recommendation must be one of strong_yes, yes, no, strong_no" },
        { status: 400 },
      );
    }

    await submitScorecard(token, {
      recommendation: body.recommendation as ScorecardRecommendation,
      overall_rating: body.overallRating,
      technical_rating: body.technicalRating,
      communication_rating: body.communicationRating,
      notes: body.notes,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error({ err }, "scorecard submit failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 },
    );
  }
}
