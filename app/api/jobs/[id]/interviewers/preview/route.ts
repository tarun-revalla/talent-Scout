import { NextRequest, NextResponse } from "next/server";
import { resolveCalendarFromEmail } from "@/lib/calendar/ical";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  _ctx: { params: Promise<{ id: string }> },
) {
  try {
    const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const resolved = await resolveCalendarFromEmail(email);
    return NextResponse.json({
      reachable: resolved.reachable,
      timezone: resolved.timezone,
      needsTimezone: resolved.reachable && !resolved.timezone,
    });
  } catch (err) {
    log.error({ err }, "interviewer calendar preview failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
