import { NextRequest, NextResponse } from "next/server";
import { fetchJobByInviteToken, toPublicJobPayload } from "@/lib/invite";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const job = await fetchJobByInviteToken(token);
    if (!job) return NextResponse.json({ error: "Link not found" }, { status: 404 });
    return NextResponse.json({ job: toPublicJobPayload(job) });
  } catch (err) {
    log.error({ err }, "apply GET failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
