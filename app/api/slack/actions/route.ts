import { NextRequest, NextResponse } from "next/server";
import { cancelAcceptedInterview, respondToProposal, getProposalByToken } from "@/lib/scheduling";
import {
  updateSlackMessage,
  buildResolvedBlocks,
  verifySlackSignature,
  postSlackThreadMessage,
} from "@/lib/slack";
import { formatSlotLocal } from "@/lib/scheduling-email";
import { log } from "@/lib/logger";
import { enqueue } from "@/lib/queue";
import { supabaseServer } from "@/lib/db";
import {
  RECOMMENDATION_LABEL,
  submitScorecard,
  type ScorecardRecommendation,
} from "@/lib/scorecard";

export const runtime = "nodejs";

const SCORECARD_ACTIONS: Record<string, ScorecardRecommendation> = {
  scorecard_strong_yes: "strong_yes",
  scorecard_yes: "yes",
  scorecard_no: "no",
  scorecard_strong_no: "strong_no",
};

/**
 * Process an interviewer's accept/reject of a scheduling proposal. Shared by
 * both entry points:
 *   - GET  (URL buttons): browser opens a link, zero Slack config required.
 *   - POST (interactive block_actions): button click is handled in-place,
 *           requires Slack Interactivity + SLACK_SIGNING_SECRET.
 *
 * Returns a short status describing what happened so callers can route the UI.
 */
async function processSlackAction(
  token: string,
  action: "accept" | "reject" | "cancel",
): Promise<"approved" | "rejected" | "cancelled" | "expired" | "already"> {
  const ctx = await getProposalByToken(token);
  if (!ctx) return "expired";
  if (action !== "cancel" && ctx.proposal.status !== "pending") return "already";
  if (action === "cancel" && ctx.proposal.status !== "accepted") return "already";

  const { session, proposal } =
    action === "cancel"
      ? await cancelAcceptedInterview(token)
      : await respondToProposal(token, action);

  // Reflect the resolved state back into the Slack message (best-effort).
  const sb = supabaseServer();
  const { data: slackRows } = await sb
    .from("scheduling_slack_messages")
    .select("id, slack_channel_id, slack_ts")
    .eq("proposal_id", proposal.id);

  for (const slackRow of slackRows ?? []) {
    const slotLocal = formatSlotLocal(proposal.slot_start, session.timezone);
    const blocks = buildResolvedBlocks({
      candidateName: ctx.candidate.name ?? "Candidate",
      jobTitle: ctx.job.title,
      roundName: `Round ${session.round_index + 1}`,
      slotLocal,
      action: action === "accept" ? "accepted" : "rejected",
      responseToken: action === "accept" ? proposal.response_token : undefined,
      origin: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    });
    try {
      await updateSlackMessage({
        channel: slackRow.slack_channel_id as string,
        ts: slackRow.slack_ts as string,
        text: `${action === "accept" ? "✅ Approved" : action === "cancel" ? "🚫 Cancelled" : "❌ Rejected"}: ${ctx.candidate.name ?? "Candidate"} interview`,
        blocks,
      });
      await sb
        .from("scheduling_slack_messages")
        .update({ status: action === "accept" ? "accepted" : action === "cancel" ? "cancelled" : "rejected", updated_at: new Date().toISOString() })
        .eq("id", slackRow.id);
      if (action === "cancel") {
        await postSlackThreadMessage({
          channel: slackRow.slack_channel_id as string,
          threadTs: slackRow.slack_ts as string,
          text: "Interview cancelled. I’m proposing the next available slot in this thread.",
        });
      }
    } catch (slackErr) {
      log.warn({ err: String(slackErr) }, "slack/actions: failed to update Slack message");
    }
  }

  if (action === "accept") {
    await enqueue(session.match_id, "send_candidate_invite", { sessionId: session.id });
    return "approved";
  }
  if (action === "cancel") {
    if (session.status === "pending_approval") {
      await enqueue(session.match_id, "send_slack_approval", { sessionId: session.id });
      await enqueue(session.match_id, "send_scheduling_proposal", { sessionId: session.id });
    }
    return "cancelled";
  }
  // On reject, send the next proposal to interviewers if one was generated.
  if (session.status === "pending_approval") {
    await enqueue(session.match_id, "send_slack_approval", { sessionId: session.id });
    await enqueue(session.match_id, "send_scheduling_proposal", { sessionId: session.id });
  }
  return "rejected";
}

/**
 * GET /api/slack/actions?token=XXX&action=accept|reject
 *
 * URL embedded in Slack message link-buttons. Works without Slack Interactive
 * Components configured — the button simply opens this URL in the browser.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const action = req.nextUrl.searchParams.get("action") as "accept" | "reject" | "cancel" | null;

  if (!token || !action || !["accept", "reject", "cancel"].includes(action)) {
    return new NextResponse("Invalid request", { status: 400 });
  }

  const origin = req.nextUrl.origin;
  try {
    const result = await processSlackAction(token, action);
    if (result === "expired") {
      return NextResponse.redirect(`${origin}/schedule/respond/${token}?error=expired`);
    }
    if (result === "already") {
      return NextResponse.redirect(`${origin}/schedule/respond/${token}`);
    }
    return NextResponse.redirect(`${origin}/schedule/respond/${token}?done=${result}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, "slack/actions GET: error processing action");
    return NextResponse.redirect(
      `${origin}/schedule/respond/${token}?error=${encodeURIComponent(msg)}`,
    );
  }
}

/**
 * POST /api/slack/actions
 *
 * Slack interactive payload endpoint (block_actions). Configure this URL under
 * your Slack app's "Interactivity & Shortcuts" request URL to let interviewers
 * approve/reject directly from the DM without opening a browser tab.
 *
 * The button's `value` carries the proposal token and the `action_id` is one of
 * approve_interview / reject_interview.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
  const signature = req.headers.get("x-slack-signature") ?? "";

  // Reject stale requests (replay protection) and verify the signature.
  const tsNum = Number(timestamp);
  if (!timestamp || Math.abs(Date.now() / 1000 - tsNum) > 60 * 5) {
    return new NextResponse("Stale request", { status: 400 });
  }
  const valid = await verifySlackSignature(rawBody, timestamp, signature);
  if (!valid) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  // Slack sends `payload=<url-encoded JSON>`.
  const params = new URLSearchParams(rawBody);
  const payloadRaw = params.get("payload");
  if (!payloadRaw) return new NextResponse("Missing payload", { status: 400 });

  let payload: {
    type?: string;
    response_url?: string;
    actions?: { action_id?: string; value?: string }[];
  };
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return new NextResponse("Bad payload", { status: 400 });
  }

  if (payload.type !== "block_actions" || !payload.actions?.length) {
    // Acknowledge anything else so Slack doesn't show an error.
    return NextResponse.json({ ok: true });
  }

  const clicked = payload.actions[0];
  const token = clicked?.value ?? "";
  const scorecardRecommendation = clicked?.action_id
    ? SCORECARD_ACTIONS[clicked.action_id]
    : undefined;
  if (token && scorecardRecommendation) {
    try {
      await submitScorecard(token, {
        recommendation: scorecardRecommendation,
        notes: "Submitted from Slack quick action.",
      });
      if (payload.response_url) {
        await fetch(payload.response_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({
            replace_original: false,
            response_type: "ephemeral",
            text: `Scorecard recorded: ${RECOMMENDATION_LABEL[scorecardRecommendation]}. Open the full scorecard link if you want to add ratings or notes.`,
          }),
        });
      }
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "slack/actions POST: error submitting scorecard action",
      );
      if (payload.response_url) {
        await fetch(payload.response_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({
            replace_original: false,
            response_type: "ephemeral",
            text:
              err instanceof Error
                ? err.message
                : "Could not submit this scorecard. Please open the full scorecard link.",
          }),
        });
      }
    }
    return NextResponse.json({ ok: true });
  }

  const action: "accept" | "reject" | "cancel" | null =
    clicked?.action_id === "approve_interview"
      ? "accept"
      : clicked?.action_id === "reject_interview"
        ? "reject"
        : clicked?.action_id === "cancel_interview"
          ? "cancel"
          : null;

  if (!token || !action) {
    return NextResponse.json({ ok: true });
  }

  // Acknowledge immediately, then update the message via response_url.
  try {
    const result = await processSlackAction(token, action);
    if (payload.response_url) {
      const messages: Record<string, string> = {
        approved: "✅ Approved — the candidate is being invited to confirm the time.",
        rejected: "❌ Declined — proposing the next available time.",
        cancelled: "🚫 Cancelled — proposing the next available time.",
        expired: "⚠️ This request has expired.",
        already: "This request was already handled.",
      };
      await fetch(payload.response_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          replace_original: false,
          response_type: "ephemeral",
          text: messages[result] ?? "Done.",
        }),
      });
    }
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err) },
      "slack/actions POST: error processing action",
    );
  }

  return NextResponse.json({ ok: true });
}
