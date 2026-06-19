import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";
import { scoreCandidateAgainstAllOpenJobs } from "@/lib/matching";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Merge a freshly-uploaded duplicate INTO the existing candidate row, then
 * delete the new row. The existing candidate's id, engagement history, and
 * conversations are preserved; their parsed_profile, raw_text, embedding,
 * resume_url, name are overwritten with the new data.
 *
 * After merge, re-runs auto-match against open jobs since the profile changed.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: existingId } = await params; // path id is the EXISTING candidate
    const body = (await req.json()) as { from_id?: string };
    const fromId = body.from_id;
    if (!fromId) return NextResponse.json({ error: "from_id required" }, { status: 400 });
    if (fromId === existingId) {
      return NextResponse.json({ error: "from_id must differ from existing id" }, { status: 400 });
    }

    const sb = supabaseServer();
    const { data: source, error: srcErr } = await sb
      .from("candidates")
      .select("name, source, raw_text, parsed_profile, resume_url, embedding")
      .eq("id", fromId)
      .single();
    if (srcErr || !source) {
      return NextResponse.json({ error: srcErr?.message ?? "source not found" }, { status: 404 });
    }

    const { error: updErr } = await sb
      .from("candidates")
      .update({
        name: source.name,
        source: source.source,
        raw_text: source.raw_text,
        parsed_profile: source.parsed_profile,
        resume_url: source.resume_url,
        embedding: source.embedding,
        email_invalid: false, // fresh resume — give the email a fresh chance
      })
      .eq("id", existingId);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    // Drop the source row. Cascades remove its (just-created) match rows.
    await sb.from("candidates").delete().eq("id", fromId);

    // Profile changed — rescore against every open job for the merged record.
    try {
      await scoreCandidateAgainstAllOpenJobs(existingId);
    } catch (err) {
      log.warn(
        { existingId, err: err instanceof Error ? err.message : String(err) },
        "merge: post-merge auto-match failed",
      );
    }

    return NextResponse.json({ merged: true, into: existingId, deleted: fromId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
