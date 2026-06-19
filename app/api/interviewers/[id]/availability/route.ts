import { NextRequest, NextResponse } from "next/server";
import { getInterviewerAvailability } from "@/lib/interviewers";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const duration = Number(req.nextUrl.searchParams.get("duration") ?? "60");
    const days = Number(req.nextUrl.searchParams.get("days") ?? "14");
    if (!Number.isFinite(duration) || duration < 15 || duration > 180) {
      return NextResponse.json({ error: "duration must be 15–180 minutes" }, { status: 400 });
    }
    const result = await getInterviewerAvailability(id, duration, days);
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, "availability GET failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
