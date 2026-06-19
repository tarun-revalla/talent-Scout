-- Enable Supabase Realtime on the two tables the recruiter UI watches live:
-- matches (status flips, scores) and conversations (new emails, analysis JSON).
-- After this runs, the browser's WebSocket subscription receives row-level
-- INSERT/UPDATE/DELETE events and the UI re-renders without polling.
do $$ begin
  alter publication supabase_realtime add table matches;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table conversations;
exception when duplicate_object then null;
end $$;
