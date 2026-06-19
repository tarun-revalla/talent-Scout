-- Target number of hires per job; job auto-closes when hired count reaches this.
alter table jobs
  add column if not exists hires_target int not null default 1
    check (hires_target >= 1 and hires_target <= 100);
