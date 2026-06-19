-- Allow candidates to self-reschedule via a token-protected link.
ALTER TABLE scheduling_proposals
  ADD COLUMN IF NOT EXISTS candidate_reschedule_token text UNIQUE;

ALTER TABLE scheduled_interviews
  ADD COLUMN IF NOT EXISTS candidate_rescheduled_count int NOT NULL DEFAULT 0;
