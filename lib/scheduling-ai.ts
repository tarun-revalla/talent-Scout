import { DateTime } from "luxon";
import type { FreeSlot } from "./calendar/types";
import type { SchedulingIntent } from "./schemas";
import { parseSchedulingIntent, rerankSchedulingSlots } from "./llm";

/** Apply structured intent filters to slot list (no LLM). */
export function filterSlotsByIntent(
  slots: FreeSlot[],
  intent: SchedulingIntent,
  timezone: string,
): FreeSlot[] {
  return slots.filter((s) => {
    const dt = DateTime.fromISO(s.start, { zone: "utc" }).setZone(timezone);
    if (intent.preferred_weekdays?.length) {
      if (!intent.preferred_weekdays.includes(dt.weekday)) return false;
    }
    if (intent.prefer_time_of_day === "morning" && dt.hour >= 12) return false;
    if (intent.prefer_time_of_day === "afternoon" && dt.hour < 12) return false;
    if (intent.earliest_date) {
      const earliest = DateTime.fromISO(intent.earliest_date, { zone: timezone }).startOf("day");
      if (dt < earliest) return false;
    }
    if (intent.latest_date) {
      const latest = DateTime.fromISO(intent.latest_date, { zone: timezone }).endOf("day");
      if (dt > latest) return false;
    }
    return true;
  });
}

export function reorderByRank(slots: FreeSlot[], rankedStarts: string[]): FreeSlot[] {
  const map = new Map(slots.map((s) => [s.start, s]));
  const ordered: FreeSlot[] = [];
  for (const start of rankedStarts) {
    const slot = map.get(start);
    if (slot) ordered.push(slot);
  }
  for (const s of slots) {
    if (!ordered.some((o) => o.start === s.start)) ordered.push(s);
  }
  return ordered;
}

export async function refineSlotsWithAi(args: {
  slots: FreeSlot[];
  timezone: string;
  intentText?: string;
  candidateName?: string | null;
  jobTitle?: string;
  roundName?: string;
  jobId?: string;
  matchId?: string;
}): Promise<{ slots: FreeSlot[]; intent?: SchedulingIntent }> {
  if (!args.intentText?.trim()) {
    return { slots: args.slots };
  }

  const intent = await parseSchedulingIntent({
    text: args.intentText.trim(),
    timezone: args.timezone,
    usage: args.jobId
      ? { jobId: args.jobId, matchId: args.matchId, operation: "parse_scheduling_intent" }
      : { operation: "parse_scheduling_intent" },
  });

  let filtered = filterSlotsByIntent(args.slots, intent, args.timezone);
  if (filtered.length === 0) filtered = args.slots;

  if (filtered.length <= 1) {
    return { slots: filtered, intent };
  }

  const rank = await rerankSchedulingSlots({
    slots: filtered,
    candidateName: args.candidateName ?? null,
    jobTitle: args.jobTitle ?? "Interview",
    roundName: args.roundName ?? "Round",
    intentSummary: intent.summary,
    usage: args.jobId
      ? { jobId: args.jobId, matchId: args.matchId, operation: "rerank_scheduling_slots" }
      : { operation: "rerank_scheduling_slots" },
  });

  return {
    slots: reorderByRank(filtered, rank.ranked_starts),
    intent,
  };
}
