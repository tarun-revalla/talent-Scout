-- Slack user ID for interviewers so approval requests can be sent via DM.
ALTER TABLE interviewers
  ADD COLUMN IF NOT EXISTS slack_user_id text;

-- Track the Slack message timestamp so we can update the message on approval/rejection.
ALTER TABLE scheduling_proposals
  ADD COLUMN IF NOT EXISTS slack_ts text;
