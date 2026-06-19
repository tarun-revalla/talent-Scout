/** Cosine distance: 0 = identical, 1 = orthogonal, 2 = opposite. */
export function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

export function parseEmbedding(e: unknown): number[] {
  if (Array.isArray(e)) return e as number[];
  if (typeof e === "string") {
    try {
      const parsed = JSON.parse(e) as unknown;
      if (!Array.isArray(parsed)) throw new Error("embedding string is not an array");
      return parsed as number[];
    } catch (err) {
      throw new Error(
        `invalid embedding JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  throw new Error("invalid embedding type");
}

/** PostgREST accepts vector RPC args more reliably as a text literal. */
export function formatEmbeddingForRpc(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/** Canonical format for writing vectors to Supabase Postgres. */
export function embeddingForDb(embedding: number[]): string {
  return formatEmbeddingForRpc(embedding);
}
