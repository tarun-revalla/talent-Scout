-- DB-backed interviewer slot reservations to prevent parallel scheduling
-- flows from booking the same interviewer/time range.

create extension if not exists btree_gist;

create table if not exists scheduling_slot_reservations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references scheduling_sessions(id) on delete cascade,
  proposal_id uuid references scheduling_proposals(id) on delete set null,
  match_id uuid not null references matches(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete set null,
  interviewer_id uuid not null references interviewers(id) on delete cascade,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  status text not null default 'active'
    check (status in ('active', 'confirmed', 'released')),
  created_at timestamptz not null default now(),
  released_at timestamptz
);

alter table scheduling_slot_reservations
  drop constraint if exists scheduling_slot_reservations_no_overlap;

alter table scheduling_slot_reservations
  add constraint scheduling_slot_reservations_no_overlap
  exclude using gist (
    interviewer_id with =,
    tstzrange(slot_start, slot_end, '[)') with &&
  )
  where (status in ('active', 'confirmed'));

create index if not exists scheduling_slot_reservations_session_idx
  on scheduling_slot_reservations(session_id);

create index if not exists scheduling_slot_reservations_match_idx
  on scheduling_slot_reservations(match_id);

alter table public.scheduling_slot_reservations enable row level security;

create table if not exists scheduling_slack_messages (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references scheduling_proposals(id) on delete cascade,
  session_id uuid not null references scheduling_sessions(id) on delete cascade,
  interviewer_id uuid references interviewers(id) on delete set null,
  slack_channel_id text not null,
  slack_ts text not null,
  status text not null default 'sent'
    check (status in ('sent', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proposal_id, slack_channel_id, slack_ts)
);

create index if not exists scheduling_slack_messages_proposal_idx
  on scheduling_slack_messages(proposal_id);

create index if not exists scheduling_slack_messages_session_idx
  on scheduling_slack_messages(session_id);

alter table public.scheduling_slack_messages enable row level security;
