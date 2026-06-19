import { supabaseServer } from "./db";
import { getBusyBlocks } from "./calendar/ical";
import { computeFreeSlots, findOverlappingSlots, rankSlots } from "./calendar/slots";
import type { FreeSlot, TimeBlock, WorkingHours } from "./calendar/types";
import { DEFAULT_WORKING_HOURS } from "./calendar/types";
import { resolveCalendarFromEmail, resolveCalendarFromUrl } from "./calendar/ical";

export interface InterviewerRow {
  id: string;
  job_id: string;
  name: string;
  email: string;
  calendar_ical_url: string;
  timezone: string;
  working_hours: WorkingHours;
  round_index: number | null;
  buffer_minutes: number;
  slack_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateInterviewerInput {
  name: string;
  email: string;
  /** Optional override; otherwise derived from email. */
  calendarIcalUrl?: string;
  timezone?: string;
  workingHours?: WorkingHours;
  roundIndex?: number | null;
  bufferMinutes?: number;
  slackUserId?: string | null;
}

function rowToInterviewer(r: Record<string, unknown>): InterviewerRow {
  const wh = r.working_hours as WorkingHours | null;
  return {
    id: r.id as string,
    job_id: r.job_id as string,
    name: r.name as string,
    email: r.email as string,
    calendar_ical_url: r.calendar_ical_url as string,
    timezone: (r.timezone as string) ?? "America/New_York",
    working_hours: wh ?? DEFAULT_WORKING_HOURS,
    round_index: (r.round_index as number | null) ?? null,
    buffer_minutes: (r.buffer_minutes as number | null) ?? 15,
    slack_user_id: (r.slack_user_id as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

export async function listInterviewers(jobId: string): Promise<InterviewerRow[]> {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("interviewers")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToInterviewer);
}

export async function getInterviewer(id: string): Promise<InterviewerRow | null> {
  const sb = supabaseServer();
  const { data, error } = await sb.from("interviewers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToInterviewer(data) : null;
}

export async function createInterviewer(
  jobId: string,
  input: CreateInterviewerInput,
): Promise<InterviewerRow> {
  if (!input.name.trim()) throw new Error("Name is required");
  if (!input.email.trim() || !input.email.includes("@")) throw new Error("Valid email required");

  const email = input.email.trim().toLowerCase();
  const resolved = input.calendarIcalUrl?.trim()
    ? await resolveCalendarFromUrl(input.calendarIcalUrl.trim())
    : await resolveCalendarFromEmail(email);

  if (!resolved.reachable) {
    throw new Error(
      "Could not read this Google Calendar — make sure it is public " +
        "(Settings → your calendar → Access permissions → Make available to public)",
    );
  }

  const timezone = input.timezone?.trim() || resolved.timezone;
  if (!timezone) {
    throw new Error("Timezone could not be read from the calendar — please enter it manually");
  }

  const sb = supabaseServer();
  const { data, error } = await sb
    .from("interviewers")
    .insert({
      job_id: jobId,
      name: input.name.trim(),
      email,
      calendar_ical_url: resolved.icalUrl,
      timezone,
      working_hours: input.workingHours ?? DEFAULT_WORKING_HOURS,
      round_index: input.roundIndex ?? null,
      buffer_minutes: input.bufferMinutes ?? 15,
      slack_user_id: input.slackUserId ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToInterviewer(data);
}

export async function updateInterviewer(
  id: string,
  patch: Partial<CreateInterviewerInput>,
): Promise<InterviewerRow> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name != null) updates.name = patch.name.trim();
  if (patch.email != null) {
    const email = patch.email.trim().toLowerCase();
    updates.email = email;
    const resolved = await resolveCalendarFromEmail(email);
    if (!resolved.reachable) {
      throw new Error(
        "Could not read this Google Calendar — make sure it is public",
      );
    }
    updates.calendar_ical_url = resolved.icalUrl;
    if (patch.timezone == null && resolved.timezone) {
      updates.timezone = resolved.timezone;
    }
  }
  if (patch.calendarIcalUrl != null && patch.email == null) {
    const resolved = await resolveCalendarFromUrl(patch.calendarIcalUrl.trim());
    updates.calendar_ical_url = resolved.icalUrl;
    if (patch.timezone == null && resolved.timezone) {
      updates.timezone = resolved.timezone;
    }
  }
  if (patch.timezone != null) updates.timezone = patch.timezone;
  if (patch.workingHours != null) updates.working_hours = patch.workingHours;
  if (patch.roundIndex !== undefined) updates.round_index = patch.roundIndex;
  if (patch.bufferMinutes !== undefined) updates.buffer_minutes = patch.bufferMinutes;
  if (patch.slackUserId !== undefined) updates.slack_user_id = patch.slackUserId;

  const sb = supabaseServer();
  const { data, error } = await sb
    .from("interviewers")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (patch.calendarIcalUrl != null || patch.email != null) {
    await sb.from("calendar_cache").delete().eq("interviewer_id", id);
  }
  return rowToInterviewer(data);
}

export async function deleteInterviewer(id: string): Promise<void> {
  const sb = supabaseServer();
  const { error } = await sb.from("interviewers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function loadCache(interviewerId: string): Promise<{ blocks: TimeBlock[]; fetchedAt: string } | null> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("calendar_cache")
    .select("busy_blocks, fetched_at")
    .eq("interviewer_id", interviewerId)
    .maybeSingle();
  if (!data) return null;
  return {
    blocks: (data.busy_blocks as TimeBlock[]) ?? [],
    fetchedAt: data.fetched_at as string,
  };
}

async function saveCache(interviewerId: string, blocks: TimeBlock[], fetchedAt: string): Promise<void> {
  const sb = supabaseServer();
  await sb.from("calendar_cache").upsert({
    interviewer_id: interviewerId,
    busy_blocks: blocks,
    fetched_at: fetchedAt,
  });
}

export async function getInterviewerAvailability(
  interviewerId: string,
  durationMinutes: number,
  daysAhead = 14,
): Promise<{ slots: FreeSlot[]; timezone: string; name: string }> {
  const interviewer = await getInterviewer(interviewerId);
  if (!interviewer) throw new Error("Interviewer not found");

  const windowStart = new Date();
  const windowEnd = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

  const cached = await loadCache(interviewerId);
  const { blocks, fetchedAt, fromCache } = await getBusyBlocks(
    interviewer.calendar_ical_url,
    windowStart,
    windowEnd,
    cached,
  );
  if (!fromCache) {
    await saveCache(interviewerId, blocks, fetchedAt);
  }

  const slots = computeFreeSlots(
    blocks,
    interviewer.timezone,
    interviewer.working_hours,
    durationMinutes,
    windowStart,
    windowEnd,
    interviewer.buffer_minutes,
  );

  return {
    slots: rankSlots(slots, interviewer.timezone),
    timezone: interviewer.timezone,
    name: interviewer.name,
  };
}

export async function getOverlapAvailability(
  interviewerIds: string[],
  durationMinutes: number,
  daysAhead = 14,
): Promise<{ slots: FreeSlot[]; interviewers: { id: string; name: string; timezone: string }[] }> {
  if (interviewerIds.length === 0) throw new Error("Select at least one interviewer");

  const perInterviewer: FreeSlot[][] = [];
  const meta: { id: string; name: string; timezone: string }[] = [];

  for (const id of interviewerIds) {
    const { slots, timezone, name } = await getInterviewerAvailability(id, durationMinutes, daysAhead);
    perInterviewer.push(slots);
    meta.push({ id, name, timezone });
  }

  const overlap = findOverlappingSlots(perInterviewer, durationMinutes);
  const tz = meta[0]?.timezone ?? "America/New_York";
  return { slots: rankSlots(overlap, tz), interviewers: meta };
}
