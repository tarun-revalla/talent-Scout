-- Interviewers with public iCal calendar URLs per job

create table if not exists interviewers (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  name text not null,
  email text not null,
  calendar_ical_url text not null,
  timezone text not null default 'America/New_York',
  working_hours jsonb not null default '{"start":"09:00","end":"17:00","days":[1,2,3,4,5]}'::jsonb,
  round_index int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists interviewers_job_id_idx on interviewers(job_id);

create table if not exists calendar_cache (
  interviewer_id uuid primary key references interviewers(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  busy_blocks jsonb not null default '[]'::jsonb
);
