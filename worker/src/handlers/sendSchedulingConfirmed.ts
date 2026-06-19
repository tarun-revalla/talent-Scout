import { supabaseServer } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { resolveEmailSettings } from "@/lib/email-templates";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import type { QueueJob } from "@/lib/queue";
import { buildSchedulingConfirmedEmail } from "@/lib/scheduling-email";
import { getLatestProposal, getSession } from "@/lib/scheduling";
import { listInterviewers } from "@/lib/interviewers";

export async function handleSendSchedulingConfirmed(job: QueueJob): Promise<void> {
  const payload = job.payload as { sessionId?: string };
  const sessionId = payload.sessionId;
  if (!sessionId) throw new Error("sessionId required");

  const session = await getSession(sessionId);
  if (!session) throw new Error("session not found");

  const proposal = await getLatestProposal(sessionId);
  if (!proposal) throw new Error("no proposal");

  const sb = supabaseServer();
  const { data: match } = await sb
    .from("matches")
    .select(
      `
      id,
      candidate:candidates ( name ),
      job:jobs ( id, title, email_settings, interview_rounds )
    `,
    )
    .eq("id", session.match_id)
    .single();
  if (!match) throw new Error("match not found");

  const candidate = Array.isArray(match.candidate) ? match.candidate[0] : match.candidate;
  const jobRow = Array.isArray(match.job) ? match.job[0] : match.job;

  const interviewers = await listInterviewers(jobRow.id as string);
  const panel = interviewers.filter((iv) => session.interviewer_ids.includes(iv.id));

  const rounds =
    (jobRow.interview_rounds as { name: string; order: number }[] | null) ?? [];
  const sorted = [...rounds].sort((a, b) => a.order - b.order);
  const roundName = sorted[session.round_index]?.name ?? `Round ${session.round_index + 1}`;

  const emailSettings = resolveEmailSettings(jobRow.email_settings);

  const { subject, body } = buildSchedulingConfirmedEmail({
    recruiterName: emailSettings.recruiter_name,
    candidateName: candidate?.name as string | null,
    jobTitle: jobRow.title as string,
    roundName,
    slotStart: proposal.slot_start,
    timezone: session.timezone,
    interviewerNames: panel.map((iv) => iv.name),
  });

  const sent = await sendEmail({
    to: env.gmailUser(),
    subject,
    body,
    htmlOptions: {
      recruiterName: emailSettings.recruiter_name,
      jobTitle: jobRow.title as string,
    },
  });

  log.info(
    { matchId: match.id, sessionId, messageId: sent.messageId },
    "send_scheduling_confirmed: sent to recruiter",
  );
}
