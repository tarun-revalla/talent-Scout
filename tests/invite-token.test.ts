import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildInviteUrl, generateInviteToken } from "../lib/invite-token";

describe("invite-token", () => {
  it("generates URL-safe tokens of consistent length", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    assert.equal(a.length, b.length);
    assert.notEqual(a, b);
    assert.match(a, /^[A-Za-z0-9_-]+$/);
  });

  it("buildInviteUrl strips trailing slash from origin", () => {
    assert.equal(
      buildInviteUrl("abc123", "https://example.com/"),
      "https://example.com/apply/abc123",
    );
  });
});
