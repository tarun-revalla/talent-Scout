-- PostgREST-friendly vector search: accept text and cast to vector(1536).
drop function if exists match_candidates(vector, int);

create or replace function match_candidates(
  query_embedding_text text,
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
    (c.embedding <=> query_embedding_text::vector(1536))::float as distance
  from candidates c
  where c.embedding is not null
  order by c.embedding <=> query_embedding_text::vector(1536)
  limit match_count;
$$;

create or replace function match_open_jobs(
  query_embedding_text text,
  match_count int default 50
)
returns table (
  id uuid,
  parsed_jd jsonb,
  auto_engage_threshold numeric,
  auto_engage_enabled boolean,
  status text,
  distance float
)
language sql stable
as $$
  select
    j.id,
    j.parsed_jd,
    j.auto_engage_threshold,
    j.auto_engage_enabled,
    j.status,
    (j.embedding <=> query_embedding_text::vector(1536))::float as distance
  from jobs j
  where j.embedding is not null
    and j.status = 'open'
  order by j.embedding <=> query_embedding_text::vector(1536)
  limit match_count;
$$;
