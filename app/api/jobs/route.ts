import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";
import { createJobFromRawJD, runMatching } from "@/lib/matching";
import { normalizeInterviewRounds } from "@/lib/interview";
import { ParsedJDSchema } from "@/lib/schemas";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("jobs")
    .select("id, title, parsed_jd, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const jobs = data ?? [];
  const jobIds = jobs.map((j) => j.id);
  const stats = new Map<string, { count: number; sum: number }>();

  if (jobIds.length > 0) {
    const { data: matches } = await sb
      .from("matches")
      .select("job_id, combined_score")
      .in("job_id", jobIds);

    for (const m of matches ?? []) {
      const cur = stats.get(m.job_id) ?? { count: 0, sum: 0 };
      cur.count += 1;
      cur.sum += Number(m.combined_score ?? 0);
      stats.set(m.job_id, cur);
    }
  }

  const enriched = jobs.map((j) => {
    const s = stats.get(j.id);
    return {
      ...j,
      match_count: s?.count ?? 0,
      avg_match:
        s && s.count > 0 ? Math.round(s.sum / s.count) : null,
    };
  });

  return NextResponse.json({ jobs: enriched });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      raw_jd?: string;
      parsed_jd?: unknown;
      interview_rounds?: unknown;
      cooling_period_months?: number;
      hires_target?: number;
    };
    const rawJD = (body.raw_jd ?? "").trim();
    if (rawJD.length < 50) {
      return NextResponse.json(
        { error: "JD too short — paste at least 50 chars" },
        { status: 400 },
      );
    }
    const parsedJD = body.parsed_jd
      ? ParsedJDSchema.parse(body.parsed_jd)
      : undefined;
    const interviewRounds = normalizeInterviewRounds(body.interview_rounds ?? []);

    const id = await createJobFromRawJD({
      rawJD,
      parsedJD,
      interviewRounds,
      coolingPeriodMonths: body.cooling_period_months,
      hiresTarget: body.hires_target,
    });
    let match: Awaited<ReturnType<typeof runMatching>> | null = null;
    try {
      match = await runMatching(id);
    } catch (matchErr) {
      log.warn(
        { jobId: id, err: matchErr instanceof Error ? matchErr.message : String(matchErr) },
        "create job: initial match failed",
      );
    }
    return NextResponse.json({ id, match });
  } catch (err) {
    log.error({ err }, "create job failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
