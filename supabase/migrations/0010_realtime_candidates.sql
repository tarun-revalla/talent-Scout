-- Add candidates to the Realtime publication so the UI can react to bounce flips
-- (email_invalid → true) without polling.
do $$ begin
  alter publication supabase_realtime add table candidates;
exception when duplicate_object then null;
end $$;
