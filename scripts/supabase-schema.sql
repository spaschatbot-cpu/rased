-- The whole backend's storage: one key/value table.
--
-- Run this once in the Supabase SQL editor before pointing SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY at the project.
--
-- It is deliberately not a schema of vehicles, trails and alerts. Those shapes
-- live in api/_lib/*.js and are validated there, and a second definition of
-- them in SQL would be a second thing to keep in step. What Postgres is being
-- asked for here is not modelling — it is a free tier billed by megabytes
-- rather than by request, which is the axis this backend is expensive on.

create table if not exists public.kv (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- `updated_at` is for whoever is staring at this table wondering when a row
-- last moved. Nothing in the backend reads it, so it is left to its default
-- rather than maintained by a trigger -- an upsert rewrites the row anyway.

-- RLS on, and no policy granted to anyone.
--
-- This is not an oversight. Every row here is server state -- password hashes,
-- sessions' worth of positions, the account table -- and the only thing that
-- reads it is the backend, holding the service_role key, which bypasses RLS by
-- design. Leaving RLS off would instead expose the whole table to the anon key
-- that ships in any browser bundle.
alter table public.kv enable row level security;

revoke all on public.kv from anon, authenticated;
