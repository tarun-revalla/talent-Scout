import { NextRequest, NextResponse } from "next/server";
import { scoreCandidateAgainstAllOpenJobs } from "@/lib/matching";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Recruiter confirmed the duplicate is actually a distinct person — keep both
 * rows. Auto-match was skipped during ingest (because we suspected a dup), so
 * trigger it now.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await scoreCandidateAgainstAllOpenJobs(id);
    return NextResponse.json({ confirmed: true, ...result });
  } catch (err) {
    log.error({ err }, "confirm-distinct failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}
