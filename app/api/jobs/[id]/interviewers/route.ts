import { NextRequest, NextResponse } from "next/server";
import { createInterviewer, listInterviewers } from "@/lib/interviewers";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const interviewers = await listInterviewers(id);
    return NextResponse.json({ interviewers });
  } catch (err) {
    log.error({ err }, "interviewers GET failed");
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
      name?: string;
      email?: string;
      calendarIcalUrl?: string;
      timezone?: string;
      workingHours?: { start: string; end: string; days: number[] };
      roundIndex?: number | null;
    };
    if (!body.name || !body.email) {
      return NextResponse.json(
        { error: "name and email are required" },
        { status: 400 },
      );
    }
    const interviewer = await createInterviewer(id, {
      name: body.name,
      email: body.email,
      calendarIcalUrl: body.calendarIcalUrl,
      timezone: body.timezone,
      workingHours: body.workingHours,
      roundIndex: body.roundIndex,
    });
    return NextResponse.json({ interviewer }, { status: 201 });
  } catch (err) {
    log.error({ err }, "interviewers POST failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 },
    );
  }
}
