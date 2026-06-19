import { supabaseServer } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { resolveEmailSettings } from "@/lib/email-templates";
import { log } from "@/lib/logger";
import type { QueueJob } from "@/lib/queue";
import { listInterviewers } from "@/lib/interviewers";
import { createScorecardsForRound, buildScorecardUrl } from "@/lib/scorecard";

export async function handleSendScorecardRequest(job: QueueJob): Promise<void> {
  const sb = supabaseServer();
  const payload = job.payload as { round_index?: number; origin?: string };
  const roundIndex = payload.round_index;
  if (!roundIndex || roundIndex < 1) throw new Error("round_index required");

  const { data: match } = await sb
    .from("matches")
    .select(
      `
      id, job_id,
      candidate:candidates ( name ),
      job:jobs ( id, title, email_settings, interview_rounds )
    `,
    )
    .eq("id", job.match_id)
    .single();
  if (!match) throw new Error("match not found");

  const candidate = Array.isArray(match.candidate) ? match.candidate[0] : match.candidate;
  const jobRow = Array.isArray(match.job) ? match.job[0] : match.job;

  // Create (idempotent) scorecard rows for interviewers on this round.
  const created = await createScorecardsForRound(
    match.id as string,
    jobRow.id as string,
    roundIndex,
  );
  if (created.length === 0) {
    log.info({ matchId: match.id, roundIndex }, "send_scorecard_request: no new scorecards");
    return;
  }

  const interviewers = await listInterviewers(jobRow.id as string);
  const byId = new Map(interviewers.map((iv) => [iv.id, iv]));

  const rounds = (jobRow.interview_rounds as { name: string; order: number }[] | null) ?? [];
  const sorted = [...rounds].sort((a, b) => a.order - b.order);
  const roundName = sorted[roundIndex - 1]?.name ?? `Round ${roundIndex}`;

  const emailSettings = resolveEmailSettings(jobRow.email_settings);
  const origin = payload.origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const candidateName = (candidate?.name as string | null) ?? "the candidate";

  for (const card of created) {
    const iv = byId.get(card.interviewer_id);
    if (!iv?.email) continue;

    const url = buildScorecardUrl(card.response_token, origin);
    const subject = `Scorecard: ${candidateName} · ${roundName} (${jobRow.title as string})`;
    const body =
      `Hi ${iv.name},\n\n` +
      `Thanks for interviewing ${candidateName} for the ${jobRow.title as string} role (${roundName}).\n\n` +
      `Please take a minute to submit your feedback — it helps the team make a fair, fast decision:\n${url}\n\n` +
      `You'll be asked for a hire recommendation, a few quick ratings, and any notes.\n\n` +
      `Thanks,\n${emailSettings.recruiter_name}`;

    const sent = await sendEmail({
      to: iv.email,
      subject,
      body,
      htmlOptions: {
        recruiterName: emailSettings.recruiter_name,
        jobTitle: jobRow.title as string,
      },
    });

    log.info(
      { matchId: match.id, interviewerId: iv.id, messageId: sent.messageId },
      "send_scorecard_request: sent",
    );
  }
}
