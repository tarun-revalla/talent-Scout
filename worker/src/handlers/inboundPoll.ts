import { supabaseServer } from "@/lib/db";
import { extractEmailAddress, fetchUnseenInbound, stripQuoted } from "@/lib/imap";
import { analyzeReply, generateAdaptiveFollowUpQuestions } from "@/lib/llm";
import { enqueueIfAbsent } from "@/lib/queue";
import { env } from "@/lib/env";
import {
  buildInterviewProgressSummary,
  interviewRoundsForEmail,
} from "@/lib/interview-email-context";
import { ParsedJDSchema } from "@/lib/schemas";
import { log } from "@/lib/logger";
import { isBounce, extractBouncedAddress } from "@/lib/bounce";

async function loadCandidateEmails(sb: ReturnType<typeof supabaseServer>): Promise<Set<string>> {
  const { data, error } = await sb
    .from("candidates")
    .select("email")
    .not("email", "is", null);
  if (error) {
    log.warn({ err: error.message }, "inbound: candidate email query failed");
    return new Set();
  }
  const emails = new Set<string>();
  for (const row of data ?? []) {
    const email = (row.email as string | null)?.toLowerCase().trim();
    if (email) emails.add(email);
  }
  return emails;
}

export async function inboundPoll(): Promise<void> {
  const sb = supabaseServer();
  const candidateEmails = await loadCandidateEmails(sb);
  if (candidateEmails.size === 0) {
    log.debug("inbound: no candidate emails in DB — skipping poll");
    return;
  }

  const messages = await fetchUnseenInbound({ candidateEmails });
  if (!messages.length) return;
  log.info({ count: messages.length, candidates: candidateEmails.size }, "inbound: fetched unseen");
  for (const m of messages) {
    // Bounce detection: postmaster / mailer-daemon notices, "Delivery Status
    // Notification (Failure)", etc. Mark the candidate's email as invalid so
    // we stop trying to reach them.
    if (isBounce(m.from, m.subject)) {
      const addr = extractBouncedAddress(m.text);
      if (addr && candidateEmails.has(addr)) {
        const { data: marked } = await sb
          .from("candidates")
          .update({ email_invalid: true })
          .eq("email", addr)
          .select("id, name");
        log.warn(
          { addr, marked: marked?.length ?? 0, subject: m.subject },
          "inbound: bounce detected, marked email as invalid",
        );
      } else {
        log.debug(
          { subject: m.subject, from: m.from, addr },
          "inbound: bounce ignored (not a known candidate)",
        );
      }
      continue;
    }

    const fromAddr = extractEmailAddress(m.from);
    if (!fromAddr || !candidateEmails.has(fromAddr)) {
      log.debug({ from: m.from }, "inbound: sender not in candidate pool, skipping");
      continue;
    }

    const threadRef = m.inReplyTo ?? m.references[0] ?? null;
    if (!threadRef) {
      log.debug({ from: m.from, subject: m.subject }, "inbound: no thread reference, skipping");
      continue;
    }

    const { data: parentConv } = await sb
      .from("conversations")
      .select("match_id")
      .eq("message_id", threadRef)
      .maybeSingle();
    if (!parentConv) {
      log.debug({ threadRef, from: m.from }, "inbound: no matching outbound");
      continue;
    }
    const matchId = parentConv.match_id as string;

    const { data: dup } = await sb
      .from("conversations")
      .select("id")
      .eq("message_id", m.messageId)
      .maybeSingle();
    if (dup) {
      log.debug({ messageId: m.messageId }, "inbound: already ingested, skipping");
      continue;
    }

    // Truncate huge replies so we don't push GPT past its context window.
    const cleanBody = stripQuoted(m.text).slice(0, 12000);
    const { data: inserted, error: insErr } = await sb
      .from("conversations")
      .insert({
        match_id: matchId,
        direction: "in",
        subject: m.subject,
        body: cleanBody,
        message_id: m.messageId,
        in_reply_to: threadRef,
        received_at: m.date.toISOString(),
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      log.error({ err: insErr?.message }, "inbound: insert conversation failed");
      continue;
    }

    const { data: matchRow } = await sb
      .from("matches")
      .select(
        "rounds_sent, job_id, interview_state, current_round_index, job:jobs ( parsed_jd, interview_rounds )",
      )
      .eq("id", matchId)
      .single();
    if (!matchRow) continue;
    const jobRow = Array.isArray(matchRow.job) ? matchRow.job[0] : matchRow.job;
    const jd = ParsedJDSchema.parse(jobRow!.parsed_jd);
    const interviewRounds = interviewRoundsForEmail(jobRow?.interview_rounds);
    const interviewRoundSummary = buildInterviewProgressSummary(interviewRounds, {
      interview_state: (matchRow.interview_state as string) ?? "not_started",
      current_round_index: (matchRow.current_round_index as number) ?? 0,
    });

    // Fetch full conversation history so the analyzer can detect cumulative
    // commitments. Without this the analyzer sees only the latest reply and
    // re-asks for items the candidate already answered in earlier rounds.
    const { data: convoRaw } = await sb
      .from("conversations")
      .select("direction, body, sent_at, received_at")
      .eq("match_id", matchId);
    const fullTranscript = (convoRaw ?? [])
      .slice()
      .sort((a, b) => {
        const ta = new Date((a.sent_at ?? a.received_at) as string).getTime();
        const tb = new Date((b.sent_at ?? b.received_at) as string).getTime();
        return ta - tb;
      })
      .map((c) => ({
        direction: c.direction as "out" | "in",
        body: (c.body as string) ?? "",
      }));

    let analysis;
    try {
      analysis = await analyzeReply({
        jd,
        transcript: fullTranscript,
        roundsSent: matchRow.rounds_sent ?? 0,
        maxRounds: env.maxOutreachRounds(),
        interviewRoundSummary,
        usage: {
          jobId: matchRow.job_id as string,
          matchId,
          operation: "analyze_reply",
        },
      });
    } catch (err) {
      log.error(
        { matchId, err: err instanceof Error ? err.message : String(err) },
        "inbound: analyzeReply failed",
      );
      continue;
    }

    log.info(
      {
        matchId,
        sentiment: analysis.sentiment,
        enthusiasm: analysis.enthusiasm_score,
        decision: analysis.decision,
        ambiguities: analysis.ambiguities.length,
        candidateQuestions: analysis.candidate_questions.length,
      },
      "inbound: analyzed",
    );

    await sb.from("conversations").update({ llm_analysis: analysis }).eq("id", inserted.id);

    await sb
      .from("matches")
      .update({ status: "replied", last_action_at: new Date().toISOString() })
      .eq("id", matchId);

    const rounds = matchRow.rounds_sent ?? 0;
    const max = env.maxOutreachRounds();
    const hasOpenQuestions = analysis.candidate_questions.length > 0;
    if (analysis.decision === "follow_up" && (rounds < max || hasOpenQuestions)) {
      // Generate adaptive, context-aware follow-up questions instead of passing
      // raw ambiguities. Falls back to analyzeReply ambiguities on error.
      let followUpQuestions: string[];
      try {
        followUpQuestions = await generateAdaptiveFollowUpQuestions({
          jd,
          transcript: fullTranscript,
          knownCommitments: {
            availability: analysis.commitments.availability ?? null,
            notice_period_weeks: analysis.commitments.notice_period_weeks ?? null,
            salary_expectation: analysis.commitments.salary_expectation ?? null,
            willing_to_interview: analysis.commitments.willing_to_interview ?? null,
          },
          existingAmbiguities: analysis.ambiguities,
          usage: {
            jobId: matchRow.job_id as string,
            matchId,
            operation: "adaptive_followup",
          },
        });
      } catch {
        followUpQuestions = analysis.ambiguities;
      }

      log.info(
        { matchId, adaptiveQuestions: followUpQuestions.length, originalAmbiguities: analysis.ambiguities.length },
        "inbound: adaptive follow-up questions generated",
      );

      await enqueueIfAbsent(matchId, "send_followup", {
        ambiguities: followUpQuestions,
        candidate_questions: analysis.candidate_questions,
      });
    } else {
      await enqueueIfAbsent(matchId, "finalize_score");
    }
  }
}
