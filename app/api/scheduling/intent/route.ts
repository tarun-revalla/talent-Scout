import { NextRequest, NextResponse } from "next/server";
import { parseSchedulingIntent } from "@/lib/llm";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { text?: string; timezone?: string };
    if (!body.text?.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    const timezone =
      body.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/New_York";
    const intent = await parseSchedulingIntent({ text: body.text.trim(), timezone });
    return NextResponse.json({ intent, timezone });
  } catch (err) {
    log.error({ err }, "scheduling intent POST failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
