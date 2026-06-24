import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDeterministicJobDigest, type DigestSnapshotJob } from "../lib/job-digest";

describe("job-digest", () => {
  it("prioritizes candidate questions and pending scorecards", () => {
    const snapshot: DigestSnapshotJob[] = [
      {
        job_id: "job-1",
        title: "Senior Engineer",
        status: "open",
        new_matches: 4,
        invite_applicants: 1,
        high_match_uncontacted: 3,
        awaiting_reply: 2,
        candidate_questions_pending: 1,
        interview_in_progress: 2,
        pending_scorecards: 2,
        queue_pending: 1,
      },
    ];

    const digest = buildDeterministicJobDigest(snapshot);

    assert.equal(digest.headline, "2 urgent recruiting actions");
    assert.deepEqual(
      digest.items.slice(0, 2).map((item) => item.priority),
      ["high", "high"],
    );
    assert.match(digest.items[0].action, /candidate question/);
    assert.match(digest.items[1].action, /pending scorecards/);
  });

  it("returns an empty digest when there are no open jobs", () => {
    const digest = buildDeterministicJobDigest([]);

    assert.equal(digest.headline, "No open jobs");
    assert.deepEqual(digest.items, []);
  });
});
