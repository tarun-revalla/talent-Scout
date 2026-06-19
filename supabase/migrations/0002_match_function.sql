-- Vector search function for the matching pipeline.
-- Returns the top-K candidates by cosine distance against a query embedding.
create or replace function match_candidates(
  query_embedding vector(1536),
  match_count int default 30
)
returns table (
  id uuid,
  name text,
  email text,
  parsed_profile jsonb,
  distance float
)
language sql stable
as $$
  select
    c.id,
    c.name,
    c.email,
    c.parsed_profile,
    (c.embedding <=> query_embedding)::float as distance
  from candidates c
  where c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
