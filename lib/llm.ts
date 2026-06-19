import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { env } from "./env";
import {
  buildFollowupEmailSystemPrompt,
  buildInitialEmailSystemPrompt,
  buildManualMessageSystemPrompt,
  buildApplicationAckSystemPrompt,
  buildNoShowFollowUpSystemPrompt,
  buildDeclineEmailSystemPrompt,
  buildRoundPassEmailSystemPrompt,
  DEFAULT_EMAIL_SETTINGS,
  resolveEmailSettings,
} from "./email-templates";
import { recordLlmUsage, type LlmUsageContext } from "./llm-usage";
import { withLlmCache } from "./llm-cache";
import {
  ComposedEmailSchema,
  MatchExplanationSchema,
  ParsedJDSchema,
  ParsedProfileSchema,
  ReplyAnalysisSchema,
  SuggestedInterviewRoundsSchema,
  type ComposedEmail,
  type EmailSettings,
  type ManualMessageIntent,
  ManualMessageIntentSchema,
  DuplicateSuggestionSchema,
  JobDigestSchema,
  type DuplicateSuggestion,
  type JobDigest,
  SchedulingIntentSchema,
  SchedulingSlotRankSchema,
  type SchedulingIntent,
  type SchedulingSlotRank,
  type MatchExplanation,
  type ParsedJD,
  type ParsedProfile,
  type ReplyAnalysis,
  type SuggestedInterviewRounds,
} from "./schemas";
import { formatRoundsForCandidateReply } from "./interview-email-context";
import { defaultRoundsForLevel } from "./interview-defaults";

let _client: OpenAI | null = null;
function client(): OpenAI {
  // maxRetries: SDK auto-retries 429/5xx/network errors with exponential backoff.
  // Default is 2; bumped to 5 since the worker can afford the wall-time and we
  // want resilience against transient OpenAI hiccups.
  if (!_client) _client = new OpenAI({ apiKey: env.openaiApiKey(), maxRetries: 5 });
  return _client;
}

// Model-routing audit (2026-06): the reasoning tier (gpt-4o, ~16x the cost of
// mini) is reserved for the three calls where output quality is load-bearing:
//   • parseJobDescription — must-have vs nice-to-have classification feeds every
//     match score for the job; runs once per job, so cost is negligible. Keep.
//   • rerankMatch — deterministic rubric scoring; the stronger model follows the
//     rubric more reliably. Keep.
//   • composeInitialEmail — candidate-facing first impression. Keep.
// Everything else (extraction, transcript analysis, follow-up/ack/no-show drafts,
// digests, scheduling) runs on `fast`. The largest token saving is not a tier
// downgrade but skipping repeat calls entirely — see withLlmCache in llm-cache.ts.
const MODELS = {
  reasoning: "gpt-4o-2024-11-20",
  fast: "gpt-4o-mini",
  embedding: "text-embedding-3-small",
} as const;

export const EMBEDDING_DIMS = 1536;
export type { LlmUsageContext };

// Prompt versions for the cache key — bump when the system prompt or output
// schema for an operation changes, so stale memoized results are not served.
const EMBED_PROMPT_VERSION = 1;
const PARSE_RESUME_PROMPT_VERSION = 1;
const PARSE_JD_PROMPT_VERSION = 1;

export async function embed(text: string, usage?: LlmUsageContext): Promise<number[]> {
  const trimmed = text.slice(0, 8000);
  const input = trimmed.length > 0 ? trimmed : "(empty)";
  return withLlmCache({
    operation: "embed",
    model: MODELS.embedding,
    promptVersion: EMBED_PROMPT_VERSION,
    input,
    compute: async () => {
      const res = await client().embeddings.create({
        model: MODELS.embedding,
        input,
      });
      recordLlmUsage(usage ?? { operation: "embed" }, MODELS.embedding, res.usage);
      return res.data[0]!.embedding;
    },
  });
}

export async function parseResume(rawText: string, usage?: LlmUsageContext): Promise<ParsedProfile> {
  const input = rawText.slice(0, 14000);
  return withLlmCache({
    operation: "parse_resume",
    model: MODELS.fast,
    promptVersion: PARSE_RESUME_PROMPT_VERSION,
    input,
    compute: async () => {
      const r = await client().beta.chat.completions.parse({
        model: MODELS.fast,
        messages: [
          {
            role: "system",
            content:
              "You extract structured candidate information from a resume. " +
              "Extract the email address with extreme accuracy — it is critical for outreach. " +
              "Use null for any field you cannot confidently determine. " +
              "Skills should be a flat list of normalized skill names (e.g., 'TypeScript', 'AWS', 'PostgreSQL').",
          },
          { role: "user", content: input },
        ],
        response_format: zodResponseFormat(ParsedProfileSchema, "profile"),
      });
      const parsed = r.choices[0]?.message.parsed;
      if (!parsed) throw new Error("parseResume: no parsed output");
      recordLlmUsage(usage ?? { operation: "parse_resume" }, MODELS.fast, r.usage);
      return parsed;
    },
  });
}

export async function parseJobDescription(rawJD: string, usage?: LlmUsageContext): Promise<ParsedJD> {
  const input = rawJD.slice(0, 14000);
  return withLlmCache({
    operation: "parse_jd",
    model: MODELS.reasoning,
    promptVersion: PARSE_JD_PROMPT_VERSION,
    input,
    compute: async () => {
      const r = await client().beta.chat.completions.parse({
        model: MODELS.reasoning,
        messages: [
          {
            role: "system",
            content:
              "Extract structured fields from a job description. " +
              "Distinguish must-have vs nice-to-have skills based on language ('required' / 'must have' / 'minimum' vs 'plus' / 'bonus' / 'nice to have'). " +
              "If salary is not stated, return null fields. Years_min is the minimum years of relevant experience.",
          },
          { role: "user", content: input },
        ],
        response_format: zodResponseFormat(ParsedJDSchema, "jd"),
      });
      const parsed = r.choices[0]?.message.parsed;
      if (!parsed) throw new Error("parseJobDescription: no parsed output");
      recordLlmUsage(usage ?? { operation: "parse_jd" }, MODELS.reasoning, r.usage);
      return parsed;
    },
  });
}

export async function suggestInterviewRounds(
  parsedJD: ParsedJD,
  usage?: LlmUsageContext,
): Promise<SuggestedInterviewRounds> {
  try {
    const r = await client().beta.chat.completions.parse({
      model: MODELS.fast,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You design a practical interview loop for a job opening. " +
            "Return 3-5 ordered rounds appropriate for the role level. " +
            "Do NOT include scheduling or calendar details — only round name, type, duration, description, and interviewer_role. " +
            "Types must be one of: phone_screen, technical, system_design, hiring_manager, culture, panel, other.",
        },
        { role: "user", content: JSON.stringify(parsedJD) },
      ],
      response_format: zodResponseFormat(SuggestedInterviewRoundsSchema, "interview_rounds"),
    });
    const parsed = r.choices[0]?.message.parsed;
    if (!parsed) throw new Error("no parsed output");
    recordLlmUsage(usage ?? { operation: "suggest_rounds" }, MODELS.fast, r.usage);
    return parsed;
  } catch {
    return {
      rounds: defaultRoundsForLevel(parsedJD.level),
      rationale: "Default loop based on role level.",
    };
  }
}

export async function rerankMatch(
  parsedJD: ParsedJD,
  parsedProfile: ParsedProfile,
  usage?: LlmUsageContext,
): Promise<MatchExplanation> {
  const r = await client().beta.chat.completions.parse({
    model: MODELS.reasoning,
    temperature: 0,
    seed: 42,
    messages: [
      {
        role: "system",
        content:
          "You are a senior technical recruiter scoring a candidate against a job. " +
          "Be deterministic — the same input MUST produce the same output every time.\n\n" +
          "Apply this RUBRIC strictly to compute the score (0-100):\n" +
          "  - Start at 50.\n" +
          "  - For each must-have skill the candidate clearly has: +10 (cap +50 from must-haves).\n" +
          "  - For each must-have skill the candidate is missing: -15.\n" +
          "  - For each nice-to-have they have: +3 (cap +12).\n" +
          "  - Years vs years_min (if specified):\n" +
          "      * candidate years >= years_min + 2 → +10\n" +
          "      * years_min <= candidate years < years_min + 2 → +5\n" +
          "      * candidate years < years_min → -15\n" +
          "  - Clamp final score to [0, 100] and round to the nearest integer.\n\n" +
          "Field rules:\n" +
          "  - matched_skills MUST be drawn ONLY from jd.must_have_skills or jd.nice_to_have_skills " +
          "and only include items the candidate clearly possesses (case-insensitive). " +
          "Do NOT invent matched skills.\n" +
          "  - gaps lists ONLY must-have skills the candidate is missing.\n" +
          "  - experience_fit: 'strong' if candidate years >= years_min + 2; " +
          "'partial' if within years_min..years_min+1; 'weak' if below years_min or years_min unknown and skills weak.\n" +
          "  - summary is 1-2 sentences citing the matched skills count, gaps, and experience fit.",
      },
      {
        role: "user",
        content: JSON.stringify({ jd: parsedJD, profile: parsedProfile }),
      },
    ],
    response_format: zodResponseFormat(MatchExplanationSchema, "match"),
  });
  const parsed = r.choices[0]?.message.parsed;
  if (!parsed) throw new Error("rerankMatch: no parsed output");
  recordLlmUsage(usage ?? { operation: "rerank_match" }, MODELS.reasoning, r.usage);
  return parsed;
}

export async function composeInitialEmail(args: {
  jd: ParsedJD;
  profile: ParsedProfile;
  matchExplanation: MatchExplanation;
  emailSettings?: EmailSettings | unknown;
  usage?: LlmUsageContext;
}): Promise<ComposedEmail> {
  const settings = args.emailSettings
    ? resolveEmailSettings(args.emailSettings)
    : DEFAULT_EMAIL_SETTINGS;
  const r = await client().beta.chat.completions.parse({
    model: MODELS.reasoning,
    messages: [
      {
        role: "system",
        content: buildInitialEmailSystemPrompt(settings),
      },
      {
        role: "user",
        content: JSON.stringify({
          jd: args.jd,
          candidate: {
            name: args.profile.name,
            skills: args.profile.skills,
            summary: args.profile.summary,
          },
          why_a_match: args.matchExplanation.summary,
        }),
      },
    ],
    response_format: zodResponseFormat(ComposedEmailSchema, "email"),
  });
  const parsed = r.choices[0]?.message.parsed;
  if (!parsed) throw new Error("composeInitialEmail: no parsed output");
  recordLlmUsage(
    args.usage ?? { operation: "compose_initial" },
    MODELS.reasoning,
    r.usage,
  );
  return parsed;
}

export async function composeRoundPassEmail(args: {
  jobTitle: string;
  candidateName: string | null;
  passedRoundName: string;
  passedRoundIndex: number;
  nextRoundName: string;
  nextRoundIndex: number;
  threadSubject?: string | null;
  emailSettings?: EmailSettings | unknown;
  usage?: LlmUsageContext;
}): Promise<ComposedEmail> {
  const settings = args.emailSettings
    ? resolveEmailSettings(args.emailSettings)
    : DEFAULT_EMAIL_SETTINGS;
  const r = await client().beta.chat.completions.parse({
    model: MODELS.fast,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: buildRoundPassEmailSystemPrompt(settings),
      },
      {
        role: "user",
        content: JSON.stringify({
          job_title: args.jobTitle,
          candidate_name: args.candidateName,
          passed_round_name: args.passedRoundName,
          passed_round_index: args.passedRoundIndex,
          next_round_name: args.nextRoundName,
          next_round_index: args.nextRoundIndex,
          thread_subject: args.threadSubject ?? null,
        }),
      },
    ],
    response_format: zodResponseFormat(ComposedEmailSchema, "email"),
  });
  const parsed = r.choices[0]?.message.parsed;
  if (!parsed) throw new Error("composeRoundPassEmail: no parsed output");
  recordLlmUsage(
    args.usage ?? { operation: "compose_round_pass" },
    MODELS.fast,
    r.usage,
  );
  return parsed;
}

export async function composeDeclineEmail(args: {
  jobTitle: string;
  candidateName: string | null;
  threadSubject?: string | null;
  emailSettings?: EmailSettings | unknown;
  usage?: LlmUsageContext;
}): Promise<ComposedEmail> {
  const settings = args.emailSettings
    ? resolveEmailSettings(args.emailSettings)
    : DEFAULT_EMAIL_SETTINGS;
  const r = await client().beta.chat.completions.parse({
    model: MODELS.fast,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: buildDeclineEmailSystemPrompt(settings),
      },
      {
        role: "user",
        content: JSON.stringify({
          job_title: args.jobTitle,
          candidate_name: args.candidateName,
          thread_subject: args.threadSubject ?? null,
        }),
      },
    ],
    response_format: zodResponseFormat(ComposedEmailSchema, "email"),
  });
  const parsed = r.choices[0]?.message.parsed;
  if (!parsed) throw new Error("composeDeclineEmail: no parsed output");
  recordLlmUsage(args.usage ?? { operation: "compose_decline" }, MODELS.fast, r.usage);
  return parsed;
}

export async function composeFollowUp(args: {
  jd: ParsedJD;
  ambiguities: string[];
  candidateQuestions?: string[];
  interviewRounds?: import("./schemas").InterviewRound[];
  interviewProgress?: {
    interview_state: string;
    current_round_index: number;
    summary?: string;
  };
  priorTranscript: { direction: "out" | "in"; body: string }[];
  candidateName: string | null;
  emailSettings?: EmailSettings | unknown;
  usage?: LlmUsageContext;
}): Promise<ComposedEmail> {
  const settings = args.emailSettings
    ? resolveEmailSettings(args.emailSettings)
    : DEFAULT_EMAIL_SETTINGS;
  const r = await client().beta.chat.completions.parse({
    model: MODELS.fast,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: buildFollowupEmailSystemPrompt(settings),
      },
      {
        role: "user",
        content: JSON.stringify({
          jd: args.jd,
          unanswered: args.ambiguities,
          candidate_questions: args.candidateQuestions ?? [],
          interview_rounds: formatRoundsForCandidateReply(args.interviewRounds ?? []),
          interview_progress: args.interviewProgress ?? null,
          transcript: args.priorTranscript,
          candidate_name: args.candidateName,
        }),
      },
    ],
    response_format: zodResponseFormat(ComposedEmailSchema, "email"),
  });
  const parsed = r.choices[0]?.message.parsed;
  if (!parsed) throw new Error("composeFollowUp: no parsed output");
  recordLlmUsage(
    args.usage ?? { operation: "compose_followup" },
    MODELS.fast,
    r.usage,
  );
  return parsed;
}

export async function analyzeReply(args: {
  jd: ParsedJD;
  /** Full chronological conversation: out = recruiter, in = candidate. Last entry should be the candidate's most recent reply. */
  transcript: { direction: "out" | "in"; body: string }[];
  roundsSent: number;
  maxRounds: number;
  /** Optional summary of configured interview rounds for detecting process questions. */
  interviewRoundSummary?: string;
  usage?: LlmUsageContext;
}): Promise<ReplyAnalysis> {
  // Truncate each body so we don't blow the context window on a long thread.
  const trimmed = args.transcript.slice(-12).map((t) => ({
    direction: t.direction,
    body: (t.body ?? "").slice(0, 4000),
  }));
  const r = await client().beta.chat.completions.parse({
    model: MODELS.fast,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "You are analyzing a recruiter ↔ candidate email thread. 'out' = recruiter; 'in' = candidate.\n\n" +
          "Extract CUMULATIVELY across the FULL transcript:\n" +
          "  - commitments.availability — earliest start date / availability info\n" +
          "  - commitments.notice_period_weeks — notice period in integer weeks (null if not stated)\n" +
          "  - commitments.salary_expectation — stated compensation expectation as a string\n" +
          "  - commitments.willing_to_interview — yes / no / maybe (only if they explicitly addressed scheduling/interview willingness; " +
          "general interest in the role is NOT the same as willing_to_interview)\n" +
          "Once the candidate has answered an item in ANY inbound message, treat it as answered for the rest of the analysis. " +
          "If the candidate updates an answer in a later message (e.g., revises salary), use the latest value.\n" +
          "Do NOT infer notice_period_weeks, salary_expectation, or availability from vague replies like 'yes, interested' — use null unless explicitly stated.\n\n" +
          "ambiguities: list ONLY recruiter screening questions (from outbound messages) that the candidate has NOT answered yet. " +
          "Phrase each as what the recruiter still needs to know (e.g. 'notice period', 'compensation expectations'). " +
          "Do NOT list items that have a cumulative answer above. Do NOT list questions the candidate asked the recruiter.\n\n" +
          "candidate_questions: list explicit question(s) the candidate asked in their LATEST inbound message that expect " +
          "a recruiter reply (role details, interview rounds, what a round covers, process, scheduling, team, etc.). Empty array if none.\n\n" +
          "sentiment + enthusiasm_score (0-100): reflect the candidate's MOST RECENT inbound message only.\n\n" +
          "decision:\n" +
          "  - 'decline' if the candidate has clearly said no anywhere in the thread.\n" +
          "  - 'follow_up' if ambiguities is non-empty OR candidate_questions is non-empty (recruiter must reply or re-ask).\n" +
          "  - 'score_now' only when screening items are cumulatively answered, candidate_questions is empty, AND rounds_sent has NOT forced follow_up.\n" +
          "  - If rounds_sent >= max_rounds and candidate_questions is non-empty, still use 'follow_up'.",
      },
      {
        role: "user",
        content: JSON.stringify({
          jd_summary: args.jd.summary,
          jd_salary: args.jd.salary_range,
          interview_rounds_summary: args.interviewRoundSummary ?? null,
          transcript: trimmed,
          rounds_sent: args.roundsSent,
          max_rounds: args.maxRounds,
        }),
      },
    ],
    response_format: zodResponseFormat(ReplyAnalysisSchema, "analysis"),
  });
  const parsed = r.choices[0]?.message.parsed;
  if (!parsed) throw new Error("analyzeReply: no parsed output");
  recordLlmUsage(
    args.usage ?? { operation: "analyze_reply" },
    MODELS.fast,
    r.usage,
  );
  return parsed;
}

export type { ManualMessageIntent };

export async function composeManualMessage(args: {
  intent: ManualMessageIntent;
  jd: ParsedJD;
  profile: ParsedProfile;
  matchSummary: string | null;
  transcript: { direction: "out" | "in"; body: string }[];
  candidateQuestions: string[];
  unansweredScreening: string[];
  interviewRounds: import("./schemas").InterviewRound[];
  interviewProgress: string;
  recruiterInstructions?: string;
  emailSettings?: EmailSettings | unknown;
  jobTitle: string;
  threadSubject?: string | null;
  usage?: LlmUsageContext;
}): Promise<ComposedEmail> {
  const settings = args.emailSettings
    ? resolveEmailSettings(args.emailSettings)
    : DEFAULT_EMAIL_SETTINGS;
  const r = await client().beta.chat.completions.parse({
    model: MODELS.fast,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: buildManualMessageSystemPrompt(settings, args.intent),
      },
      {
        role: "user",
        content: JSON.stringify({
          job_title: args.jobTitle,
          jd: args.jd,
          candidate: {
            name: args.profile.name,
            skills: args.profile.skills,
            summary: args.profile.summary,
          },
          why_a_match: args.matchSummary,
          transcript: args.transcript,
          candidate_questions: args.candidateQuestions,
          unanswered_screening: args.unansweredScreening,
          interview_rounds: formatRoundsForCandidateReply(args.interviewRounds),
          interview_progress: args.interviewProgress,
          thread_subject: args.threadSubject,
          recruiter_instructions: args.recruiterInstructions?.trim() || null,
        }),
      },
    ],
    response_format: zodResponseFormat(ComposedEmailSchema, "email"),
  });
  const parsed = r.choices[0]?.message.parsed;
  if (!parsed) throw new Error("composeManualMessage: no parsed output");
  recordLlmUsage(
    args.usage ?? { operation: "compose_manual" },
    MODELS.fast,
    r.usage,
  );
  return parsed;
}

export async function composeApplicationAckEmail(args: {
  jd: ParsedJD;
  profile: ParsedProfile;
  jobTitle: string;
  emailSettings?: EmailSettings | unknown;
  usage?: LlmUsageContext;
}): Promise<ComposedEmail> {
  const settings = args.emailSettings
    ? resolveEmailSettings(args.emailSettings)
    : DEFAULT_EMAIL_SETTINGS;
  const r = await client().beta.chat.completions.parse({
    model: MODELS.fast,
    temperature: 0.3,
    messages: [
      { role: "system", content: buildApplicationAckSystemPrompt(settings) },
      {
        role: "user",
        content: JSON.stringify({
          job_title: args.jobTitle,
          jd_summary: args.jd.summary,
          candidate_name: args.profile.name,
        }),
      },
    ],
    response_format: zodResponseFormat(ComposedEmailSchema, "email"),
  });
  const parsed = r.choices[0]?.message.parsed;
  if (!parsed) throw new Error("composeApplicationAckEmail: no parsed output");
  recordLlmUsage(
    args.usage ?? { operation: "compose_application_ack" },
    MODELS.fast,
    r.usage,
  );
  return parsed;
}

export async function composeNoShowEmail(args: {
  jobTitle: string;
  candidateName: string | null;
  roundName: string;
  threadSubject?: string | null;
  emailSettings?: EmailSettings | unknown;
  usage?: LlmUsageContext;
}): Promise<ComposedEmail> {
  const settings = args.emailSettings
    ? resolveEmailSettings(args.emailSettings)
    : DEFAULT_EMAIL_SETTINGS;
  const r = await client().beta.chat.completions.parse({
    model: MODELS.fast,
    temperature: 0.3,
    messages: [
      { role: "system", content: buildNoShowFollowUpSystemPrompt(settings) },
      {
        role: "user",
        content: JSON.stringify({
          job_title: args.jobTitle,
          candidate_name: args.candidateName,
          missed_round_name: args.roundName,
          thread_subject: args.threadSubject ?? null,
        }),
      },
    ],
    response_format: zodResponseFormat(ComposedEmailSchema, "email"),
  });
  const parsed = r.choices[0]?.message.parsed;
  if (!parsed) throw new Error("composeNoShowEmail: no parsed output");
  recordLlmUsage(
    args.usage ?? { operation: "compose_no_show" },
    MODELS.fast,
    r.usage,
  );
  return parsed;
}

export async function suggestDuplicateResolution(args: {
  email: string;
  existingProfile: ParsedProfile;
  newProfile: ParsedProfile;
  existingRawSnippet: string;
  newRawSnippet: string;
  usage?: LlmUsageContext;
}): Promise<DuplicateSuggestion> {
  const r = await client().beta.chat.completions.parse({
    model: MODELS.fast,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Two candidate records share the same email. Compare profiles and resume snippets. " +
          "Recommend merge (same person — prefer newer upload if it adds info) or keep_both (different people sharing email). " +
          "Be concise. reason is 1-2 sentences; summary is one line for the recruiter UI.",
      },
      {
        role: "user",
        content: JSON.stringify({
          email: args.email,
          existing_profile: args.existingProfile,
          new_profile: args.newProfile,
          existing_resume_snippet: args.existingRawSnippet.slice(0, 2000),
          new_resume_snippet: args.newRawSnippet.slice(0, 2000),
        }),
      },
    ],
    response_format: zodResponseFormat(DuplicateSuggestionSchema, "duplicate_suggestion"),
  });
  const parsed = r.choices[0]?.message.parsed;
  if (!parsed) throw new Error("suggestDuplicateResolution: no parsed output");
  recordLlmUsage(
    args.usage ?? { operation: "duplicate_suggest" },
    MODELS.fast,
    r.usage,
  );
  return parsed;
}

export async function composeJobDigest(args: {
  jobsSnapshot: unknown;
  usage?: LlmUsageContext;
}): Promise<JobDigest> {
  const r = await client().beta.chat.completions.parse({
    model: MODELS.fast,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You produce a recruiter daily digest from structured job/match stats. " +
          "headline: one punchy line. summary: 2-3 sentences across all jobs. " +
          "items: up to 8 actionable items sorted by priority (high first). " +
          "Each action is imperative and specific (e.g. 'Reply to Jane on Senior Backend — asked about remote'). " +
          "Use only facts from the snapshot.",
      },
      { role: "user", content: JSON.stringify(args.jobsSnapshot) },
    ],
    response_format: zodResponseFormat(JobDigestSchema, "digest"),
  });
  const parsed = r.choices[0]?.message.parsed;
  if (!parsed) throw new Error("composeJobDigest: no parsed output");
  recordLlmUsage(args.usage ?? { operation: "compose_digest" }, MODELS.fast, r.usage);
  return parsed;
}

export async function parseSchedulingIntent(args: {
  text: string;
  timezone: string;
  usage?: LlmUsageContext;
}): Promise<SchedulingIntent> {
  const r = await client().beta.chat.completions.parse({
    model: MODELS.fast,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Parse a recruiter's natural-language scheduling preference into structured filters. " +
          "Use IANA timezone for interpreting relative dates (today, next week, Tuesday). " +
          "preferred_weekdays: ISO 1=Mon … 7=Sun, or null if not specified. " +
          "prefer_time_of_day: morning (before 12), afternoon (12-17), or any. " +
          "earliest_date/latest_date: YYYY-MM-DD in the recruiter's local timezone, or null. " +
          "summary: one friendly sentence restating what you understood.",
      },
      {
        role: "user",
        content: JSON.stringify({ text: args.text, timezone: args.timezone }),
      },
    ],
    response_format: zodResponseFormat(SchedulingIntentSchema, "scheduling_intent"),
  });
  const parsed = r.choices[0]?.message.parsed;
  if (!parsed) throw new Error("parseSchedulingIntent: no parsed output");
  recordLlmUsage(args.usage ?? { operation: "parse_scheduling_intent" }, MODELS.fast, r.usage);
  return parsed;
}

export async function rerankSchedulingSlots(args: {
  slots: { start: string; end: string }[];
  candidateName: string | null;
  jobTitle: string;
  roundName: string;
  intentSummary?: string;
  usage?: LlmUsageContext;
}): Promise<SchedulingSlotRank> {
  const capped = args.slots.slice(0, 24);
  const r = await client().beta.chat.completions.parse({
    model: MODELS.fast,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "Rank interview time slots for candidate experience and recruiter efficiency. " +
          "Prefer mid-morning Tue-Thu, avoid very early/late, spread across days when possible. " +
          "If intentSummary is provided, strongly favor slots matching it. " +
          "Return ranked_starts as a reordering of the input slot start ISO strings (subset ok if some are poor fits). " +
          "reasoning: one sentence for the recruiter UI.",
      },
      {
        role: "user",
        content: JSON.stringify({
          candidate_name: args.candidateName,
          job_title: args.jobTitle,
          round_name: args.roundName,
          intent_summary: args.intentSummary ?? null,
          slots: capped,
        }),
      },
    ],
    response_format: zodResponseFormat(SchedulingSlotRankSchema, "slot_rank"),
  });
  const parsed = r.choices[0]?.message.parsed;
  if (!parsed) throw new Error("rerankSchedulingSlots: no parsed output");
  recordLlmUsage(args.usage ?? { operation: "rerank_scheduling_slots" }, MODELS.fast, r.usage);
  return parsed;
}

/** Build the text used for embedding a candidate. */
export function profileEmbeddingText(p: ParsedProfile): string {
  const exp = p.experience
    .map((e) => `${e.title ?? ""} at ${e.company ?? ""}`.trim())
    .filter(Boolean)
    .join("; ");
  const parts = [
    p.summary,
    p.skills.length ? `Skills: ${p.skills.join(", ")}` : "",
    exp ? `Experience: ${exp}` : "",
    p.education.length ? `Education: ${p.education.join("; ")}` : "",
    p.years != null ? `Total years: ${p.years}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

/** Build the text used for embedding a job description. */
export function jdEmbeddingText(jd: ParsedJD): string {
  return [
    `Title: ${jd.title}`,
    `Level: ${jd.level}`,
    `Must-haves: ${jd.must_have_skills.join(", ")}`,
    jd.nice_to_have_skills.length ? `Nice-to-haves: ${jd.nice_to_have_skills.join(", ")}` : "",
    jd.years_min != null ? `Min years: ${jd.years_min}` : "",
    `Summary: ${jd.summary}`,
    `Responsibilities: ${jd.responsibilities.join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}
