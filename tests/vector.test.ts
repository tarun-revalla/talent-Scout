import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cosineDistance, formatEmbeddingForRpc, parseEmbedding } from "../lib/vector";

describe("vector", () => {
  it("cosineDistance returns 0 for identical vectors", () => {
    const v = [1, 0, 0];
    assert.equal(cosineDistance(v, v), 0);
  });

  it("cosineDistance returns 1 for orthogonal vectors", () => {
    assert.equal(cosineDistance([1, 0, 0], [0, 1, 0]), 1);
  });

  it("parseEmbedding accepts arrays and JSON strings", () => {
    assert.deepEqual(parseEmbedding([1, 2]), [1, 2]);
    assert.deepEqual(parseEmbedding("[3,4]"), [3, 4]);
  });

  it("formatEmbeddingForRpc produces pgvector text literal", () => {
    assert.equal(formatEmbeddingForRpc([1, 2.5, 3]), "[1,2.5,3]");
  });
});
