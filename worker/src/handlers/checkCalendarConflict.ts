import { supabaseServer } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { log } from "@/lib/logger";
import type { QueueJob } from "@/lib/queue";
import { getSession, cancelConfirmedInterview } from "@/lib/scheduling";
import { overlapsSlot } from "@/lib/calendar/validate";
import { env } from "@/lib/env";

export async function handleCheckCalendarConflict(job: QueueJob): Promise<void> {
  const sb = supabaseServer();
  const payload = job.payload as { sessionId?: string };
  const sessionId = payload.sessionId;
  if (!sessionId) throw new Error("sessionId required");

  const session = await getSession(sessionId);
  if (!session || session.status !== "confirmed") {
    log.info({ sessionId }, "check_calendar_conflict: not confirmed, skipping");
    return;
  }

  const { data: interview } = await sb
    .from("scheduled_interviews")
    .select("id, starts_at, ends_at, confirmed_at")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!interview || !interview.confirmed_at) {
    log.info({ sessionId }, "check_calendar_conflict: no confirmed interview, skipping");
    return;
  }

  // Skip if interview already started.
  if (new Date(interview.starts_at as string) <= new Date()) {
    log.info({ sessionId }, "check_calendar_conflict: interview already started, skipping");
    return;
  }

  const stillFree = await overlapsSlot(
    session.interviewer_ids,
    interview.starts_at as string,
    interview.ends_at as string,
  );

  if (stillFree) {
    log.info({ sessionId }, "check_calendar_conflict: slot still free, no conflict");
    return;
  }

  log.warn({ sessionId }, "check_calendar_conflict: CONFLICT DETECTED — cancelling interview");

  // Cancel the confirmed interview.
  await cancelConfirmedInterview(sessionId);

  // Fetch context for the notification email.
  const { data: match } = await sb
    .from("matches")
    .select(
      `
      id,
      candidate:candidates ( name, email ),
      job:jobs ( id, title )
    `,
    )
    .eq("id", session.match_id)
    .single();

  if (!match) return;
  const candidate = Array.isArray(match.candidate) ? match.candidate[0] : match.candidate;
  const jobRow = Array.isArray(match.job) ? match.job[0] : match.job;

  const subject = `⚠️ Calendar conflict detected — ${candidate?.name ?? "Candidate"} interview cancelled`;
  const body =
    `A calendar conflict was detected for the upcoming interview.\n\n` +
    `Candidate: ${candidate?.name ?? "Unknown"}\n` +
    `Role: ${jobRow?.title ?? "Unknown"}\n` +
    `Scheduled time: ${interview.starts_at as string}\n\n` +
    `The interview has been cancelled. Please reschedule via the platform.\n\n` +
    `Talent Scout`;

  await sendEmail({
    to: env.gmailUser(),
    subject,
    body,
    htmlOptions: { recruiterName: "Talent Scout", jobTitle: jobRow?.title as string ?? "" },
  });

  log.info({ sessionId, matchId: match.id }, "check_calendar_conflict: recruiter notified");
}

/**
 * Periodic drop-off detection: find scheduling sessions that have been in
 * pending_approval for more than 48h and notify the recruiter.
 * Called from the main worker loop, not the queue.
 */
export async function detectDropOffs(): Promise<void> {
  const sb = supabaseServer();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: staleSessions, error } = await sb
    .from("scheduling_sessions")
    .select(
      `
      id, match_id, updated_at,
      match:matches (
        id,
        candidate:candidates ( name, email ),
        job:jobs ( id, title )
      )
    `,
    )
    .eq("status", "pending_approval")
    .lt("updated_at", cutoff);

  if (error) {
    log.warn({ err: error.message }, "detectDropOffs: query failed");
    return;
  }
  if (!staleSessions || staleSessions.length === 0) return;

  log.info({ count: staleSessions.length }, "detectDropOffs: found stale sessions");

  for (const session of staleSessions) {
    const matchData = Array.isArray(session.match) ? session.match[0] : session.match;
    if (!matchData) continue;

    const candidate = Array.isArray(matchData.candidate)
      ? matchData.candidate[0]
      : matchData.candidate;
    const jobRow = Array.isArray(matchData.job) ? matchData.job[0] : matchData.job;

    const subject = `⏰ Scheduling follow-up needed — ${candidate?.name ?? "Candidate"}`;
    const body =
      `A scheduling proposal has been awaiting interviewer response for more than 48 hours.\n\n` +
      `Candidate: ${candidate?.name ?? "Unknown"}\n` +
      `Role: ${jobRow?.title ?? "Unknown"}\n` +
      `Session ID: ${session.id}\n\n` +
      `Please follow up with the interviewer or create a new scheduling session.\n\n` +
      `Talent Scout`;

    try {
      await sendEmail({
        to: env.gmailUser(),
        subject,
        body,
        htmlOptions: { recruiterName: "Talent Scout", jobTitle: jobRow?.title ?? "" },
      });
      log.info({ sessionId: session.id }, "detectDropOffs: recruiter nudge sent");
    } catch (err) {
      log.warn({ sessionId: session.id, err: String(err) }, "detectDropOffs: nudge failed");
    }

    // Touch updated_at so we don't send a second nudge next tick.
    await sb
      .from("scheduling_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", session.id);
  }
}
