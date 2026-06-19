-- Pipeline stages move from candidate-level to per-match. A candidate can be
-- "shortlisted" for one job and "archived" for another.
alter table matches
  add column if not exists pipeline_stage text not null default 'new';

alter table matches
  drop constraint if exists matches_pipeline_stage_check;
alter table matches
  add constraint matches_pipeline_stage_check
  check (pipeline_stage in ('new', 'shortlisted', 'contacted', 'archived'));

create index if not exists idx_matches_pipeline_stage
  on matches(job_id, pipeline_stage);
