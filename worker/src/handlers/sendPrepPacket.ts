import { supabaseServer } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { resolveEmailSettings } from "@/lib/email-templates";
import { log } from "@/lib/logger";
import type { QueueJob } from "@/lib/queue";
import { getSession, getLatestProposal } from "@/lib/scheduling";
import { listInterviewers } from "@/lib/interviewers";
import { formatSlotLocal } from "@/lib/scheduling-email";

export async function handleSendPrepPacket(job: QueueJob): Promise<void> {
  const sb = supabaseServer();
  const payload = job.payload as { sessionId?: string };
  const sessionId = payload.sessionId;
  if (!sessionId) throw new Error("sessionId required");

  // Skip if already sent.
  const { data: interview } = await sb
    .from("scheduled_interviews")
    .select("id, starts_at, prep_packet_sent_at")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!interview) {
    log.info({ sessionId }, "send_prep_packet: no confirmed interview found, skipping");
    return;
  }
  if (interview.prep_packet_sent_at) {
    log.info({ sessionId }, "send_prep_packet: already sent, skipping");
    return;
  }

  const session = await getSession(sessionId);
  if (!session || session.status !== "confirmed") {
    log.info({ sessionId }, "send_prep_packet: session not confirmed, skipping");
    return;
  }

  const proposal = await getLatestProposal(sessionId);
  if (!proposal) throw new Error("no proposal found");

  const { data: match } = await sb
    .from("matches")
    .select(
      `
      id, thread_id,
      candidate:candidates ( name, email, email_invalid, parsed_profile ),
      job:jobs ( id, title, email_settings, interview_rounds, parsed_jd )
    `,
    )
    .eq("id", session.match_id)
    .single();
  if (!match) throw new Error("match not found");

  const candidate = Array.isArray(match.candidate) ? match.candidate[0] : match.candidate;
  const jobRow = Array.isArray(match.job) ? match.job[0] : match.job;

  if (!candidate?.email) throw new Error("candidate has no email");
  if (candidate.email_invalid) {
    log.info({ matchId: match.id }, "send_prep_packet: skipping (email invalid)");
    return;
  }

  const interviewers = await listInterviewers(jobRow.id as string);
  const panel = interviewers.filter((iv) => session.interviewer_ids.includes(iv.id));

  const rounds = (jobRow.interview_rounds as { name: string; type?: string; duration_minutes?: number; description?: string; order: number }[] | null) ?? [];
  const sorted = [...rounds].sort((a, b) => a.order - b.order);
  const round = sorted[session.round_index];
  const roundName = round?.name ?? `Round ${session.round_index + 1}`;
  const roundType = round?.type ?? "interview";
  const roundDescription = round?.description ?? "";

  const emailSettings = resolveEmailSettings(jobRow.email_settings);
  const when = formatSlotLocal(proposal.slot_start, session.timezone);
  const firstName = (candidate.name as string | null)?.split(" ")[0] ?? "there";

  const parsedJd = jobRow.parsed_jd as Record<string, unknown> | null;
  const skills = (parsedJd?.skills_required as string[] | null)?.join(", ") ?? "";
  const panelBios = panel.map((iv) => `• ${iv.name} (${iv.email})`).join("\n");

  const subject = `Your ${jobRow.title as string} interview prep — ${roundName} · ${when}`;
  const body =
    `Hi ${firstName},\n\n` +
    `Your ${roundName} is tomorrow. Here's everything you need to prepare.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `INTERVIEW DETAILS\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Role: ${jobRow.title as string}\n` +
    `Round: ${roundName} (${roundType})\n` +
    `When: ${when} (${session.timezone})\n` +
    `Duration: ${session.duration_minutes} minutes\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `YOUR PANEL\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${panelBios || "Details will be shared shortly"}\n\n` +
    (roundDescription
      ? `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `WHAT TO EXPECT\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${roundDescription}\n\n`
      : "") +
    (skills
      ? `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `KEY SKILLS THIS ROLE FOCUSES ON\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${skills}\n\n`
      : "") +
    (emailSettings.prep_packet_instructions.trim()
      ? `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `NOTES FROM THE TEAM\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${emailSettings.prep_packet_instructions.trim()}\n\n`
      : "") +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `TIPS\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• Be ready to join 5 minutes early\n` +
    `• Have questions prepared for your interviewers\n` +
    `• Review the job description beforehand\n\n` +
    `Good luck — we're rooting for you!\n\n` +
    `${emailSettings.recruiter_name}`;

  const sent = await sendEmail({
    to: candidate.email as string,
    subject,
    body,
    htmlOptions: {
      recruiterName: emailSettings.recruiter_name,
      jobTitle: jobRow.title as string,
    },
  });

  // Mark prep packet sent.
  await sb
    .from("scheduled_interviews")
    .update({ prep_packet_sent_at: sent.acceptedAt })
    .eq("session_id", sessionId);

  await sb.from("conversations").insert({
    match_id: match.id,
    direction: "out",
    subject,
    body,
    message_id: sent.messageId,
    sent_at: sent.acceptedAt,
  });

  log.info({ matchId: match.id, sessionId }, "send_prep_packet: sent prep packet");
}
