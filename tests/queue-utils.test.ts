import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_QUEUE_ATTEMPTS,
  computeRetryDelaySec,
  shouldRetryQueueJob,
} from "../lib/queue-utils";

describe("queue-utils", () => {
  it("shouldRetryQueueJob respects max attempts", () => {
    assert.equal(shouldRetryQueueJob(1), true);
    assert.equal(shouldRetryQueueJob(MAX_QUEUE_ATTEMPTS - 1), true);
    assert.equal(shouldRetryQueueJob(MAX_QUEUE_ATTEMPTS), false);
  });

  it("computeRetryDelaySec uses exponential backoff capped at 300s", () => {
    assert.equal(computeRetryDelaySec(1), 5);
    assert.equal(computeRetryDelaySec(2), 10);
    assert.equal(computeRetryDelaySec(3), 20);
    assert.equal(computeRetryDelaySec(4), 40);
    assert.equal(computeRetryDelaySec(5), 80);
    assert.equal(computeRetryDelaySec(10), 300);
  });
});
