-- Open/closed status per job. Closed jobs are read-only:
-- no re-run match, no engage, no auto-match on new candidates.
alter table jobs
  add column if not exists status text not null default 'open'
    check (status in ('open', 'closed'));
