import { supabaseServer } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { resolveEmailSettings } from "@/lib/email-templates";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import type { QueueJob } from "@/lib/queue";
import { buildIcsEvent } from "@/lib/calendar/ics-generate";
import { buildCandidateInviteEmail, buildCandidateRescheduleUrl } from "@/lib/scheduling-email";
import {
  confirmScheduledInterview,
  getLatestProposal,
  getSession,
} from "@/lib/scheduling";
import { listInterviewers } from "@/lib/interviewers";
import { overlapsSlot } from "@/lib/calendar/validate";

export async function handleSendCandidateInvite(job: QueueJob): Promise<void> {
  const sb = supabaseServer();
  const payload = job.payload as { sessionId?: string };
  const sessionId = payload.sessionId;
  if (!sessionId) throw new Error("sessionId required");

  const session = await getSession(sessionId);
  if (!session) throw new Error("session not found");
  if (session.status !== "approved") {
    log.info({ sessionId }, "send_candidate_invite: skipping (not approved)");
    return;
  }

  const proposal = await getLatestProposal(sessionId);
  if (!proposal || proposal.status !== "accepted") {
    throw new Error("no accepted proposal");
  }

  const stillFree = await overlapsSlot(
    session.interviewer_ids,
    proposal.slot_start,
    proposal.slot_end,
  );
  if (!stillFree) {
    throw new Error("slot no longer available at send time");
  }

  const { data: match } = await sb
    .from("matches")
    .select(
      `
      id, thread_id,
      candidate:candidates ( name, email, email_invalid ),
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

  const interviewers = await listInterviewers(jobRow.id as string);
  const panel = interviewers.filter((iv) => session.interviewer_ids.includes(iv.id));

  const rounds =
    (jobRow.interview_rounds as { name: string; order: number }[] | null) ?? [];
  const sorted = [...rounds].sort((a, b) => a.order - b.order);
  const roundName = sorted[session.round_index]?.name ?? `Round ${session.round_index + 1}`;

  const emailSettings = resolveEmailSettings(jobRow.email_settings);
  const icsUid = `talentscout-${sessionId}@talentscout`;

  // Fetch the candidate's reschedule token from the accepted proposal.
  const { data: proposalWithToken } = await sb
    .from("scheduling_proposals")
    .select("candidate_reschedule_token")
    .eq("id", proposal.id)
    .maybeSingle();

  const candidateRescheduleToken = proposalWithToken?.candidate_reschedule_token as string | null;
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? undefined;
  const rescheduleUrl = candidateRescheduleToken
    ? buildCandidateRescheduleUrl(candidateRescheduleToken, origin)
    : undefined;

  const { subject, body } = buildCandidateInviteEmail({
    candidateName: candidate.name as string | null,
    jobTitle: jobRow.title as string,
    roundName,
    slotStart: proposal.slot_start,
    timezone: session.timezone,
    durationMinutes: session.duration_minutes,
    recruiterName: emailSettings.recruiter_name,
    interviewerNames: panel.map((iv) => iv.name),
    rescheduleUrl,
  });

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
  });

  const sent = await sendEmail({
    to: candidate.email as string,
    subject,
    body,
    htmlOptions: {
      recruiterName: emailSettings.recruiter_name,
      jobTitle: jobRow.title as string,
    },
    attachments: [
      {
        filename: "interview.ics",
        content: ics,
        contentType: "text/calendar; method=REQUEST",
      },
    ],
  });

  await confirmScheduledInterview(sessionId);

  await sb.from("conversations").insert({
    match_id: match.id,
    direction: "out",
    subject,
    body,
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
    { matchId: match.id, sessionId, to: candidate.email },
    "send_candidate_invite: sent with ICS",
  );
}
