-- Track email validity. Set true when a delivery bounce is observed via IMAP.
alter table candidates
  add column if not exists email_invalid boolean not null default false;

-- Normalize existing emails to lowercase for clean duplicate-detection.
update candidates
  set email = lower(trim(email))
  where email is not null and email <> lower(trim(email));
