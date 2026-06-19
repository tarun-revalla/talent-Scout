export const MAX_QUEUE_ATTEMPTS = 5;

export function shouldRetryQueueJob(attempts: number): boolean {
  return attempts < MAX_QUEUE_ATTEMPTS;
}

/** Exponential backoff: 5s, 10s, 20s, 40s, 80s — capped at 5 minutes. */
export function computeRetryDelaySec(attempts: number): number {
  return Math.min(300, 5 * 2 ** (attempts - 1));
}
