import { getInterviewerAvailability } from "../interviewers";

/** Check whether all interviewers are still free for [start, end). */
export async function overlapsSlot(
  interviewerIds: string[],
  slotStart: string,
  slotEnd: string,
): Promise<boolean> {
  const durationMs = new Date(slotEnd).getTime() - new Date(slotStart).getTime();
  const durationMinutes = Math.round(durationMs / 60_000);
  if (durationMinutes < 1) return false;

  for (const id of interviewerIds) {
    const { slots } = await getInterviewerAvailability(id, durationMinutes, 14);
    const ok = slots.some((s) => s.start === slotStart && s.end === slotEnd);
    if (!ok) return false;
  }
  return true;
}
