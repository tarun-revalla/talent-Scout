import { NextRequest, NextResponse } from "next/server";
import { getSession, getLatestProposal } from "@/lib/scheduling";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const proposal = await getLatestProposal(id);
    return NextResponse.json({ session, proposal });
  } catch (err) {
    log.error({ err }, "scheduling session GET failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
