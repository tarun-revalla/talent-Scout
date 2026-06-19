import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimateLlmCostUsd, formatUsdCost } from "../lib/llm-pricing";

describe("llm-pricing", () => {
  it("estimateLlmCostUsd uses model-specific rates", () => {
    const mini = estimateLlmCostUsd({
      model: "gpt-4o-mini",
      prompt_tokens: 1_000_000,
      completion_tokens: 0,
    });
    assert.equal(mini, 0.15);

    const embed = estimateLlmCostUsd({
      model: "text-embedding-3-small",
      prompt_tokens: 1_000_000,
      completion_tokens: 0,
    });
    assert.equal(embed, 0.02);
  });

  it("estimateLlmCostUsd discounts prompt-cache hits", () => {
    // Half the 1M prompt tokens served from cache: 500k @ $2.50 + 500k @ $1.25.
    const cost = estimateLlmCostUsd({
      model: "gpt-4o",
      prompt_tokens: 1_000_000,
      completion_tokens: 0,
      cached_prompt_tokens: 500_000,
    });
    assert.equal(cost, 1.25 + 0.625);
  });

  it("formatUsdCost shows small amounts with extra precision", () => {
    assert.equal(formatUsdCost(1.234), "$1.23");
    assert.equal(formatUsdCost(0.042), "$0.042");
  });
});
