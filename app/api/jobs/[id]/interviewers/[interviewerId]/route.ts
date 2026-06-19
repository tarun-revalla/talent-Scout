import { NextRequest, NextResponse } from "next/server";
import { deleteInterviewer, getInterviewer, updateInterviewer } from "@/lib/interviewers";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; interviewerId: string }> },
) {
  try {
    const { interviewerId } = await params;
    const interviewer = await getInterviewer(interviewerId);
    if (!interviewer) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ interviewer });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; interviewerId: string }> },
) {
  try {
    const { id: jobId, interviewerId } = await params;
    const existing = await getInterviewer(interviewerId);
    if (!existing || existing.job_id !== jobId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      calendarIcalUrl?: string;
      timezone?: string;
      workingHours?: { start: string; end: string; days: number[] };
      roundIndex?: number | null;
    };
    const interviewer = await updateInterviewer(interviewerId, body);
    return NextResponse.json({ interviewer });
  } catch (err) {
    log.error({ err }, "interviewer PATCH failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; interviewerId: string }> },
) {
  try {
    const { id: jobId, interviewerId } = await params;
    const existing = await getInterviewer(interviewerId);
    if (!existing || existing.job_id !== jobId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await deleteInterviewer(interviewerId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
