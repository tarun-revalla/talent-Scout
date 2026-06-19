import { DateTime } from "luxon";
import type { FreeSlot, TimeBlock, WorkingHours } from "./types";
import { DEFAULT_WORKING_HOURS } from "./types";

const SLOT_STEP_MIN = 15;

function parseHm(hm: string): { hour: number; minute: number } {
  const [h, m] = hm.split(":").map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

/** Expand each busy block by bufferMinutes on both sides to enforce padding. */
function expandBusyBlocks(blocks: TimeBlock[], bufferMinutes: number): TimeBlock[] {
  if (bufferMinutes <= 0) return blocks;
  const bufMs = bufferMinutes * 60_000;
  return blocks.map((b) => ({
    start: new Date(new Date(b.start).getTime() - bufMs).toISOString(),
    end: new Date(new Date(b.end).getTime() + bufMs).toISOString(),
  }));
}

/** Generate candidate start times within working hours, excluding busy blocks. */
export function computeFreeSlots(
  busyBlocks: TimeBlock[],
  timezone: string,
  workingHours: WorkingHours,
  durationMinutes: number,
  windowStart: Date,
  windowEnd: Date,
  bufferMinutes = 0,
): FreeSlot[] {
  const wh = workingHours ?? DEFAULT_WORKING_HOURS;
  const startHm = parseHm(wh.start);
  const endHm = parseHm(wh.end);
  const slots: FreeSlot[] = [];
  const effectiveBusy = expandBusyBlocks(busyBlocks, bufferMinutes);

  let cursor = DateTime.fromJSDate(windowStart, { zone: timezone }).startOf("day");
  const endDay = DateTime.fromJSDate(windowEnd, { zone: timezone }).endOf("day");

  while (cursor <= endDay) {
    const isoDow = cursor.weekday; // 1=Mon … 7=Sun
    if (wh.days.includes(isoDow)) {
      let slotStart = cursor.set({
        hour: startHm.hour,
        minute: startHm.minute,
        second: 0,
        millisecond: 0,
      });
      const dayEnd = cursor.set({
        hour: endHm.hour,
        minute: endHm.minute,
        second: 0,
        millisecond: 0,
      });

      while (slotStart.plus({ minutes: durationMinutes }) <= dayEnd) {
        const slotEnd = slotStart.plus({ minutes: durationMinutes });
        const sUtc = slotStart.toUTC().toISO()!;
        const eUtc = slotEnd.toUTC().toISO()!;

        if (slotEnd.toJSDate() >= windowStart && slotStart.toJSDate() <= windowEnd) {
          if (!overlapsAny(sUtc, eUtc, effectiveBusy)) {
            slots.push({ start: sUtc, end: eUtc });
          }
        }
        slotStart = slotStart.plus({ minutes: SLOT_STEP_MIN });
      }
    }
    cursor = cursor.plus({ days: 1 });
  }

  return slots;
}

function overlapsAny(start: string, end: string, blocks: TimeBlock[]): boolean {
  for (const b of blocks) {
    if (start < b.end && end > b.start) return true;
  }
  return false;
}

/** Intersect free slots across multiple interviewers (all must be free). */
export function findOverlappingSlots(
  perInterviewer: FreeSlot[][],
  durationMinutes: number,
): FreeSlot[] {
  if (perInterviewer.length === 0) return [];
  if (perInterviewer.length === 1) return perInterviewer[0] ?? [];

  let overlap = perInterviewer[0] ?? [];
  for (let i = 1; i < perInterviewer.length; i++) {
    overlap = intersectSlots(overlap, perInterviewer[i] ?? [], durationMinutes);
    if (overlap.length === 0) break;
  }
  return overlap;
}

function intersectSlots(
  a: FreeSlot[],
  b: FreeSlot[],
  durationMinutes: number,
): FreeSlot[] {
  const result: FreeSlot[] = [];
  for (const sa of a) {
    for (const sb of b) {
      const start = sa.start > sb.start ? sa.start : sb.start;
      const end = sa.end < sb.end ? sa.end : sb.end;
      if (start >= end) continue;
      const startMs = new Date(start).getTime();
      const endMs = new Date(end).getTime();
      const durMs = durationMinutes * 60_000;
      if (endMs - startMs >= durMs) {
        const slotEnd = new Date(startMs + durMs).toISOString();
        result.push({ start, end: slotEnd });
      }
    }
  }
  return dedupeSlots(result);
}

function dedupeSlots(slots: FreeSlot[]): FreeSlot[] {
  const seen = new Set<string>();
  const out: FreeSlot[] = [];
  for (const s of slots.sort((x, y) => x.start.localeCompare(y.start))) {
    const key = s.start;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Score slots for ranking: prefer sooner, mid-morning, Tue-Thu. */
export function scoreSlot(
  startIso: string,
  timezone: string,
  urgency: "high" | "normal" = "normal",
): number {
  const dt = DateTime.fromISO(startIso, { zone: "utc" }).setZone(timezone);
  let score = 100;
  const hoursUntil = dt.diff(DateTime.now().setZone(timezone), "hours").hours;

  if (urgency === "high") {
    // For urgent roles prefer the soonest slots strongly.
    if (hoursUntil < 24) score += 20;
    else if (hoursUntil < 48) score += 10;
    else if (hoursUntil > 120) score -= 15;
  } else {
    if (hoursUntil < 24) score -= 30;
    else if (hoursUntil < 48) score -= 10;
  }

  const hour = dt.hour;
  if (hour >= 10 && hour <= 14) score += 15;
  if (hour < 9 || hour >= 17) score -= 20;
  const dow = dt.weekday;
  if (dow === 2 || dow === 3 || dow === 4) score += 10;
  if (dow === 1 || dow === 5) score += 5;
  return score;
}

export function rankSlots(
  slots: FreeSlot[],
  timezone: string,
  urgency: "high" | "normal" = "normal",
): FreeSlot[] {
  return [...slots].sort(
    (a, b) => scoreSlot(b.start, timezone, urgency) - scoreSlot(a.start, timezone, urgency),
  );
}
