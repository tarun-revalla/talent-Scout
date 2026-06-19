-- Enable Row Level Security on all public app tables.
--
-- Access model (hackathon / single-tenant recruiter tool):
--   • service_role (API routes + worker) — bypasses RLS, full access
--   • anon (browser Realtime only) — SELECT on live UI tables only
--   • authenticated — same as anon until Supabase Auth is added
--
-- Sensitive tables (scheduling tokens, queue, PII-adjacent) have no client
-- policies → blocked from PostgREST even if the anon key is in the browser.

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table public.jobs enable row level security;
alter table public.candidates enable row level security;
alter table public.matches enable row level security;
alter table public.conversations enable row level security;
alter table public.outreach_queue enable row level security;
alter table public.llm_usage enable row level security;
alter table public.match_round_events enable row level security;
alter table public.job_invite_events enable row level security;
alter table public.interviewers enable row level security;
alter table public.calendar_cache enable row level security;
alter table public.scheduling_sessions enable row level security;
alter table public.scheduling_proposals enable row level security;
alter table public.scheduled_interviews enable row level security;
alter table public.schema_migrations enable row level security;

-- ---------------------------------------------------------------------------
-- Realtime publication (browser live updates)
-- ---------------------------------------------------------------------------

do $$ begin
  alter publication supabase_realtime add table jobs;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Client roles: deny writes at the grant layer (RLS also blocks without policies)
-- ---------------------------------------------------------------------------

revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime read policies — anon/authenticated may SELECT rows they subscribe to
-- ---------------------------------------------------------------------------

create policy "anon_realtime_select"
  on public.jobs
  for select
  to anon, authenticated
  using (true);

create policy "anon_realtime_select"
  on public.candidates
  for select
  to anon, authenticated
  using (true);

create policy "anon_realtime_select"
  on public.matches
  for select
  to anon, authenticated
  using (true);

create policy "anon_realtime_select"
  on public.conversations
  for select
  to anon, authenticated
  using (true);

-- No policies on other tables → client roles cannot read or write via PostgREST.
-- service_role continues to bypass RLS for server-side API routes and the worker.
