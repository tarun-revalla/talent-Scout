import { supabaseServer } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { resolveEmailSettings } from "@/lib/email-templates";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import type { QueueJob } from "@/lib/queue";
import { buildIcsCancelEvent, buildIcsEvent } from "@/lib/calendar/ics-generate";
import {
  buildCandidateInviteEmail,
  buildCandidateReschedulePendingEmail,
  buildCandidateRescheduledEmail,
  buildCandidateRescheduleUrl,
  buildInterviewerRescheduleUrl,
} from "@/lib/scheduling-email";
import {
  assertSlotReservedForSession,
  confirmScheduledInterview,
  getLatestProposal,
  getRescheduleContext,
  getSession,
} from "@/lib/scheduling";
import { listInterviewers } from "@/lib/interviewers";

function uniqueEmails(emails: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of emails) {
    const normalized = email?.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export async function handleSendCandidateInvite(job: QueueJob): Promise<void> {
  const sb = supabaseServer();
  const payload = job.payload as {
    sessionId?: string;
    pendingReschedule?: boolean;
    previousSlotStart?: string;
    previousSlotEnd?: string;
    previousSessionId?: string;
  };
  const sessionId = payload.sessionId;
  if (!sessionId) throw new Error("sessionId required");

  const session = await getSession(sessionId);
  if (!session) throw new Error("session not found");

  const proposal = await getLatestProposal(sessionId);
  if (!proposal) throw new Error("no proposal found");

  if (payload.pendingReschedule) {
    if (proposal.status !== "pending") {
      log.info({ sessionId }, "send_candidate_invite: pending reschedule skipped (not pending)");
      return;
    }
  } else {
    if (session.status !== "approved") {
      log.info({ sessionId }, "send_candidate_invite: skipping (not approved)");
      return;
    }
    if (proposal.status !== "accepted") {
      throw new Error("no accepted proposal");
    }
  }

  const { data: match } = await sb
    .from("matches")
    .select(
      `
      id, thread_id,
      candidate:candidates ( id, name, email, email_invalid ),
      job:jobs ( id, title, email_settings, interview_rounds )
    `,
    )
    .eq("id", session.match_id)
    .single();
  if (!match) throw new Error("match not found");

  const candidate = Array.isArray(match.candidate) ? match.candidate[0] : match.candidate;
  const jobRow = Array.isArray(match.job) ? match.job[0] : match.job;
  if (!candidate?.email) throw new Error("candidate has no email");
  if (candidate.email_invalid) {
    log.info({ matchId: match.id }, "send_candidate_invite: skipping (email invalid)");
    return;
  }

  if (!payload.pendingReschedule) {
    await assertSlotReservedForSession({
      session,
      proposal,
      candidateId: (candidate.id as string | null) ?? null,
    });
  }

  const interviewers = await listInterviewers(jobRow.id as string);
  const panel = interviewers.filter((iv) => session.interviewer_ids.includes(iv.id));

  const rounds =
    (jobRow.interview_rounds as { name: string; order: number }[] | null) ?? [];
  const sorted = [...rounds].sort((a, b) => a.order - b.order);
  const roundName = sorted[session.round_index]?.name ?? `Round ${session.round_index + 1}`;

  const emailSettings = resolveEmailSettings(jobRow.email_settings);
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? undefined;

  const { data: proposalWithToken } = await sb
    .from("scheduling_proposals")
    .select("candidate_reschedule_token")
    .eq("id", proposal.id)
    .maybeSingle();

  const candidateRescheduleToken = proposalWithToken?.candidate_reschedule_token as string | null;
  const rescheduleUrl = candidateRescheduleToken
    ? buildCandidateRescheduleUrl(candidateRescheduleToken, origin)
    : undefined;
  const interviewerRescheduleUrl = buildInterviewerRescheduleUrl(proposal.response_token, origin);

  const proposedSlots =
    proposal.proposed_slots && proposal.proposed_slots.length > 0
      ? proposal.proposed_slots
      : [{ start: proposal.slot_start, end: proposal.slot_end }];

  if (payload.pendingReschedule) {
    const { subject, body } = buildCandidateReschedulePendingEmail({
      candidateName: candidate.name as string | null,
      jobTitle: jobRow.title as string,
      roundName,
      timezone: session.timezone,
      durationMinutes: session.duration_minutes,
      recruiterName: emailSettings.recruiter_name,
      interviewerNames: panel.map((iv) => iv.name),
      previousSlotStart: payload.previousSlotStart,
      proposedSlots,
    });

    const sent = await sendEmail({
      to: candidate.email as string,
      subject,
      body,
      htmlOptions: {
        recruiterName: emailSettings.recruiter_name,
        jobTitle: jobRow.title as string,
      },
    });

    await sb.from("conversations").insert({
      match_id: match.id,
      direction: "out",
      subject,
      body,
      message_id: sent.messageId,
      sent_at: sent.acceptedAt,
    });

    log.info(
      { matchId: match.id, sessionId, to: candidate.email },
      "send_candidate_invite: sent pending reschedule notice",
    );
    return;
  }

  const rescheduleCtx =
    payload.previousSlotStart
      ? {
          previousSlotStart: payload.previousSlotStart,
          previousSlotEnd: payload.previousSlotEnd,
          previousSessionId: payload.previousSessionId,
        }
      : await getRescheduleContext(
          sessionId,
          session.match_id,
          session.round_index,
          proposal.slot_start,
        );

  const isReschedule = Boolean(rescheduleCtx?.previousSlotStart);

  const emailContent = isReschedule
    ? buildCandidateRescheduledEmail({
        candidateName: candidate.name as string | null,
        jobTitle: jobRow.title as string,
        roundName,
        slotStart: proposal.slot_start,
        previousSlotStart: rescheduleCtx!.previousSlotStart,
        timezone: session.timezone,
        durationMinutes: session.duration_minutes,
        recruiterName: emailSettings.recruiter_name,
        interviewerNames: panel.map((iv) => iv.name),
        rescheduleUrl,
        interviewerRescheduleUrl,
      })
    : buildCandidateInviteEmail({
        candidateName: candidate.name as string | null,
        jobTitle: jobRow.title as string,
        roundName,
        slotStart: proposal.slot_start,
        timezone: session.timezone,
        durationMinutes: session.duration_minutes,
        recruiterName: emailSettings.recruiter_name,
        interviewerNames: panel.map((iv) => iv.name),
        rescheduleUrl,
        interviewerRescheduleUrl,
      });

  const icsUid = `talentscout-${sessionId}@talentscout`;
  const ics = buildIcsEvent({
    uid: icsUid,
    start: proposal.slot_start,
    end: proposal.slot_end,
    summary: `${jobRow.title} — ${roundName}`,
    description: `Interview for ${jobRow.title}. Interviewers: ${panel.map((iv) => iv.name).join(", ")}`,
    organizerEmail: env.gmailUser(),
    organizerName: emailSettings.recruiter_name,
    attendeeEmail: candidate.email as string,
    attendeeName: candidate.name as string | null,
    additionalAttendees: uniqueEmails([env.gmailUser(), ...panel.map((iv) => iv.email)])
      .filter((email) => email !== (candidate.email as string).toLowerCase())
      .map((email) => ({
        email,
        name: email === env.gmailUser()
          ? emailSettings.recruiter_name
          : panel.find((iv) => iv.email.toLowerCase() === email)?.name,
      })),
  });

  const attachments: Array<{
    filename: string;
    content: string;
    contentType: string;
  }> = [
    {
      filename: "interview.ics",
      content: ics,
      contentType: "text/calendar; method=REQUEST",
    },
  ];

  if (isReschedule && rescheduleCtx?.previousSessionId && rescheduleCtx.previousSlotEnd) {
    const cancelUid = `talentscout-${rescheduleCtx.previousSessionId}@talentscout`;
    attachments.unshift({
      filename: "cancel-interview.ics",
      content: buildIcsCancelEvent({
        uid: cancelUid,
        start: rescheduleCtx.previousSlotStart,
        end: rescheduleCtx.previousSlotEnd,
        summary: `${jobRow.title} — ${roundName}`,
        description: `Cancelled interview for ${jobRow.title}`,
        organizerEmail: env.gmailUser(),
        organizerName: emailSettings.recruiter_name,
        attendeeEmail: candidate.email as string,
        attendeeName: candidate.name as string | null,
      }),
      contentType: "text/calendar; method=CANCEL",
    });
  }

  const cc = uniqueEmails([env.gmailUser(), ...panel.map((iv) => iv.email)]).filter(
    (email) => email !== (candidate.email as string).toLowerCase(),
  );

  const sent = await sendEmail({
    to: candidate.email as string,
    cc,
    subject: emailContent.subject,
    body: emailContent.body,
    htmlOptions: {
      recruiterName: emailSettings.recruiter_name,
      jobTitle: jobRow.title as string,
    },
    attachments,
  });

  await confirmScheduledInterview(sessionId);

  await sb.from("conversations").insert({
    match_id: match.id,
    direction: "out",
    subject: emailContent.subject,
    body: emailContent.body,
    message_id: sent.messageId,
    sent_at: sent.acceptedAt,
  });

  await sb
    .from("matches")
    .update({
      thread_id: match.thread_id ?? sent.messageId,
      last_action_at: sent.acceptedAt,
    })
    .eq("id", match.id);

  log.info(
    { matchId: match.id, sessionId, to: candidate.email, isReschedule },
    "send_candidate_invite: sent with ICS",
  );
}
