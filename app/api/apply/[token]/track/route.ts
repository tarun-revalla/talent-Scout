import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchJobByInviteToken, recordInviteEvent, type InviteEventType } from "@/lib/invite";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const BodySchema = z.object({
  visitorId: z.string().min(8).max(128),
  event: z.enum(["open", "started", "completed"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = BodySchema.parse(await req.json());
    const job = await fetchJobByInviteToken(token);
    if (!job) return NextResponse.json({ error: "Link not found" }, { status: 404 });

    const result = await recordInviteEvent(
      job.id as string,
      body.visitorId,
      body.event as InviteEventType,
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    log.error({ err }, "apply track failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
