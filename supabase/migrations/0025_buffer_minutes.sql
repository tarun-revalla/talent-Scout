-- Add buffer_minutes to interviewers so free-slot computation leaves padding
-- between consecutive interviews (default 15 minutes).
ALTER TABLE interviewers
  ADD COLUMN IF NOT EXISTS buffer_minutes int NOT NULL DEFAULT 15;
