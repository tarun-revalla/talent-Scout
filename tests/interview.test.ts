import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeReEligibleAfter,
  isCoolingPeriodActive,
  shouldAutoCloseJob,
} from "../lib/interview";
import { defaultRoundsForLevel } from "../lib/interview-defaults";

describe("interview", () => {
  it("isCoolingPeriodActive returns true before re_eligible_after", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    assert.equal(isCoolingPeriodActive(future), true);
    assert.equal(isCoolingPeriodActive(null), false);
  });

  it("computeReEligibleAfter adds months", () => {
    const rejected = new Date("2026-01-15T12:00:00.000Z");
    const eligible = computeReEligibleAfter(rejected, 6);
    assert.equal(new Date(eligible).getUTCMonth(), 6);
  });

  it("shouldAutoCloseJob when hired count reaches target", () => {
    assert.equal(shouldAutoCloseJob(0, 2), false);
    assert.equal(shouldAutoCloseJob(1, 2), false);
    assert.equal(shouldAutoCloseJob(2, 2), true);
    assert.equal(shouldAutoCloseJob(3, 2), true);
  });

  it("defaultRoundsForLevel returns more rounds for senior roles", () => {
    const junior = defaultRoundsForLevel("junior");
    const senior = defaultRoundsForLevel("senior");
    assert.ok(senior.length >= junior.length);
    assert.ok(senior.some((r) => r.type === "system_design"));
  });
});
