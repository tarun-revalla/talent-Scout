import { EmailSettingsSchema, type EmailSettings } from "./schemas";

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  recruiter_name: "Talent Team",
  initial_instructions: "",
  followup_instructions: "",
  interest_questions: [
    "Are you open to exploring a new opportunity right now?",
    "What is your earliest start date / notice period?",
    "What are your compensation expectations? (Mention the role's range if available.)",
    "Would you be open to a 30-minute intro call this week or next?",
  ],
  prep_packet_instructions: "",
  decline_enabled: false,
  decline_instructions: "",
};

export function resolveEmailSettings(raw: unknown): EmailSettings {
  const parsed = EmailSettingsSchema.safeParse(raw);
  if (!parsed.success) return DEFAULT_EMAIL_SETTINGS;
  return {
    ...DEFAULT_EMAIL_SETTINGS,
    ...parsed.data,
    interest_questions:
      parsed.data.interest_questions.length > 0
        ? parsed.data.interest_questions
        : DEFAULT_EMAIL_SETTINGS.interest_questions,
  };
}

export function formatNumberedQuestions(questions: string[]): string {
  return questions.map((q, i) => `${i + 1}) ${q}`).join("\n");
}

export function buildInitialEmailSystemPrompt(settings: EmailSettings): string {
  const questions = formatNumberedQuestions(settings.interest_questions);
  const extra = settings.initial_instructions.trim();
  return (
    "Write a warm, concise outbound recruiting email (120-180 words). Plain text, no markdown. " +
    "Open with a personalized line referencing 1-2 of the candidate's matched skills or experience. " +
    "Briefly describe the role (1-2 sentences). Then ask these questions clearly numbered:\n" +
    `${questions}\n` +
    `Sign off as ${settings.recruiter_name}. Subject must be specific and < 70 chars.` +
    (extra ? `\n\nAdditional recruiter instructions:\n${extra}` : "")
  );
}

export function buildRoundPassEmailSystemPrompt(settings: EmailSettings): string {
  const extra = settings.followup_instructions.trim();
  return (
    "You write a short, joyful confirmation email after a candidate PASSES an interview round. " +
    "Plain text only, no markdown. 80-130 words.\n\n" +
    "TONE: warm, celebratory, genuine — they should feel good about their performance. " +
    "One light positive phrase is fine (e.g. 'great news', 'well done') but stay professional, not cheesy.\n\n" +
    "STRUCTURE:\n" +
    "1. Congratulate them by name on passing the round they just completed (use passed_round_name).\n" +
    "2. Say the recruiting team will reach out soon to coordinate the next step (next_round_name).\n" +
    "3. Do NOT propose specific dates/times or ask scheduling questions — scheduling comes later.\n" +
    "4. Brief warm close.\n\n" +
    "RULES:\n" +
    "  - Subject: start with 'Re: ' if a thread subject is provided; otherwise 'Great news'. Keep < 70 chars.\n" +
    `  - Sign off as ${settings.recruiter_name}.\n` +
    "  - Never mention rejection, other candidates, or internal scores." +
    (extra ? `\n\nAdditional recruiter instructions:\n${extra}` : "")
  );
}

export function buildFollowupEmailSystemPrompt(settings: EmailSettings): string {
  const extra = settings.followup_instructions.trim();
  return (
    "You write follow-up emails on behalf of a recruiting team. Your output will be sent verbatim — be careful and warm.\n\n" +
    "INPUTS:\n" +
    "  - jd: structured job description — legitimate source of facts about the role.\n" +
    "  - interview_rounds: ordered list with name, type, duration_minutes, interviewer_role, and what_this_round_covers " +
    "(the recruiter-written description of what the round assesses — use this when answering round-detail questions).\n" +
    "  - interview_progress: candidate's current position in the interview loop (state + current round index).\n" +
    "  - candidate_questions: explicit questions the candidate asked in their LATEST reply (may be empty).\n" +
    "  - transcript: chronological email thread (out = recruiter, in = candidate).\n" +
    "  - unanswered: recruiter screening questions the candidate has NOT answered yet " +
    "(e.g. notice period, compensation). These are questions YOU asked THEM — not questions they asked you.\n" +
    "  - candidate_name\n\n" +
    "OUTPUT (80-150 words, plain text, no markdown). Follow this structure IN ORDER:\n\n" +
    "1. ONE warm opening line that acknowledges something specific from the candidate's LATEST inbound reply.\n\n" +
    "2. CANDIDATE QUESTIONS — if 'candidate_questions' is non-empty OR their LATEST inbound message asks something:\n" +
    "     Answer each relevant question warmly and concisely. Use facts ONLY from jd, interview_rounds, or interview_progress.\n" +
    "     For interview-process questions (round order, what a round covers, duration, interviewer role, what's next):\n" +
    "       - Use interview_rounds + interview_progress as the primary source.\n" +
    "       - When they ask what a round covers or involves, answer from what_this_round_covers if it is set — " +
    "paraphrase it naturally; do NOT invent topics beyond that text.\n" +
    "       - If what_this_round_covers is null for that round, share only name/type/duration/interviewer_role and say " +
    "the recruiter will share more specifics shortly.\n" +
    "       - If they passed a round, acknowledge progress and describe the NEXT round from the data.\n" +
    "     For role/JD questions (remote, team, skills): use jd facts.\n" +
    "     If a detail is NOT in jd or interview_rounds (exact schedule, interviewer name/email, calendar link, comp negotiation):\n" +
    "       - Say the recruiter will follow up shortly with those specifics — do NOT invent details.\n" +
    "     If candidate_questions is empty and their latest reply has no questions, SKIP this section.\n\n" +
    "3. UNANSWERED RECRUITER ITEMS — if 'unanswered' is non-empty:\n" +
    "     - Politely note they haven't covered these yet and re-ask as a short numbered list.\n" +
    "     - These are YOUR outstanding screening questions — you are asking them, not answering them.\n" +
    "     - NEVER use phrases like 'great question', 'those details are best covered live', or defer-to-call " +
    "language in this section. That language is ONLY for section 2 when the candidate asked something.\n" +
    "     - NEVER repeat items the candidate already answered anywhere in the transcript.\n\n" +
    "4. One-line warm close.\n\n" +
    "HARD RULES:\n" +
    "  - If the candidate only said they are interested / open to chat but did not ask anything, " +
    "sections 2 is omitted — go straight from the warm opener to re-asking unanswered items (section 3).\n" +
    "  - NEVER fabricate facts not present in the JD or interview_rounds.\n" +
    "  - NEVER ask the candidate questions they already answered.\n" +
    "  - NEVER answer the candidate's questions BY asking them another question.\n" +
    "  - Subject: prefix with 'Re: '. Keep < 70 chars.\n" +
    `  - Sign off as ${settings.recruiter_name}.` +
    (extra ? `\n\nAdditional recruiter instructions:\n${extra}` : "")
  );
}

export function buildManualMessageSystemPrompt(
  settings: EmailSettings,
  intent: import("./schemas").ManualMessageIntent,
): string {
  const extra = settings.followup_instructions.trim();
  const base =
    "You draft recruiter emails that will be reviewed before sending. Plain text, no markdown. " +
    "Warm, professional, concise. Subject: use 'Re: ' when continuing a thread; keep < 70 chars. " +
    `Sign off as ${settings.recruiter_name}.\n\n`;

  if (intent === "answer_questions") {
    return (
      base +
      "INTENT: Answer the candidate's explicit questions using ONLY facts from jd, interview_rounds, and interview_progress. " +
      "Do not invent schedule links, interviewer names, or compensation beyond jd.salary_range. " +
      "If a detail is unknown, say the recruiter will follow up. 80-150 words."
    );
  }
  if (intent === "nudge") {
    return (
      base +
      "INTENT: Gentle follow-up nudge — candidate has gone quiet. Reference the role briefly, " +
      "one warm line acknowledging prior thread if any, and a single clear ask (reply or confirm interest). 60-100 words."
    );
  }
  return (
    base +
    "INTENT: General recruiter message. Personalize using candidate profile and match context. " +
    "100-160 words unless recruiter instructions specify otherwise." +
    (extra ? `\n\nAdditional recruiter instructions:\n${extra}` : "")
  );
}

export function buildApplicationAckSystemPrompt(settings: EmailSettings): string {
  return (
    "Write a brief application confirmation email (60-100 words). Plain text, no markdown. " +
    "Thank the candidate for applying, confirm receipt of their application, and set expectation " +
    "that the team will review and follow up if there is a fit. Do NOT ask screening questions yet — " +
    "this is acknowledgment only. Warm and professional. " +
    `Sign off as ${settings.recruiter_name}. Subject should reference the role and stay < 70 chars.`
  );
}

export function buildDeclineEmailSystemPrompt(settings: EmailSettings): string {
  const extra = settings.decline_instructions.trim();
  return (
    "Write a kind, respectful rejection email to a candidate who will NOT be moving forward " +
    "in the interview process. Plain text, no markdown. 80-130 words.\n\n" +
    "TONE: warm, genuine, and human — thank them sincerely for their time and interest. " +
    "Be gracious and leave the door open for future roles. Never sound like a form letter.\n\n" +
    "STRUCTURE:\n" +
    "1. Thank them by name for interviewing / their interest in the role.\n" +
    "2. Let them know the team has decided to move forward with other candidates for this role.\n" +
    "3. Say something briefly encouraging and invite them to apply for future openings.\n" +
    "4. Warm close.\n\n" +
    "HARD RULES:\n" +
    "  - NEVER disclose internal scores, the specific rejection reason, interviewer names, or " +
    "comparisons to other candidates.\n" +
    "  - NEVER make promises about specific future roles or timelines.\n" +
    "  - Do NOT ask the candidate any questions.\n" +
    "  - Subject: prefix with 'Re: ' if a thread subject is provided; otherwise reference the role. Keep < 70 chars.\n" +
    `  - Sign off as ${settings.recruiter_name}.` +
    (extra ? `\n\nAdditional recruiter instructions:\n${extra}` : "")
  );
}

export function buildNoShowFollowUpSystemPrompt(settings: EmailSettings): string {
  return (
    "Write a reschedule email after the candidate missed a scheduled interview round. " +
    "Plain text, 70-120 words. Empathetic tone — assume good intent. " +
    "Acknowledge they missed the round, offer to reschedule, ask them to reply with availability. " +
    "Do NOT reject or express frustration. " +
    `Sign off as ${settings.recruiter_name}. Subject: prefix with 'Re: ' if thread subject provided.`
  );
}
