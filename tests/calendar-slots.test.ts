import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mergeOverlapping,
  normalizeGoogleCalendarUrl,
  parseBusyBlocks,
  parseTimezoneFromIcal,
  googleCalendarIcalUrlFromEmail,
} from "../lib/calendar/ical";
import { findOverlappingSlots, scoreSlot } from "../lib/calendar/slots";

describe("calendar slots", () => {
  it("mergeOverlapping merges adjacent blocks", () => {
    const merged = mergeOverlapping([
      { start: "2026-06-10T10:00:00.000Z", end: "2026-06-10T11:00:00.000Z" },
      { start: "2026-06-10T11:00:00.000Z", end: "2026-06-10T12:00:00.000Z" },
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].start, "2026-06-10T10:00:00.000Z");
    assert.equal(merged[0].end, "2026-06-10T12:00:00.000Z");
  });

  it("findOverlappingSlots returns intersection", () => {
    const a = [
      { start: "2026-06-10T14:00:00.000Z", end: "2026-06-10T15:00:00.000Z" },
      { start: "2026-06-11T14:00:00.000Z", end: "2026-06-11T15:00:00.000Z" },
    ];
    const b = [
      { start: "2026-06-10T14:00:00.000Z", end: "2026-06-10T15:00:00.000Z" },
    ];
    const overlap = findOverlappingSlots([a, b], 60);
    assert.equal(overlap.length, 1);
    assert.equal(overlap[0].start, "2026-06-10T14:00:00.000Z");
  });

  it("scoreSlot returns a number", () => {
    const s = scoreSlot("2026-06-12T15:00:00.000Z", "America/New_York");
    assert.equal(typeof s, "number");
  });

  it("normalizeGoogleCalendarUrl converts cid web links to iCal feed", () => {
    const url = normalizeGoogleCalendarUrl(
      "https://calendar.google.com/calendar/u/0?cid=cnRhcnVuQHlleHQuY29t",
    );
    assert.equal(
      url,
      "https://calendar.google.com/calendar/ical/rtarun%40yext.com/public/basic.ics",
    );
  });

  it("parseTimezoneFromIcal reads X-WR-TIMEZONE", () => {
    const tz = parseTimezoneFromIcal(
      "BEGIN:VCALENDAR\nX-WR-TIMEZONE:Asia/Kolkata\nEND:VCALENDAR",
    );
    assert.equal(tz, "Asia/Kolkata");
  });

  it("googleCalendarIcalUrlFromEmail builds public feed URL", () => {
    assert.equal(
      googleCalendarIcalUrlFromEmail("rtarun@yext.com"),
      "https://calendar.google.com/calendar/ical/rtarun%40yext.com/public/basic.ics",
    );
  });

  it("parseBusyBlocks extracts VEVENT busy times", () => {
    const ical = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTSTART:2026-06-10T14:00:00Z",
      "DTEND:2026-06-10T15:00:00Z",
      "SUMMARY:Busy",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const windowStart = new Date("2026-06-01T00:00:00Z");
    const windowEnd = new Date("2026-06-30T00:00:00Z");
    const blocks = parseBusyBlocks(ical, windowStart, windowEnd);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].start, "2026-06-10T14:00:00.000Z");
    assert.equal(blocks[0].end, "2026-06-10T15:00:00.000Z");
  });
});
