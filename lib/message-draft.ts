import { supabaseServer } from "./db";
import { resolveEmailSettings } from "./email-templates";
import { composeManualMessage, type ManualMessageIntent } from "./llm";
import {
  MatchExplanationSchema,
  ParsedJDSchema,
  ParsedProfileSchema,
} from "./schemas";
import { parseJobRounds } from "./interview";
import { buildInterviewProgressSummary } from "./interview-email-context";

export async function draftMessageForMatch(
  matchId: string,
  args: {
    intent: ManualMessageIntent;
    instructions?: string;
    questions?: string[];
  },
) {
  const sb = supabaseServer();
  const { data: m, error: mErr } = await sb
    .from("matches")
    .select(
      `
      id, match_explanation, interview_state, current_round_index,
      candidate:candidates ( name, email, parsed_profile ),
      job:jobs ( id, title, parsed_jd, email_settings, interview_rounds )
    `,
    )
    .eq("id", matchId)
    .single();
  if (mErr || !m) throw new Error(mErr?.message ?? "Match not found");

  const candidate = Array.isArray(m.candidate) ? m.candidate[0] : m.candidate;
  const jobRow = Array.isArray(m.job) ? m.job[0] : m.job;
  if (!jobRow) throw new Error("Job not found");

  const jd = ParsedJDSchema.parse(jobRow.parsed_jd);
  const profile = ParsedProfileSchema.parse(candidate?.parsed_profile ?? {});
  const explanation = MatchExplanationSchema.safeParse(m.match_explanation);
  const rounds = parseJobRounds(jobRow.interview_rounds);
  const emailSettings = resolveEmailSettings(jobRow.email_settings);

  const { data: convos } = await sb
    .from("conversations")
    .select("direction, subject, body, llm_analysis, sent_at, received_at")
    .eq("match_id", matchId)
    .order("sent_at", { ascending: true, nullsFirst: true })
    .order("received_at", { ascending: true, nullsFirst: true })
    .limit(20);

  const transcript = (convos ?? [])
    .slice()
    .sort((a, b) => {
      const ta = new Date((a.sent_at ?? a.received_at) as string).getTime();
      const tb = new Date((b.sent_at ?? b.received_at) as string).getTime();
      return ta - tb;
    })
    .map((c) => ({
      direction: c.direction as "in" | "out",
      body: (c.body ?? "").slice(0, 4000),
    }));

  const latestInbound = [...(convos ?? [])]
    .reverse()
    .find((c) => c.direction === "in");
  const latestAnalysis = latestInbound?.llm_analysis as {
    candidate_questions?: string[];
    ambiguities?: string[];
  } | null;

  const questions =
    args.questions?.length ? args.questions : (latestAnalysis?.candidate_questions ?? []);

  const threadSubject =
    [...(convos ?? [])].reverse().find((c) => c.subject)?.subject ?? null;

  const composed = await composeManualMessage({
    intent: args.intent,
    jd,
    profile,
    matchSummary: explanation.success ? explanation.data.summary : null,
    transcript,
    candidateQuestions: questions,
    unansweredScreening: latestAnalysis?.ambiguities ?? [],
    interviewRounds: rounds,
    interviewProgress: buildInterviewProgressSummary(rounds, {
      interview_state: m.interview_state as string,
      current_round_index: Number(m.current_round_index ?? 0),
    }),
    recruiterInstructions: args.instructions,
    emailSettings,
    jobTitle: jobRow.title as string,
    threadSubject,
    usage: { matchId, jobId: jobRow.id as string, operation: "compose_manual" },
  });

  return composed;
}
