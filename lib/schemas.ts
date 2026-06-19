import { z } from "zod";

export const SalaryRangeSchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  currency: z.string().nullable(),
  period: z.enum(["yearly", "monthly", "hourly"]).nullable(),
});
export type SalaryRange = z.infer<typeof SalaryRangeSchema>;

export const ParsedJDSchema = z.object({
  title: z.string(),
  level: z.enum(["intern", "junior", "mid", "senior", "lead", "principal", "unspecified"]),
  must_have_skills: z.array(z.string()),
  nice_to_have_skills: z.array(z.string()),
  years_min: z.number().nullable(),
  location: z.string().nullable(),
  remote: z.enum(["onsite", "hybrid", "remote", "unspecified"]),
  salary_range: SalaryRangeSchema,
  responsibilities: z.array(z.string()),
  summary: z.string(),
});
export type ParsedJD = z.infer<typeof ParsedJDSchema>;

export const ExperienceItemSchema = z.object({
  company: z.string(),
  title: z.string(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  description: z.string().nullable(),
});

export const ParsedProfileSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  years: z.number().nullable(),
  skills: z.array(z.string()),
  experience: z.array(ExperienceItemSchema),
  education: z.array(z.string()),
  summary: z.string(),
});
export type ParsedProfile = z.infer<typeof ParsedProfileSchema>;

export const MatchExplanationSchema = z.object({
  score: z.number().min(0).max(100),
  matched_skills: z.array(z.string()),
  gaps: z.array(z.string()),
  experience_fit: z.enum(["strong", "partial", "weak"]),
  summary: z.string(),
});
export type MatchExplanation = z.infer<typeof MatchExplanationSchema>;

export const CommitmentsSchema = z.object({
  availability: z.string().nullable(),
  notice_period_weeks: z.number().nullable(),
  salary_expectation: z.string().nullable(),
  willing_to_interview: z.enum(["yes", "no", "maybe"]).nullable(),
});
export type Commitments = z.infer<typeof CommitmentsSchema>;

export const ReplyAnalysisSchema = z.object({
  sentiment: z.enum(["enthusiastic", "positive", "neutral", "hesitant", "declining"]),
  enthusiasm_score: z.number().min(0).max(100),
  commitments: CommitmentsSchema,
  ambiguities: z.array(z.string()),
  /** Questions the candidate asked in their LATEST reply that still need a recruiter response. */
  candidate_questions: z.array(z.string()).default([]),
  decision: z.enum(["score_now", "follow_up", "decline"]),
});
export type ReplyAnalysis = z.infer<typeof ReplyAnalysisSchema>;

export const ComposedEmailSchema = z.object({
  subject: z.string(),
  body: z.string(),
});
export type ComposedEmail = z.infer<typeof ComposedEmailSchema>;

export const InterviewRoundTypeSchema = z.enum([
  "phone_screen",
  "technical",
  "system_design",
  "hiring_manager",
  "culture",
  "panel",
  "other",
]);
export type InterviewRoundType = z.infer<typeof InterviewRoundTypeSchema>;

export const InterviewRoundSchema = z.object({
  order: z.number().int().min(1),
  name: z.string().min(1).max(120),
  type: InterviewRoundTypeSchema,
  duration_minutes: z.number().int().min(15).max(480).nullable(),
  description: z.string().max(2000).nullable(),
  interviewer_role: z.string().max(120).nullable(),
});
export type InterviewRound = z.infer<typeof InterviewRoundSchema>;

export const InterviewRoundsSchema = z.array(InterviewRoundSchema).min(1).max(12);

export const SuggestedInterviewRoundsSchema = z.object({
  rounds: InterviewRoundsSchema,
  rationale: z.string(),
});
export type SuggestedInterviewRounds = z.infer<typeof SuggestedInterviewRoundsSchema>;

export const EmailSettingsSchema = z.object({
  recruiter_name: z.string().min(1).max(80),
  initial_instructions: z.string().max(2000),
  followup_instructions: z.string().max(2000),
  interest_questions: z.array(z.string().min(1).max(500)).min(1).max(8),
  /** Optional recruiter-authored notes injected into interview prep packets. */
  prep_packet_instructions: z.string().max(2000).optional().default(""),
  /** When true, rejected candidates receive an automated, kind decline email. */
  decline_enabled: z.boolean().optional().default(false),
  /** Optional recruiter guidance for the tone/content of decline emails. */
  decline_instructions: z.string().max(2000).optional().default(""),
});
export type EmailSettings = z.infer<typeof EmailSettingsSchema>;

export const ManualMessageIntentSchema = z.enum([
  "general",
  "answer_questions",
  "nudge",
]);
export type ManualMessageIntent = z.infer<typeof ManualMessageIntentSchema>;

export const DuplicateSuggestionSchema = z.object({
  recommendation: z.enum(["merge", "keep_both"]),
  confidence: z.enum(["high", "medium", "low"]),
  reason: z.string(),
  summary: z.string(),
});
export type DuplicateSuggestion = z.infer<typeof DuplicateSuggestionSchema>;

export const JobDigestSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  items: z.array(
    z.object({
      job_id: z.string(),
      job_title: z.string(),
      priority: z.enum(["high", "medium", "low"]),
      action: z.string(),
    }),
  ),
});
export type JobDigest = z.infer<typeof JobDigestSchema>;

export const SchedulingIntentSchema = z.object({
  summary: z.string(),
  preferred_weekdays: z.array(z.number().int().min(1).max(7)).nullable(),
  prefer_time_of_day: z.enum(["morning", "afternoon", "any"]),
  earliest_date: z.string().nullable(),
  latest_date: z.string().nullable(),
});
export type SchedulingIntent = z.infer<typeof SchedulingIntentSchema>;

export const SchedulingSlotRankSchema = z.object({
  ranked_starts: z.array(z.string()),
  reasoning: z.string(),
});
export type SchedulingSlotRank = z.infer<typeof SchedulingSlotRankSchema>;
