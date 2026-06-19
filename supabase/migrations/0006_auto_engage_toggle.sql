-- Auto-engage is opt-in: even with a threshold set, the agent only triggers
-- outreach automatically once the recruiter has explicitly enabled it on the job.
alter table jobs
  add column if not exists auto_engage_enabled boolean not null default false;
