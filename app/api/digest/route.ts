import { NextResponse } from "next/server";
import { generateJobDigest, getDigestSnapshot } from "@/lib/job-digest";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const [digest, snapshot] = await Promise.all([
      generateJobDigest(),
      getDigestSnapshot(),
    ]);
    return NextResponse.json({ digest, snapshot });
  } catch (err) {
    log.error({ err }, "digest GET failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
