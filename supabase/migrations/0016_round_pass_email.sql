-- Allow queue action for interview round pass confirmation emails.
alter table outreach_queue drop constraint if exists outreach_queue_action_check;
alter table outreach_queue
  add constraint outreach_queue_action_check
  check (action in ('send_initial', 'send_followup', 'finalize_score', 'send_round_pass'));
