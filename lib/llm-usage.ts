import { supabaseServer } from "./db";
import { log } from "./logger";

export type LlmUsageContext = {
  jobId?: string | null;
  matchId?: string | null;
  operation: string;
};

type UsagePayload = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** OpenAI reports how many prompt tokens were served from its prompt cache. */
  prompt_tokens_details?: { cached_tokens?: number } | null;
};

export function recordLlmUsage(
  ctx: LlmUsageContext,
  model: string,
  usage: UsagePayload | null | undefined,
): void {
  if (!usage) return;

  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const cachedPromptTokens = Math.min(
    usage.prompt_tokens_details?.cached_tokens ?? 0,
    promptTokens,
  );
  const totalTokens =
    usage.total_tokens ?? promptTokens + completionTokens;
  if (totalTokens <= 0) return;

  const sb = supabaseServer();
  void sb
    .from("llm_usage")
    .insert({
      job_id: ctx.jobId ?? null,
      match_id: ctx.matchId ?? null,
      operation: ctx.operation,
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cached_prompt_tokens: cachedPromptTokens,
      total_tokens: totalTokens,
    })
    .then(({ error }) => {
      if (error) {
        log.warn(
          { err: error.message, operation: ctx.operation, jobId: ctx.jobId },
          "llm-usage: insert failed",
        );
      }
    });
}
