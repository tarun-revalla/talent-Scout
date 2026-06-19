import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";
import { updateJobRawJD } from "@/lib/matching";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("jobs")
    .select(
      "id, title, raw_jd, parsed_jd, weights, auto_engage_threshold, auto_engage_enabled, status, email_settings, interview_rounds, cooling_period_months, hires_target, created_at",
    )
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ job: data });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { raw_jd?: string };
    const rawJD = (body.raw_jd ?? "").trim();
    if (rawJD.length < 50) {
      return NextResponse.json(
        { error: "JD too short — paste at least 50 chars" },
        { status: 400 },
      );
    }
    // Block edits on closed jobs.
    const { data: jobRow } = await supabaseServer()
      .from("jobs")
      .select("status")
      .eq("id", id)
      .single();
    if (jobRow?.status === "closed") {
      return NextResponse.json(
        { error: "Job is closed — re-open it before editing." },
        { status: 409 },
      );
    }
    const { title } = await updateJobRawJD(id, rawJD);
    return NextResponse.json({ id, title });
  } catch (err) {
    log.error({ err }, "edit job failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error } = await supabaseServer().from("jobs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
