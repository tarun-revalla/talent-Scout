-- Track OpenAI token usage per job (and optionally per match).
create table if not exists llm_usage (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  match_id uuid references matches(id) on delete set null,
  operation text not null,
  model text not null,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  total_tokens int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_llm_usage_job on llm_usage (job_id);
create index if not exists idx_llm_usage_created on llm_usage (created_at desc);
