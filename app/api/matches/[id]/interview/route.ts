import { NextRequest, NextResponse } from "next/server";
import {
  advanceInterviewRound,
  clearExpiredRejection,
  getInterviewTimeline,
  recordInterviewNoShow,
  rejectInInterview,
  startInterviewLoop,
  withdrawFromInterview,
} from "@/lib/interview";
import { REJECTION_REASONS, type RejectionReason } from "@/lib/ui-tokens";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await clearExpiredRejection(id);
    const timeline = await getInterviewTimeline(id);
    return NextResponse.json(timeline);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      action?: string;
      reason?: string;
      note?: string;
    };

    switch (body.action) {
      case "start": {
        const result = await startInterviewLoop(id);
        return NextResponse.json(result);
      }
      case "advance": {
        const result = await advanceInterviewRound(id, body.note);
        return NextResponse.json(result);
      }
      case "reject": {
        const reason = body.reason as RejectionReason;
        if (!REJECTION_REASONS.includes(reason)) {
          return NextResponse.json({ error: "Invalid rejection reason" }, { status: 400 });
        }
        const result = await rejectInInterview(id, reason, body.note);
        return NextResponse.json(result);
      }
      case "withdraw": {
        const result = await withdrawFromInterview(id, body.note);
        return NextResponse.json(result);
      }
      case "no_show": {
        const result = await recordInterviewNoShow(id, body.note);
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json(
          { error: "action must be start, advance, reject, withdraw, or no_show" },
          { status: 400 },
        );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
