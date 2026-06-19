import { supabaseServer } from "@/lib/db";
import { composeApplicationAckEmail } from "@/lib/llm";
import { sendEmail } from "@/lib/email";
import { ParsedJDSchema, ParsedProfileSchema } from "@/lib/schemas";
import { resolveEmailSettings } from "@/lib/email-templates";
import { log } from "@/lib/logger";
import type { QueueJob } from "@/lib/queue";

/** Thank-you email after a candidate applies via the public invite link. Does not change outreach status. */
export async function handleSendApplicationAck(job: QueueJob): Promise<void> {
  const sb = supabaseServer();

  const { data: m, error: mErr } = await sb
    .from("matches")
    .select(
      `
      id, thread_id,
      candidate:candidates ( id, name, email, email_invalid, parsed_profile, source ),
      job:jobs ( id, title, parsed_jd, status, email_settings )
    `,
    )
    .eq("id", job.match_id)
    .single();
  if (mErr || !m) throw new Error(mErr?.message ?? "match not found");

  const candidate = Array.isArray(m.candidate) ? m.candidate[0] : m.candidate;
  const jobRow = Array.isArray(m.job) ? m.job[0] : m.job;
  if (!candidate?.email) throw new Error("candidate has no email");
  if (candidate.email_invalid) {
    log.info({ matchId: m.id }, "send_application_ack: skipping (email invalid)");
    return;
  }
  if (candidate.source !== "invite_link") {
    log.info({ matchId: m.id }, "send_application_ack: skipping (not invite_link)");
    return;
  }
  if (!jobRow) throw new Error("job missing");
  if (jobRow.status === "closed") {
    log.info({ matchId: m.id }, "send_application_ack: skipping (job closed)");
    return;
  }

  const { count } = await sb
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("match_id", m.id)
    .eq("direction", "out");
  if ((count ?? 0) > 0) {
    log.info({ matchId: m.id }, "send_application_ack: skipping (already sent)");
    return;
  }

  const jd = ParsedJDSchema.parse(jobRow.parsed_jd);
  const profile = ParsedProfileSchema.parse(candidate.parsed_profile);

  const composed = await composeApplicationAckEmail({
    jd,
    profile,
    jobTitle: jobRow.title as string,
    emailSettings: jobRow.email_settings,
    usage: {
      jobId: jobRow.id as string,
      matchId: m.id as string,
      operation: "compose_application_ack",
    },
  });

  const emailSettings = resolveEmailSettings(jobRow.email_settings);
  const sent = await sendEmail({
    to: candidate.email,
    subject: composed.subject,
    body: composed.body,
    htmlOptions: {
      recruiterName: emailSettings.recruiter_name,
      jobTitle: jobRow.title as string,
    },
  });

  await sb.from("conversations").insert({
    match_id: m.id,
    direction: "out",
    subject: composed.subject,
    body: composed.body,
    message_id: sent.messageId,
    sent_at: sent.acceptedAt,
  });

  await sb
    .from("matches")
    .update({
      thread_id: m.thread_id ?? sent.messageId,
      last_action_at: sent.acceptedAt,
    })
    .eq("id", m.id);

  log.info({ matchId: m.id, to: candidate.email }, "send_application_ack: sent");
}
