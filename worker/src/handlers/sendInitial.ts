import { supabaseServer } from "@/lib/db";
import { composeInitialEmail } from "@/lib/llm";
import { sendEmail } from "@/lib/email";
import { ParsedJDSchema, ParsedProfileSchema, MatchExplanationSchema } from "@/lib/schemas";
import { resolveEmailSettings } from "@/lib/email-templates";
import { log } from "@/lib/logger";
import type { QueueJob } from "@/lib/queue";

export async function handleSendInitial(job: QueueJob): Promise<void> {
  const sb = supabaseServer();

  const { data: m, error: mErr } = await sb
    .from("matches")
    .select(
      `
      id, status, rounds_sent, match_explanation,
      candidate:candidates ( id, name, email, email_invalid, parsed_profile ),
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
    log.info({ matchId: m.id }, "send_initial: skipping (email marked invalid)");
    return;
  }
  if (!jobRow) throw new Error("job missing");

  // Idempotency: stale queue retries must not re-send outreach.
  if (m.status !== "discovered") {
    log.info(
      { matchId: m.id, status: m.status },
      "send_initial: skipping (already engaged or scored)",
    );
    return;
  }

  // Re-check the job's status — recruiter may have closed it after this row was enqueued.
  const { data: jobStatus } = await sb
    .from("jobs")
    .select("status")
    .eq("id", jobRow.id as string)
    .single();
  if (jobStatus?.status === "closed") {
    log.info({ matchId: m.id, jobId: jobRow.id }, "send_initial: skipping (job closed)");
    return;
  }

  const jd = ParsedJDSchema.parse(jobRow.parsed_jd);
  const profile = ParsedProfileSchema.parse(candidate.parsed_profile);
  const explanation = MatchExplanationSchema.parse(m.match_explanation);

  const composed = await composeInitialEmail({
    jd,
    profile,
    matchExplanation: explanation,
    emailSettings: jobRow.email_settings,
    usage: {
      jobId: jobRow.id as string,
      matchId: m.id as string,
      operation: "compose_initial",
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

  log.info(
    { matchId: m.id, to: candidate.email, messageId: sent.messageId },
    "send_initial: email sent",
  );

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
      status: "outreach_sent",
      rounds_sent: (m.rounds_sent ?? 0) + 1,
      thread_id: sent.messageId,
      last_action_at: sent.acceptedAt,
    })
    .eq("id", m.id);

  // Auto-bump THIS match's pipeline stage to 'contacted' on first outreach.
  // Accept BOTH 'new' (manual engage) and 'shortlisted' (auto-shortlist already
  // promoted it). 'archived' and 'contacted' are intentionally untouched —
  // we never overwrite a deliberate manual move or a previously contacted state.
  await sb
    .from("matches")
    .update({ pipeline_stage: "contacted" })
    .eq("id", m.id)
    .in("pipeline_stage", ["new", "shortlisted"]);
}
