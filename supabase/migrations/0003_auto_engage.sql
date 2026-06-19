-- Per-job auto-engagement threshold (0..100). Default 55: any match scoring
-- at or above this auto-enqueues outreach the moment matching completes.
alter table jobs
  add column if not exists auto_engage_threshold numeric not null default 55;
