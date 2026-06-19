-- Talent Scout — initial schema
create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  raw_jd text not null,
  parsed_jd jsonb,
  embedding vector(1536),
  weights jsonb not null default '{"match":0.5,"interest":0.5}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  source text,
  raw_text text,
  parsed_profile jsonb,
  resume_url text,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete cascade,
  match_score numeric,
  match_explanation jsonb,
  status text not null default 'discovered',
  rounds_sent int not null default 0,
  interest_score numeric,
  interest_breakdown jsonb,
  combined_score numeric generated always as
    (coalesce(match_score, 0) * 0.5 + coalesce(interest_score, 0) * 0.5) stored,
  thread_id text,
  last_action_at timestamptz,
  unique (job_id, candidate_id)
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  direction text not null check (direction in ('out', 'in')),
  subject text,
  body text,
  message_id text,
  in_reply_to text,
  sent_at timestamptz,
  received_at timestamptz,
  llm_analysis jsonb
);

create table if not exists outreach_queue (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  action text not null check (action in ('send_initial', 'send_followup', 'finalize_score')),
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts int not null default 0,
  last_error text,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_jobs_embedding on jobs using ivfflat (embedding vector_cosine_ops) with (lists = 50);
create index if not exists idx_candidates_embedding on candidates using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists idx_outreach_queue_pending on outreach_queue (status, scheduled_for) where status = 'pending';
create index if not exists idx_matches_ranking on matches (job_id, combined_score desc);
create index if not exists idx_conversations_match on conversations (match_id, sent_at desc, received_at desc);
create index if not exists idx_conversations_message_id on conversations (message_id);

-- Storage bucket for resume PDFs (created via Supabase dashboard or CLI):
-- supabase storage create resumes --public=false
