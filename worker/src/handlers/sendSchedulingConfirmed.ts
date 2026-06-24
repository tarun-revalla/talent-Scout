import { log } from "@/lib/logger";
import type { QueueJob } from "@/lib/queue";

export async function handleSendSchedulingConfirmed(job: QueueJob): Promise<void> {
  const payload = job.payload as { sessionId?: string };
  log.info(
    { sessionId: payload.sessionId },
    "send_scheduling_confirmed: skipped (candidate invite now CCs recruiter and interviewers)",
  );
}
