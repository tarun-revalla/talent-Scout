import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildIcsEvent } from "../lib/calendar/ics-generate";

describe("ics-generate", () => {
  it("buildIcsEvent produces valid VCALENDAR structure", () => {
    const ics = buildIcsEvent({
      uid: "test-uid@talentscout",
      start: "2026-06-15T14:00:00.000Z",
      end: "2026-06-15T15:00:00.000Z",
      summary: "Engineer Interview",
      description: "Technical round",
      organizerEmail: "recruiter@example.com",
      organizerName: "Talent Team",
      attendeeEmail: "candidate@example.com",
      attendeeName: "Jane Doe",
    });
    assert.match(ics, /^BEGIN:VCALENDAR/);
    assert.match(ics, /BEGIN:VEVENT/);
    assert.match(ics, /UID:test-uid@talentscout/);
    assert.match(ics, /END:VEVENT/);
    assert.match(ics, /END:VCALENDAR/);
  });
});
