import { supabaseServer } from "@/lib/db";
import { composeNoShowEmail } from "@/lib/llm";
import { sendEmail } from "@/lib/email";
import { resolveEmailSettings } from "@/lib/email-templates";
import { log } from "@/lib/logger";
import type { QueueJob } from "@/lib/queue";

export async function handleSendNoShow(job: QueueJob): Promise<void> {
  const sb = supabaseServer();
  const payload = job.payload as {
    round_index?: number;
    round_name?: string;
  };
  const roundName = payload.round_name ?? "interview round";
  const roundIndex = Number(payload.round_index ?? 0);

  const { data: m, error: mErr } = await sb
    .from("matches")
    .select(
      `
      id, thread_id, current_round_index,
      candidate:candidates ( name, email, email_invalid ),
      job:jobs ( id, title, status, email_settings )
    `,
    )
    .eq("id", job.match_id)
    .single();
  if (mErr || !m) throw new Error(mErr?.message ?? "match not found");

  const candidate = Array.isArray(m.candidate) ? m.candidate[0] : m.candidate;
  const jobRow = Array.isArray(m.job) ? m.job[0] : m.job;
  if (!candidate?.email) throw new Error("candidate has no email");
  if (candidate.email_invalid) {
    log.info({ matchId: m.id }, "send_no_show: skipping (email invalid)");
    return;
  }
  if (!jobRow || jobRow.status === "closed") {
    log.info({ matchId: m.id }, "send_no_show: skipping (job closed/missing)");
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

  const composed = await composeNoShowEmail({
    jobTitle: jobRow.title as string,
    candidateName: candidate.name as string | null,
    roundName,
    threadSubject,
    emailSettings: jobRow.email_settings,
    usage: {
      jobId: jobRow.id as string,
      matchId: m.id as string,
      operation: "compose_no_show",
    },
  });

  const emailSettings = resolveEmailSettings(jobRow.email_settings);
  const finalSubject =
    inReplyTo && !composed.subject.startsWith("Re:") ? `Re: ${composed.subject}` : composed.subject;

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

  log.info(
    { matchId: m.id, roundIndex, roundName, to: candidate.email },
    "send_no_show: sent reschedule email",
  );
}
