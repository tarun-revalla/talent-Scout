function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  openaiApiKey: () => required("OPENAI_API_KEY"),
  supabaseUrl: () => required("SUPABASE_URL"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  // NEXT_PUBLIC_* vars must be referenced by their literal name so Next.js
  // can inline them at build time. process.env[dynamicKey] is not replaced.
  publicSupabaseUrl: () => {
    const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!v) throw new Error("Missing required env var: NEXT_PUBLIC_SUPABASE_URL");
    return v;
  },
  publicSupabaseAnonKey: () => {
    const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!v) throw new Error("Missing required env var: NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return v;
  },
  gmailUser: () => required("GMAIL_USER"),
  gmailAppPassword: () => required("GMAIL_APP_PASSWORD"),
  gmailImapHost: () => optional("GMAIL_IMAP_HOST", "imap.gmail.com"),
  gmailSmtpHost: () => optional("GMAIL_SMTP_HOST", "smtp.gmail.com"),
  workerPollIntervalMs: () =>
    parseInt(optional("WORKER_POLL_INTERVAL_MS", "30000"), 10),
  workerSharedSecret: () => required("WORKER_SHARED_SECRET"),
  maxOutreachRounds: () => parseInt(optional("MAX_OUTREACH_ROUNDS", "3"), 10),
  /** Optional password to reveal token/cost stats on the analytics page. */
  analyticsUnlockPassword: () => process.env.ANALYTICS_UNLOCK_PASSWORD?.trim() || null,
  /** Slack Bot Token (xoxb-…) for sending DM approval requests to interviewers. */
  slackBotToken: () => process.env.SLACK_BOT_TOKEN?.trim() || null,
  /** Slack signing secret for verifying interactive action payloads. */
  slackSigningSecret: () => process.env.SLACK_SIGNING_SECRET?.trim() || null,
  /** Fallback Slack channel ID if no interviewer slack_user_id is set. */
  slackChannelId: () => process.env.SLACK_CHANNEL_ID?.trim() || null,
};
