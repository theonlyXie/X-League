-- Nobody pays at the venue unless the venue said they could.
--
-- The app used to confirm every booking outright and tell the player to settle
-- at the gate on the day. That is an arrangement it was making on the venue's
-- behalf without ever asking them. Now a venue opts in, and a venue that has
-- not opted in receives a *request* it can accept or decline.
--
-- The two facts these cases exist to hold:
--
--   The default is off, including for venues that already existed. An
--   arrangement nobody agreed to should not be grandfathered in on the grounds
--   that it happens to be running.
--
--   A request holds the hour. The slot is blocked while the venue decides, or
--   the player waits for an answer about a pitch somebody else has taken in the
--   meantime. That is what `pending_payment` buys: the state is already in the
--   exclusion constraint and in every "this holds the slot" list in the
--   codebase, so the blocking is structural rather than remembered.
--
--   psql -f supabase/tests/pay_at_venue_probe.sql
--
-- Expects the identities from supabase/seed_identities.sql.

create or replace function pay_at_venue_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  BASEL uuid := '11111111-1111-1111-1111-111111111111';
  SALMA uuid := '22222222-2222-2222-2222-222222222222';
  KARIM uuid := '33333333-3333-3333-3333-333333333333';
  v_venue uuid;
  v_pitch uuid;
  v_slot  timestamptz;
  v_bk    uuid;
  v_n     integer;
  v_txt   text;
  v_bool  boolean;
  h       record;
  r       record;
begin
  select v.id, p.id into v_venue, v_pitch
    from pitch p join venue v on v.id = p.venue_id
   where v.name = 'Stadium One' and p.label = 'Pitch B';

  -- -------------------------------------------------------------------------
  -- The default
  -- -------------------------------------------------------------------------
  -- A venue nobody has configured. `Nasr Sports Club` is seeded without the
  -- column set, so this reads the column default rather than a seeded value —
  -- which is the thing worth checking, because the nine venues already in the
  -- live database are in exactly that position.
  select v.pay_at_venue into v_bool from venue v where v.name = 'Nasr Sports Club';
  return query select 'a venue nobody configured does not take money at the gate',
                      coalesce(v_bool::text, '(null)'), v_bool = false;

  -- -------------------------------------------------------------------------
  -- Turning it on is the owner's call
  -- -------------------------------------------------------------------------
  -- Salma is a manager at Stadium One. A manager runs the day; whether the
  -- venue takes money at the gate at all is an arrangement, not a shift.
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from set_pay_at_venue(v_venue, false);
  return query select 'a manager cannot change how the venue takes payment', r.reason,
                      not r.ok
                      and r.reason = 'Only the owner can change how this venue takes payment.';

  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from set_pay_at_venue(v_venue, false);
  return query select 'nor can somebody who works somewhere else', r.reason,
                      not r.ok
                      and r.reason = 'Only the owner can change how this venue takes payment.';

  update venue_staff set role = 'owner' where user_id = SALMA and venue_id = v_venue;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from set_pay_at_venue(v_venue, false);
  return query select 'the owner switches it off', coalesce(r.reason, 'ok'), r.ok;

  -- Changing how a venue takes money is the kind of decision somebody asks
  -- about three months later.
  select count(*)::integer into v_n
    from audit_log a where a.action = 'venue.pay_at_venue' and a.subject_id = v_venue;
  return query select 'and the change is on the record', v_n::text, v_n = 1;

  -- -------------------------------------------------------------------------
  -- What the booking screen reads before it words a button
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', null, true);
  select venue_pay_at_venue(v_venue) into v_bool;
  return query select 'a signed-out visitor can still be told Book or Request',
                      coalesce(v_bool::text, '(null)'), v_bool = false;

  return query select 'and reading it needs no account',
    case when has_function_privilege('anon', 'venue_pay_at_venue(uuid)', 'execute')
         then 'open to anon' else '(closed!)' end,
    has_function_privilege('anon', 'venue_pay_at_venue(uuid)', 'execute');

  -- -------------------------------------------------------------------------
  -- Booking at a venue that has not agreed
  -- -------------------------------------------------------------------------
  v_slot := ((current_date + 6 + interval '19 hours') at time zone 'Africa/Cairo');
  delete from booking where pitch_id = v_pitch and during && tstzrange(v_slot, v_slot + interval '1 hour');

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Basel Elsayed');
  v_bk := h.booking_id;

  select * into r from confirm_booking(v_bk);
  return query select 'confirming becomes asking', coalesce(r.state, '(none)'),
                      r.ok and r.state = 'requested';

  -- No code, because there is nothing yet to turn up and quote. A code handed
  -- out before the venue has agreed is a promise the app cannot keep.
  return query select 'and no booking code is handed out yet',
                      coalesce(r.code, '(none)'), r.code is null;

  select b.state::text into v_txt from booking b where b.id = v_bk;
  return query select 'the booking is waiting on the venue', coalesce(v_txt, '(gone)'),
                      v_txt = 'pending_payment';

  -- The hour has to stop being for sale the moment it is asked for, or the
  -- player is waiting on an answer about a pitch somebody else has booked.
  select count(*)::integer into v_n
    from search_availability(v_pitch, (v_slot at time zone 'Africa/Cairo')::date) sa
   where sa.hour = extract(hour from v_slot at time zone 'Africa/Cairo')::integer
     and sa.available;
  return query select 'and the hour is off sale while the venue decides', v_n::text, v_n = 0;

  -- A deadline belongs to a hold. A request is waiting on a person, and a
  -- countdown against somebody else's reply is a countdown nobody can act on.
  select (b.expires_at is null) into v_bool from booking b where b.id = v_bk;
  return query select 'a request has no countdown against it',
                      coalesce(v_bool::text, '(null)'), v_bool;

  select count(*)::integer into v_n
    from notification n where n.player_id = SALMA and n.kind = 'booking_request';
  return query select 'everybody who works there is told', v_n::text, v_n = 1;

  -- Tapping Request twice must not open a second one, and must say the same
  -- thing the first tap said.
  select * into r from confirm_booking(v_bk);
  return query select 'asking twice says the same thing', coalesce(r.state, '(none)'),
                      r.ok and r.state = 'requested';

  -- -------------------------------------------------------------------------
  -- The venue's answer
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from respond_to_booking_request(v_bk, true);
  return query select 'somebody from another venue cannot answer it', r.reason,
                      not r.ok and r.reason = 'That booking is not at your venue.';

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from respond_to_booking_request(v_bk, true);
  return query select 'nor can the player accept their own request', r.reason,
                      not r.ok and r.reason = 'That booking is not at your venue.';

  -- Answering is a shift job: whoever is on the desk when the request arrives.
  -- Only switching the arrangement on and off is reserved to the owner.
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select count(*)::integer into v_n from venue_requests(v_venue) vr where vr.booking_id = v_bk;
  return query select 'the venue sees the request waiting', v_n::text, v_n = 1;

  select vr.captain_name into v_txt from venue_requests(v_venue) vr where vr.booking_id = v_bk;
  return query select 'and who is asking, by name', coalesce(v_txt, '(none)'),
                      v_txt = 'Basel Elsayed';

  select * into r from respond_to_booking_request(v_bk, true);
  return query select 'the venue accepts', coalesce(r.reason, 'ok'), r.ok;

  return query select 'and only now is there a code', coalesce(r.code, '(none)'),
                      r.code is not null and length(r.code) > 0;

  select b.state::text into v_txt from booking b where b.id = v_bk;
  return query select 'the booking is confirmed', coalesce(v_txt, '(gone)'), v_txt = 'confirmed';

  select count(*)::integer into v_n
    from notification n where n.player_id = BASEL and n.kind = 'booking_accepted';
  return query select 'and the player is told', v_n::text, v_n = 1;

  select count(*)::integer into v_n from venue_requests(v_venue) vr where vr.booking_id = v_bk;
  return query select 'an answered request leaves the queue', v_n::text, v_n = 0;

  select * into r from respond_to_booking_request(v_bk, false);
  return query select 'and cannot be answered a second time', r.reason,
                      not r.ok and r.reason = 'That request has already been answered.';

  -- -------------------------------------------------------------------------
  -- Declining
  -- -------------------------------------------------------------------------
  v_slot := ((current_date + 6 + interval '21 hours') at time zone 'Africa/Cairo');
  delete from booking where pitch_id = v_pitch and during && tstzrange(v_slot, v_slot + interval '1 hour');

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Basel Elsayed');
  v_bk := h.booking_id;
  perform confirm_booking(v_bk);

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from respond_to_booking_request(v_bk, false, 'Pitch is being resurfaced.');
  return query select 'the venue can decline', coalesce(r.reason, 'ok'), r.ok;

  select b.state::text into v_txt from booking b where b.id = v_bk;
  return query select 'a declined request is cancelled, not left hanging',
                      coalesce(v_txt, '(gone)'), v_txt = 'cancelled';

  -- The hour goes back on sale. A venue that says no to one player has not
  -- taken the hour off the market.
  select count(*)::integer into v_n
    from search_availability(v_pitch, (v_slot at time zone 'Africa/Cairo')::date) sa
   where sa.hour = extract(hour from v_slot at time zone 'Africa/Cairo')::integer
     and sa.available;
  return query select 'and the hour is for sale again', v_n::text, v_n = 1;

  select n.body into v_txt
    from notification n
   where n.player_id = BASEL and n.kind = 'booking_declined'
   order by n.created_at desc limit 1;
  return query select 'the player is told, with the reason the venue gave',
                      coalesce(v_txt, '(none)'), v_txt = 'Pitch is being resurfaced.';

  -- -------------------------------------------------------------------------
  -- A venue that has agreed keeps today's behaviour exactly
  -- -------------------------------------------------------------------------
  select * into r from set_pay_at_venue(v_venue, true);

  v_slot := ((current_date + 6 + interval '23 hours') at time zone 'Africa/Cairo');
  delete from booking where pitch_id = v_pitch and during && tstzrange(v_slot, v_slot + interval '1 hour');

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Basel Elsayed');
  v_bk := h.booking_id;

  select * into r from confirm_booking(v_bk);
  return query select 'where the venue has agreed, confirming still confirms',
                      coalesce(r.state, '(none)'), r.ok and r.state = 'confirmed';

  return query select 'with a code there and then', coalesce(r.code, '(none)'),
                      r.code is not null and length(r.code) > 0;

  select count(*)::integer into v_n from venue_requests(v_venue);
  return query select 'and nothing for the venue to answer', v_n::text, v_n = 0;

  -- Idempotent, as it was before: a retried tap returns the same code rather
  -- than minting a second one.
  select * into r from confirm_booking(v_bk);
  return query select 'confirming twice returns the same booking',
                      coalesce(r.state, '(none)'), r.ok and r.state = 'confirmed';
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from pay_at_venue_probe();
rollback;

drop function pay_at_venue_probe();
