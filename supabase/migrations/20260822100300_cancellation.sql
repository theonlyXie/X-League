-- X League — cancellation, no-shows and money.
--
-- P-05 has been telling players, in both languages, that cancellation is free
-- until 3 PM and that two unexcused no-shows in a season restrict cash-deposit
-- bookings. Both sentences were copy. There was no way to cancel at all, no
-- record of a no-show, and nothing that could restrict anything.
--
-- A policy a screen states and the server cannot enforce is worse than no
-- policy: it is a promise to the venue that the product quietly breaks. This
-- migration makes both sentences true, and puts the numbers in a table so the
-- admin console can change them without a deploy.

-- ---------------------------------------------------------------------------
-- The policy itself
-- ---------------------------------------------------------------------------

-- ADM-013: platform settings are data, not constants compiled into functions,
-- so the cutoff can move without a migration and the change is auditable.
create table if not exists policy_setting (
  key         text primary key,
  value       integer not null,
  description text not null,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

insert into policy_setting (key, value, description) values
  ('cancellation_cutoff_hour', 15,
   'Hour of the match day, venue-local, until which cancellation is free. P-05 states 3 PM.'),
  ('no_show_limit', 2,
   'Unexcused no-shows within a season before cash-deposit booking is restricted.'),
  ('season_days', 180,
   'How far back a no-show counts against a player.'),
  ('hold_seconds', 292,
   'How long a hold survives before the slot returns to inventory.')
on conflict (key) do nothing;

create or replace function policy_value(p_key text, p_default integer default 0)
returns integer
language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce((select value from policy_setting where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------------
-- Money (§7.1 PaymentReference)
-- ---------------------------------------------------------------------------

-- BKG-007. Cash at the gate is still a payment, and the venue reconciling their
-- evening needs a row per obligation rather than a number derived from a
-- booking's state. Card and wallet land in the same table when they exist.
create table if not exists payment_reference (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references booking(id) on delete cascade,
  kind        text not null default 'cash_deposit'
                check (kind in ('cash_deposit', 'balance', 'card', 'wallet', 'refund')),
  amount_egp  integer not null check (amount_egp >= 0),
  state       text not null default 'due'
                check (state in ('due', 'collected', 'refunded', 'waived', 'forfeited')),
  -- Whatever the venue writes in their own book, so the two can be reconciled.
  reference   text,
  collected_by uuid references auth.users(id) on delete set null,
  collected_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists payment_reference_booking_idx on payment_reference (booking_id);

-- A confirmed booking owes its deposit at the gate. Written by trigger so the
-- obligation exists the moment the booking does, rather than being conjured by
-- whichever screen happens to ask about it.
create or replace function seed_deposit_obligation() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
begin
  if new.state <> 'confirmed' or new.deposit_egp <= 0 then
    return null;
  end if;
  if exists (select 1 from payment_reference
              where booking_id = new.id and kind = 'cash_deposit') then
    return null;
  end if;

  insert into payment_reference (booking_id, kind, amount_egp, state)
  values (new.id, 'cash_deposit', new.deposit_egp, 'due');
  return null;
end;
$$;

drop trigger if exists booking_seed_deposit on booking;
create trigger booking_seed_deposit
  after insert or update of state on booking
  for each row execute function seed_deposit_obligation();

-- ---------------------------------------------------------------------------
-- Standing (BKG-010)
-- ---------------------------------------------------------------------------

-- What the product knows about whether to trust somebody with a cash deposit.
-- Exposed to the player as well as the venue, because a restriction nobody can
-- see is one nobody can fix.
create or replace function player_standing(p_player_id uuid)
returns table (
  no_shows        integer,
  late_cancels    integer,
  limit_reached   boolean,
  cash_allowed    boolean,
  season_days     integer
)
language sql stable security definer
set search_path = public, pg_temp as $$
  with s as (
    select policy_value('season_days', 180) as days,
           policy_value('no_show_limit', 2) as lim
  ),
  counted as (
    select
      count(*) filter (where b.state = 'no_show')::integer as no_shows,
      count(*) filter (
        where b.state = 'cancelled'
          and exists (select 1 from booking_event be
                       where be.booking_id = b.id and be.event = 'Cancelled after the cutoff')
      )::integer as late_cancels
    from booking b, s
    where b.captain_id = p_player_id
      and lower(b.during) > now() - make_interval(days => s.days)
  )
  select c.no_shows, c.late_cancels,
         c.no_shows >= s.lim,
         c.no_shows < s.lim,
         s.days
    from counted c, s;
$$;

create or replace function my_standing()
returns table (
  no_shows      integer,
  late_cancels  integer,
  limit_reached boolean,
  cash_allowed  boolean,
  season_days   integer
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select * from player_standing(auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Cancelling
-- ---------------------------------------------------------------------------

-- The cutoff, resolved in the venue's own zone. "3 PM today" means 3 PM where
-- the pitch is, which on a booking made from another timezone is not 3 PM where
-- the phone is.
create or replace function cancellation_cutoff(p_booking_id uuid, p_tz text default 'Africa/Cairo')
returns timestamptz
language sql stable security definer
set search_path = public, pg_temp as $$
  select (
    ((lower(b.during) at time zone p_tz)::date
      + make_interval(hours => policy_value('cancellation_cutoff_hour', 15)))
    at time zone p_tz
  )
  from booking b where b.id = p_booking_id;
$$;

-- BKG-008. Cancelling returns the hour to inventory immediately — the
-- exclusion constraint only counts live states, so the slot is saleable the
-- moment this commits, with no sweeper in the loop.
create or replace function cancel_booking(p_booking_id uuid)
returns table (ok boolean, free boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_captain uuid;
  v_state   booking_state;
  v_venue   uuid;
  v_cutoff  timestamptz;
  v_free    boolean;
  v_staff   boolean;
begin
  select b.captain_id, b.state, venue_of_pitch(b.pitch_id)
    into v_captain, v_state, v_venue
    from booking b where b.id = p_booking_id for update;

  if v_state is null then
    return query select false, false, 'That booking no longer exists.';
    return;
  end if;

  v_staff := is_venue_staff(v_venue);

  -- The captain cancels their own; the venue cancels anything at their venue,
  -- which is what a phone call to reception actually is.
  if v_captain is distinct from auth.uid() and not v_staff then
    return query select false, false, 'That booking is not yours to cancel.';
    return;
  end if;

  if v_state in ('cancelled', 'expired') then
    return query select true, true, null::text;
    return;
  end if;

  if v_state in ('checked_in', 'completed') then
    return query select false, false, 'That match has already been played.';
    return;
  end if;

  if v_state not in ('held', 'pending_payment', 'confirmed') then
    return query select false, false, 'That booking cannot be cancelled.';
    return;
  end if;

  v_cutoff := cancellation_cutoff(p_booking_id);
  v_free   := now() < v_cutoff;

  update booking set state = 'cancelled', expires_at = null where id = p_booking_id;

  insert into booking_event (booking_id, event, actor, from_state, to_state, detail)
  values (p_booking_id,
          case when v_free then 'Cancelled before the cutoff'
               else 'Cancelled after the cutoff' end,
          current_actor(), v_state, 'cancelled',
          jsonb_build_object('cutoff', v_cutoff, 'free', v_free));

  -- A free cancellation owes nothing. A late one forfeits the deposit, which
  -- is the venue's compensation for an hour they can no longer sell.
  update payment_reference
     set state = case when v_free then 'waived' else 'forfeited' end
   where booking_id = p_booking_id and state = 'due';

  -- Squad places go with it, so nobody is left holding an invitation to a
  -- match that is not happening.
  update booking_participant set state = 'removed'
   where booking_id = p_booking_id and state in ('invited', 'accepted');

  return query select true, v_free, null::text;
end;
$$;

-- BKG-010 / RBAC-002. Only the venue can say somebody did not turn up, and only
-- once the hour has passed — a no-show declared at 8:59 for a 9 PM match is not
-- evidence of anything.
create or replace function mark_no_show(p_booking_id uuid)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_state   booking_state;
  v_venue   uuid;
  v_starts  timestamptz;
  v_captain uuid;
begin
  select b.state, venue_of_pitch(b.pitch_id), lower(b.during), b.captain_id
    into v_state, v_venue, v_starts, v_captain
    from booking b where b.id = p_booking_id for update;

  if v_state is null then
    return query select false, 'That booking no longer exists.';
    return;
  end if;

  if not is_venue_staff(v_venue) then
    return query select false, 'You do not have access to that venue.';
    return;
  end if;

  if v_state = 'no_show' then
    return query select true, null::text;
    return;
  end if;

  if v_state <> 'confirmed' then
    return query select false, 'Only a confirmed booking can be marked a no-show.';
    return;
  end if;

  if now() < v_starts then
    return query select false, 'That match has not started yet.';
    return;
  end if;

  update booking set state = 'no_show' where id = p_booking_id;

  insert into booking_event (booking_id, event, actor, from_state, to_state)
  values (p_booking_id, 'Nobody arrived', current_actor(), 'confirmed', 'no_show');

  update payment_reference set state = 'forfeited'
   where booking_id = p_booking_id and state = 'due';

  -- PTS: a no-show costs the captain, and the ledger says why.
  if v_captain is not null then
    insert into point_ledger (player_id, kind, points, note)
    values (v_captain, 'no_show', points_for('no_show'), 'Did not arrive');
  end if;

  return query select true, null::text;
end;
$$;

-- BKG-007: the gate collecting cash is a payment event, recorded as one.
create or replace function record_payment(
  p_booking_id uuid,
  p_kind       text default 'cash_deposit',
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

-- ---------------------------------------------------------------------------
-- The restriction, enforced where it matters
-- ---------------------------------------------------------------------------

-- hold_slot, restated in full. CREATE OR REPLACE resets security, search_path
-- and every attribute to what this statement says, so all of it is repeated
-- rather than assumed — the same reason search_availability is restated in the
-- discovery migration.
--
-- What is new is the standing check. P-05 promises the venue that repeated
-- no-shows restrict cash-deposit booking; this is the only place that promise
-- can actually be kept, because it is the only place inventory is claimed.
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

  -- BKG-010: the restriction P-05 states.
  select cash_allowed into v_allowed from player_standing(v_uid);
  if v_allowed is false then
    v_out := (false, null, null, null, null,
              'Cash-deposit booking is restricted after repeated no-shows. Speak to the venue.'
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

-- What the checkout screen should be told rather than assume: the real cutoff
-- for this booking, and whether cancelling now is free.
create or replace function booking_terms(p_booking_id uuid)
returns table (
  cutoff_at    timestamptz,
  free_now     boolean,
  deposit_egp  integer,
  balance_egp  integer,
  deposit_state text
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select cancellation_cutoff(b.id),
         now() < cancellation_cutoff(b.id),
         b.deposit_egp,
         greatest(0, b.price_egp - b.deposit_egp),
         coalesce((select pr.state from payment_reference pr
                    where pr.booking_id = b.id and pr.kind = 'cash_deposit'
                    order by pr.created_at desc limit 1), 'due')
    from booking b
   where b.id = p_booking_id
     and (b.captain_id = auth.uid() or is_venue_staff(venue_of_pitch(b.pitch_id)));
$$;

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

alter table policy_setting     enable row level security;
alter table payment_reference  enable row level security;

alter function public.seed_deposit_obligation() set search_path = public, pg_temp;

revoke execute on function public.seed_deposit_obligation()      from public, anon, authenticated;
revoke execute on function public.policy_value(text, integer)    from public, anon, authenticated;
revoke execute on function public.player_standing(uuid)          from public, anon, authenticated;
revoke execute on function public.cancellation_cutoff(uuid, text) from public, anon;
revoke execute on function public.cancel_booking(uuid)           from public, anon;
revoke execute on function public.mark_no_show(uuid)             from public, anon;
revoke execute on function public.record_payment(uuid, text, text) from public, anon;
revoke execute on function public.my_standing()                  from public, anon;
revoke execute on function public.booking_terms(uuid)            from public, anon;
revoke execute on function public.hold_slot(uuid, timestamptz, integer, text, integer) from public;

-- `player_standing(uuid)` takes an id and stays internal; `my_standing()` is
-- the version a client may call, and it can only ask about itself.
grant execute on function public.my_standing()                   to authenticated;
grant execute on function public.cancellation_cutoff(uuid, text) to authenticated;
grant execute on function public.cancel_booking(uuid)            to authenticated;
grant execute on function public.mark_no_show(uuid)              to authenticated;
grant execute on function public.record_payment(uuid, text, text) to authenticated;
grant execute on function public.booking_terms(uuid)             to authenticated;
grant execute on function public.hold_slot(uuid, timestamptz, integer, text, integer) to anon, authenticated;

comment on table public.policy_setting is
  'Platform policy as data. P-05 states the cutoff and the no-show limit to the player; these rows are what actually enforce them.';
