import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SHORTLIST_THRESHOLD,
  effectiveShortlistThreshold,
} from "../lib/matching-utils";

describe("matching-utils", () => {
  it("uses engage threshold when auto-engage is enabled", () => {
    assert.equal(effectiveShortlistThreshold(true, 72), 72);
  });

  it("uses default threshold when auto-engage is disabled", () => {
    assert.equal(effectiveShortlistThreshold(false, 72), DEFAULT_SHORTLIST_THRESHOLD);
    assert.equal(DEFAULT_SHORTLIST_THRESHOLD, 85);
  });
});
