-- What the gate is owed, from the ledger rather than from a dead column.
--
-- Three more places where removing the deposit left a number reading zero for
-- ever, all of them on the screen a venue works its evening from:
--
--   * `owner_arrivals.deposit_egp` is `booking.deposit_egp`, which
--     20260822108900_no_deposit.sql set to 0 on every row. Owner Today renders
--     it as "EGP 0 cash to collect at gate" against every arrival.
--   * `owner_summary.cash_due_egp` sums the same column, so the CASH DUE tile
--     is permanently 0 — on a screen whose entire job is telling somebody how
--     much cash to expect.
--   * `owner_summary.cash_gates` counts `source = 'app'` only. That was right
--     when a deposit was an app-booking thing. Now the whole price is settled
--     at the gate whatever channel the booking came through, so a venue taking
--     half its business by phone was told to expect half the gates.
--
-- The obligation already exists and is already correct: `payment_reference`
-- carries a `balance` row per confirmed booking, `record_payment` moves it to
-- collected, `cancel_booking` forfeits it. These three read it.
--
-- `deposit_egp` becomes `due_egp` in the arrivals row, and a `paid` flag joins
-- it. Renaming rather than keeping the old word: a column called deposit that
-- holds the full balance is how the next person writes the next zero.

-- ---------------------------------------------------------------------------
-- Arrivals
-- ---------------------------------------------------------------------------

drop function if exists public.owner_arrivals(uuid, date, text);

create or replace function owner_arrivals(p_venue_id uuid, p_date date, p_tz text default 'Africa/Cairo')
returns table (
  booking_id   uuid,
  pitch_label  text,
  starts_at    timestamptz,
  hour         smallint,
  state        booking_state,
  source       booking_source,
  code         text,
  captain_name text,
  due_egp      integer,
  paid         boolean,
  checked_in   boolean
)
language plpgsql security definer
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
     -- A no-show stays on the shift. Dropping it the moment it is marked
     -- leaves the operator unable to see that they marked it.
     and b.state in ('confirmed', 'checked_in', 'completed', 'no_show')
   order by lower(b.during), p.label;
end;
$$;

-- ---------------------------------------------------------------------------
-- The tiles
-- ---------------------------------------------------------------------------

create or replace function owner_summary(p_venue_id uuid, p_date date, p_tz text default 'Africa/Cairo')
returns table (
  occupancy_pct integer,
  open_slots    integer,
  cash_due_egp  integer,
  cash_gates    integer,
  conflicts     integer
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_venue_staff(p_venue_id) then
    raise exception 'You do not have access to that venue.' using errcode = 'insufficient_privilege';
  end if;

  return query
  with cells as (
    select a.available
      from pitch p
      cross join lateral search_availability(p.id, p_date, p_tz) a
     where p.venue_id = p_venue_id
  ),
  owing as (
    select b.id as booking_id,
           coalesce(sum(pr.amount_egp), 0)::integer as amount
      from booking b
      join pitch p on p.id = b.pitch_id
      join payment_reference pr on pr.booking_id = b.id and pr.state = 'due'
     where p.venue_id = p_venue_id
       and (lower(b.during) at time zone p_tz)::date = p_date
       and b.state in ('confirmed', 'checked_in')
     group by b.id
  )
  select
    case when (select count(*) from cells) = 0 then 0
         else round(100.0 * (select count(*) from cells where not available)
                          / (select count(*) from cells))::integer end,
    (select count(*)::integer from cells where available),
    (select coalesce(sum(amount), 0)::integer from owing),
    (select count(*)::integer from owing),
    0;
end;
$$;

-- ---------------------------------------------------------------------------
-- And the verb that settles it
-- ---------------------------------------------------------------------------

-- The default was `cash_deposit`, a kind nothing raises any more, so the one
-- call a gate would make without thinking about it — `record_payment(id)` —
-- refused with "There is nothing outstanding of that kind."
create or replace function record_payment(
  p_booking_id uuid,
  p_kind       text default 'balance',
  p_reference  text default null
)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_venue uuid;
  v_rows  integer;
begin
  select venue_of_pitch(b.pitch_id) into v_venue from booking b where b.id = p_booking_id;

  if v_venue is null then
    return query select false, 'That booking no longer exists.';
    return;
  end if;
  if not is_venue_staff(v_venue) then
    return query select false, 'You do not have access to that venue.';
    return;
  end if;

  update payment_reference
     set state = 'collected', collected_by = auth.uid(), collected_at = now(),
         reference = coalesce(p_reference, reference)
   where booking_id = p_booking_id and kind = p_kind and state = 'due';
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return query select false, 'There is nothing outstanding of that kind.';
    return;
  end if;

  insert into booking_event (booking_id, event, actor, detail)
  values (p_booking_id, 'Payment collected', current_actor(),
          jsonb_build_object('kind', p_kind, 'reference', p_reference));

  return query select true, null::text;
end;
$$;

-- Closed here, handed back by access_control, which runs after this one.
revoke execute on function public.owner_arrivals(uuid, date, text)
  from public, anon, authenticated;
revoke execute on function public.owner_summary(uuid, date, text)
  from public, anon, authenticated;
revoke execute on function public.record_payment(uuid, text, text)
  from public, anon, authenticated;
