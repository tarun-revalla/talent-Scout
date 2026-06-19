import { supabaseServer } from "./db";

export type QueueAction =
  | "send_initial"
  | "send_followup"
  | "finalize_score"
  | "send_round_pass"
  | "send_application_ack"
  | "send_no_show"
  | "send_decline"
  | "send_scheduling_proposal"
  | "send_candidate_invite"
  | "send_scheduling_confirmed"
  | "send_prep_packet"
  | "send_slack_approval"
  | "check_calendar_conflict"
  | "send_scorecard_request";

export interface QueueJob {
  id: string;
  match_id: string;
  action: QueueAction;
  payload: Record<string, unknown>;
  attempts: number;
}

export async function enqueue(
  matchId: string,
  action: QueueAction,
  payload: Record<string, unknown> = {},
): Promise<string> {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("outreach_queue")
    .insert({ match_id: matchId, action, payload })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Skip if this match already has a pending/running queue row for the action. */
export async function enqueueIfAbsent(
  matchId: string,
  action: QueueAction,
  payload: Record<string, unknown> = {},
): Promise<string | null> {
  const sb = supabaseServer();
  const { data: existing } = await sb
    .from("outreach_queue")
    .select("id")
    .eq("match_id", matchId)
    .eq("action", action)
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle();
  if (existing) return null;
  return enqueue(matchId, action, payload);
}

/**
 * Claim the next pending queue job. Single-worker friendly:
 * find the oldest pending row, atomically flip status='running'.
 * If two workers race, only one of the UPDATEs succeeds (the other returns 0 rows).
 */
export async function claimNext(): Promise<QueueJob | null> {
  const sb = supabaseServer();
  const { data: pending } = await sb
    .from("outreach_queue")
    .select("id, match_id, action, payload, attempts")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!pending) return null;

  const { data: claimed, error } = await sb
    .from("outreach_queue")
    .update({
      status: "running",
      locked_at: new Date().toISOString(),
      attempts: (pending.attempts ?? 0) + 1,
    })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select("id, match_id, action, payload, attempts")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!claimed) return null; // someone else claimed it
  return claimed as QueueJob;
}

export async function markDone(id: string): Promise<void> {
  const sb = supabaseServer();
  await sb.from("outreach_queue").update({ status: "done" }).eq("id", id);
}

export async function markFailed(id: string, errMsg: string): Promise<void> {
  const sb = supabaseServer();
  await sb
    .from("outreach_queue")
    .update({ status: "failed", last_error: errMsg.slice(0, 500) })
    .eq("id", id);
}

import { computeRetryDelaySec, shouldRetryQueueJob } from "./queue-utils";

/**
 * Either reschedule the job for a future retry (with exponential backoff) or
 * mark it permanently failed if it has hit MAX_ATTEMPTS. Counts on the
 * caller's `attempts` field already including the current (failed) attempt.
 */
export async function failOrRetry(
  id: string,
  attempts: number,
  errMsg: string,
): Promise<{ retried: boolean; nextAttemptAt?: string }> {
  const sb = supabaseServer();
  const trimmed = errMsg.slice(0, 500);
  if (!shouldRetryQueueJob(attempts)) {
    await sb
      .from("outreach_queue")
      .update({ status: "failed", last_error: trimmed })
      .eq("id", id);
    return { retried: false };
  }
  const delaySec = computeRetryDelaySec(attempts);
  const nextAt = new Date(Date.now() + delaySec * 1000).toISOString();
  await sb
    .from("outreach_queue")
    .update({
      status: "pending",
      scheduled_for: nextAt,
      last_error: trimmed,
      locked_at: null,
    })
    .eq("id", id);
  return { retried: true, nextAttemptAt: nextAt };
}
