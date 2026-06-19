import { NextRequest, NextResponse } from "next/server";
import { runMatching } from "@/lib/matching";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const result = await runMatching(id);
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err, jobId: id }, "match run failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
