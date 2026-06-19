import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterSlotsByIntent } from "../lib/scheduling-ai";

describe("scheduling-ai", () => {
  it("filterSlotsByIntent respects weekday preference", () => {
    const slots = [
      { start: "2026-06-09T14:00:00.000Z", end: "2026-06-09T15:00:00.000Z" },
      { start: "2026-06-10T14:00:00.000Z", end: "2026-06-10T15:00:00.000Z" },
    ];
    const filtered = filterSlotsByIntent(
      slots,
      {
        summary: "Wednesdays only",
        preferred_weekdays: [3],
        prefer_time_of_day: "any",
        earliest_date: null,
        latest_date: null,
      },
      "UTC",
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].start, "2026-06-10T14:00:00.000Z");
  });
});
