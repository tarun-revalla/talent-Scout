import { NextRequest, NextResponse } from "next/server";
import { parseJobDescription, suggestInterviewRounds } from "@/lib/llm";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { raw_jd?: string };
    const rawJD = (body.raw_jd ?? "").trim();
    if (rawJD.length < 50) {
      return NextResponse.json(
        { error: "JD too short — paste at least 50 chars" },
        { status: 400 },
      );
    }
    const parsed = await parseJobDescription(rawJD, { operation: "parse_jd" });
    const suggested = await suggestInterviewRounds(parsed, { operation: "suggest_rounds" });
    return NextResponse.json({
      parsed,
      suggested_rounds: suggested.rounds,
      rationale: suggested.rationale,
      default_cooling_months: 6,
    });
  } catch (err) {
    log.error({ err }, "parse-preview failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
