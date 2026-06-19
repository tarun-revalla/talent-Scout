import { supabaseServer } from "@/lib/db";
import { composeRoundPassEmail } from "@/lib/llm";
import { sendEmail } from "@/lib/email";
import { resolveEmailSettings } from "@/lib/email-templates";
import { log } from "@/lib/logger";
import type { QueueJob } from "@/lib/queue";

type RoundPassPayload = {
  passed_round_index?: number;
  passed_round_name?: string;
  next_round_index?: number;
  next_round_name?: string;
};

export async function handleSendRoundPass(job: QueueJob): Promise<void> {
  const sb = supabaseServer();
  const payload = job.payload as RoundPassPayload;
  const passedRoundName = String(payload.passed_round_name ?? "the interview round");
  const nextRoundName = String(payload.next_round_name ?? "the next round");
  const passedRoundIndex = Number(payload.passed_round_index ?? 1);
  const nextRoundIndex = Number(payload.next_round_index ?? passedRoundIndex + 1);

  const { data: m, error: mErr } = await sb
    .from("matches")
    .select(
      `
      id, interview_state, current_round_index, thread_id, job_id,
      candidate:candidates ( id, name, email, email_invalid ),
      job:jobs ( title, email_settings, status )
    `,
    )
    .eq("id", job.match_id)
    .single();
  if (mErr || !m) throw new Error(mErr?.message ?? "match not found");

  const candidate = Array.isArray(m.candidate) ? m.candidate[0] : m.candidate;
  const jobRow = Array.isArray(m.job) ? m.job[0] : m.job;
  if (!candidate?.email) throw new Error("candidate has no email");
  if (candidate.email_invalid) throw new Error("candidate email invalid");
  if (!jobRow) throw new Error("job missing");
  if (jobRow.status === "closed") {
    log.info({ matchId: m.id }, "send_round_pass: skipping (job closed)");
    return;
  }

  if (m.interview_state !== "in_progress") {
    log.info(
      { matchId: m.id, interview_state: m.interview_state },
      "send_round_pass: skipping (interview not in progress)",
    );
    return;
  }
  if (Number(m.current_round_index) !== nextRoundIndex) {
    log.info(
      { matchId: m.id, expected: nextRoundIndex, actual: m.current_round_index },
      "send_round_pass: skipping (round advanced again)",
    );
    return;
  }

  const { data: convoRaw } = await sb
    .from("conversations")
    .select("direction, subject, body, message_id, in_reply_to, sent_at, received_at")
    .eq("match_id", m.id)
    .limit(30);
  const convo = (convoRaw ?? []).slice().sort((a, b) => {
    const ta = new Date((a.sent_at ?? a.received_at) as string).getTime();
    const tb = new Date((b.sent_at ?? b.received_at) as string).getTime();
    return ta - tb;
  });
  const lastInbound = [...convo].reverse().find((c) => c.direction === "in");
  const lastOutbound = [...convo].reverse().find((c) => c.direction === "out");
  const threadSubject =
    (lastOutbound?.subject as string | null) ??
    (lastInbound?.subject as string | null) ??
    null;

  const composed = await composeRoundPassEmail({
    jobTitle: jobRow.title as string,
    candidateName: candidate.name ?? null,
    passedRoundName,
    passedRoundIndex,
    nextRoundName,
    nextRoundIndex,
    threadSubject,
    emailSettings: jobRow.email_settings,
    usage: {
      jobId: m.job_id as string,
      matchId: m.id as string,
      operation: "compose_round_pass",
    },
  });

  const inReplyTo =
    (lastInbound?.message_id as string | null) ??
    (lastOutbound?.message_id as string | null) ??
    (m.thread_id as string | null) ??
    null;
  const refs = convo
    .map((c) => c.message_id as string | null)
    .filter((x): x is string => !!x);

  const subject = composed.subject.startsWith("Re:")
    ? composed.subject
    : threadSubject?.startsWith("Re:")
      ? `Re: ${threadSubject.replace(/^Re:\s*/i, "")}`
      : composed.subject;

  const emailSettings = resolveEmailSettings(jobRow.email_settings);
  const sent = await sendEmail({
    to: candidate.email,
    subject,
    body: composed.body,
    inReplyTo,
    references: refs,
    htmlOptions: {
      recruiterName: emailSettings.recruiter_name,
      jobTitle: jobRow.title as string,
    },
  });

  log.info(
    {
      matchId: m.id,
      to: candidate.email,
      passedRoundIndex,
      nextRoundIndex,
      messageId: sent.messageId,
    },
    "send_round_pass: email sent",
  );

  await sb.from("conversations").insert({
    match_id: m.id,
    direction: "out",
    subject,
    body: composed.body,
    message_id: sent.messageId,
    in_reply_to: inReplyTo,
    sent_at: sent.acceptedAt,
  });

  await sb
    .from("matches")
    .update({ last_action_at: sent.acceptedAt })
    .eq("id", m.id);
}
