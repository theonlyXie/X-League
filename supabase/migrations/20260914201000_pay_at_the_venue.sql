-- Nobody pays at the venue unless the venue said they could.
--
-- Until now every confirmed booking ended the same way: "settle it at the
-- venue on the day". That is an arrangement the app was making on the venue's
-- behalf without asking them, and for most venues it is not the arrangement
-- they have. So it becomes a thing a venue switches on.
--
-- A venue that has switched it on keeps today's behaviour exactly: confirm,
-- get a code, turn up and pay. A venue that has not gets a *request* — the
-- hour is held for that player, the venue accepts or declines, and whatever
-- money changes hands is arranged between them off the app.
--
-- It is off for every venue, including the nine already in the database. That
-- is the deliberate choice: an arrangement nobody agreed to should not be
-- grandfathered in because it happens to be running.
--
-- ---------------------------------------------------------------------------
-- Why a request is `pending_payment` rather than a new state
-- ---------------------------------------------------------------------------
--
-- `booking_state` has carried `pending_payment` since the spine was written
-- and nothing has ever set it. It is already in the exclusion constraint that
-- stops two bookings sharing an hour, already in all six "this state holds the
-- slot" lists across the availability and grid queries, and already accepted
-- by `cancel_booking`.
--
-- A new `requested` value would have meant finding every one of those lists
-- and adding it — and the cost of missing one is a pitch sold twice. That is
-- the same shape of mistake as rebuilding a function from the wrong ancestor,
-- and it is avoided the same way: by not creating the opportunity. The state
-- is called `pending_payment` and it means "the venue has not said yes yet",
-- which is also, accurately, why no payment has been arranged.

alter table venue add column if not exists pay_at_venue boolean not null default false;

comment on column venue.pay_at_venue is
  'Whether this venue lets players book instantly and settle at the gate. Off '
  'by default: until an owner turns it on, a booking here is a request the '
  'venue has to accept.';

-- What the booking screen needs before it can word a button. Readable without
-- an account, because the person deciding whether to book is often not signed
-- in yet, and "Book" versus "Request" is the first honest thing to tell them.
create or replace function venue_pay_at_venue(p_venue_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce((select v.pay_at_venue from venue v where v.id = p_venue_id), false);
$$;

-- ---------------------------------------------------------------------------
-- Confirming, or asking
-- ---------------------------------------------------------------------------

-- The return type gains `state`, so this is a drop and a create. Postgres will
-- not widen a function's result in place, and the caller has to be able to
-- tell "you have a booking" from "you have asked for one" — those are two
-- different screens and the same `ok`.
drop function if exists confirm_booking(uuid);

create or replace function confirm_booking(p_booking_id uuid)
returns table (ok boolean, code text, state text, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_state   booking_state;
  v_code    text;
  v_captain uuid;
  v_venue   uuid;
  v_allowed boolean;
  v_name    text;
  v_when    timestamptz;
  v_vname   text;
  r         record;
begin
  select b.state, b.code, b.captain_id, v.id, v.pay_at_venue, v.name, lower(b.during)
    into v_state, v_code, v_captain, v_venue, v_allowed, v_vname, v_when
    from booking b
    join pitch p on p.id = b.pitch_id
    join venue v on v.id = p.venue_id
   where b.id = p_booking_id
     for update of b;

  if v_state is null then
    return query select false, null::text, null::text, 'That booking no longer exists.';
    return;
  end if;

  if v_captain is distinct from auth.uid() then
    return query select false, null::text, null::text, 'That hold belongs to someone else.';
    return;
  end if;

  -- Already answered, either way. Returning the same thing twice is what makes
  -- a retried tap harmless.
  if v_state in ('confirmed', 'checked_in', 'completed') then
    return query select true, v_code, 'confirmed'::text, null::text;
    return;
  end if;

  if v_state = 'pending_payment' then
    return query select true, null::text, 'requested'::text, null::text;
    return;
  end if;

  if v_state <> 'held' then
    return query select false, null::text, null::text, 'That hold is no longer active.';
    return;
  end if;

  if exists (select 1 from booking b where b.id = p_booking_id and b.expires_at <= now()) then
    update booking set state = 'expired', expires_at = null where id = p_booking_id;
    insert into booking_event (booking_id, event, actor, from_state, to_state)
    values (p_booking_id, 'Hold expired before confirmation', 'system · inventory lock', 'held', 'expired');
    return query select false, null::text, null::text, 'Your hold expired — the slot is back on sale.';
    return;
  end if;

  -- The venue takes money at the gate: nothing to ask, and the code is the
  -- thing they read out on arrival.
  if v_allowed then
    v_code := generate_booking_code();

    update booking
       set state = 'confirmed', code = v_code, expires_at = null
     where id = p_booking_id;

    insert into booking_event (booking_id, event, actor, from_state, to_state, detail)
    values (p_booking_id, 'Booking confirmed · pay at the venue', current_actor(), 'held', 'confirmed',
            jsonb_build_object('code', v_code));

    return query select true, v_code, 'confirmed'::text, null::text;
    return;
  end if;

  -- Otherwise it is a request. The hour stays blocked — that is what
  -- `pending_payment` does in the exclusion constraint — so nobody else can
  -- take it while the venue decides. `expires_at` has to be cleared: the
  -- schema allows a deadline only on a hold.
  update booking
     set state = 'pending_payment', expires_at = null
   where id = p_booking_id;

  insert into booking_event (booking_id, event, actor, from_state, to_state)
  values (p_booking_id, 'Requested · waiting on the venue', current_actor(), 'held', 'pending_payment');

  select coalesce(pp.display_name, 'A player') into v_name
    from player_profile pp where pp.id = auth.uid();

  -- Everybody who works there, because a request nobody sees is a request
  -- nobody answers.
  for r in select vs.user_id from venue_staff vs where vs.venue_id = v_venue and vs.active
  loop
    perform notify(
      r.user_id,
      'booking_request',
      v_name || ' has asked for an hour',
      to_char(v_when at time zone 'Africa/Cairo', 'FMDay FMDD Mon · FMHH12:MI AM') || ' at ' || v_vname,
      jsonb_build_object('screen', 'owner', 'booking_id', p_booking_id)
    );
  end loop;

  return query select true, null::text, 'requested'::text, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- The venue's answer
-- ---------------------------------------------------------------------------

create or replace function respond_to_booking_request(
  p_booking_id uuid,
  p_accept     boolean,
  p_note       text default null
)
returns table (ok boolean, code text, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_state   booking_state;
  v_captain uuid;
  v_venue   uuid;
  v_vname   text;
  v_code    text;
begin
  select b.state, b.captain_id, v.id, v.name
    into v_state, v_captain, v_venue, v_vname
    from booking b
    join pitch p on p.id = b.pitch_id
    join venue v on v.id = p.venue_id
   where b.id = p_booking_id
     for update of b;

  if v_state is null then
    return query select false, null::text, 'That booking no longer exists.';
    return;
  end if;

  if not is_venue_staff(v_venue, 'staff') then
    return query select false, null::text, 'That booking is not at your venue.';
    return;
  end if;

  if v_state <> 'pending_payment' then
    return query select false, null::text, 'That request has already been answered.';
    return;
  end if;

  if p_accept then
    v_code := generate_booking_code();

    update booking set state = 'confirmed', code = v_code where id = p_booking_id;

    insert into booking_event (booking_id, event, actor, from_state, to_state, detail)
    values (p_booking_id, 'Request accepted by the venue', current_actor(),
            'pending_payment', 'confirmed', jsonb_build_object('code', v_code));

    perform notify(
      v_captain,
      'booking_accepted',
      v_vname || ' confirmed your hour',
      'Your booking reference is ' || v_code || '.',
      jsonb_build_object('screen', 'booking', 'booking_id', p_booking_id)
    );

    return query select true, v_code, null::text;
    return;
  end if;

  update booking set state = 'cancelled' where id = p_booking_id;

  insert into booking_event (booking_id, event, actor, from_state, to_state, detail)
  values (p_booking_id, 'Request declined by the venue', current_actor(),
          'pending_payment', 'cancelled',
          jsonb_build_object('note', nullif(btrim(p_note), '')));

  perform notify(
    v_captain,
    'booking_declined',
    v_vname || ' could not take that hour',
    nullif(btrim(p_note), ''),
    jsonb_build_object('screen', 'play')
  );

  return query select true, null::text, null::text;
end;
$$;

-- What Owner Mode reads. Oldest first: a request that has been waiting longest
-- is the one somebody is still refreshing for.
create or replace function venue_requests(p_venue_id uuid default null)
returns table (
  booking_id   uuid,
  venue_id     uuid,
  venue_name   text,
  pitch_label  text,
  starts_at    timestamptz,
  minutes      integer,
  captain_name text,
  price_egp    integer,
  asked_at     timestamptz
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select b.id,
         v.id,
         v.name,
         p.label,
         lower(b.during),
         (extract(epoch from (upper(b.during) - lower(b.during))) / 60)::integer,
         coalesce(pp.display_name, b.captain_name, 'A player'),
         b.price_egp,
         b.updated_at
    from booking b
    join pitch p on p.id = b.pitch_id
    join venue v on v.id = p.venue_id
    left join player_profile pp on pp.id = b.captain_id
   where b.state = 'pending_payment'
     and upper(b.during) > now()
     and (p_venue_id is null or v.id = p_venue_id)
     and is_venue_staff(v.id, 'staff')
   order by b.updated_at;
$$;

-- ---------------------------------------------------------------------------
-- Turning it on
-- ---------------------------------------------------------------------------

-- Owners only. A manager runs the day; whether the venue takes money at the
-- gate at all is the owner's arrangement to make.
create or replace function set_pay_at_venue(p_venue_id uuid, p_allowed boolean)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from venue v where v.id = p_venue_id) then
    return query select false, 'That venue no longer exists.';
    return;
  end if;

  if not is_venue_staff(p_venue_id, 'owner') then
    return query select false, 'Only the owner can change how this venue takes payment.';
    return;
  end if;

  update venue set pay_at_venue = coalesce(p_allowed, false) where id = p_venue_id;

  -- Through the helper rather than into the table: `audit_log` has two
  -- not-null columns (`actor`, `subject_kind`) that a hand-written insert is
  -- free to forget, and `write_audit` is where the house fills them in.
  perform write_audit('venue.pay_at_venue', 'venue', p_venue_id,
                      jsonb_build_object('allowed', coalesce(p_allowed, false)));

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function venue_pay_at_venue(uuid) from public, anon, authenticated;
revoke all on function confirm_booking(uuid) from public, anon, authenticated;
revoke all on function respond_to_booking_request(uuid, boolean, text) from public, anon, authenticated;
revoke all on function venue_requests(uuid) from public, anon, authenticated;
revoke all on function set_pay_at_venue(uuid, boolean) from public, anon, authenticated;

-- Wording a button is not a privileged act, and the person reading it may not
-- have signed in yet.
grant execute on function venue_pay_at_venue(uuid) to anon, authenticated;
grant execute on function confirm_booking(uuid) to authenticated;
grant execute on function respond_to_booking_request(uuid, boolean, text) to authenticated;
grant execute on function venue_requests(uuid) to authenticated;
grant execute on function set_pay_at_venue(uuid, boolean) to authenticated;
