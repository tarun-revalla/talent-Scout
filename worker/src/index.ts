import dns from "node:dns";
import { loadEnvLocal } from "@/lib/load-env";

// Railway (and most container hosts) resolve smtp/imap.gmail.com to an IPv6
// address first, but their egress to that IPv6 hangs until the socket times
// out ("Connection timeout") — which is why it works locally but not on
// Railway. Prefer IPv4 A-records so the connection actually establishes.
dns.setDefaultResultOrder("ipv4first");

loadEnvLocal();

import { log } from "@/lib/logger";
import { env } from "@/lib/env";
import { supabaseServer } from "@/lib/db";
import { claimNext, markDone, failOrRetry, type QueueJob } from "@/lib/queue";
import { handleSendInitial } from "./handlers/sendInitial";
import { handleSendFollowup } from "./handlers/sendFollowup";
import { handleFinalizeScore } from "./handlers/finalizeScore";
import { handleSendRoundPass } from "./handlers/sendRoundPass";
import { handleSendApplicationAck } from "./handlers/sendApplicationAck";
import { handleSendNoShow } from "./handlers/sendNoShow";
import { handleSendDecline } from "./handlers/sendDecline";
import { handleSendSchedulingProposal } from "./handlers/sendSchedulingProposal";
import { handleSendCandidateInvite } from "./handlers/sendCandidateInvite";
import { handleSendSchedulingConfirmed } from "./handlers/sendSchedulingConfirmed";
import { handleSendPrepPacket } from "./handlers/sendPrepPacket";
import { handleSendSlackApproval } from "./handlers/sendSlackApproval";
import { handleCheckCalendarConflict, detectDropOffs } from "./handlers/checkCalendarConflict";
import { handleSendScorecardRequest } from "./handlers/sendScorecardRequest";
import { inboundPoll } from "./handlers/inboundPoll";

const STALE_LOCK_MS = 5 * 60 * 1000;

/**
 * On boot, reset queue rows that were claimed by a previous worker but never
 * finished (worker crash / kill). After STALE_LOCK_MS the row goes back to
 * 'pending' so this worker can pick it up.
 */
async function resetStaleRunningJobs(): Promise<void> {
  const sb = supabaseServer();
  const cutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  const { data, error } = await sb
    .from("outreach_queue")
    .update({ status: "pending" })
    .eq("status", "running")
    .lt("locked_at", cutoff)
    .select("id");
  if (error) {
    log.warn({ err: error.message }, "stale-reset: query failed");
    return;
  }
  if (data && data.length > 0) {
    log.warn({ count: data.length }, "stale-reset: returned rows to pending");
  }
}

const MAX_PER_TICK = 5;
const SEND_THROTTLE_MS = 4000;

async function dispatch(j: QueueJob): Promise<void> {
  if (j.action === "send_initial") return handleSendInitial(j);
  if (j.action === "send_followup") return handleSendFollowup(j);
  if (j.action === "finalize_score") return handleFinalizeScore(j);
  if (j.action === "send_round_pass") return handleSendRoundPass(j);
  if (j.action === "send_application_ack") return handleSendApplicationAck(j);
  if (j.action === "send_no_show") return handleSendNoShow(j);
  if (j.action === "send_decline") return handleSendDecline(j);
  if (j.action === "send_scheduling_proposal") return handleSendSchedulingProposal(j);
  if (j.action === "send_candidate_invite") return handleSendCandidateInvite(j);
  if (j.action === "send_scheduling_confirmed") return handleSendSchedulingConfirmed(j);
  if (j.action === "send_prep_packet") return handleSendPrepPacket(j);
  if (j.action === "send_slack_approval") return handleSendSlackApproval(j);
  if (j.action === "check_calendar_conflict") return handleCheckCalendarConflict(j);
  if (j.action === "send_scorecard_request") return handleSendScorecardRequest(j);
  throw new Error(`unknown action: ${j.action}`);
}

async function tick(): Promise<void> {
  for (let i = 0; i < MAX_PER_TICK; i++) {
    const job = await claimNext();
    if (!job) return;
    log.info({ id: job.id, action: job.action, matchId: job.match_id }, "claimed job");
    try {
      await dispatch(job);
      await markDone(job.id);
      // Throttle between sends to avoid Gmail rate hits.
      if (job.action !== "finalize_score") {
        await new Promise((r) => setTimeout(r, SEND_THROTTLE_MS));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const result = await failOrRetry(job.id, job.attempts, msg);
      if (result.retried) {
        log.warn(
          { jobId: job.id, action: job.action, attempts: job.attempts, nextAt: result.nextAttemptAt, err: msg },
          "job failed — will retry",
        );
      } else {
        log.error(
          { jobId: job.id, action: job.action, attempts: job.attempts, err: msg },
          "job failed permanently after max retries",
        );
      }
    }
  }
}

// Run drop-off detection every DROP_OFF_CHECK_TICKS ticks (~every 5 min at 30s intervals).
const DROP_OFF_CHECK_TICKS = 10;
let dropOffTickCounter = 0;

async function main() {
  const interval = env.workerPollIntervalMs();
  log.info({ pollMs: interval, perTick: MAX_PER_TICK }, "worker booting");

  // Recover from any prior worker crash.
  await resetStaleRunningJobs();

  // Pin the event loop. Some libraries (imapflow streams, undici fetch) can
  // briefly leave the loop empty between operations and Node will exit.
  const keepAlive = setInterval(() => {}, 60_000);

  process.on("uncaughtException", (err) => log.error({ err: err.message }, "uncaughtException"));
  process.on("unhandledRejection", (r) => log.error({ r: String(r) }, "unhandledRejection"));

  let stopping = false;
  const stop = () => {
    stopping = true;
    log.info("worker shutting down");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    dropOffTickCounter++;
    const tasks: Promise<void>[] = [tick(), inboundPoll()];

    if (dropOffTickCounter % DROP_OFF_CHECK_TICKS === 0) {
      tasks.push(
        detectDropOffs().catch((err) =>
          log.error({ err: err instanceof Error ? err.message : String(err) }, "detectDropOffs error"),
        ),
      );
    }

    const results = await Promise.allSettled(tasks);
    for (const r of results) {
      if (r.status === "rejected") {
        log.error(
          { err: r.reason instanceof Error ? r.reason.message : String(r.reason) },
          "tick error",
        );
      }
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  clearInterval(keepAlive);
  process.exit(0);
}

main().catch((err) => {
  log.error({ err: err instanceof Error ? err.message : String(err) }, "fatal");
  process.exit(1);
});
