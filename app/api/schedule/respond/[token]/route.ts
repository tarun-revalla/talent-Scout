import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";
import { getProposalByToken, respondToProposal } from "@/lib/scheduling";
import { enqueueIfAbsent } from "@/lib/queue";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const ctx = await getProposalByToken(token);
    if (!ctx) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
    }

    const sb = supabaseServer();
    const { data: jobRow } = await sb
      .from("jobs")
      .select("interview_rounds")
      .eq("id", ctx.job.id)
      .single();
    const rounds =
      (jobRow?.interview_rounds as { name: string; order: number }[] | null) ?? [];
    const sorted = [...rounds].sort((a, b) => a.order - b.order);
    const roundName = sorted[ctx.session.round_index]?.name ?? `Round ${ctx.session.round_index + 1}`;

    // Multi-slot: expose all proposed options; fall back to the single slot.
    const slots =
      ctx.proposal.proposed_slots && ctx.proposal.proposed_slots.length > 0
        ? ctx.proposal.proposed_slots
        : [{ start: ctx.proposal.slot_start, end: ctx.proposal.slot_end }];

    return NextResponse.json({
      status: ctx.proposal.status,
      slotStart: ctx.proposal.slot_start,
      slotEnd: ctx.proposal.slot_end,
      slots,
      timezone: ctx.session.timezone,
      durationMinutes: ctx.session.duration_minutes,
      jobTitle: ctx.job.title,
      roundName,
      candidateName: ctx.candidate.name,
      interviewers: ctx.interviewers.map((iv) => iv.name),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = (await req.json()) as {
      action?: string;
      email?: string;
      origin?: string;
      selectedSlotStart?: string;
    };
    if (body.action !== "accept" && body.action !== "reject") {
      return NextResponse.json({ error: "action must be accept or reject" }, { status: 400 });
    }

    const result = await respondToProposal(token, body.action, {
      responderEmail: body.email,
      selectedSlotStart: body.selectedSlotStart,
    });

    const matchId = result.session.match_id;

    if (body.action === "reject" && result.nextProposal) {
      await enqueueIfAbsent(matchId, "send_scheduling_proposal", {
        responseToken: result.nextProposal.response_token,
        origin: body.origin,
      });
    }

    if (body.action === "accept") {
      await enqueueIfAbsent(matchId, "send_candidate_invite", {
        sessionId: result.session.id,
        origin: body.origin,
      });
      await enqueueIfAbsent(matchId, "send_scheduling_confirmed", {
        sessionId: result.session.id,
      });
    }

    return NextResponse.json({
      ok: true,
      action: body.action,
      sessionStatus: result.session.status,
      hasNextProposal: Boolean(result.nextProposal),
    });
  } catch (err) {
    log.error({ err }, "schedule respond POST failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 },
    );
  }
}
