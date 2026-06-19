import { DateTime } from "luxon";

export interface IcsEventArgs {
  uid: string;
  start: string;
  end: string;
  summary: string;
  description: string;
  organizerEmail: string;
  organizerName: string;
  attendeeEmail: string;
  attendeeName?: string | null;
}

function formatIcsDate(iso: string): string {
  return DateTime.fromISO(iso, { zone: "utc" }).toFormat("yyyyMMdd'T'HHmmss'Z'");
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Build a minimal RFC 5545 VEVENT for email attachment. */
export function buildIcsEvent(args: IcsEventArgs): string {
  const now = DateTime.utc().toFormat("yyyyMMdd'T'HHmmss'Z'");
  const dtStart = formatIcsDate(args.start);
  const dtEnd = formatIcsDate(args.end);
  const attendee = args.attendeeName
    ? `CN=${escapeIcs(args.attendeeName)}:mailto:${args.attendeeEmail}`
    : `mailto:${args.attendeeEmail}`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Talent Scout//Interview Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${args.uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcs(args.summary)}`,
    `DESCRIPTION:${escapeIcs(args.description)}`,
    `ORGANIZER;CN=${escapeIcs(args.organizerName)}:mailto:${args.organizerEmail}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;${attendee}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
