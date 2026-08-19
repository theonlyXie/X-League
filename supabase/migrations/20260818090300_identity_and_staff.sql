-- X League — identity, staff scoping and the privileged transitions.
--
-- AUTH-001: sign-in is a verified mobile number and a one-time password.
-- AUTH-005: one identity holds player, captain and venue roles at once.
-- RBAC-002: venue staff reach only the venues explicitly assigned to them.
--
-- The change that matters most here is not the tables — it is that the
-- privileged functions stop taking the caller's word for anything. Before this
-- migration `check_in_booking` accepted an `actor` string from the client and
-- wrote it into the audit log; a forged actor made ADM-012 worthless. The actor
-- is now derived from the session, and the venue is checked against it.

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

-- PRO-001 / PRO-006. One row per signed-in person; the football identity in
-- §5.1 hangs off this, and it is deliberately separate from auth.users so that
-- deleting an account can preserve audit-critical history (§7.3, soft deletion).
create table if not exists player_profile (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text        not null,
  -- NFR-PRIV-003: the number is never exposed through discovery; it lives here
  -- only so a venue can be given a contact for a booking they are hosting.
  phone         text,
  -- AUTH-003: 18+ for the first public release.
  birth_year    smallint    check (birth_year between 1900 and 2100),
  preferred_area text,
  -- PRO-006: searchable by everyone, by teams only, or by nobody.
  visibility    text        not null default 'everyone'
                  check (visibility in ('everyone', 'connections', 'nobody')),
  -- AUTH-004: versioned acceptance of terms and privacy notice.
  terms_version text,
  terms_accepted_at timestamptz,
  language      text        not null default 'en' check (language in ('en', 'ar')),
  created_at    timestamptz not null default now()
);

-- RBAC-002. A person is staff *at named venues*, with a role that says how far
-- their authority runs. Membership is a row, not a claim in a token, so
-- revoking it takes effect on the next call.
do $$ begin
  create type venue_role as enum ('staff', 'manager', 'owner');
exception when duplicate_object then null;
end $$;

create table if not exists venue_staff (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid       not null references auth.users(id) on delete cascade,
  venue_id   uuid       not null references venue(id) on delete cascade,
  role       venue_role not null default 'staff',
  -- OWN-014: managers suspend staff without deleting the audit history.
  active     boolean    not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, venue_id)
);

create index if not exists venue_staff_user_idx on venue_staff (user_id) where active;

alter table player_profile enable row level security;
alter table venue_staff    enable row level security;

-- A person may read and maintain their own profile, and see which venues they
-- work at. Nothing here exposes anybody else.
drop policy if exists player_profile_self_read on player_profile;
create policy player_profile_self_read on player_profile
  for select to authenticated using (id = auth.uid());

drop policy if exists player_profile_self_write on player_profile;
create policy player_profile_self_write on player_profile
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists player_profile_self_insert on player_profile;
create policy player_profile_self_insert on player_profile
  for insert to authenticated with check (id = auth.uid());

drop policy if exists venue_staff_self_read on venue_staff;
create policy venue_staff_self_read on venue_staff
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Who is calling
-- ---------------------------------------------------------------------------

-- RBAC-002, as one reusable predicate. `p_min_role` lets a caller demand more
-- than mere membership — recording a booking is staff work, but changing a
-- venue's configuration should not be.
create or replace function is_venue_staff(p_venue_id uuid, p_min_role venue_role default 'staff')
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from venue_staff vs
     where vs.user_id = auth.uid()
       and vs.venue_id = p_venue_id
       and vs.active
       and vs.role >= p_min_role
  );
$$;

-- The venue a pitch belongs to, for scoping a booking-level action.
create or replace function venue_of_pitch(p_pitch_id uuid)
returns uuid
language sql stable security definer
set search_path = public, pg_temp as $$
  select venue_id from pitch where id = p_pitch_id;
$$;

-- ADM-012: the audit log records who acted. Derived from the session, never
-- from an argument, so it cannot be forged by whoever calls the function.
create or replace function current_actor()
returns text
language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(
    (select 'staff · ' || pp.display_name from player_profile pp where pp.id = auth.uid()),
    (select 'user · ' || auth.uid()::text where auth.uid() is not null),
    'anonymous'
  );
$$;

-- ---------------------------------------------------------------------------
-- Bookings belong to someone
-- ---------------------------------------------------------------------------

alter table booking add column if not exists captain_id uuid references auth.users(id) on delete set null;
create index if not exists booking_captain_idx on booking (captain_id);

-- ---------------------------------------------------------------------------
-- The transitions, now scoped
-- ---------------------------------------------------------------------------

-- BKG-002, with an owner. A hold now belongs to the person who took it, which
-- is what lets confirm and release refuse to act on someone else's slot.
create or replace function hold_slot(
  p_pitch_id     uuid,
  p_starts_at    timestamptz,
  p_minutes      integer default 60,
  p_captain_name text default null,
  p_hold_seconds integer default 292
)
returns hold_outcome
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_during  tstzrange := tstzrange(p_starts_at, p_starts_at + make_interval(mins => p_minutes), '[)');
  v_hour    smallint  := extract(hour from p_starts_at at time zone 'Africa/Cairo')::smallint;
  v_date    date      := (p_starts_at at time zone 'Africa/Cairo')::date;
  v_uid     uuid      := auth.uid();
  v_price   integer;
  v_deposit integer;
  v_id      uuid;
  v_name    text;
  v_expires timestamptz := now() + make_interval(secs => p_hold_seconds);
  v_out     hold_outcome;
begin
  -- AUTH-001: booking is for signed-in people. Browsing is not.
  if v_uid is null then
    v_out := (false, null, null, null, null, 'Sign in to hold a slot.')::hold_outcome;
    return v_out;
  end if;

  perform expire_stale_holds(p_pitch_id);

  select pr.price_egp, pr.deposit_egp into v_price, v_deposit
    from price_rule pr
   where pr.pitch_id = p_pitch_id
     and v_hour >= pr.start_hour and v_hour < pr.end_hour
     and pr.valid_from <= v_date
     and (pr.valid_to is null or pr.valid_to > v_date)
   limit 1;

  select coalesce(p_captain_name, pp.display_name) into v_name
    from player_profile pp where pp.id = v_uid;

  begin
    insert into booking (pitch_id, during, state, source, captain_id, captain_name,
                         price_egp, deposit_egp, expires_at)
    values (p_pitch_id, v_during, 'held', 'app', v_uid, coalesce(v_name, p_captain_name),
            coalesce(v_price, 0), coalesce(v_deposit, 0), v_expires)
    returning id into v_id;
  exception
    when exclusion_violation then
      v_out := (false, null, null, null, null,
                'That slot was taken while you were deciding.')::hold_outcome;
      return v_out;
  end;

  insert into booking_event (booking_id, event, actor, to_state, detail)
  values (v_id, 'Slot held', current_actor(), 'held',
          jsonb_build_object('hold_seconds', p_hold_seconds));

  v_out := (true, v_id, v_expires, coalesce(v_price, 0), coalesce(v_deposit, 0), null)::hold_outcome;
  return v_out;
end;
$$;

-- Only the captain who took the hold may turn it into a booking.
create or replace function confirm_booking(p_booking_id uuid)
returns table (ok boolean, code text, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_state   booking_state;
  v_code    text;
  v_captain uuid;
begin
  select b.state, b.code, b.captain_id into v_state, v_code, v_captain
    from booking b where b.id = p_booking_id
     for update;

  if v_state is null then
    return query select false, null::text, 'That booking no longer exists.';
    return;
  end if;

  -- Not "hidden in the UI" — refused on the server (RBAC-001).
  if v_captain is distinct from auth.uid() then
    return query select false, null::text, 'That hold belongs to someone else.';
    return;
  end if;

  if v_state in ('confirmed', 'checked_in', 'completed') then
    return query select true, v_code, null::text;
    return;
  end if;

  if v_state <> 'held' then
    return query select false, null::text, 'That hold is no longer active.';
    return;
  end if;

  if exists (select 1 from booking b where b.id = p_booking_id and b.expires_at <= now()) then
    update booking set state = 'expired', expires_at = null where id = p_booking_id;
    insert into booking_event (booking_id, event, actor, from_state, to_state)
    values (p_booking_id, 'Hold expired before confirmation', 'system · inventory lock', 'held', 'expired');
    return query select false, null::text, 'Your hold expired — the slot is back on sale.';
    return;
  end if;

  v_code := generate_booking_code();

  update booking
     set state = 'confirmed', code = v_code, expires_at = null
   where id = p_booking_id;

  insert into booking_event (booking_id, event, actor, from_state, to_state, detail)
  values (p_booking_id, 'Booking confirmed · cash deposit selected', current_actor(), 'held', 'confirmed',
          jsonb_build_object('code', v_code));

  return query select true, v_code, null::text;
end;
$$;

create or replace function release_hold(p_booking_id uuid)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_rows integer;
begin
  update booking
     set state = 'expired', expires_at = null
   where id = p_booking_id
     and state = 'held'
     and captain_id is not distinct from auth.uid();
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    insert into booking_event (booking_id, event, actor, from_state, to_state)
    values (p_booking_id, 'Hold released · slot returned to inventory', current_actor(), 'held', 'expired');
  end if;

  return v_rows > 0;
end;
$$;

-- BKG-009 / RBAC-002. The old signature took the actor as an argument; it is
-- gone, because a client-supplied actor is not evidence of who acted.
drop function if exists check_in_booking(uuid, text);

create or replace function check_in_booking(p_booking_id uuid)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_state    booking_state;
  v_venue_id uuid;
begin
  select b.state, venue_of_pitch(b.pitch_id) into v_state, v_venue_id
    from booking b where b.id = p_booking_id for update;

  if v_state is null then
    return query select false, 'That booking no longer exists.';
    return;
  end if;

  -- RBAC-002: staff reach only their own venues, and the check is here rather
  -- than in whatever client happened to call.
  if not is_venue_staff(v_venue_id) then
    return query select false, 'You do not have access to that venue.';
    return;
  end if;

  if v_state = 'checked_in' then
    return query select true, null::text;
    return;
  end if;

  if v_state <> 'confirmed' then
    return query select false, 'Only a confirmed booking can be checked in.';
    return;
  end if;

  update booking set state = 'checked_in', checked_in_at = now() where id = p_booking_id;

  insert into booking_event (booking_id, event, actor, from_state, to_state)
  values (p_booking_id, 'Checked in · cash deposit collected', current_actor(), 'confirmed', 'checked_in');

  return query select true, null::text;
end;
$$;

drop function if exists record_offline_booking(uuid, timestamptz, integer, booking_source, text, text);

-- OWN-003 / AC-05, scoped to the venue the staff member actually works at.
create or replace function record_offline_booking(
  p_pitch_id     uuid,
  p_starts_at    timestamptz,
  p_minutes      integer,
  p_source       booking_source,
  p_captain_name text
)
returns table (ok boolean, booking_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if not is_venue_staff(venue_of_pitch(p_pitch_id)) then
    return query select false, null::uuid, 'You do not have access to that venue.';
    return;
  end if;

  perform expire_stale_holds(p_pitch_id);

  begin
    insert into booking (pitch_id, during, state, source, captain_name, code)
    values (p_pitch_id,
            tstzrange(p_starts_at, p_starts_at + make_interval(mins => p_minutes), '[)'),
            'confirmed', p_source, p_captain_name, generate_booking_code())
    returning id into v_id;
  exception
    when exclusion_violation then
      return query select false, null::uuid, 'That slot is already taken on this pitch.';
      return;
  end;

  insert into booking_event (booking_id, event, actor, to_state, detail)
  values (v_id, 'Booking entered at the venue', current_actor(), 'confirmed',
          jsonb_build_object('source', p_source));

  return query select true, v_id, null::text;
end;
$$;

-- O-02, scoped. Captain names and payment state are venue data, and RBAC-006
-- says an employee sees nothing about unrelated people.
create or replace function owner_day(
  p_venue_id uuid,
  p_date     date,
  p_tz       text default 'Africa/Cairo'
)
returns table (
  pitch_label text,
  hour        smallint,
  starts_at   timestamptz,
  state       booking_state,
  source      booking_source,
  code        text,
  captain_name text,
  price_egp   integer,
  deposit_egp integer
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_venue_staff(p_venue_id) then
    raise exception 'You do not have access to that venue.'
      using errcode = 'insufficient_privilege';
  end if;

  perform expire_stale_holds(null);

  return query
  select
    p.label,
    a.hour,
    a.starts_at,
    b.state,
    coalesce(b.source, 'app'::booking_source),
    b.code,
    b.captain_name,
    a.price_egp,
    a.deposit_egp
  from pitch p
  cross join lateral search_availability(p.id, p_date, p_tz) a
  left join booking b
    on b.pitch_id = p.id
   and b.during && tstzrange(a.starts_at, a.ends_at, '[)')
   and b.state in ('held', 'pending_payment', 'confirmed', 'checked_in', 'completed')
  where p.venue_id = p_venue_id
  order by a.hour, p.label;
end;
$$;

-- Which venues the signed-in person may operate. Drives the workspace switch
-- (RBAC-005) without the client guessing.
create or replace function my_venues()
returns table (venue_id uuid, name text, role venue_role)
language sql stable security definer
set search_path = public, pg_temp as $$
  select v.id, v.name, vs.role
    from venue_staff vs join venue v on v.id = vs.venue_id
   where vs.user_id = auth.uid() and vs.active
   order by v.name;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

-- §2, Guest: browsing public venues and availability needs no account.
grant execute on function search_availability(uuid, date, text)            to anon, authenticated;
grant execute on function nearest_alternatives(uuid, timestamptz, integer) to anon, authenticated;

-- Everything that changes inventory now requires a session. `hold_slot` still
-- accepts anon calls at the grant level so it can answer "Sign in to hold a
-- slot" rather than a bare 42501, but it writes nothing without auth.uid().
grant execute on function hold_slot(uuid, timestamptz, integer, text, integer) to anon, authenticated;
grant execute on function confirm_booking(uuid)                                to authenticated;
grant execute on function release_hold(uuid)                                   to authenticated;

-- Venue operations: signed in, and scoped inside the function to the venues
-- the caller actually works at.
grant execute on function check_in_booking(uuid)                                             to authenticated;
grant execute on function record_offline_booking(uuid, timestamptz, integer, booking_source, text) to authenticated;
grant execute on function owner_day(uuid, date, text)                                        to authenticated;
grant execute on function my_venues()                                                        to authenticated;
grant execute on function is_venue_staff(uuid, venue_role)                                   to authenticated;
