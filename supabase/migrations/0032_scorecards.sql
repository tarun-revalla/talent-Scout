-- Interviewer scorecards: after each round, the interviewer fills a token-based
-- form (recommendation + ratings + notes). One row per (match, round, interviewer).
create table if not exists interviewer_scorecards (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  round_index int not null check (round_index >= 1),
  interviewer_id uuid not null references interviewers(id) on delete cascade,
  response_token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'expired')),
  -- Filled on submit:
  recommendation text check (recommendation in ('strong_yes', 'yes', 'no', 'strong_no')),
  overall_rating int check (overall_rating between 1 and 5),
  technical_rating int check (technical_rating between 1 and 5),
  communication_rating int check (communication_rating between 1 and 5),
  notes text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, round_index, interviewer_id)
);

create index if not exists idx_scorecards_match on interviewer_scorecards(match_id, round_index);
create index if not exists idx_scorecards_token on interviewer_scorecards(response_token);

-- RLS: lock down like the rest of the schema; service role bypasses.
alter table interviewer_scorecards enable row level security;
