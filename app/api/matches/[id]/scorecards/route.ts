import { NextRequest, NextResponse } from "next/server";
import { listScorecardsForMatch } from "@/lib/scorecard";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const scorecards = await listScorecardsForMatch(id);
    return NextResponse.json({ scorecards });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
