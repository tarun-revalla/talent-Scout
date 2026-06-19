-- Memoize deterministic LLM calls (resume/JD parsing, embeddings) by content hash.
--
-- These operations are pure functions of (input text, model, prompt version):
-- the same resume re-uploaded, or the same JD re-parsed, yields the same result.
-- Caching the result lets us skip the OpenAI round-trip entirely on a repeat,
-- which is a full token saving (not just the prompt-cache discount).

create table if not exists llm_parse_cache (
  id uuid primary key default gen_random_uuid(),
  operation text not null,        -- e.g. parse_resume, parse_jd, embed
  model text not null,            -- model the result was produced with
  prompt_version int not null default 1, -- bump to invalidate when the prompt changes
  input_hash text not null,       -- sha256 of the exact input string sent to the model
  result jsonb not null,          -- the parsed object / embedding vector
  created_at timestamptz not null default now(),
  last_hit_at timestamptz not null default now(),
  hit_count int not null default 0,
  unique (operation, model, prompt_version, input_hash)
);

create index if not exists idx_llm_parse_cache_lookup
  on llm_parse_cache (operation, model, prompt_version, input_hash);

-- Service-role only (API routes + worker). No client policies → blocked from
-- PostgREST via the anon key, consistent with other sensitive tables (see 0024).
alter table public.llm_parse_cache enable row level security;

-- Track prompt-cache hits so analytics can credit the discount on cached input
-- tokens. OpenAI auto-caches identical prompt prefixes >1024 tokens and bills
-- those tokens at a reduced rate; we were previously costing them at full price.
alter table public.llm_usage
  add column if not exists cached_prompt_tokens int not null default 0;
