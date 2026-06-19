-- Fallback interviewers tried when all primary interviewers reject a proposal.
ALTER TABLE scheduling_sessions
  ADD COLUMN IF NOT EXISTS fallback_interviewer_ids uuid[] DEFAULT '{}';
