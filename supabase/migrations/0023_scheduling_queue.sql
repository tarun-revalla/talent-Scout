-- Queue actions for interview scheduling emails

alter table outreach_queue drop constraint if exists outreach_queue_action_check;

alter table outreach_queue add constraint outreach_queue_action_check
  check (action in (
    'send_initial',
    'send_followup',
    'finalize_score',
    'send_round_pass',
    'send_application_ack',
    'send_no_show',
    'send_scheduling_proposal',
    'send_candidate_invite',
    'send_scheduling_confirmed'
  ));
