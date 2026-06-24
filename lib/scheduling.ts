import { supabaseServer } from "./db";
import { getOverlapAvailability, listInterviewers } from "./interviewers";
import { generateSchedulingToken } from "./scheduling-token";
import type { FreeSlot } from "./calendar/types";
import { enqueue } from "./queue";

export type SchedulingStatus =
  | "draft"
  | "proposing"
  | "pending_approval"
  | "approved"
  | "confirmed"
  | "cancelled"
  | "expired";

export interface SchedulingSession {
  id: string;
  match_id: string;
  round_index: number;
  duration_minutes: number;
  timezone: string;
  status: SchedulingStatus;
  interviewer_ids: string[];
  fallback_interviewer_ids: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProposedSlot {
  start: string;
  end: string;
}

export interface SchedulingProposal {
  id: string;
  session_id: string;
  slot_start: string;
  slot_end: string;
  proposed_slots: ProposedSlot[];
  status: string;
  response_token: string;
  responded_at: string | null;
  proposal_index: number;
}

function slotsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() &&
    new Date(bStart).getTime() < new Date(aEnd).getTime();
}

function rowToSession(r: Record<string, unknown>): SchedulingSession {
  return {
    id: r.id as string,
    match_id: r.match_id as string,
    round_index: r.round_index as number,
    duration_minutes: r.duration_minutes as number,
    timezone: r.timezone as string,
    status: r.status as SchedulingStatus,
    interviewer_ids: (r.interviewer_ids as string[]) ?? [],
    fallback_interviewer_ids: (r.fallback_interviewer_ids as string[]) ?? [],
    notes: (r.notes as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

export async function findOverlapSlots(
  interviewerIds: string[],
  durationMinutes: number,
  daysAhead = 14,
): Promise<{ slots: FreeSlot[] }> {
  const { slots } = await getOverlapAvailability(interviewerIds, durationMinutes, daysAhead);
  return { slots: await filterReservedSlots(interviewerIds, slots) };
}

async function filterReservedSlots(interviewerIds: string[], slots: FreeSlot[]): Promise<FreeSlot[]> {
  if (interviewerIds.length === 0 || slots.length === 0) return slots;

  const minStart = slots.reduce((min, s) => (s.start < min ? s.start : min), slots[0]!.start);
  const maxEnd = slots.reduce((max, s) => (s.end > max ? s.end : max), slots[0]!.end);
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("scheduling_slot_reservations")
    .select("interviewer_id, slot_start, slot_end")
    .in("interviewer_id", interviewerIds)
    .in("status", ["active", "confirmed"])
    .lt("slot_start", maxEnd)
    .gt("slot_end", minStart);
  if (error) throw new Error(error.message);

  const reservations = data ?? [];
  return slots.filter(
    (slot) =>
      !reservations.some((r) =>
        slotsOverlap(
          slot.start,
          slot.end,
          r.slot_start as string,
          r.slot_end as string,
        ),
      ),
  );
}

async function reserveAcceptedSlot(args: {
  session: SchedulingSession;
  proposal: SchedulingProposal;
  match: Record<string, unknown>;
  slotStart: string;
  slotEnd: string;
}): Promise<void> {
  const sb = supabaseServer();
  const { data: existing, error: existingErr } = await sb
    .from("scheduling_slot_reservations")
    .select("id")
    .eq("session_id", args.session.id)
    .in("status", ["active", "confirmed"])
    .limit(1);
  if (existingErr) throw new Error(existingErr.message);
  if (existing && existing.length > 0) return;

  const rows = args.session.interviewer_ids.map((interviewerId) => ({
    session_id: args.session.id,
    proposal_id: args.proposal.id,
    match_id: args.session.match_id,
    candidate_id: (args.match.candidate_id as string | null) ?? null,
    interviewer_id: interviewerId,
    slot_start: args.slotStart,
    slot_end: args.slotEnd,
    status: "active",
  }));

  const { error } = await sb.from("scheduling_slot_reservations").insert(rows);
  if (error) {
    throw new Error("Selected slot is no longer available — another interview reserved it");
  }
}

export async function assertSlotReservedForSession(args: {
  session: SchedulingSession;
  proposal: SchedulingProposal;
  candidateId: string | null;
}): Promise<void> {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("scheduling_slot_reservations")
    .select("interviewer_id, candidate_id")
    .eq("session_id", args.session.id)
    .eq("proposal_id", args.proposal.id)
    .eq("match_id", args.session.match_id)
    .eq("slot_start", args.proposal.slot_start)
    .eq("slot_end", args.proposal.slot_end)
    .in("status", ["active", "confirmed"]);
  if (error) throw new Error(error.message);

  const reservedInterviewers = new Set((data ?? []).map((r) => r.interviewer_id as string));
  const missing = args.session.interviewer_ids.filter((id) => !reservedInterviewers.has(id));
  if (missing.length > 0) {
    throw new Error("Selected slot is not reserved for this interview session");
  }

  if (args.candidateId) {
    const wrongCandidate = (data ?? []).some(
      (r) => r.candidate_id && r.candidate_id !== args.candidateId,
    );
    if (wrongCandidate) {
      throw new Error("Selected slot is reserved for a different candidate");
    }
  }
}

async function createNextProposalAfterRejection(args: {
  session: SchedulingSession;
  proposal: SchedulingProposal;
  now: string;
}): Promise<{ session: SchedulingSession; nextProposal?: SchedulingProposal }> {
  const sb = supabaseServer();
  const alreadyOffered = new Set(
    (args.proposal.proposed_slots ?? []).map((s) => s.start).concat(args.proposal.slot_start),
  );

  let nextSlots: FreeSlot[] = [];
  let nextInterviewerIds = args.session.interviewer_ids;

  const { slots: primarySlots } = await findOverlapSlots(
    args.session.interviewer_ids,
    args.session.duration_minutes,
  );
  nextSlots = primarySlots.filter(
    (s) => !alreadyOffered.has(s.start) && new Date(s.start) > new Date(),
  );

  if (nextSlots.length === 0 && args.session.fallback_interviewer_ids.length > 0) {
    const { slots: fallbackSlots } = await findOverlapSlots(
      args.session.fallback_interviewer_ids,
      args.session.duration_minutes,
    );
    nextSlots = fallbackSlots.filter((s) => new Date(s.start) > new Date());
    if (nextSlots.length > 0) nextInterviewerIds = args.session.fallback_interviewer_ids;
  }

  if (nextSlots.length === 0) {
    await sb
      .from("scheduling_sessions")
      .update({ status: "expired", updated_at: args.now })
      .eq("id", args.session.id);
    throw new Error("No alternative slots available — please contact the recruiter");
  }

  if (nextInterviewerIds !== args.session.interviewer_ids) {
    await sb
      .from("scheduling_sessions")
      .update({ interviewer_ids: nextInterviewerIds, updated_at: args.now })
      .eq("id", args.session.id);
  }

  const offered = nextSlots.slice(0, FALLBACK_SLOT_COUNT);
  const proposedSlots = slotsFromStarts(
    offered.map((s) => s.start),
    args.session.duration_minutes,
  );
  const firstSlot = proposedSlots[0]!;
  const nextToken = generateSchedulingToken();
  const nextCandidateToken = generateSchedulingToken();
  const { data: nextProposal, error } = await sb
    .from("scheduling_proposals")
    .insert({
      session_id: args.session.id,
      slot_start: firstSlot.start,
      slot_end: firstSlot.end,
      proposed_slots: proposedSlots,
      status: "pending",
      response_token: nextToken,
      candidate_reschedule_token: nextCandidateToken,
      proposal_index: args.proposal.proposal_index + 1,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await sb
    .from("scheduling_sessions")
    .update({ status: "pending_approval", updated_at: args.now })
    .eq("id", args.session.id);

  const session = (await getSession(args.session.id))!;
  return { session, nextProposal: nextProposal as SchedulingProposal };
}

export async function getSession(id: string): Promise<SchedulingSession | null> {
  const sb = supabaseServer();
  const { data, error } = await sb.from("scheduling_sessions").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToSession(data) : null;
}

export async function listSessionsForMatch(matchId: string): Promise<SchedulingSession[]> {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("scheduling_sessions")
    .select("*")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToSession);
}

export async function getLatestProposal(sessionId: string): Promise<SchedulingProposal | null> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("scheduling_proposals")
    .select("*")
    .eq("session_id", sessionId)
    .order("proposal_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as SchedulingProposal | null;
}

export interface CreateSessionInput {
  matchId: string;
  roundIndex: number;
  durationMinutes: number;
  interviewerIds: string[];
  fallbackInterviewerIds?: string[];
  /** Single chosen slot. Provide this OR slotStarts. */
  slotStart?: string;
  /** Multiple proposed slots the recipient picks from. First is the default. */
  slotStarts?: string[];
  timezone?: string;
  notes?: string;
  urgency?: "high" | "normal";
}

/** Build {start,end} slot objects from a list of start ISO strings. */
function slotsFromStarts(starts: string[], durationMinutes: number): ProposedSlot[] {
  return starts.map((start) => ({
    start,
    end: new Date(new Date(start).getTime() + durationMinutes * 60_000).toISOString(),
  }));
}

/**
 * Create a session and its proposal. Accepts either a single `slotStart` or
 * multiple `slotStarts` the recipient picks from. The first slot is stored as
 * slot_start/slot_end; all options are stored in proposed_slots.
 */
export async function createSchedulingSession(
  input: CreateSessionInput,
): Promise<{ session: SchedulingSession; proposal: SchedulingProposal }> {
  if (input.interviewerIds.length === 0) throw new Error("Select at least one interviewer");
  if (input.durationMinutes < 15 || input.durationMinutes > 180) {
    throw new Error("Duration must be 15–180 minutes");
  }

  // Normalize the requested slots: slotStarts takes precedence, else single slotStart.
  const requestedStarts = (input.slotStarts && input.slotStarts.length > 0
    ? input.slotStarts
    : input.slotStart
      ? [input.slotStart]
      : []
  ).filter((s, i, arr) => arr.indexOf(s) === i); // dedupe, preserve order

  if (requestedStarts.length === 0) {
    throw new Error("Provide at least one slot (slotStart or slotStarts)");
  }

  const sb = supabaseServer();

  const { data: match, error: mErr } = await sb
    .from("matches")
    .select("id, job_id, interview_state")
    .eq("id", input.matchId)
    .single();
  if (mErr || !match) throw new Error("Match not found");

  for (const ivId of input.interviewerIds) {
    const { data: iv } = await sb
      .from("interviewers")
      .select("id")
      .eq("id", ivId)
      .eq("job_id", match.job_id)
      .maybeSingle();
    if (!iv) throw new Error("Interviewer not found on this job");
  }

  const { slots } = await findOverlapSlots(
    input.interviewerIds,
    input.durationMinutes,
  );
  const available = new Set(slots.map((s) => s.start));
  const validStarts = requestedStarts.filter((s) => available.has(s));
  if (validStarts.length === 0) {
    throw new Error("Selected slot is no longer available — please pick another time");
  }

  const proposedSlots = slotsFromStarts(validStarts, input.durationMinutes);
  const firstSlot = proposedSlots[0]!;

  const now = new Date().toISOString();
  const { data: sessionRow, error: sErr } = await sb
    .from("scheduling_sessions")
    .insert({
      match_id: input.matchId,
      round_index: input.roundIndex,
      duration_minutes: input.durationMinutes,
      timezone: input.timezone ?? "America/New_York",
      status: "pending_approval",
      interviewer_ids: input.interviewerIds,
      fallback_interviewer_ids: input.fallbackInterviewerIds ?? [],
      notes: input.notes ?? null,
      updated_at: now,
    })
    .select("*")
    .single();
  if (sErr) throw new Error(sErr.message);

  const token = generateSchedulingToken();
  const candidateRescheduleToken = generateSchedulingToken();
  const { data: proposalRow, error: pErr } = await sb
    .from("scheduling_proposals")
    .insert({
      session_id: sessionRow.id,
      slot_start: firstSlot.start,
      slot_end: firstSlot.end,
      proposed_slots: proposedSlots,
      status: "pending",
      response_token: token,
      candidate_reschedule_token: candidateRescheduleToken,
      proposal_index: 0,
    })
    .select("*")
    .single();
  if (pErr) throw new Error(pErr.message);

  return {
    session: rowToSession(sessionRow),
    proposal: proposalRow as SchedulingProposal,
  };
}

/** Look up a confirmed interview by the candidate's reschedule token. */
export async function getProposalByCandidateRescheduleToken(token: string): Promise<{
  proposal: SchedulingProposal;
  session: SchedulingSession;
  match: Record<string, unknown>;
  interviewers: { id: string; name: string; email: string }[];
  job: { id: string; title: string };
  candidate: { name: string | null; email: string | null };
} | null> {
  const sb = supabaseServer();
  const { data: proposal } = await sb
    .from("scheduling_proposals")
    .select("*")
    .eq("candidate_reschedule_token", token)
    .maybeSingle();
  if (!proposal) return null;
  // Reuse existing context builder — same shape.
  return getProposalByToken(proposal.response_token as string);
}

export async function getProposalByToken(token: string): Promise<{
  proposal: SchedulingProposal;
  session: SchedulingSession;
  match: Record<string, unknown>;
  interviewers: { id: string; name: string; email: string }[];
  job: { id: string; title: string };
  candidate: { name: string | null; email: string | null };
} | null> {
  const sb = supabaseServer();
  const { data: proposal } = await sb
    .from("scheduling_proposals")
    .select("*")
    .eq("response_token", token)
    .maybeSingle();
  if (!proposal) return null;

  const session = await getSession(proposal.session_id as string);
  if (!session) return null;

  const { data: match } = await sb
    .from("matches")
    .select(
      `
      id, job_id, candidate_id, current_round_index,
      candidate:candidates ( name, email ),
      job:jobs ( id, title, interview_rounds )
    `,
    )
    .eq("id", session.match_id)
    .single();
  if (!match) return null;

  const interviewers = await listInterviewers(
    (Array.isArray(match.job) ? match.job[0] : match.job)?.id as string,
  );
  const selected = interviewers.filter((iv) => session.interviewer_ids.includes(iv.id));

  const candidate = Array.isArray(match.candidate) ? match.candidate[0] : match.candidate;
  const job = Array.isArray(match.job) ? match.job[0] : match.job;

  return {
    proposal: proposal as SchedulingProposal,
    session,
    match,
    interviewers: selected.map((iv) => ({ id: iv.id, name: iv.name, email: iv.email })),
    job: { id: job.id as string, title: job.title as string },
    candidate: {
      name: candidate?.name as string | null,
      email: candidate?.email as string | null,
    },
  };
}

export interface RespondOptions {
  /** Which of the proposed slots the recipient chose (multi-slot accept). */
  selectedSlotStart?: string;
  responderEmail?: string;
}

/** Number of alternative slots to offer when a proposal is rejected. */
const FALLBACK_SLOT_COUNT = 3;

export async function respondToProposal(
  token: string,
  action: "accept" | "reject",
  opts: RespondOptions = {},
): Promise<{ session: SchedulingSession; proposal: SchedulingProposal; nextProposal?: SchedulingProposal }> {
  const { selectedSlotStart, responderEmail } = opts;
  const ctx = await getProposalByToken(token);
  if (!ctx) throw new Error("Invalid or expired link");
  if (ctx.proposal.status !== "pending") {
    throw new Error(`This proposal was already ${ctx.proposal.status}`);
  }

  const sb = supabaseServer();
  const now = new Date().toISOString();

  if (action === "reject") {
    await sb
      .from("scheduling_proposals")
      .update({ status: "rejected", responded_at: now, responder_email: responderEmail ?? null })
      .eq("id", ctx.proposal.id);

    const { session, nextProposal } = await createNextProposalAfterRejection({
      session: ctx.session,
      proposal: ctx.proposal,
      now,
    });
    return {
      session,
      proposal: { ...ctx.proposal, status: "rejected", responded_at: now },
      nextProposal,
    };
  }

  // Accept — resolve which slot was chosen (multi-slot picker) or default to slot_start.
  let chosenStart = ctx.proposal.slot_start;
  let chosenEnd = ctx.proposal.slot_end;
  const options = ctx.proposal.proposed_slots ?? [];
  if (selectedSlotStart && options.length > 0) {
    const match = options.find((s) => s.start === selectedSlotStart);
    if (!match) throw new Error("Selected time is not one of the proposed options");
    chosenStart = match.start;
    chosenEnd = match.end;
  }

  await reserveAcceptedSlot({
    session: ctx.session,
    proposal: ctx.proposal,
    match: ctx.match,
    slotStart: chosenStart,
    slotEnd: chosenEnd,
  });

  await sb
    .from("scheduling_proposals")
    .update({
      status: "accepted",
      slot_start: chosenStart,
      slot_end: chosenEnd,
      responded_at: now,
      responder_email: responderEmail ?? null,
    })
    .eq("id", ctx.proposal.id);

  await sb
    .from("scheduling_sessions")
    .update({ status: "approved", updated_at: now })
    .eq("id", ctx.session.id);

  const session = (await getSession(ctx.session.id))!;
  return {
    session,
    proposal: { ...ctx.proposal, status: "accepted", slot_start: chosenStart, slot_end: chosenEnd, responded_at: now },
  };
}

export async function cancelAcceptedInterview(
  token: string,
): Promise<{ session: SchedulingSession; proposal: SchedulingProposal; nextProposal?: SchedulingProposal }> {
  const ctx = await getProposalByToken(token);
  if (!ctx) throw new Error("Invalid or expired link");
  if (ctx.proposal.status !== "accepted" || !["approved", "confirmed"].includes(ctx.session.status)) {
    throw new Error("This interview is not currently committed");
  }

  const sb = supabaseServer();
  const now = new Date().toISOString();

  await sb
    .from("scheduling_slot_reservations")
    .update({ status: "released", released_at: now })
    .eq("session_id", ctx.session.id)
    .in("status", ["active", "confirmed"]);

  await sb
    .from("scheduled_interviews")
    .update({ confirmed_at: null })
    .eq("session_id", ctx.session.id);

  await sb
    .from("scheduling_proposals")
    .update({ status: "rejected", responded_at: now })
    .eq("id", ctx.proposal.id);

  const { session, nextProposal } = await createNextProposalAfterRejection({
    session: ctx.session,
    proposal: ctx.proposal,
    now,
  });

  return {
    session,
    proposal: { ...ctx.proposal, status: "rejected", responded_at: now },
    nextProposal,
  };
}

export async function confirmScheduledInterview(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "approved") throw new Error("Session not approved yet");

  const proposal = await getLatestProposal(sessionId);
  if (!proposal || proposal.status !== "accepted") {
    throw new Error("No accepted proposal");
  }

  const sb = supabaseServer();
  const now = new Date().toISOString();
  const icsUid = `talentscout-${sessionId}@talentscout`;

  await sb.from("scheduled_interviews").upsert({
    session_id: sessionId,
    match_id: session.match_id,
    round_index: session.round_index,
    starts_at: proposal.slot_start,
    ends_at: proposal.slot_end,
    ics_uid: icsUid,
    confirmed_at: now,
  });

  await sb
    .from("scheduling_sessions")
    .update({ status: "confirmed", updated_at: now })
    .eq("id", sessionId);

  await sb
    .from("scheduling_slot_reservations")
    .update({ status: "confirmed" })
    .eq("session_id", sessionId)
    .eq("status", "active");

  // Schedule prep packet 24h before the interview starts.
  const startsAt = new Date(proposal.slot_start);
  const prepAt = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);
  const scheduledFor = prepAt > new Date() ? prepAt.toISOString() : new Date().toISOString();
  await enqueue(session.match_id, "send_prep_packet", { sessionId, scheduledFor });
  await sb
    .from("outreach_queue")
    .update({ scheduled_for: scheduledFor })
    .eq("match_id", session.match_id)
    .eq("action", "send_prep_packet")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);

  // Schedule a calendar conflict re-check 2h before the interview.
  const conflictCheckAt = new Date(startsAt.getTime() - 2 * 60 * 60 * 1000);
  const conflictFor = conflictCheckAt > new Date() ? conflictCheckAt.toISOString() : new Date().toISOString();
  await enqueue(session.match_id, "check_calendar_conflict", { sessionId, scheduledFor: conflictFor });
  await sb
    .from("outreach_queue")
    .update({ scheduled_for: conflictFor })
    .eq("match_id", session.match_id)
    .eq("action", "check_calendar_conflict")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);
}

/** Fetch confirmed interview by session ID. */
export async function getConfirmedInterview(sessionId: string): Promise<{
  id: string;
  match_id: string;
  round_index: number;
  starts_at: string;
  ends_at: string;
  prep_packet_sent_at: string | null;
} | null> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("scheduled_interviews")
    .select("id, match_id, round_index, starts_at, ends_at, prep_packet_sent_at")
    .eq("session_id", sessionId)
    .maybeSingle();
  return data as typeof data & { prep_packet_sent_at: string | null } | null;
}

/** Cancel a confirmed interview (used by candidate rescheduling). */
export async function cancelConfirmedInterview(sessionId: string): Promise<void> {
  const sb = supabaseServer();
  const now = new Date().toISOString();
  await sb
    .from("scheduled_interviews")
    .update({ confirmed_at: null })
    .eq("session_id", sessionId);
  await sb
    .from("scheduling_sessions")
    .update({ status: "cancelled", updated_at: now })
    .eq("id", sessionId);
  await sb
    .from("scheduling_slot_reservations")
    .update({ status: "released", released_at: now })
    .eq("session_id", sessionId)
    .in("status", ["active", "confirmed"]);
}
