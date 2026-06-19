import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";
import {
  getProposalByCandidateRescheduleToken,
  findOverlapSlots,
  cancelConfirmedInterview,
  createSchedulingSession,
  getSession,
} from "@/lib/scheduling";
import { enqueue } from "@/lib/queue";
import { formatSlotLocal } from "@/lib/scheduling-email";

export const runtime = "nodejs";

/** GET /api/scheduling/reschedule/[token]
 *  Returns current booking details + available alternative slots.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ctx = await getProposalByCandidateRescheduleToken(token);
  if (!ctx) {
    return NextResponse.json({ error: "Invalid or expired reschedule link" }, { status: 404 });
  }

  // Enforce 24h cutoff before the interview.
  const sb = supabaseServer();
  const { data: interview } = await sb
    .from("scheduled_interviews")
    .select("starts_at, ends_at, confirmed_at")
    .eq("session_id", ctx.session.id)
    .maybeSingle();

  if (!interview || !interview.confirmed_at) {
    return NextResponse.json({ error: "No confirmed interview found for this link" }, { status: 404 });
  }

  const cutoff = new Date(new Date(interview.starts_at as string).getTime() - 24 * 60 * 60 * 1000);
  if (new Date() > cutoff) {
    return NextResponse.json(
      { error: "This link expired — rescheduling is only available more than 24 hours before the interview" },
      { status: 410 },
    );
  }

  const { slots } = await findOverlapSlots(
    ctx.session.interviewer_ids,
    ctx.session.duration_minutes,
  );

  const alternatives = slots
    .filter(
      (s) =>
        s.start !== ctx.proposal.slot_start && new Date(s.start) > new Date(),
    )
    .slice(0, 6)
    .map((s) => ({
      start: s.start,
      end: s.end,
      label: formatSlotLocal(s.start, ctx.session.timezone),
    }));

  return NextResponse.json({
    current: {
      start: ctx.proposal.slot_start,
      end: ctx.proposal.slot_end,
      label: formatSlotLocal(ctx.proposal.slot_start, ctx.session.timezone),
      timezone: ctx.session.timezone,
    },
    interview: {
      jobTitle: ctx.job.title,
      roundIndex: ctx.session.round_index,
      durationMinutes: ctx.session.duration_minutes,
      candidateName: ctx.candidate.name,
      interviewers: ctx.interviewers.map((iv) => iv.name),
    },
    alternatives,
  });
}

/** POST /api/scheduling/reschedule/[token]
 *  Cancel the current interview and start a new scheduling session for the chosen slot.
 *  Body: { slotStart: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = (await req.json()) as { slotStart?: string };
  if (!body.slotStart) {
    return NextResponse.json({ error: "slotStart is required" }, { status: 400 });
  }

  const ctx = await getProposalByCandidateRescheduleToken(token);
  if (!ctx) {
    return NextResponse.json({ error: "Invalid or expired reschedule link" }, { status: 404 });
  }

  const sb = supabaseServer();
  const { data: interview } = await sb
    .from("scheduled_interviews")
    .select("starts_at, confirmed_at, candidate_rescheduled_count")
    .eq("session_id", ctx.session.id)
    .maybeSingle();

  if (!interview || !interview.confirmed_at) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  const cutoff = new Date(new Date(interview.starts_at as string).getTime() - 24 * 60 * 60 * 1000);
  if (new Date() > cutoff) {
    return NextResponse.json({ error: "Reschedule window has closed (< 24h to interview)" }, { status: 410 });
  }

  // Validate that the chosen slot is actually available.
  const { slots } = await findOverlapSlots(
    ctx.session.interviewer_ids,
    ctx.session.duration_minutes,
  );
  const valid = slots.some((s) => s.start === body.slotStart);
  if (!valid) {
    return NextResponse.json({ error: "Selected slot is no longer available" }, { status: 409 });
  }

  // Cancel the existing confirmed interview.
  await cancelConfirmedInterview(ctx.session.id);

  // Update reschedule count.
  await sb
    .from("scheduled_interviews")
    .update({
      candidate_rescheduled_count:
        ((interview.candidate_rescheduled_count as number) ?? 0) + 1,
    })
    .eq("session_id", ctx.session.id);

  // Create a new scheduling session for the new slot.
  const originalSession = await getSession(ctx.session.id);
  const { session, proposal } = await createSchedulingSession({
    matchId: ctx.session.match_id,
    roundIndex: ctx.session.round_index,
    durationMinutes: ctx.session.duration_minutes,
    interviewerIds: ctx.session.interviewer_ids,
    fallbackInterviewerIds: originalSession?.fallback_interviewer_ids ?? [],
    slotStart: body.slotStart,
    timezone: ctx.session.timezone,
    notes: `Rescheduled by candidate`,
  });

  // Surface the candidate-initiated reschedule to the recruiter: log it on the
  // interview timeline (shown in the candidate drawer) so it isn't silent.
  const fromLabel = formatSlotLocal(ctx.proposal.slot_start, ctx.session.timezone);
  const toLabel = formatSlotLocal(proposal.slot_start, session.timezone);
  await sb.from("match_round_events").insert({
    match_id: ctx.session.match_id,
    round_index: ctx.session.round_index + 1,
    event_type: "note",
    note: `Candidate rescheduled interview: ${fromLabel} → ${toLabel}`,
  });

  // Notify interviewers of the new slot.
  await enqueue(ctx.session.match_id, "send_scheduling_proposal", {
    sessionId: session.id,
  });

  return NextResponse.json({
    success: true,
    newSlot: {
      start: proposal.slot_start,
      end: proposal.slot_end,
      label: formatSlotLocal(proposal.slot_start, session.timezone),
    },
    sessionId: session.id,
  });
}
