/**
 * OpenAI standard API rates per 1M tokens (USD).
 * `cachedInput` is the discounted rate for prompt tokens served from OpenAI's
 * prompt cache (identical prompt prefixes >1024 tokens are billed at 50%).
 */
const RATES_PER_MILLION: Record<
  string,
  { input: number; cachedInput: number; output: number }
> = {
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10 },
  "gpt-4o-2024-11-20": { input: 2.5, cachedInput: 1.25, output: 10 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
  "text-embedding-3-small": { input: 0.02, cachedInput: 0.02, output: 0 },
};

const FALLBACK_RATES = { input: 0.15, cachedInput: 0.075, output: 0.6 };

export function estimateLlmCostUsd(row: {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  /** Prompt tokens served from OpenAI's prompt cache, billed at the discounted rate. */
  cached_prompt_tokens?: number;
}): number {
  const rates = RATES_PER_MILLION[row.model] ?? FALLBACK_RATES;
  const cached = Math.min(row.cached_prompt_tokens ?? 0, row.prompt_tokens);
  const uncachedInput = row.prompt_tokens - cached;
  return (
    (uncachedInput / 1_000_000) * rates.input +
    (cached / 1_000_000) * rates.cachedInput +
    (row.completion_tokens / 1_000_000) * rates.output
  );
}

export function formatUsdCost(amount: number): string {
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(4)}`;
}
