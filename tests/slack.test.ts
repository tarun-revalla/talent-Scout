import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildApprovalBlocks, buildScorecardRequestBlocks } from "../lib/slack";

describe("slack", () => {
  it("builds single-slot approval blocks with yes and no", () => {
    const blocks = buildApprovalBlocks({
      candidateName: "Avery Candidate",
      jobTitle: "Senior Engineer",
      roundName: "Technical",
      slots: [{ start: "2026-06-24T15:00:00.000Z", label: "Wed, Jun 24 · 11:00 AM" }],
      durationMinutes: 60,
      respondUrl: "https://example.test/schedule/respond/tok123",
      responseToken: "tok123",
      origin: "https://example.test",
    });

    const actions = blocks
      .filter((block) => block.type === "actions")
      .flatMap((block) => (block.elements as Record<string, unknown>[]) ?? []);

    assert.equal(actions.length, 2);
    assert.ok(actions.some((action) => action.action_id === "approve_interview"));
    assert.ok(actions.some((action) => action.action_id === "reject_interview"));
    assert.ok(
      (actions.find((action) => action.action_id === "approve_interview")?.text as { text?: string })
        ?.text?.includes("Yes"),
    );
    assert.ok(
      actions.every((action) => action.url == null),
      "approval buttons should be interactive, not URL links",
    );
  });

  it("builds multi-slot approval blocks with one button per slot plus none work", () => {
    const blocks = buildApprovalBlocks({
      candidateName: "Avery Candidate",
      jobTitle: "Senior Engineer",
      roundName: "Technical",
      slots: [
        { start: "2026-06-24T15:00:00.000Z", label: "Wed 11am" },
        { start: "2026-06-24T18:00:00.000Z", label: "Wed 2pm" },
        { start: "2026-06-25T15:00:00.000Z", label: "Thu 11am" },
      ],
      durationMinutes: 60,
      respondUrl: "https://example.test/schedule/respond/tok123",
      responseToken: "tok123",
      origin: "https://example.test",
    });

    const actions = blocks
      .filter((block) => block.type === "actions")
      .flatMap((block) => (block.elements as Record<string, unknown>[]) ?? []);

    assert.equal(actions.length, 4);
    assert.equal(
      actions.filter((action) => action.action_id === "approve_interview_slot").length,
      3,
    );
    assert.ok(actions.some((action) => action.action_id === "reject_interview"));
    assert.ok(
      actions.every((action) => action.url == null),
      "slot buttons should be interactive, not URL links",
    );
  });

  it("builds scorecard request blocks with full form and quick recommendation actions", () => {
    const blocks = buildScorecardRequestBlocks({
      candidateName: "Avery Candidate",
      jobTitle: "Senior Engineer",
      roundName: "Technical",
      scorecardUrl: "https://example.test/scorecard/tok123",
      responseToken: "tok123",
    });

    const actions = blocks
      .filter((block) => block.type === "actions")
      .flatMap((block) => (block.elements as Record<string, unknown>[]) ?? []);

    assert.ok(
      actions.some(
        (action) =>
          action.action_id === "open_scorecard" &&
          action.value === "tok123" &&
          action.url === "https://example.test/scorecard/tok123",
      ),
    );

    for (const actionId of [
      "scorecard_strong_yes",
      "scorecard_yes",
      "scorecard_no",
      "scorecard_strong_no",
    ]) {
      assert.ok(
        actions.some((action) => action.action_id === actionId && action.value === "tok123"),
        `${actionId} should carry the response token`,
      );
    }
  });
});
