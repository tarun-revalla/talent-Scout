-- Job invite links + application funnel analytics

alter table jobs
  add column if not exists invite_token text,
  add column if not exists invite_enabled boolean not null default true;

-- gen_random_uuid() is built-in; gen_random_bytes requires pgcrypto (not always enabled)
update jobs
set invite_token = replace(gen_random_uuid()::text, '-', '')
where invite_token is null;

alter table jobs alter column invite_token set not null;

create unique index if not exists idx_jobs_invite_token on jobs (invite_token);

create table if not exists job_invite_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  visitor_id text not null,
  event_type text not null check (event_type in ('open', 'started', 'completed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_invite_events_job_type on job_invite_events (job_id, event_type);
create index if not exists idx_invite_events_job_visitor on job_invite_events (job_id, visitor_id, event_type);
