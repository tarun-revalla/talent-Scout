-- Pipeline stage on each candidate. Drives the All / Shortlisted / Contacted / Archived
-- tabs on the candidates page and the "Move to stage" dropdown on the drawer.
alter table candidates
  add column if not exists pipeline_stage text not null default 'new';

-- Loose check (not enum) so we can extend later without migrations.
alter table candidates
  drop constraint if exists candidates_pipeline_stage_check;
alter table candidates
  add constraint candidates_pipeline_stage_check
  check (pipeline_stage in ('new', 'shortlisted', 'contacted', 'archived'));

create index if not exists idx_candidates_pipeline_stage
  on candidates(pipeline_stage);
