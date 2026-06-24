import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildScorecardRequestBlocks } from "../lib/slack";

describe("slack", () => {
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
