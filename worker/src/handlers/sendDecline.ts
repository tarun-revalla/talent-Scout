import { supabaseServer } from "@/lib/db";
import { composeDeclineEmail } from "@/lib/llm";
import { sendEmail } from "@/lib/email";
import { resolveEmailSettings } from "@/lib/email-templates";
import { log } from "@/lib/logger";
import type { QueueJob } from "@/lib/queue";

export async function handleSendDecline(job: QueueJob): Promise<void> {
  const sb = supabaseServer();

  const { data: m, error: mErr } = await sb
    .from("matches")
    .select(
      `
      id, thread_id, interview_state,
      candidate:candidates ( name, email, email_invalid ),
      job:jobs ( id, title, status, email_settings )
    `,
    )
    .eq("id", job.match_id)
    .single();
  if (mErr || !m) throw new Error(mErr?.message ?? "match not found");

  const candidate = Array.isArray(m.candidate) ? m.candidate[0] : m.candidate;
  const jobRow = Array.isArray(m.job) ? m.job[0] : m.job;
  if (!jobRow) throw new Error("job missing");

  // Only send when the candidate is actually rejected — guards against races
  // where a later action (e.g. cooling cleared) flipped the state.
  if (m.interview_state !== "rejected") {
    log.info(
      { matchId: m.id, interview_state: m.interview_state },
      "send_decline: skipping (not in rejected state)",
    );
    return;
  }

  const emailSettings = resolveEmailSettings(jobRow.email_settings);
  if (!emailSettings.decline_enabled) {
    log.info({ matchId: m.id }, "send_decline: skipping (decline emails disabled)");
    return;
  }

  if (!candidate?.email) throw new Error("candidate has no email");
  if (candidate.email_invalid) {
    log.info({ matchId: m.id }, "send_decline: skipping (email invalid)");
    return;
  }

  const { data: lastConv } = await sb
    .from("conversations")
    .select("message_id, subject")
    .eq("match_id", m.id)
    .order("sent_at", { ascending: false })
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const inReplyTo = (lastConv?.message_id as string | null) ?? null;
  const threadSubject = (lastConv?.subject as string | null) ?? null;

  const composed = await composeDeclineEmail({
    jobTitle: jobRow.title as string,
    candidateName: (candidate.name as string | null) ?? null,
    threadSubject,
    emailSettings: jobRow.email_settings,
    usage: {
      jobId: jobRow.id as string,
      matchId: m.id as string,
      operation: "compose_decline",
    },
  });

  const finalSubject =
    inReplyTo && !composed.subject.startsWith("Re:")
      ? `Re: ${composed.subject}`
      : composed.subject;

  const sent = await sendEmail({
    to: candidate.email,
    subject: finalSubject,
    body: composed.body,
    inReplyTo,
    references: inReplyTo ? [inReplyTo] : [],
    htmlOptions: {
      recruiterName: emailSettings.recruiter_name,
      jobTitle: jobRow.title as string,
    },
  });

  await sb.from("conversations").insert({
    match_id: m.id,
    direction: "out",
    subject: finalSubject,
    body: composed.body,
    message_id: sent.messageId,
    in_reply_to: inReplyTo,
    sent_at: sent.acceptedAt,
  });

  await sb
    .from("matches")
    .update({
      thread_id: m.thread_id ?? sent.messageId,
      last_action_at: sent.acceptedAt,
    })
    .eq("id", m.id);

  log.info({ matchId: m.id, to: candidate.email }, "send_decline: sent decline email");
}
