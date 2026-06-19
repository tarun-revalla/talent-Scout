import { createHash } from "node:crypto";
import { supabaseServer } from "./db";
import { log } from "./logger";

/**
 * Memoize a deterministic LLM call by content hash.
 *
 * For pure operations — resume/JD parsing, embeddings — the result is a function
 * of (input, model, promptVersion). On a cache hit we skip the OpenAI round-trip
 * entirely (a full token saving), so `compute` is only run on a miss.
 *
 * The cache is best-effort: any DB error degrades to computing fresh rather than
 * failing the request. Bump `promptVersion` whenever the system prompt or schema
 * changes, so stale results are not served.
 */
export async function withLlmCache<T>(args: {
  operation: string;
  model: string;
  promptVersion: number;
  /** The exact input string sent to the model (already trimmed/normalized). */
  input: string;
  compute: () => Promise<T>;
}): Promise<T> {
  const inputHash = createHash("sha256").update(args.input).digest("hex");
  const sb = supabaseServer();

  try {
    const { data } = await sb
      .from("llm_parse_cache")
      .select("id, result, hit_count")
      .eq("operation", args.operation)
      .eq("model", args.model)
      .eq("prompt_version", args.promptVersion)
      .eq("input_hash", inputHash)
      .maybeSingle();
    if (data?.result != null) {
      // Best-effort hit bookkeeping; never block on it.
      void sb
        .from("llm_parse_cache")
        .update({
          hit_count: (data.hit_count as number) + 1,
          last_hit_at: new Date().toISOString(),
        })
        .eq("id", data.id)
        .then(({ error }) => {
          if (error) log.warn({ err: error.message }, "llm-cache: hit bookkeeping failed");
        });
      return data.result as T;
    }
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), operation: args.operation },
      "llm-cache: read failed; computing fresh",
    );
  }

  const result = await args.compute();

  try {
    await sb.from("llm_parse_cache").upsert(
      {
        operation: args.operation,
        model: args.model,
        prompt_version: args.promptVersion,
        input_hash: inputHash,
        result: result as unknown as Record<string, unknown>,
      },
      { onConflict: "operation,model,prompt_version,input_hash" },
    );
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), operation: args.operation },
      "llm-cache: write failed",
    );
  }

  return result;
}
