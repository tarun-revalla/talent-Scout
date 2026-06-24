import { NextRequest, NextResponse } from "next/server";
import { findOverlapSlots, createSchedulingSession, listSessionsForMatch, releaseSchedulingSession } from "@/lib/scheduling";
import { enqueueIfAbsent } from "@/lib/queue";
import { refineSlotsWithAi } from "@/lib/scheduling-ai";
import { supabaseServer } from "@/lib/db";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const matchId = req.nextUrl.searchParams.get("matchId");
    if (!matchId) {
      return NextResponse.json({ error: "matchId required" }, { status: 400 });
    }
    const sessions = await listSessionsForMatch(matchId);
    return NextResponse.json({ sessions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: string;
      interviewerIds?: string[];
      durationMinutes?: number;
      daysAhead?: number;
      intentText?: string;
      matchId?: string;
      roundIndex?: number;
      slotStart?: string;
      slotStarts?: string[];
      timezone?: string;
      notes?: string;
      rescheduleSessionId?: string;
    };

    if (body.action === "slots") {
      if (!body.interviewerIds?.length || !body.durationMinutes) {
        return NextResponse.json(
          { error: "interviewerIds and durationMinutes required" },
          { status: 400 },
        );
      }
      const { slots } = await findOverlapSlots(
        body.interviewerIds,
        body.durationMinutes,
        body.daysAhead ?? 14,
      );

      let refined = slots;
      let intentSummary: string | undefined;
      if (body.intentText?.trim()) {
        const tz = body.timezone ?? "America/New_York";
        let candidateName: string | null = null;
        let jobTitle = "Interview";
        let roundName = "Round";
        let jobId: string | undefined;

        if (body.matchId) {
          const sb = supabaseServer();
          const { data: match } = await sb
            .from("matches")
            .select(
              `
              job_id, current_round_index,
              candidate:candidates ( name ),
              job:jobs ( id, title, interview_rounds )
            `,
            )
            .eq("id", body.matchId)
            .maybeSingle();
          if (match) {
            const cand = Array.isArray(match.candidate) ? match.candidate[0] : match.candidate;
            const job = Array.isArray(match.job) ? match.job[0] : match.job;
            candidateName = (cand?.name as string | null) ?? null;
            jobTitle = (job?.title as string) ?? jobTitle;
            jobId = job?.id as string | undefined;
            const rounds =
              (job?.interview_rounds as { name: string; order: number }[] | null) ?? [];
            const sorted = [...rounds].sort((a, b) => a.order - b.order);
            const ri = (match.current_round_index as number) ?? 0;
            roundName = sorted[ri]?.name ?? roundName;
          }
        }

        const result = await refineSlotsWithAi({
          slots,
          timezone: tz,
          intentText: body.intentText,
          candidateName,
          jobTitle,
          roundName,
          jobId,
          matchId: body.matchId,
        });
        refined = result.slots;
        intentSummary = result.intent?.summary;
      }

      return NextResponse.json({ slots: refined, intentSummary });
    }

    const hasSlots = Boolean(body.slotStart) || (body.slotStarts?.length ?? 0) > 0;
    if (!body.matchId || body.roundIndex == null || !body.durationMinutes || !hasSlots) {
      return NextResponse.json(
        { error: "matchId, roundIndex, durationMinutes, slotStart(s), and interviewerIds required" },
        { status: 400 },
      );
    }
    if (!body.interviewerIds?.length) {
      return NextResponse.json({ error: "interviewerIds required" }, { status: 400 });
    }

    if (body.rescheduleSessionId) {
      const released = await releaseSchedulingSession(body.rescheduleSessionId);
      const sb = supabaseServer();
      await sb.from("match_round_events").insert({
        match_id: body.matchId,
        round_index: body.roundIndex,
        event_type: "note",
        note: "Interview rescheduled — new times proposed to the panel.",
      });

      const result = await createSchedulingSession({
        matchId: body.matchId,
        roundIndex: body.roundIndex,
        durationMinutes: body.durationMinutes,
        interviewerIds: body.interviewerIds,
        slotStart: body.slotStart,
        slotStarts: body.slotStarts,
        timezone: body.timezone,
        notes: body.notes,
      });

      const origin = req.nextUrl.origin;
      await enqueueIfAbsent(body.matchId, "send_slack_approval", {
        sessionId: result.session.id,
        origin,
      });
      await enqueueIfAbsent(body.matchId, "send_scheduling_proposal", {
        responseToken: result.proposal.response_token,
        origin,
      });
      await enqueueIfAbsent(body.matchId, "send_candidate_invite", {
        sessionId: result.session.id,
        pendingReschedule: true,
        previousSlotStart: released.previousSlotStart,
        previousSlotEnd: released.previousSlotEnd,
        previousSessionId: released.previousSessionId,
      });

      return NextResponse.json(result, { status: 201 });
    }

    const result = await createSchedulingSession({
      matchId: body.matchId,
      roundIndex: body.roundIndex,
      durationMinutes: body.durationMinutes,
      interviewerIds: body.interviewerIds,
      slotStart: body.slotStart,
      slotStarts: body.slotStarts,
      timezone: body.timezone,
      notes: body.notes,
    });

    const origin = req.nextUrl.origin;
    await enqueueIfAbsent(body.matchId, "send_slack_approval", {
      sessionId: result.session.id,
      origin,
    });
    await enqueueIfAbsent(body.matchId, "send_scheduling_proposal", {
      responseToken: result.proposal.response_token,
      origin,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    log.error({ err }, "scheduling sessions POST failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 },
    );
  }
}
