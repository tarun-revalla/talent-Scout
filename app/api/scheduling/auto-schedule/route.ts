import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";
import { findOverlapSlots, createSchedulingSession } from "@/lib/scheduling";
import { parseSchedulingIntent, rerankSchedulingSlots } from "@/lib/llm";
import { listInterviewers } from "@/lib/interviewers";
import { enqueue } from "@/lib/queue";

export const runtime = "nodejs";

/**
 * POST /api/scheduling/auto-schedule
 *
 * One-step natural-language scheduling. The recruiter provides their intent
 * as free text (e.g. "Schedule the technical round for Sarah next Tuesday
 * afternoon") and this endpoint:
 *   1. Parses intent for time preferences
 *   2. Finds available interviewers for the round
 *   3. Computes overlapping slots filtered by intent
 *   4. Selects the best slot
 *   5. Creates the session + proposal
 *   6. Enqueues the scheduling proposal email
 *
 * Body: {
 *   matchId: string
 *   roundIndex: number
 *   intentText: string
 *   durationMinutes?: number          (default 60)
 *   timezone?: string                 (default America/New_York)
 *   interviewerIds?: string[]         (if omitted, uses all interviewers for the round)
 *   fallbackInterviewerIds?: string[]
 *   urgency?: "high" | "normal"
 * }
 */
export async function POST(req: NextRequest) {
  let body: {
    matchId?: string;
    roundIndex?: number;
    intentText?: string;
    durationMinutes?: number;
    timezone?: string;
    interviewerIds?: string[];
    fallbackInterviewerIds?: string[];
    urgency?: "high" | "normal";
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.matchId || body.roundIndex == null || !body.intentText) {
    return NextResponse.json(
      { error: "matchId, roundIndex, and intentText are required" },
      { status: 400 },
    );
  }

  const sb = supabaseServer();

  // Verify the match exists and get the job.
  const { data: match, error: mErr } = await sb
    .from("matches")
    .select("id, job_id, interview_state")
    .eq("id", body.matchId)
    .single();
  if (mErr || !match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const timezone = body.timezone ?? "America/New_York";
  const durationMinutes = body.durationMinutes ?? 60;

  // Parse recruiter intent.
  let intentSummary = body.intentText;
  let filteredSlots: { start: string; end: string }[] = [];

  try {
    const intent = await parseSchedulingIntent({ text: body.intentText, timezone });
    intentSummary = intent.summary;

    // Determine which interviewers to use.
    let interviewerIds = body.interviewerIds ?? [];
    if (interviewerIds.length === 0) {
      const allInterviewers = await listInterviewers(match.job_id as string);
      const roundInterviewers = allInterviewers.filter(
        (iv) => iv.round_index === body.roundIndex || iv.round_index === null,
      );
      interviewerIds = roundInterviewers.map((iv) => iv.id);
    }
    if (interviewerIds.length === 0) {
      return NextResponse.json(
        { error: "No interviewers found for this round — add interviewers first" },
        { status: 422 },
      );
    }

    const { slots } = await findOverlapSlots(interviewerIds, durationMinutes);
    if (slots.length === 0) {
      return NextResponse.json(
        { error: "No overlapping availability found in the next 14 days" },
        { status: 422 },
      );
    }

    // AI reranking based on intent.
    const { data: matchFull } = await sb
      .from("matches")
      .select("candidate:candidates(name), job:jobs(title, interview_rounds)")
      .eq("id", body.matchId)
      .single();

    const candidate = Array.isArray(matchFull?.candidate)
      ? matchFull.candidate[0]
      : matchFull?.candidate;
    const jobRow = Array.isArray(matchFull?.job) ? matchFull.job[0] : matchFull?.job;
    const rounds = (jobRow?.interview_rounds as { name: string; order: number }[] | null) ?? [];
    const sorted = [...rounds].sort((a, b) => a.order - b.order);
    const roundName = sorted[body.roundIndex]?.name ?? `Round ${body.roundIndex + 1}`;

    const ranked = await rerankSchedulingSlots({
      slots: slots.slice(0, 20),
      candidateName: (candidate?.name as string | null) ?? null,
      jobTitle: (jobRow?.title as string | null) ?? "Role",
      roundName,
      intentSummary,
    });

    filteredSlots = ranked.ranked_starts
      .map((start: string) => slots.find((s: { start: string; end: string }) => s.start === start))
      .filter((s: { start: string; end: string } | undefined): s is { start: string; end: string } => s != null);

    if (filteredSlots.length === 0) filteredSlots = slots.slice(0, 3);

    const bestSlot = filteredSlots[0];
    if (!bestSlot) {
      return NextResponse.json({ error: "Could not determine a best slot" }, { status: 422 });
    }

    // Create the scheduling session with the best slot.
    const { session, proposal } = await createSchedulingSession({
      matchId: body.matchId,
      roundIndex: body.roundIndex,
      durationMinutes,
      interviewerIds,
      fallbackInterviewerIds: body.fallbackInterviewerIds ?? [],
      slotStart: bestSlot.start,
      timezone,
      notes: `Auto-scheduled from: "${body.intentText}"`,
      urgency: body.urgency,
    });

    // Enqueue proposal email to interviewers.
    await enqueue(body.matchId, "send_scheduling_proposal", { sessionId: session.id });

    return NextResponse.json({
      session,
      proposal: {
        id: proposal.id,
        slot_start: proposal.slot_start,
        slot_end: proposal.slot_end,
        response_token: proposal.response_token,
      },
      intentSummary,
      alternatives: filteredSlots.slice(1, 4),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
