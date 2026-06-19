import { supabaseServer } from "@/lib/db";
import { composeFollowUp } from "@/lib/llm";
import { sendEmail } from "@/lib/email";
import { ParsedJDSchema } from "@/lib/schemas";
import { resolveEmailSettings } from "@/lib/email-templates";
import {
  buildInterviewProgressSummary,
  interviewRoundsForEmail,
} from "@/lib/interview-email-context";
import { log } from "@/lib/logger";
import type { QueueJob } from "@/lib/queue";

export async function handleSendFollowup(job: QueueJob): Promise<void> {
  const sb = supabaseServer();
  const payload = job.payload as {
    ambiguities?: unknown;
    candidate_questions?: unknown;
  };
  const ambiguities = Array.isArray(payload.ambiguities)
    ? (payload.ambiguities as string[])
    : [];
  const candidateQuestions = Array.isArray(payload.candidate_questions)
    ? (payload.candidate_questions as string[])
    : [];

  const { data: m, error: mErr } = await sb
    .from("matches")
    .select(
      `
      id, status, rounds_sent, thread_id, job_id, interview_state, current_round_index,
      candidate:candidates ( id, name, email, email_invalid ),
      job:jobs ( title, parsed_jd, email_settings, interview_rounds )
    `,
    )
    .eq("id", job.match_id)
    .single();
  if (mErr || !m) throw new Error(mErr?.message ?? "match not found");
  const jobRowForJD = Array.isArray(m.job) ? m.job[0] : m.job;
  const jd = ParsedJDSchema.parse(jobRowForJD?.parsed_jd);

  const candidate = Array.isArray(m.candidate) ? m.candidate[0] : m.candidate;
  if (!candidate?.email) throw new Error("candidate has no email");
  if (candidate.email_invalid) {
    log.info({ matchId: m.id }, "send_followup: skipping (email marked invalid)");
    return;
  }

  // Job-status guard: skip silently if recruiter closed the job after enqueue.
  const { data: jobStatus } = await sb
    .from("jobs")
    .select("status")
    .eq("id", m.job_id as string)
    .single();
  if (jobStatus?.status === "closed") {
    log.info({ matchId: m.id }, "send_followup: skipping (job closed)");
    return;
  }

  // Race guard: a newer reply may have arrived after this follow-up was
  // enqueued. If the latest analysis now says score_now or decline, drop it.
  const { data: latestIn } = await sb
    .from("conversations")
    .select("llm_analysis, received_at")
    .eq("match_id", m.id)
    .eq("direction", "in")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestAnalysis = latestIn?.llm_analysis as {
    decision?: string;
    candidate_questions?: string[];
  } | null;
  const latestDecision = latestAnalysis?.decision;
  const latestCandidateQuestions = latestAnalysis?.candidate_questions ?? [];
  if (latestDecision === "decline") {
    log.info({ matchId: m.id, latestDecision }, "send_followup: skipping (candidate declined)");
    return;
  }
  if (
    latestDecision === "score_now" &&
    ambiguities.length === 0 &&
    candidateQuestions.length === 0 &&
    latestCandidateQuestions.length === 0
  ) {
    log.info(
      { matchId: m.id, latestDecision },
      "send_followup: skipping (screening complete, no open questions)",
    );
    return;
  }

  const { data: convoRaw } = await sb
    .from("conversations")
    .select("direction, subject, body, message_id, in_reply_to, sent_at, received_at")
    .eq("match_id", m.id)
    .limit(20);
  // Sort chronologically by whichever timestamp is set on each row.
  const convo = (convoRaw ?? []).slice().sort((a, b) => {
    const ta = new Date((a.sent_at ?? a.received_at) as string).getTime();
    const tb = new Date((b.sent_at ?? b.received_at) as string).getTime();
    return ta - tb;
  });

  const transcript = convo.map((c) => ({
    direction: c.direction as "out" | "in",
    body: (c.body as string) ?? "",
  }));
  const lastInbound = [...convo].reverse().find((c) => c.direction === "in");
  const lastOutbound = [...convo].reverse().find((c) => c.direction === "out");

  const interviewRounds = interviewRoundsForEmail(jobRowForJD?.interview_rounds);
  const interviewState = (m.interview_state as string) ?? "not_started";
  const currentRoundIndex = (m.current_round_index as number) ?? 0;
  const interviewProgress = {
    interview_state: interviewState,
    current_round_index: currentRoundIndex,
    summary: buildInterviewProgressSummary(interviewRounds, {
      interview_state: interviewState,
      current_round_index: currentRoundIndex,
    }),
  };

  const composed = await composeFollowUp({
    jd,
    ambiguities,
    candidateQuestions:
      candidateQuestions.length > 0 ? candidateQuestions : latestCandidateQuestions,
    interviewRounds,
    interviewProgress,
    priorTranscript: transcript,
    candidateName: candidate.name ?? null,
    emailSettings: jobRowForJD?.email_settings,
    usage: {
      jobId: m.job_id as string,
      matchId: m.id as string,
      operation: "compose_followup",
    },
  });

  // Threading: reply to the most recent inbound message_id (or fall back to thread_id).
  const inReplyTo =
    (lastInbound?.message_id as string | null) ??
    (lastOutbound?.message_id as string | null) ??
    (m.thread_id as string | null) ??
    null;
  const refs = (convo ?? [])
    .map((c) => c.message_id as string | null)
    .filter((x): x is string => !!x);

  const subject = composed.subject.startsWith("Re:")
    ? composed.subject
    : `Re: ${composed.subject}`;

  const emailSettings = resolveEmailSettings(jobRowForJD?.email_settings);
  const sent = await sendEmail({
    to: candidate.email,
    subject,
    body: composed.body,
    inReplyTo,
    references: refs,
    htmlOptions: {
      recruiterName: emailSettings.recruiter_name,
      jobTitle: (jobRowForJD?.title as string | undefined) ?? undefined,
    },
  });

  log.info(
    { matchId: m.id, to: candidate.email, messageId: sent.messageId, inReplyTo },
    "send_followup: email sent",
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
    .update({
      status: "follow_up_sent",
      rounds_sent: (m.rounds_sent ?? 0) + 1,
      last_action_at: sent.acceptedAt,
    })
    .eq("id", m.id);
}
