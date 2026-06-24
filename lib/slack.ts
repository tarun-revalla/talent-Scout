import { env } from "./env";

export interface SlackBlock {
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
  slots: { start: string; label: string }[];
  durationMinutes: number;
  respondUrl: string;
  responseToken: string;
  origin: string;
}): SlackBlock[] {
  const slotList =
    args.slots.length > 0
      ? args.slots
      : [{ start: "", label: "See scheduling link" }];
  const multi = slotList.length > 1;

  const timesText = multi
    ? `*Proposed times — pick one:*\n${slotList.map((s) => `• ${s.label}`).join("\n")}`
    : `*Proposed time:* ${slotList[0]!.label}`;

  const actionButtons: Record<string, unknown>[] = [];
  if (!multi) {
    const slot = slotList[0]!;
    actionButtons.push(
      {
        type: "button",
        text: { type: "plain_text", text: "✅ Yes" },
        style: "primary",
        value: slot.start
          ? `${args.responseToken}|${slot.start}`
          : args.responseToken,
        action_id: "approve_interview",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "❌ No" },
        style: "danger",
        value: args.responseToken,
        action_id: "reject_interview",
      },
    );
  } else {
    for (const slot of slotList) {
      actionButtons.push({
        type: "button",
        text: { type: "plain_text", text: slot.label },
        value: `${args.responseToken}|${slot.start}`,
        action_id: "approve_interview_slot",
      });
    }
    actionButtons.push({
      type: "button",
      text: { type: "plain_text", text: "None work" },
      style: "danger",
      value: args.responseToken,
      action_id: "reject_interview",
    });
  }

  const actionBlocks: SlackBlock[] = [];
  for (let i = 0; i < actionButtons.length; i += 5) {
    actionBlocks.push({
      type: "actions",
      elements: actionButtons.slice(i, i + 5),
    });
  }

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Interview request:* ${args.candidateName} · ${args.jobTitle}\n` +
          `*Round:* ${args.roundName}\n` +
          `${timesText}\n` +
          `*Duration:* ${args.durationMinutes} minutes`,
      },
    },
    ...actionBlocks,
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Tap a button above, or <${args.respondUrl}|open the full picker in your browser>.`,
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
  action: "accepted" | "rejected" | "cancelled";
  responseToken?: string;
  origin?: string;
}): SlackBlock[] {
  const emoji =
    args.action === "accepted" ? "✅" : args.action === "cancelled" ? "🔄" : "❌";
  const label =
    args.action === "accepted"
      ? "Approved"
      : args.action === "cancelled"
        ? "Reschedule requested"
        : "Rejected";
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
          text: { type: "plain_text", text: "Reschedule" },
          value: args.responseToken,
          action_id: "reschedule_interview",
          confirm: {
            title: { type: "plain_text", text: "Reschedule interview?" },
            text: {
              type: "mrkdwn",
              text: "This releases the reserved time and proposes new slots for the panel.",
            },
            confirm: { type: "plain_text", text: "Reschedule" },
            deny: { type: "plain_text", text: "Keep it" },
          },
        },
      ],
    });
  }
  return blocks;
}

/** Build Block Kit blocks for an interviewer scorecard request. */
export function buildScorecardRequestBlocks(args: {
  candidateName: string;
  jobTitle: string;
  roundName: string;
  scorecardUrl: string;
  responseToken: string;
}): SlackBlock[] {
  const recommendationButtons = [
    { text: "Strong yes", style: "primary", actionId: "scorecard_strong_yes" },
    { text: "Yes", actionId: "scorecard_yes" },
    { text: "No", actionId: "scorecard_no" },
    { text: "Strong no", style: "danger", actionId: "scorecard_strong_no" },
  ];

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Scorecard needed:* ${args.candidateName} · ${args.jobTitle}\n` +
          `*Round:* ${args.roundName}\n` +
          "Use a quick recommendation below, or open the full scorecard to add ratings and notes.",
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open full scorecard" },
          url: args.scorecardUrl,
          value: args.responseToken,
          action_id: "open_scorecard",
        },
      ],
    },
    {
      type: "actions",
      elements: recommendationButtons.map((button) => ({
        type: "button",
        text: { type: "plain_text", text: button.text },
        style: button.style,
        value: args.responseToken,
        action_id: button.actionId,
      })),
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Quick recommendations save your hire decision. Open the full scorecard to add ratings and notes before final submit.",
        },
      ],
    },
  ];
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
