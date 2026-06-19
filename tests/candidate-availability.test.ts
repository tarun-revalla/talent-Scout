import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterCandidatesAvailableForJob,
  isCandidateReservedOnOtherJobs,
} from "../lib/candidate-availability";

describe("candidate-availability", () => {
  it("filterCandidatesAvailableForJob excludes reserved candidates", () => {
    const reserved = new Set(["c1", "c3"]);
    const rows = [
      { id: "c1", name: "A" },
      { id: "c2", name: "B" },
      { id: "c3", name: "C" },
    ];
    const out = filterCandidatesAvailableForJob(rows, reserved);
    assert.deepEqual(out.map((r) => r.id), ["c2"]);
  });

  it("isCandidateReservedOnOtherJobs checks set membership", () => {
    const reserved = new Set(["x"]);
    assert.equal(isCandidateReservedOnOtherJobs("x", reserved), true);
    assert.equal(isCandidateReservedOnOtherJobs("y", reserved), false);
  });
});
