import { log } from "../logger";
import type { TimeBlock } from "./types";

const CACHE_TTL_MS = 5 * 60 * 1000;

/** Validate that a URL looks like a fetchable calendar feed. */
export function isValidCalendarUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize Google Calendar share links into a fetchable iCal URL.
 * Supports web UI links (?cid=base64email) and already-valid .ics feeds.
 */
export function normalizeGoogleCalendarUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed);
    if (!u.hostname.includes("calendar.google.com")) return trimmed;

    if (u.pathname.includes("/ical/") && trimmed.endsWith(".ics")) {
      return trimmed;
    }

    const cid = u.searchParams.get("cid");
    if (cid) {
      let calendarId = cid;
      try {
        calendarId = Buffer.from(cid, "base64").toString("utf8");
      } catch {
        // cid may already be plain email / calendar id
      }
      const encoded = encodeURIComponent(calendarId);
      return `https://calendar.google.com/calendar/ical/${encoded}/public/basic.ics`;
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

/** Build Google Calendar public iCal URL from a workspace email. */
export function googleCalendarIcalUrlFromEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) {
    throw new Error("Valid email required");
  }
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(normalized)}/public/basic.ics`;
}

/** Read X-WR-TIMEZONE from Google Calendar iCal exports. */
export function parseTimezoneFromIcal(icalText: string): string | null {
  const match = icalText.match(/^X-WR-TIMEZONE:(.+)$/m);
  const tz = match?.[1]?.trim();
  if (!tz) return null;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

export interface ResolvedCalendar {
  icalUrl: string;
  timezone: string | null;
  reachable: boolean;
}

export async function fetchIcalText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "TalentScout/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Calendar fetch failed (${res.status})`);
  return res.text();
}

/** Normalize URL and read timezone from the feed header. */
export async function resolveCalendarFromUrl(
  url: string,
): Promise<ResolvedCalendar> {
  const icalUrl = normalizeGoogleCalendarUrl(url);
  try {
    const text = await fetchIcalText(icalUrl);
    return { icalUrl, timezone: parseTimezoneFromIcal(text), reachable: true };
  } catch {
    return { icalUrl, timezone: null, reachable: false };
  }
}

/** Derive iCal URL from email and verify the public feed is reachable. */
export async function resolveCalendarFromEmail(email: string): Promise<ResolvedCalendar> {
  const icalUrl = googleCalendarIcalUrlFromEmail(email);
  return resolveCalendarFromUrl(icalUrl);
}

/** Unfold RFC 5545 line continuations. */
function unfoldIcal(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

/** Parse iCal DTSTART/DTEND value to Date (UTC Z suffix or floating local). */
function parseIcalDateTime(raw: string): Date | null {
  const value = raw.trim();
  if (!value) return null;

  // ISO-style from some feeds: 2026-06-10T14:00:00Z
  if (value.includes("-")) {
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  // All-day: YYYYMMDD
  if (/^\d{8}$/.test(value)) {
    const y = value.slice(0, 4);
    const mo = value.slice(4, 6);
    const d = value.slice(6, 8);
    const dt = new Date(`${y}-${mo}-${d}T00:00:00.000Z`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  // YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ? ".000Z" : ""}`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function propertyValue(body: string, name: string): string | null {
  const re = new RegExp(`^${name}(?:;[^:]*)?:(.+)$`, "m");
  return body.match(re)?.[1]?.trim() ?? null;
}

function toIso(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Parse iCal text into busy blocks within [windowStart, windowEnd]. */
export function parseBusyBlocks(
  icalText: string,
  windowStart: Date,
  windowEnd: Date,
): TimeBlock[] {
  const unfolded = unfoldIcal(icalText);
  const blocks: TimeBlock[] = [];
  const eventRe = /BEGIN:VEVENT[\s\S]*?END:VEVENT/g;

  for (const segment of unfolded.match(eventRe) ?? []) {
    const body = segment;
    const startRaw = propertyValue(body, "DTSTART");
    if (!startRaw) continue;

    const start = parseIcalDateTime(startRaw);
    let end = parseIcalDateTime(propertyValue(body, "DTEND") ?? "");
    if (!start) continue;

    // All-day end dates are exclusive in iCal
    if (/^\d{8}$/.test(startRaw.trim()) && end) {
      end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    }
    if (!end) end = new Date(start.getTime() + 60 * 60 * 1000);

    if (end <= windowStart || start >= windowEnd) continue;
    const clampedStart = start < windowStart ? windowStart : start;
    const clampedEnd = end > windowEnd ? windowEnd : end;
    const s = toIso(clampedStart);
    const e = toIso(clampedEnd);
    if (s && e && s < e) blocks.push({ start: s, end: e });
  }

  return mergeOverlapping(blocks);
}

export function mergeOverlapping(blocks: TimeBlock[]): TimeBlock[] {
  if (blocks.length === 0) return [];
  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
  const merged: TimeBlock[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= prev.end) {
      if (cur.end > prev.end) prev.end = cur.end;
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

export interface CachedBusyResult {
  blocks: TimeBlock[];
  fetchedAt: string;
  fromCache: boolean;
}

/** Fetch busy blocks, optionally using a DB cache row. */
export async function getBusyBlocks(
  icalUrl: string,
  windowStart: Date,
  windowEnd: Date,
  cached?: { blocks: TimeBlock[]; fetchedAt: string } | null,
): Promise<CachedBusyResult> {
  const now = Date.now();
  if (cached && now - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
    return { blocks: cached.blocks, fetchedAt: cached.fetchedAt, fromCache: true };
  }
  try {
    const text = await fetchIcalText(icalUrl);
    const blocks = parseBusyBlocks(text, windowStart, windowEnd);
    const fetchedAt = new Date().toISOString();
    return { blocks, fetchedAt, fromCache: false };
  } catch (err) {
    log.warn({ err, url: icalUrl }, "ical fetch failed");
    if (cached) {
      return { blocks: cached.blocks, fetchedAt: cached.fetchedAt, fromCache: true };
    }
    throw err instanceof Error ? err : new Error("Calendar unavailable");
  }
}
