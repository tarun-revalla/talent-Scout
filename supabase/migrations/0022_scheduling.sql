-- Interview scheduling sessions, proposals, and confirmed bookings

create table if not exists scheduling_sessions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  round_index int not null default 0,
  duration_minutes int not null,
  timezone text not null default 'America/New_York',
  status text not null default 'draft'
    check (status in (
      'draft',
      'proposing',
      'pending_approval',
      'approved',
      'confirmed',
      'cancelled',
      'expired'
    )),
  interviewer_ids uuid[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduling_sessions_match_id_idx on scheduling_sessions(match_id);

create table if not exists scheduling_proposals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references scheduling_sessions(id) on delete cascade,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'expired', 'superseded')),
  response_token text not null unique,
  responded_at timestamptz,
  responder_email text,
  proposal_index int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists scheduling_proposals_session_id_idx on scheduling_proposals(session_id);
create index if not exists scheduling_proposals_token_idx on scheduling_proposals(response_token);

create table if not exists scheduled_interviews (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references scheduling_sessions(id) on delete cascade unique,
  match_id uuid not null references matches(id) on delete cascade,
  round_index int not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  ics_uid text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists scheduled_interviews_match_id_idx on scheduled_interviews(match_id);
