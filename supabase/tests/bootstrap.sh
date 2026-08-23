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

-- Supabase puts pgcrypto in `extensions`, and the sign-up path hashes
-- passwords with it. Same schema, same function names, so the migration reads
-- identically here and on the hosted project.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

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
  raw_user_meta_data jsonb not null default '{}',
  -- Written by sign_up. GoTrue reads this column to verify a password, so a
  -- shim that omitted it would let the suites pass on a schema the real
  -- sign-in could never work against.
  encrypted_password text,
  email_confirmed_at timestamptz,
  confirmation_token text,
  recovery_token     text,
  email_change       text,
  email_change_token_new text
);

create unique index on auth.users (email);

-- GoTrue keeps one row per login method. sign_up writes it, so the shim has to
-- accept it.
create table auth.identities (
  id              uuid primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  identity_data   jsonb not null,
  provider        text not null,
  provider_id     text not null,
  last_sign_in_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider, provider_id)
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

echo "==> test scaffolding"
psql_ -q <<'SQL'
-- A booking in the past. `hold_slot` now refuses to create one — an hour that
-- has already started is not for sale — but several probes need a *played*
-- match to exist before they can test rating, standings or no-shows.
--
-- This sets that state up directly rather than through a sale path that
-- correctly rejects it. Everything downstream (confirm, check-in, complete,
-- rate) still runs through the real functions; only the one step being
-- deliberately bypassed is bypassed.
create function test_past_booking(
  p_pitch_id  uuid,
  p_starts_at timestamptz,
  p_captain   uuid,
  p_minutes   integer default 60
)
returns uuid
language plpgsql as $$
declare
  v_id    uuid;
  v_price integer;
  v_dep   integer;
  v_hour  integer := extract(hour from p_starts_at at time zone 'Africa/Cairo')::integer;
  v_date  date    := (p_starts_at at time zone 'Africa/Cairo')::date;
begin
  delete from booking
   where pitch_id = p_pitch_id
     and during && tstzrange(p_starts_at, p_starts_at + make_interval(mins => p_minutes));

  select price_egp, deposit_egp into v_price, v_dep
    from price_rule
   where pitch_id = p_pitch_id
     and v_hour >= start_hour and v_hour < end_hour
     and valid_from <= v_date and (valid_to is null or valid_to > v_date)
   limit 1;

  insert into booking (pitch_id, during, state, source, captain_id, captain_name,
                       code, price_egp, deposit_egp)
  select p_pitch_id,
         tstzrange(p_starts_at, p_starts_at + make_interval(mins => p_minutes), '[)'),
         'confirmed', 'app', p_captain, pp.display_name,
         generate_booking_code(), coalesce(v_price, 300), coalesce(v_dep, 100)
    from player_profile pp where pp.id = p_captain
  returning id into v_id;

  return v_id;
end;
$$;

-- Closed even though it is scaffolding: it is created after the access-control
-- migration has run, so it would otherwise keep the Postgres default of
-- EXECUTE to PUBLIC — which is the exact drift access_probe exists to catch,
-- and it duly caught this.
revoke execute on function test_past_booking(uuid, timestamptz, uuid, integer)
  from public, anon, authenticated;
SQL

echo "==> seed"
psql_ -q -f "$ROOT/supabase/seed.sql"
psql_ -q -f "$ROOT/supabase/seed_identities.sql"

echo "==> ready"
psql_ -tAc "select count(*) || ' tables, ' || (
  select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public') || ' functions'
  from pg_tables where schemaname = 'public'"
