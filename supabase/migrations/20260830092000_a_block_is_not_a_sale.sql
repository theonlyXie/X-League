-- A pitch taken off sale is not a booking, and owes nobody anything.
--
-- `owner_arrivals` on 24 August returned this row to the gate:
--
--   Blocked · watering — Pitch C — due EGP 300 — unpaid
--
-- which is an instruction to collect three hundred pounds from a hose. The
-- same three blocks counted as three sales worth EGP 900 in `venue_payouts`,
-- 11% of that venue's reported gross, on the screen a venue reconciles its
-- week against.
--
-- The chain, and the part of it that is my own doing:
--
--   1. `20260822108997_an_offline_booking_has_a_price` fixed phone and walk-in
--      bookings entering the ledger worth zero, by reading the price rule in
--      `record_offline_booking`. It read it for every source, and `block` is
--      one of the sources.
--   2. `seed_deposit_obligation` raises a `balance` reference, due, on any
--      confirmed booking with a price above zero. So pricing a block raised an
--      obligation against it.
--   3. `owner_arrivals` and `venue_payouts` both select on state alone, with no
--      filter on source, so both picked it up as business.
--
-- Fixed at the root and at both readers, because the readers should not have
-- been counting blocks as trade whatever the price said.
--
-- Restated in full rather than patched: CREATE OR REPLACE resets security,
-- search_path and every attribute to what the statement says.

-- 1. The root. A block reserves the hour and sells nothing.
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
  v_id    uuid;
  v_hour  smallint := extract(hour from p_starts_at at time zone 'Africa/Cairo')::smallint;
  v_date  date     := (p_starts_at at time zone 'Africa/Cairo')::date;
  v_price integer;
begin
  if not is_venue_staff(venue_of_pitch(p_pitch_id)) then
    return query select false, null::uuid, 'You do not have access to that venue.';
    return;
  end if;

  perform expire_stale_holds(p_pitch_id);

  -- Priced only when somebody is buying it. A block is the venue closing the
  -- hour to itself, so it stays at zero and the obligation trigger — which
  -- fires above zero only — never raises a balance against it.
  if p_source <> 'block' then
    select pr.price_egp into v_price
      from price_rule pr
     where pr.pitch_id = p_pitch_id
       and v_hour >= pr.start_hour and v_hour < pr.end_hour
       and pr.valid_from <= v_date
       and (pr.valid_to is null or pr.valid_to > v_date)
     limit 1;
  end if;

  begin
    insert into booking (pitch_id, during, state, source, captain_name, code, price_egp)
    values (p_pitch_id,
            tstzrange(p_starts_at, p_starts_at + make_interval(mins => p_minutes), '[)'),
            'confirmed', p_source, p_captain_name, generate_booking_code(),
            coalesce(v_price, 0))
    returning id into v_id;
  exception
    when exclusion_violation then
      return query select false, null::uuid, 'That slot is already taken on this pitch.';
      return;
  end;

  insert into booking_event (booking_id, event, actor, to_state, detail)
  values (v_id, 'Booking entered at the venue', current_actor(), 'confirmed',
          jsonb_build_object('source', p_source, 'price_egp', coalesce(v_price, 0)));

  return query select true, v_id, null::text;
end;
$$;

revoke execute on function public.record_offline_booking(uuid, timestamptz, integer, booking_source, text)
  from public, anon;
grant execute on function public.record_offline_booking(uuid, timestamptz, integer, booking_source, text)
  to authenticated;

-- 2. Nobody arrives for a watering. The calendar grid still draws blocks, which
--    is where a venue needs to see them; this list is the gate's, and every row
--    on it is somebody to expect.
-- Defaults reproduced exactly. Postgres will not let CREATE OR REPLACE drop a
-- parameter default, and the first attempt at this migration was refused for
-- omitting them.
create or replace function owner_arrivals(
  p_venue_id uuid,
  p_date date,
  p_tz text default 'Africa/Cairo'
)
returns table (
  booking_id uuid, pitch_label text, starts_at timestamptz, hour smallint,
  state booking_state, source booking_source, code text, captain_name text,
  due_egp integer, paid boolean, checked_in boolean
)
-- Volatile, not stable. It calls `expire_stale_holds`, which writes, and
-- PostgREST runs a stable function inside a read-only transaction: marking it
-- stable made every load of Owner Today answer 405 "cannot execute SELECT in a
-- read-only transaction". `owner_day` and `search_venues` call the same thing
-- and are volatile for the same reason. Caught by the browser check on the
-- first run after this migration.
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
begin
  if not is_venue_staff(p_venue_id) then
    raise exception 'You do not have access to that venue.' using errcode = 'insufficient_privilege';
  end if;

  perform expire_stale_holds(null);

  return query
  select b.id, p.label, lower(b.during),
         extract(hour from lower(b.during) at time zone p_tz)::smallint,
         b.state, b.source, b.code, b.captain_name,
         coalesce((select sum(pr.amount_egp)::integer from payment_reference pr
                    where pr.booking_id = b.id and pr.state = 'due'), 0),
         exists (select 1 from payment_reference pr
                  where pr.booking_id = b.id and pr.state = 'collected'),
         b.checked_in_at is not null
    from booking b
    join pitch p on p.id = b.pitch_id
   where p.venue_id = p_venue_id
     and (lower(b.during) at time zone p_tz)::date = p_date
     and b.state in ('confirmed', 'checked_in', 'completed', 'no_show')
     and b.source <> 'block'
   order by lower(b.during), p.label;
end;
$$;

revoke execute on function public.owner_arrivals(uuid, date, text) from public, anon;
grant execute on function public.owner_arrivals(uuid, date, text) to authenticated;

-- 3. Money. A blocked hour sold nothing, so it is neither a booking nor gross.
create or replace function venue_payouts(
  p_venue_id uuid,
  p_from date default null,
  p_to date default null,
  p_tz text default 'Africa/Cairo'
)
returns table (
  on_date date, bookings integer, gross_egp integer,
  collected_egp integer, outstanding_egp integer, forfeited_egp integer
)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_today date := (now() at time zone p_tz)::date;
  v_from  date := coalesce(p_from, v_today - 29);
  v_to    date := coalesce(p_to, v_today);
begin
  if not is_venue_staff(p_venue_id, 'manager') then
    raise exception 'You do not manage that venue.' using errcode = 'insufficient_privilege';
  end if;

  return query
  with bk as (
    select b.id,
           b.price_egp,
           (lower(b.during) at time zone p_tz)::date as on_day
      from booking b
      join pitch p on p.id = b.pitch_id
     where p.venue_id = p_venue_id
       and (lower(b.during) at time zone p_tz)::date between v_from and v_to
       and b.state in ('confirmed', 'checked_in', 'completed', 'no_show')
       and b.source <> 'block'
  ),
  sold as (
    select bk.on_day,
           count(*)::integer as n,
           sum(bk.price_egp)::integer as gross
      from bk group by bk.on_day
  ),
  paid as (
    select bk.on_day,
           coalesce(sum(pr.amount_egp) filter (where pr.state = 'collected'), 0)::integer as collected,
           coalesce(sum(pr.amount_egp) filter (where pr.state = 'due'), 0)::integer as due,
           coalesce(sum(pr.amount_egp) filter (where pr.state = 'forfeited'), 0)::integer as forfeited
      from bk
      join payment_reference pr on pr.booking_id = bk.id
     group by bk.on_day
  )
  select sold.on_day, sold.n, sold.gross,
         coalesce(paid.collected, 0),
         coalesce(paid.due, 0),
         coalesce(paid.forfeited, 0)
    from sold
    left join paid on paid.on_day = sold.on_day
   order by 1 desc;
end;
$$;

revoke execute on function public.venue_payouts(uuid, date, date, text) from public, anon;
grant execute on function public.venue_payouts(uuid, date, date, text) to authenticated;

-- 4. The obligations already raised against blocks. Waived rather than deleted,
--    so the ledger keeps its history and shows the correction rather than
--    quietly losing the rows — and waived rather than forfeited, because
--    forfeited means somebody owed it and did not pay.
update payment_reference pr
   set state = 'waived'
  from booking b
 where pr.booking_id = b.id
   and b.source = 'block'
   and pr.state = 'due';

-- And the prices behind them, so nothing recomputes an obligation from a figure
-- that should never have been on a block.
update booking set price_egp = 0 where source = 'block' and price_egp <> 0;
