#!/usr/bin/env bash
# Build a throwaway database that behaves like the hosted project, so the SQL
# suites can run without one.
#
# What Supabase provides and a bare Postgres does not: an `auth` schema with a
# users table, `auth.uid()` reading the JWT claim PostgREST sets, and the `anon`
# and `authenticated` roles the grants name. The shim below is deliberately the
# smallest thing that makes those true — it is a test fixture, not a
# reimplementation, and nothing in it ships.
#
#   supabase/tests/bootstrap.sh            # rebuild and seed
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
HOST="${PGHOST:-/tmp/pgsock}"
PORT="${PGPORT:-5433}"
USER="${PGUSER:-postgres}"
DB="${PGDATABASE:-postgres}"

psql_() { psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 "$@"; }

echo "==> resetting schema"
psql_ -q <<'SQL'
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
grant usage on schema public to public;
SQL

echo "==> auth shim"
psql_ -q <<'SQL'
create schema auth;

-- Enough of auth.users for foreign keys and the identity seed to be honest.
create table auth.users (
  id                 uuid primary key,
  instance_id        uuid,
  aud                text,
  role               text,
  phone              text unique,
  phone_confirmed_at timestamptz,
  email              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  raw_app_meta_data  jsonb not null default '{}',
  raw_user_meta_data jsonb not null default '{}'
);

-- Exactly how the real one reads: the claim PostgREST puts on the session.
--
-- The setting is cleared by `set_config(..., null, true)`, which stores an
-- empty string rather than NULL — casting that straight to json raises, so the
-- empty case is nullif'd out before the cast. The hosted function is defensive
-- in the same way; a shim that is not turns "signed out" into an error.
create function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', ''
  )::uuid;
$$;

create function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role',
    'anon'
  );
$$;

do $$ begin create role anon nologin;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin;  exception when duplicate_object then null; end $$;
grant usage on schema public, auth to anon, authenticated, service_role;
SQL

echo "==> migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  printf '    %s\n' "$(basename "$f")"
  psql_ -q -f "$f"
done

echo "==> seed"
psql_ -q -f "$ROOT/supabase/seed.sql"
psql_ -q -f "$ROOT/supabase/seed_identities.sql"

echo "==> ready"
psql_ -tAc "select count(*) || ' tables, ' || (
  select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public') || ' functions'
  from pg_tables where schemaname = 'public'"
