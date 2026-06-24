import { env } from "./env";

interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

const SLACK_FETCH_TIMEOUT_MS = 15_000;

/**
 * Post a message to a Slack user (DM) or channel via the Slack Web API.
 * Returns the message timestamp (ts) which can be used to update the message later.
 */
export async function postSlackMessage(args: {
  channel: string; // user ID (UXXXXXXX) or channel ID (CXXXXXXX)
  text: string;
  blocks?: SlackBlock[];
}): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const token = env.slackBotToken();
  if (!token) throw new Error("SLACK_BOT_TOKEN is not configured");

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(SLACK_FETCH_TIMEOUT_MS),
    body: JSON.stringify({
      channel: args.channel,
      text: args.text,
      blocks: args.blocks,
    }),
  });

  const json = (await res.json()) as { ok: boolean; ts?: string; error?: string };
  return json;
}

export async function postSlackThreadMessage(args: {
  channel: string;
  threadTs: string;
  text: string;
  blocks?: SlackBlock[];
}): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const token = env.slackBotToken();
  if (!token) throw new Error("SLACK_BOT_TOKEN is not configured");

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(SLACK_FETCH_TIMEOUT_MS),
    body: JSON.stringify({
      channel: args.channel,
      thread_ts: args.threadTs,
      text: args.text,
      blocks: args.blocks,
    }),
  });

  const json = (await res.json()) as { ok: boolean; ts?: string; error?: string };
  return json;
}

/**
 * Resolve a Slack user ID (UXXXX) from their email address so the bot can DM
 * them directly instead of posting to a shared channel. Requires the
 * `users:read.email` bot scope. Returns null if not found or not configured.
 */
export async function lookupSlackUserByEmail(email: string): Promise<string | null> {
  const token = env.slackBotToken();
  if (!token) return null;

  const res = await fetch(
    `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(SLACK_FETCH_TIMEOUT_MS),
    },
  );
  const json = (await res.json()) as {
    ok: boolean;
    user?: { id?: string };
    error?: string;
  };
  if (!json.ok || !json.user?.id) return null;
  return json.user.id;
}

/**
 * Update an existing Slack message (e.g., to mark it approved/rejected).
 */
export async function updateSlackMessage(args: {
  channel: string;
  ts: string;
  text: string;
  blocks?: SlackBlock[];
}): Promise<{ ok: boolean; error?: string }> {
  const token = env.slackBotToken();
  if (!token) throw new Error("SLACK_BOT_TOKEN is not configured");

  const res = await fetch("https://slack.com/api/chat.update", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(SLACK_FETCH_TIMEOUT_MS),
    body: JSON.stringify({
      channel: args.channel,
      ts: args.ts,
      text: args.text,
      blocks: args.blocks,
    }),
  });

  const json = (await res.json()) as { ok: boolean; error?: string };
  return json;
}

/** Build Block Kit blocks for an interview approval request. */
export function buildApprovalBlocks(args: {
  candidateName: string;
  jobTitle: string;
  roundName: string;
  slotLocal: string;
  durationMinutes: number;
  respondUrl: string;
  responseToken: string;
  origin: string;
}): SlackBlock[] {
  const approveUrl = `${args.origin}/api/slack/actions?token=${args.responseToken}&action=accept`;
  const rejectUrl = `${args.origin}/api/slack/actions?token=${args.responseToken}&action=reject`;

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Interview request:* ${args.candidateName} · ${args.jobTitle}\n` +
          `*Round:* ${args.roundName}\n` +
          `*Proposed time:* ${args.slotLocal}\n` +
          `*Duration:* ${args.durationMinutes} minutes`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "✅ Approve" },
          style: "primary",
          url: approveUrl,
          value: args.responseToken,
          action_id: "approve_interview",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "❌ Reject" },
          style: "danger",
          url: rejectUrl,
          value: args.responseToken,
          action_id: "reject_interview",
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `<${args.respondUrl}|View in browser> if buttons don't work`,
        },
      ],
    },
  ];
}

/** Build updated blocks for a resolved (approved/rejected) approval message. */
export function buildResolvedBlocks(args: {
  candidateName: string;
  jobTitle: string;
  roundName: string;
  slotLocal: string;
  action: "accepted" | "rejected";
  responseToken?: string;
  origin?: string;
}): SlackBlock[] {
  const emoji = args.action === "accepted" ? "✅" : "❌";
  const label = args.action === "accepted" ? "Approved" : "Rejected";
  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `${emoji} *${label}:* ${args.candidateName} · ${args.jobTitle}\n` +
          `*Round:* ${args.roundName}\n` +
          `*Time:* ${args.slotLocal}`,
      },
    },
  ];
  if (args.action === "accepted" && args.responseToken && args.origin) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Cancel interview" },
          style: "danger",
          url: `${args.origin}/api/slack/actions?token=${args.responseToken}&action=cancel`,
          value: args.responseToken,
          action_id: "cancel_interview",
          confirm: {
            title: { type: "plain_text", text: "Cancel interview?" },
            text: {
              type: "mrkdwn",
              text: "This releases the reserved time and asks the system to propose another slot.",
            },
            confirm: { type: "plain_text", text: "Cancel interview" },
            deny: { type: "plain_text", text: "Keep it" },
          },
        },
      ],
    });
  }
  return blocks;
}

/**
 * Verify a Slack request signature (X-Slack-Signature header).
 * Returns true if the request is genuine.
 */
export async function verifySlackSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
): Promise<boolean> {
  const secret = env.slackSigningSecret();
  if (!secret) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(baseString));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `v0=${hex}` === signature;
}
