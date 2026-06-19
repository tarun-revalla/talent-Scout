import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractEmailAddress } from "../lib/imap";

describe("imap", () => {
  it("extractEmailAddress parses display name format", () => {
    assert.equal(extractEmailAddress("Jane Doe <jane@example.com>"), "jane@example.com");
  });

  it("extractEmailAddress parses bare address", () => {
    assert.equal(extractEmailAddress("jane@example.com"), "jane@example.com");
  });
});
