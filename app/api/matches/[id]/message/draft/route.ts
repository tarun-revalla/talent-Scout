import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { draftMessageForMatch } from "@/lib/message-draft";
import { ManualMessageIntentSchema } from "@/lib/schemas";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  intent: ManualMessageIntentSchema.default("general"),
  instructions: z.string().max(1000).optional(),
  questions: z.array(z.string()).max(10).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: matchId } = await params;
    const body = BodySchema.parse(await req.json());
    const composed = await draftMessageForMatch(matchId, {
      intent: body.intent,
      instructions: body.instructions,
      questions: body.questions,
    });
    return NextResponse.json(composed);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    log.error({ err }, "message draft failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
