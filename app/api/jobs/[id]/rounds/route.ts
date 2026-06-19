import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";
import { defaultRoundsForLevel } from "@/lib/interview-defaults";
import { normalizeInterviewRounds, parseJobRounds } from "@/lib/interview";
import { suggestInterviewRounds } from "@/lib/llm";
import { ParsedJDSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("jobs")
    .select("title, parsed_jd, interview_rounds, cooling_period_months, hires_target, status")
    .eq("id", id)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Job not found" }, { status: 404 });
  }

  const stored = parseJobRounds(data.interview_rounds);
  const parsed = ParsedJDSchema.safeParse(data.parsed_jd);
  const defaults =
    parsed.success && stored.length === 0
      ? defaultRoundsForLevel(parsed.data.level)
      : [];

  return NextResponse.json({
    title: data.title,
    interview_rounds: stored.length > 0 ? stored : defaults,
    cooling_period_months: Number(data.cooling_period_months ?? 6),
    hires_target: Number(data.hires_target ?? 1),
    has_custom_rounds: stored.length > 0,
    status: data.status,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      interview_rounds?: unknown;
      cooling_period_months?: number;
      hires_target?: number;
    };

    const sb = supabaseServer();
    const { data: jobRow, error: jobErr } = await sb
      .from("jobs")
      .select("status")
      .eq("id", id)
      .single();
    if (jobErr || !jobRow) {
      return NextResponse.json({ error: jobErr?.message ?? "Job not found" }, { status: 404 });
    }
    if (jobRow.status === "closed") {
      return NextResponse.json(
        { error: "Job is closed — re-open it before editing interview rounds." },
        { status: 409 },
      );
    }

    const rounds = normalizeInterviewRounds(body.interview_rounds ?? []);
    const cooling = Math.max(1, Math.min(24, Number(body.cooling_period_months ?? 6)));
    const hiresTarget = Math.max(1, Math.min(100, Number(body.hires_target ?? 1)));

    const { data: inProgress } = await sb
      .from("matches")
      .select("current_round_index")
      .eq("job_id", id)
      .eq("interview_state", "in_progress");
    const maxActiveRound = Math.max(
      0,
      ...(inProgress ?? []).map((m) => Number(m.current_round_index ?? 0)),
    );
    if (maxActiveRound > rounds.length) {
      return NextResponse.json(
        {
          error: `Cannot reduce below ${maxActiveRound} rounds — a candidate is currently on round ${maxActiveRound}.`,
        },
        { status: 409 },
      );
    }

    const { error } = await sb
      .from("jobs")
      .update({
        interview_rounds: rounds,
        cooling_period_months: cooling,
        hires_target: hiresTarget,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      interview_rounds: rounds,
      cooling_period_months: cooling,
      hires_target: hiresTarget,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sb = supabaseServer();
    const { data, error } = await sb
      .from("jobs")
      .select("parsed_jd, status")
      .eq("id", id)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Job not found" }, { status: 404 });
    }
    if (data.status === "closed") {
      return NextResponse.json({ error: "Job is closed" }, { status: 409 });
    }

    const parsed = ParsedJDSchema.parse(data.parsed_jd);
    const suggested = await suggestInterviewRounds(parsed, {
      jobId: id,
      operation: "suggest_rounds",
    });
    return NextResponse.json({
      suggested_rounds: suggested.rounds,
      rationale: suggested.rationale,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
