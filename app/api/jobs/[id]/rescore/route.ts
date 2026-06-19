import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";
import { invalidateJobMatchScores, runMatching } from "@/lib/matching";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Force a fresh match run: nullify cached match_score for every match on this
 * job, then re-run matching so each row gets re-LLM'd. Use after editing the
 * JD off-flow, or whenever the cached scores look wrong.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { data: jobRow } = await supabaseServer()
      .from("jobs")
      .select("status")
      .eq("id", id)
      .single();
    if (jobRow?.status === "closed") {
      return NextResponse.json(
        { error: "Job is closed — re-open to rescore." },
        { status: 409 },
      );
    }
    await invalidateJobMatchScores(id);
    const result = await runMatching(id);
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err, jobId: id }, "rescore failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
