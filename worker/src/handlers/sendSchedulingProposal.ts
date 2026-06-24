import { supabaseServer } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { resolveEmailSettings } from "@/lib/email-templates";
import { log } from "@/lib/logger";
import type { QueueJob } from "@/lib/queue";
import { buildSchedulingProposalEmail } from "@/lib/scheduling-email";
import { getLatestProposal, getProposalByToken } from "@/lib/scheduling";

export async function handleSendSchedulingProposal(job: QueueJob): Promise<void> {
  const sb = supabaseServer();
  const payload = job.payload as {
    sessionId?: string;
    proposalId?: string;
    responseToken?: string;
    origin?: string;
  };

  let ctx;
  if (payload.responseToken) {
    ctx = await getProposalByToken(payload.responseToken);
  } else if (payload.proposalId) {
    const { data: proposal } = await sb
      .from("scheduling_proposals")
      .select("response_token")
      .eq("id", payload.proposalId)
      .single();
    if (proposal?.response_token) {
      ctx = await getProposalByToken(proposal.response_token as string);
    }
  } else if (payload.sessionId) {
    const proposal = await getLatestProposal(payload.sessionId);
    if (proposal?.response_token) {
      ctx = await getProposalByToken(proposal.response_token);
    }
  }
  if (!ctx) throw new Error("scheduling proposal not found");
  if (ctx.proposal.status !== "pending") {
    log.info({ proposalId: ctx.proposal.id }, "send_scheduling_proposal: skipping (not pending)");
    return;
  }

  const { data: jobRow } = await sb
    .from("jobs")
    .select("title, email_settings, interview_rounds")
    .eq("id", ctx.job.id)
    .single();

  const rounds = (jobRow?.interview_rounds as { name: string; order: number }[] | null) ?? [];
  const sorted = [...rounds].sort((a, b) => a.order - b.order);
  const roundName = sorted[ctx.session.round_index]?.name ?? `Round ${ctx.session.round_index + 1}`;

  const emailSettings = resolveEmailSettings(jobRow?.email_settings);
  const origin = payload.origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  for (const iv of ctx.interviewers) {
    const { subject, body } = buildSchedulingProposalEmail({
      interviewerName: iv.name,
      candidateName: ctx.candidate.name,
      jobTitle: ctx.job.title,
      roundName,
      slotStart: ctx.proposal.slot_start,
      slotEnd: ctx.proposal.slot_end,
      proposedSlots: ctx.proposal.proposed_slots,
      timezone: ctx.session.timezone,
      durationMinutes: ctx.session.duration_minutes,
      responseToken: ctx.proposal.response_token,
      origin,
      recruiterName: emailSettings.recruiter_name,
    });

    const sent = await sendEmail({
      to: iv.email,
      subject,
      body,
      htmlOptions: {
        recruiterName: emailSettings.recruiter_name,
        jobTitle: ctx.job.title,
      },
    });

    log.info(
      { matchId: ctx.session.match_id, to: iv.email, messageId: sent.messageId },
      "send_scheduling_proposal: sent",
    );
  }
}
