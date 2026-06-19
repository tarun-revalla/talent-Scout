-- Per-job email template settings (recruiter name, questions, custom instructions).
alter table jobs
  add column if not exists email_settings jsonb not null default '{
    "recruiter_name": "Talent Team",
    "initial_instructions": "",
    "followup_instructions": "",
    "interest_questions": [
      "Are you open to exploring a new opportunity right now?",
      "What is your earliest start date / notice period?",
      "What are your compensation expectations? (Mention the role''s range if available.)",
      "Would you be open to a 30-minute intro call this week or next?"
    ]
  }'::jsonb;
