import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";
import { fetchCandidateIdsReservedOnOtherJobs } from "@/lib/candidate-availability";
import { assertNotInCooling } from "@/lib/interview";
import { enqueueIfAbsent } from "@/lib/queue";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: jobId } = await params;
    const body = (await req.json()) as { match_ids?: string[] };
    const matchIds = body.match_ids ?? [];
    if (!matchIds.length) {
      return NextResponse.json({ error: "match_ids required" }, { status: 400 });
    }

    const sb = supabaseServer();

    // Block mutations on closed jobs.
    const { data: jobRow } = await sb
      .from("jobs")
      .select("status")
      .eq("id", jobId)
      .single();
    if (jobRow?.status === "closed") {
      return NextResponse.json(
        { error: "Job is closed — re-open it before sending outreach." },
        { status: 409 },
      );
    }

    const { data: matches, error } = await sb
      .from("matches")
      .select("id, status, candidate:candidates ( id, email, email_invalid )")
      .eq("job_id", jobId)
      .in("id", matchIds);
    if (error) throw new Error(error.message);

    const reservedElsewhere = await fetchCandidateIdsReservedOnOtherJobs(sb, jobId);
    const enqueued: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const m of matches ?? []) {
      const cand = Array.isArray(m.candidate) ? m.candidate[0] : m.candidate;
      if (cand?.id && reservedElsewhere.has(cand.id as string)) {
        skipped.push({ id: m.id as string, reason: "active on another job" });
        continue;
      }
      if (!cand?.email) {
        skipped.push({ id: m.id as string, reason: "no email" });
        continue;
      }
      if (cand.email_invalid) {
        skipped.push({ id: m.id as string, reason: "email bounced previously" });
        continue;
      }
      if (m.status !== "discovered") {
        skipped.push({ id: m.id as string, reason: `status=${m.status}` });
        continue;
      }
      try {
        await assertNotInCooling(m.id as string);
      } catch (err) {
        skipped.push({
          id: m.id as string,
          reason: err instanceof Error ? err.message : "cooling period",
        });
        continue;
      }
      const queued = await enqueueIfAbsent(m.id as string, "send_initial");
      if (queued) enqueued.push(m.id as string);
      else skipped.push({ id: m.id as string, reason: "already queued" });
    }
    log.info({ jobId, enqueued: enqueued.length, skipped: skipped.length }, "engage");
    return NextResponse.json({ enqueued, skipped });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
