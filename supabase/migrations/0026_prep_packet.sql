-- Track when a pre-interview prep packet was sent to the candidate.
ALTER TABLE scheduled_interviews
  ADD COLUMN IF NOT EXISTS prep_packet_sent_at timestamptz;

-- New queue action for sending prep packets (enforced at application layer).
-- No SQL constraint change needed; the check constraint already allows new values
-- via the application-level QueueAction type union.
