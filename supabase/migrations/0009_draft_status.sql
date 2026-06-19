-- Allow 'draft' as a third job status. Drafts behave like 'open' for editing
-- and matching, but are excluded from auto-match against new candidates and
-- never auto-engage.
do $$
declare cn text;
begin
  for cn in
    select conname from pg_constraint
    where conrelid = 'jobs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table jobs drop constraint %I', cn);
  end loop;
end $$;

alter table jobs
  add constraint jobs_status_check
  check (status in ('open', 'closed', 'draft'));
