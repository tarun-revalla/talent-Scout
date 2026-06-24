import { NextResponse } from "next/server";
import {
  buildDeterministicJobDigest,
  generateJobDigest,
  getDigestSnapshot,
} from "@/lib/job-digest";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const snapshot = await getDigestSnapshot();
    let digest;
    try {
      digest = await generateJobDigest(snapshot);
    } catch (err) {
      log.warn({ err }, "digest GET: AI digest failed, using deterministic fallback");
      digest = {
        ...buildDeterministicJobDigest(snapshot),
        generated_at: new Date().toISOString(),
      };
    }
    return NextResponse.json({ digest, snapshot });
  } catch (err) {
    log.error({ err }, "digest GET failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
