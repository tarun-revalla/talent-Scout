-- Interview loop configuration per job + per-match progress (scheduling excluded for now).

alter table jobs
  add column if not exists interview_rounds jsonb not null default '[]'::jsonb,
  add column if not exists cooling_period_months int not null default 6
    check (cooling_period_months >= 1 and cooling_period_months <= 24);

alter table matches
  add column if not exists interview_state text not null default 'not_started',
  add column if not exists current_round_index int not null default 0,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_at_round int,
  add column if not exists rejection_reason text,
  add column if not exists re_eligible_after timestamptz;

alter table matches drop constraint if exists matches_interview_state_check;
alter table matches
  add constraint matches_interview_state_check
  check (interview_state in ('not_started', 'in_progress', 'rejected', 'hired', 'withdrawn'));

create index if not exists idx_matches_interview_state
  on matches (job_id, interview_state);

create index if not exists idx_matches_re_eligible
  on matches (job_id, candidate_id, re_eligible_after)
  where interview_state = 'rejected';

create table if not exists match_round_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  round_index int not null check (round_index >= 1),
  event_type text not null check (
    event_type in ('started', 'passed', 'failed', 'no_show', 'note', 'hired', 'withdrawn')
  ),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_match_round_events_match
  on match_round_events (match_id, created_at desc);
