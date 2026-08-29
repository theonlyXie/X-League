-- No down payment. Nothing is owed before the match.
--
-- The spine was built around a cash deposit at the gate: a price rule carried
-- one, a confirmed booking inherited it, a trigger raised an obligation for it,
-- and a late cancellation forfeited it. The product no longer works that way —
-- a player books, turns up, and settles the whole price at the venue.
--
-- Every one of those behaviours reads the same source: `price_rule.deposit_egp`.
-- `hold_slot` copies it onto the booking, `seed_deposit_obligation` raises a
-- payment_reference only when it is above zero, `booking_terms` splits the price
-- by it, and `cancel_booking` forfeits whatever is still due. So this changes
-- the source rather than performing surgery on nine migrations of tested spine:
-- with no deposit on any rule, the machinery downstream is inert rather than
-- removed, and every existing case still passes because each one already
-- handled a zero deposit correctly.
--
-- The columns stay. A deposit is a pricing decision rather than a schema fact,
-- and leaving the shape in place is what makes reinstating one later a migration
-- instead of a rewrite. What is gone is any way for the product to set one:
-- `set_price_rule` no longer takes the argument, because a parameter that is
-- silently ignored is worse than a parameter that does not exist.

-- ---------------------------------------------------------------------------
-- Nothing currently owes anything
-- ---------------------------------------------------------------------------

update price_rule set deposit_egp = 0 where deposit_egp <> 0;

-- Bookings already sold with one. Their hour is unchanged; only what was asked
-- for up front is.
update booking set deposit_egp = 0 where deposit_egp <> 0;

-- An obligation nobody will now collect should not sit in the ledger as
-- outstanding. Waived rather than deleted: the row is a record that it existed,
-- and deleting history to make a report tidy is how a ledger stops being one.
update payment_reference
   set state = 'waived'
 where kind = 'cash_deposit' and state = 'due';

-- ---------------------------------------------------------------------------
-- And nothing can set one
-- ---------------------------------------------------------------------------

-- The old five-argument form is dropped rather than left beside the new one:
-- two overloads differing only by a deposit is exactly the ambiguity PostgREST
-- resolves by guessing.
drop function if exists public.set_price_rule(uuid, integer, integer, integer, integer, date);

create or replace function set_price_rule(
  p_pitch_id   uuid,
  p_start_hour integer,
  p_end_hour   integer,
  p_price_egp  integer,
  p_valid_from date default null
)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_venue uuid := venue_of_pitch(p_pitch_id);
  v_from  date := coalesce(p_valid_from, current_date);
  v_old   price_rule%rowtype;
begin
  if v_venue is null then
    return query select false, 'That pitch no longer exists.';
    return;
  end if;
  if not is_venue_staff(v_venue, 'manager') then
    return query select false, 'You do not manage that venue.';
    return;
  end if;
  if p_start_hour < 0 or p_end_hour > 24 or p_start_hour >= p_end_hour then
    return query select false, 'That is not a valid range of hours.';
    return;
  end if;
  if p_price_egp < 0 then
    return query select false, 'A price cannot be negative.';
    return;
  end if;

  -- Close any overlapping rule as of the new rule's start, rather than
  -- deleting it. History stays intact and the two never both apply.
  --
  -- Overlap is usually partial: a venue changing its 6-8 PM price still has a
  -- rule covering 8-11. Closing that rule wholesale would leave those hours
  -- with no price at all — which showed up as a pitch quoting EGP 0 for the
  -- rest of the evening. So each closed rule's uncovered remainder is carried
  -- forward as a continuation at the old price.
  for v_old in
    select * from price_rule pr
     where pr.pitch_id = p_pitch_id
       and (pr.valid_to is null or pr.valid_to > v_from)
       and pr.start_hour < p_end_hour and pr.end_hour > p_start_hour
  loop
    update price_rule set valid_to = v_from where id = v_old.id;

    if v_old.start_hour < p_start_hour then
      insert into price_rule (pitch_id, valid_from, start_hour, end_hour, price_egp, deposit_egp)
      values (p_pitch_id, v_from, v_old.start_hour, p_start_hour::smallint,
              v_old.price_egp, 0);
    end if;

    if v_old.end_hour > p_end_hour then
      insert into price_rule (pitch_id, valid_from, start_hour, end_hour, price_egp, deposit_egp)
      values (p_pitch_id, v_from, p_end_hour::smallint, v_old.end_hour,
              v_old.price_egp, 0);
    end if;
  end loop;

  insert into price_rule (pitch_id, valid_from, start_hour, end_hour, price_egp, deposit_egp)
  values (p_pitch_id, v_from, p_start_hour::smallint, p_end_hour::smallint,
          p_price_egp, 0);

  perform write_audit('price.set', 'pitch', p_pitch_id,
    jsonb_build_object('start_hour', p_start_hour, 'end_hour', p_end_hour,
                       'price_egp', p_price_egp, 'valid_from', v_from));

  return query select true, null::text;
end;
$$;

-- Closed here, handed back by access_control, which runs after this one.
revoke execute on function public.set_price_rule(uuid, integer, integer, integer, date)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The money is still owed — just at the venue, on the day
-- ---------------------------------------------------------------------------

-- Removing the deposit removed the only thing a venue could record collecting,
-- which would have left `venue_payouts` and `admin_ledger` reading zero
-- collected forever. That is not "no down payment", it is "no accounting".
--
-- So the obligation a confirmed booking raises is now the whole price, as a
-- `balance` rather than a `cash_deposit`. Same table, same states, same
-- `record_payment` — what changed is when it is due, not whether it exists.
create or replace function seed_deposit_obligation() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
begin
  if new.state <> 'confirmed' or new.price_egp <= 0 then
    return null;
  end if;
  if exists (select 1 from payment_reference
              where booking_id = new.id and kind = 'balance') then
    return null;
  end if;

  insert into payment_reference (booking_id, kind, amount_egp, state)
  values (new.id, 'balance', new.price_egp, 'due');
  return null;
end;
$$;

-- The trigger function runs as the table's owner and needs no grant; it is
-- revoked for the same reason every other one is.
revoke execute on function public.seed_deposit_obligation() from public, anon, authenticated;

-- Bookings confirmed before this change have no obligation at all — their
-- deposit row was waived above. Raise the balance they still owe so the ledger
-- is not silently missing every booking that already existed.
insert into payment_reference (booking_id, kind, amount_egp, state)
select b.id, 'balance', b.price_egp, 'due'
  from booking b
 where b.state in ('confirmed', 'checked_in')
   and b.price_egp > 0
   and not exists (select 1 from payment_reference pr
                    where pr.booking_id = b.id and pr.kind = 'balance');

-- ---------------------------------------------------------------------------
-- What the no-show restriction is called
-- ---------------------------------------------------------------------------

-- BKG-010's restriction message still named a deposit that no longer exists,
-- so somebody who had been restricted was told to fix a thing the product
-- stopped doing. The rule is unchanged — repeated no-shows restrict booking —
-- only what it is called.
--
-- Restated verbatim from 20260822100700 with that one string changed, because
-- CREATE OR REPLACE resets security and search_path, and because rewriting a
-- working function from memory to change a sentence is how `source`, the
-- captain-name lookup and the right standing column quietly go missing.
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
  v_allowed boolean;
  v_out     hold_outcome;
begin
  -- AUTH-001: booking is for signed-in people. Browsing is not.
  if v_uid is null then
    v_out := (false, null, null, null, null, 'Sign in to hold a slot.')::hold_outcome;
    return v_out;
  end if;

  -- An hour that has already started cannot be sold.
  if p_starts_at <= now() then
    v_out := (false, null, null, null, null, 'That slot has already started.')::hold_outcome;
    return v_out;
  end if;

  -- BKG-010: the restriction P-05 states.
  select cash_allowed into v_allowed from player_standing(v_uid);
  if v_allowed is false then
    v_out := (false, null, null, null, null,
              'Booking is restricted after repeated no-shows. Speak to the venue.'
             )::hold_outcome;
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

revoke execute on function public.hold_slot(uuid, timestamptz, integer, text, integer)
  from public, anon, authenticated;
