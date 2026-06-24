import { supabaseServer } from "@/lib/db";
import { log } from "@/lib/logger";
import type { QueueJob } from "@/lib/queue";
import { getSession, getLatestProposal, getProposalSlotOptions } from "@/lib/scheduling";
import { listInterviewers } from "@/lib/interviewers";
import {
  buildApprovalBlocks,
  postSlackMessage,
  lookupSlackUserByEmail,
} from "@/lib/slack";
import { formatSlotLocal, formatSlotButtonLabel } from "@/lib/scheduling-email";
import { buildScheduleRespondUrl } from "@/lib/scheduling-token";
import { env } from "@/lib/env";

export async function handleSendSlackApproval(job: QueueJob): Promise<void> {
  const sb = supabaseServer();
  const payload = job.payload as { sessionId?: string };
  const sessionId = payload.sessionId;
  if (!sessionId) throw new Error("sessionId required");

  const session = await getSession(sessionId);
  if (!session) throw new Error("session not found");
  if (session.status !== "pending_approval") {
    log.info({ sessionId }, "send_slack_approval: session no longer pending, skipping");
    return;
  }

  const proposal = await getLatestProposal(sessionId);
  if (!proposal || proposal.status !== "pending") {
    log.info({ sessionId }, "send_slack_approval: no pending proposal, skipping");
    return;
  }

  const { data: match } = await sb
    .from("matches")
    .select(
      `
      id,
      candidate:candidates ( name ),
      job:jobs ( id, title, interview_rounds )
    `,
    )
    .eq("id", session.match_id)
    .single();
  if (!match) throw new Error("match not found");

  const candidate = Array.isArray(match.candidate) ? match.candidate[0] : match.candidate;
  const jobRow = Array.isArray(match.job) ? match.job[0] : match.job;

  const interviewers = await listInterviewers(jobRow.id as string);
  const panel = interviewers.filter((iv) => session.interviewer_ids.includes(iv.id));

  const rounds = (jobRow.interview_rounds as { name: string; order: number }[] | null) ?? [];
  const sorted = [...rounds].sort((a, b) => a.order - b.order);
  const roundName = sorted[session.round_index]?.name ?? `Round ${session.round_index + 1}`;

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const respondUrl = buildScheduleRespondUrl(proposal.response_token, origin);

  const slotOptions = getProposalSlotOptions(proposal);
  const slots = slotOptions.map((s) => ({
    start: s.start,
    label: formatSlotLocal(s.start, session.timezone),
    buttonLabel: formatSlotButtonLabel(s.start, session.timezone),
  }));

  if (slots.length === 0) {
    log.warn({ sessionId, proposalId: proposal.id }, "send_slack_approval: no slots on proposal");
  }

  log.info(
    { sessionId, proposalId: proposal.id, slotCount: slots.length },
    "send_slack_approval: building blocks",
  );

  const blocks = buildApprovalBlocks({
    candidateName: (candidate?.name as string | null) ?? "Candidate",
    jobTitle: jobRow.title as string,
    roundName,
    slots,
    durationMinutes: session.duration_minutes,
    respondUrl,
    responseToken: proposal.response_token,
    origin,
  });

  const text =
    `Interview approval needed: ${candidate?.name ?? "Candidate"} · ${jobRow.title as string} · ${slots.length > 1 ? `${slots.length} times` : slots[0]!.label}`;

  const slackUsersNotified: string[] = [];

  for (const interviewer of panel) {
    // Prefer a direct DM to the interviewer. Use a stored Slack user ID if we
    // have one; otherwise resolve it from their email and persist it for next
    // time. Only fall back to a shared channel if no DM target can be found.
    let target = interviewer.slack_user_id;
    if (!target && interviewer.email) {
      const resolved = await lookupSlackUserByEmail(interviewer.email);
      if (resolved) {
        target = resolved;
        await sb.from("interviewers").update({ slack_user_id: resolved }).eq("id", interviewer.id);
        log.info(
          { interviewerId: interviewer.id, slackUserId: resolved },
          "send_slack_approval: resolved Slack user from email",
        );
      }
    }
    if (!target) target = env.slackChannelId();
    if (!target) {
      log.warn(
        { interviewerId: interviewer.id, email: interviewer.email },
        "send_slack_approval: could not resolve a Slack DM (no slack_user_id, email lookup failed, no fallback channel)",
      );
      continue;
    }

    const result = await postSlackMessage({ channel: target, text, blocks });
    if (result.ok && result.ts) {
      // Persist Slack ts so we can update the message on approval/rejection.
      await sb
        .from("scheduling_proposals")
        .update({ slack_ts: result.ts })
        .eq("id", proposal.id);
      await sb.from("scheduling_slack_messages").upsert(
        {
          proposal_id: proposal.id,
          session_id: session.id,
          interviewer_id: interviewer.id,
          slack_channel_id: target,
          slack_ts: result.ts,
          status: "sent",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "proposal_id,slack_channel_id,slack_ts" },
      );
      slackUsersNotified.push(target);
      log.info({ target, ts: result.ts }, "send_slack_approval: sent Slack approval request");
    } else {
      log.warn(
        {
          target,
          error: result.error,
          errors: result.errors,
          slotCount: slots.length,
        },
        "send_slack_approval: Slack API error",
      );
    }
  }

  if (slackUsersNotified.length === 0) {
    throw new Error("No Slack messages sent — check SLACK_BOT_TOKEN and interviewer slack_user_id");
  }
}
