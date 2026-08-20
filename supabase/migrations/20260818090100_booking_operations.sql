-- X League — booking operations.
--
-- Every state transition lives in a function so that the check and the write
-- happen inside one transaction. §7.2: transitions are server-authoritative;
-- a client may request one but never perform one directly.

-- ---------------------------------------------------------------------------
-- Expiry
-- ---------------------------------------------------------------------------

-- AC-03: a hold whose countdown ran out stops occupying the pitch and the
-- inventory is immediately saleable again.
--
-- The exclusion constraint cannot test `now()` itself (it is not immutable),
-- so expired holds are retired on the way past — before any read or write that
-- depends on the pitch being free. Scoping to one pitch keeps the write small
-- and takes exactly the row locks needed to make the following insert honest.
create or replace function expire_stale_holds(p_pitch_id uuid default null)
returns integer
language plpgsql as $$
declare
  n integer;
begin
  with retired as (
    update booking
       -- `hold_has_deadline` insists only a live hold carries a deadline, so
       -- retiring one has to clear it in the same statement.
       set state = 'expired', expires_at = null
     where state = 'held'
       and expires_at <= now()
       and (p_pitch_id is null or pitch_id = p_pitch_id)
    returning id, pitch_id
  ), logged as (
    insert into booking_event (booking_id, event, actor, from_state, to_state)
    select id, 'Hold expired · slot returned to inventory', 'system · inventory lock', 'held', 'expired'
      from retired
    returning 1
  )
  select count(*) into n from logged;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Availability
-- ---------------------------------------------------------------------------

-- VEN-001 / VEN-002: the player states pitch, date and window first, and only
-- slots that are saleable at query time come back.
create or replace function search_availability(
  p_pitch_id uuid,
  p_date     date,
  p_tz       text default 'Africa/Cairo'
)
returns table (
  starts_at timestamptz,
  ends_at   timestamptz,
  hour      smallint,
  price_egp integer,
  deposit_egp integer,
  available boolean,
  taken_by  booking_source
)
language plpgsql as $$
begin
  perform expire_stale_holds(p_pitch_id);

  return query
  with rule as (
    select ar.open_hour, ar.close_hour, ar.slot_minutes
      from availability_rule ar
     where ar.pitch_id = p_pitch_id
       and ar.day_of_week = extract(dow from p_date)::smallint
     limit 1
  ),
  slot as (
    select
      h::smallint as hour,
      -- Built in the venue's own timezone: 9 PM in Cairo is the product's
      -- unit of inventory, not 9 PM UTC (NFR-LOC-002).
      ((p_date + make_interval(hours => h)) at time zone p_tz) as starts_at,
      ((p_date + make_interval(hours => h) + make_interval(mins => r.slot_minutes)) at time zone p_tz) as ends_at
    from rule r,
         generate_series(r.open_hour, r.close_hour - 1) as h
  )
  select
    s.starts_at,
    s.ends_at,
    s.hour,
    coalesce(pr.price_egp, 0),
    coalesce(pr.deposit_egp, 0),
    b.id is null,
    b.source
  from slot s
  left join price_rule pr
    on pr.pitch_id = p_pitch_id
   and s.hour >= pr.start_hour and s.hour < pr.end_hour
   and pr.valid_from <= p_date
   and (pr.valid_to is null or pr.valid_to > p_date)
  left join booking b
    on b.pitch_id = p_pitch_id
   and b.during && tstzrange(s.starts_at, s.ends_at, '[)')
   and b.state in ('held', 'pending_payment', 'confirmed', 'checked_in', 'completed')
  order by s.starts_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Holding
-- ---------------------------------------------------------------------------

do $$ begin
  create type hold_outcome as (
    ok           boolean,
    booking_id   uuid,
    expires_at   timestamptz,
    price_egp    integer,
    deposit_egp  integer,
    reason       text
  );
exception when duplicate_object then null;
end $$;

-- BKG-002 / BKG-003: taking a slot creates a server-side hold with a deadline,
-- and the attempt is atomic — overlapping occupancy is rejected, never merged.
--
-- AC-02: when two players reach for the last slot at once, exactly one of these
-- calls commits. The other loses the race inside the database and is handed the
-- nearest alternatives (BKG-011) rather than a failure it cannot act on.
create or replace function hold_slot(
  p_pitch_id     uuid,
  p_starts_at    timestamptz,
  p_minutes      integer default 60,
  p_captain_name text default null,
  p_hold_seconds integer default 292
)
returns hold_outcome
language plpgsql as $$
declare
  v_during  tstzrange := tstzrange(p_starts_at, p_starts_at + make_interval(mins => p_minutes), '[)');
  v_hour    smallint  := extract(hour from p_starts_at at time zone 'Africa/Cairo')::smallint;
  v_date    date      := (p_starts_at at time zone 'Africa/Cairo')::date;
  v_price   integer;
  v_deposit integer;
  v_id      uuid;
  v_expires timestamptz := now() + make_interval(secs => p_hold_seconds);
  v_out     hold_outcome;
begin
  perform expire_stale_holds(p_pitch_id);

  -- The quote is resolved once, here, and travels with the row from now on.
  select pr.price_egp, pr.deposit_egp into v_price, v_deposit
    from price_rule pr
   where pr.pitch_id = p_pitch_id
     and v_hour >= pr.start_hour and v_hour < pr.end_hour
     and pr.valid_from <= v_date
     and (pr.valid_to is null or pr.valid_to > v_date)
   limit 1;

  begin
    insert into booking (pitch_id, during, state, source, captain_name,
                         price_egp, deposit_egp, expires_at)
    values (p_pitch_id, v_during, 'held', 'app', p_captain_name,
            coalesce(v_price, 0), coalesce(v_deposit, 0), v_expires)
    returning id into v_id;
  exception
    when exclusion_violation then
      v_out := (false, null, null, null, null,
                'That slot was taken while you were deciding.')::hold_outcome;
      return v_out;
  end;

  insert into booking_event (booking_id, event, actor, to_state, detail)
  values (v_id, 'Slot held', 'system · inventory lock', 'held',
          jsonb_build_object('hold_seconds', p_hold_seconds));

  v_out := (true, v_id, v_expires, coalesce(v_price, 0), coalesce(v_deposit, 0), null)::hold_outcome;
  return v_out;
end;
$$;

-- BKG-011: when the slot goes, offer the closest thing that is still there.
create or replace function nearest_alternatives(
  p_pitch_id  uuid,
  p_starts_at timestamptz,
  p_limit     integer default 3
)
returns table (starts_at timestamptz, hour smallint, price_egp integer)
language sql as $$
  select a.starts_at, a.hour, a.price_egp
    from search_availability(
           p_pitch_id,
           (p_starts_at at time zone 'Africa/Cairo')::date
         ) a
   where a.available
   order by abs(extract(epoch from (a.starts_at - p_starts_at)))
   limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- Confirming, releasing, arriving
-- ---------------------------------------------------------------------------

-- Four characters from an alphabet with no 0/O/1/I/L, so a code read aloud at
-- a gate or copied off a screen cannot be misheard. Uniqueness is enforced by
-- the column, not by hoping.
create or replace function generate_booking_code()
returns text
language sql volatile as $$
  select 'XL-' || string_agg(
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::int, 1), ''
  )
  from generate_series(1, 4);
$$;

-- BKG-005: confirming is idempotent on an already-confirmed hold, so a retried
-- callback returns the original booking rather than creating a second one.
create or replace function confirm_booking(p_booking_id uuid)
returns table (ok boolean, code text, reason text)
language plpgsql as $$
declare
  v_state booking_state;
  v_code  text;
begin
  select b.state, b.code into v_state, v_code
    from booking b where b.id = p_booking_id
     for update;

  if v_state is null then
    return query select false, null::text, 'That booking no longer exists.';
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

  -- The deadline is checked here rather than trusted from the client.
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
  values (p_booking_id, 'Booking confirmed · cash deposit selected', 'player · app', 'held', 'confirmed',
          jsonb_build_object('code', v_code));

  return query select true, v_code, null::text;
end;
$$;

-- Leaving checkout without confirming gives the slot straight back.
create or replace function release_hold(p_booking_id uuid)
returns boolean
language plpgsql as $$
declare
  v_rows integer;
begin
  update booking
     set state = 'expired', expires_at = null
   where id = p_booking_id and state = 'held';
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    insert into booking_event (booking_id, event, actor, from_state, to_state)
    values (p_booking_id, 'Hold released · slot returned to inventory', 'player · app', 'held', 'expired');
  end if;

  return v_rows > 0;
end;
$$;

-- BKG-009: only a venue-authorised user marks arrival, and that is what makes
-- the booking rating-eligible later (§5.4).
create or replace function check_in_booking(p_booking_id uuid, p_actor text)
returns table (ok boolean, reason text)
language plpgsql as $$
declare
  v_state booking_state;
begin
  select b.state into v_state from booking b where b.id = p_booking_id for update;

  if v_state is null then
    return query select false, 'That booking no longer exists.';
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
  values (p_booking_id, 'Checked in · cash deposit collected', p_actor, 'confirmed', 'checked_in');

  return query select true, null::text;
end;
$$;

-- OWN-003 / AC-05: staff record a phone or walk-in booking into the same
-- timeline, and it removes the slot from player search exactly like an app
-- booking does. Same constraint, same table, different `source`.
create or replace function record_offline_booking(
  p_pitch_id     uuid,
  p_starts_at    timestamptz,
  p_minutes      integer,
  p_source       booking_source,
  p_captain_name text,
  p_actor        text
)
returns table (ok boolean, booking_id uuid, reason text)
language plpgsql as $$
declare
  v_id uuid;
begin
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
  values (v_id, 'Booking entered at the venue', p_actor, 'confirmed',
          jsonb_build_object('source', p_source));

  return query select true, v_id, null::text;
end;
$$;

-- O-02: the owner's day, every channel in one grid.
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
language plpgsql as $$
begin
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
