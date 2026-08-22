-- Cancellation, no-show and payment probe (BKG-007 / BKG-008 / BKG-010).
--
-- P-05 states two policies to the player in both languages: free cancellation
-- until 3 PM, and two unexcused no-shows in a season restricting cash-deposit
-- bookings. These cases are the difference between the screen saying that and
-- the server doing it.
--
--   psql -f supabase/tests/cancellation_probe.sql

create or replace function cancellation_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  BASEL uuid := '11111111-1111-1111-1111-111111111111';
  SALMA uuid := '22222222-2222-2222-2222-222222222222';
  KARIM uuid := '33333333-3333-3333-3333-333333333333';
  v_pitch uuid;
  v_slot  timestamptz;
  v_bk    uuid;
  v_n     integer;
  v_txt   text;
  v_bool  boolean;
  h       hold_outcome;
  r       record;
begin
  select p.id into v_pitch
    from pitch p join venue v on v.id = p.venue_id
   where v.name = 'Stadium One' and p.label = 'Pitch B';

  -- A match well in the future, so "before the cutoff" is unambiguous.
  v_slot := ((current_date + 3 + interval '21 hours') at time zone 'Africa/Cairo');
  delete from booking where pitch_id = v_pitch and during && tstzrange(v_slot, v_slot + interval '1 hour');

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Basel Elsayed');
  v_bk := h.booking_id;
  perform confirm_booking(v_bk);

  -- -------------------------------------------------------------------------
  -- BKG-007 — the deposit is an obligation, not a number on a screen
  -- -------------------------------------------------------------------------
  select count(*)::integer into v_n
    from payment_reference where booking_id = v_bk and kind = 'cash_deposit' and state = 'due';
  return query select 'confirming creates the deposit owed at the gate', v_n::text, v_n = 1;

  select deposit_state into v_txt from booking_terms(v_bk);
  return query select 'and checkout can read its state', v_txt, v_txt = 'due';

  select free_now into v_bool from booking_terms(v_bk);
  return query select 'cancelling is free before the cutoff', v_bool::text, v_bool;

  -- -------------------------------------------------------------------------
  -- RBAC — whose booking it is
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from cancel_booking(v_bk);
  return query select 'somebody else cannot cancel it',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'That booking is not yours to cancel.';

  -- -------------------------------------------------------------------------
  -- BKG-008 — cancelling returns the hour to inventory
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  perform invite_to_booking(v_bk, SALMA, null, 'starter', 'MID');

  select available into v_bool
    from search_availability(v_pitch, (v_slot at time zone 'Africa/Cairo')::date) where hour = 21;
  return query select 'the booked hour is not saleable', v_bool::text, v_bool = false;

  select * into r from cancel_booking(v_bk);
  return query select 'the captain can cancel', coalesce(r.reason, 'cancelled'), r.ok;
  return query select 'and it is recorded as free', r.free::text, r.free;

  select available into v_bool
    from search_availability(v_pitch, (v_slot at time zone 'Africa/Cairo')::date) where hour = 21;
  return query select 'the hour is saleable again immediately', v_bool::text, v_bool;

  select state into v_txt from payment_reference where booking_id = v_bk and kind = 'cash_deposit';
  return query select 'a free cancellation waives the deposit', v_txt, v_txt = 'waived';

  select count(*)::integer into v_n
    from booking_participant where booking_id = v_bk and state in ('invited', 'accepted');
  return query select 'and nobody is left holding an invitation', v_n::text, v_n = 0;

  select * into r from cancel_booking(v_bk);
  return query select 'cancelling twice is harmless', coalesce(r.reason, 'ok'), r.ok;

  -- -------------------------------------------------------------------------
  -- After the cutoff
  -- -------------------------------------------------------------------------
  -- A match *today*: the cutoff is an hour on the match day, so a booking three
  -- days out has a cutoff three days out whatever hour is configured.
  v_slot := ((current_date + interval '23 hours') at time zone 'Africa/Cairo');
  delete from booking where pitch_id = v_pitch and during && tstzrange(v_slot, v_slot + interval '1 hour');
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Basel Elsayed');
  v_bk := h.booking_id;
  perform confirm_booking(v_bk);

  -- Move the policy rather than the clock: the cutoff is data, which is the
  -- point of putting it in a table. Midnight on the match day has passed.
  update policy_setting set value = 0 where key = 'cancellation_cutoff_hour';
  select free_now into v_bool from booking_terms(v_bk);
  return query select 'with the cutoff passed, cancelling is no longer free',
                      v_bool::text, v_bool = false;

  select * into r from cancel_booking(v_bk);
  return query select 'it is still allowed', coalesce(r.reason, 'cancelled'), r.ok;
  return query select 'but recorded as late', r.free::text, r.free = false;

  select state into v_txt from payment_reference where booking_id = v_bk and kind = 'cash_deposit';
  return query select 'and the deposit is forfeited', v_txt, v_txt = 'forfeited';
  update policy_setting set value = 15 where key = 'cancellation_cutoff_hour';

  -- -------------------------------------------------------------------------
  -- BKG-010 — no-shows
  -- -------------------------------------------------------------------------
  -- A match that has already started, so a no-show is a real observation. Set
  -- up directly: hold_slot refuses to sell an hour that has already begun.
  v_slot := ((current_date - 1 + interval '20 hours') at time zone 'Africa/Cairo');
  v_bk := test_past_booking(v_pitch, v_slot, BASEL);

  select * into r from mark_no_show(v_bk);
  return query select 'a player cannot declare their own no-show',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from mark_no_show(v_bk);
  return query select 'nor can staff at a different venue',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'You do not have access to that venue.';

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from mark_no_show(v_bk);
  return query select 'the hosting venue can', coalesce(r.reason, 'marked'), r.ok;

  select state into v_txt from booking where id = v_bk;
  return query select 'the booking reads as a no-show', v_txt, v_txt = 'no_show';

  select count(*)::integer into v_n
    from point_ledger where player_id = BASEL and kind = 'no_show';
  return query select 'and it costs the captain XP', v_n::text, v_n = 1;

  -- A no-show before the match has started is not an observation.
  v_slot := ((current_date + 3 + interval '19 hours') at time zone 'Africa/Cairo');
  delete from booking where pitch_id = v_pitch and during && tstzrange(v_slot, v_slot + interval '1 hour');
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Basel Elsayed');
  perform confirm_booking(h.booking_id);
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from mark_no_show(h.booking_id);
  return query select 'a no-show cannot be declared before kick-off',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'That match has not started yet.';
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  perform cancel_booking(h.booking_id);

  -- -------------------------------------------------------------------------
  -- The restriction P-05 promises
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select no_shows, cash_allowed into r from my_standing();
  return query select 'one no-show does not restrict booking',
                      r.no_shows || ', allowed=' || r.cash_allowed, r.no_shows = 1 and r.cash_allowed;

  -- A second one, on another evening.
  v_slot := ((current_date - 2 + interval '20 hours') at time zone 'Africa/Cairo');
  v_bk := test_past_booking(v_pitch, v_slot, BASEL);
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  perform mark_no_show(v_bk);

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select no_shows, cash_allowed into r from my_standing();
  return query select 'two do', r.no_shows || ', allowed=' || r.cash_allowed,
                      r.no_shows = 2 and r.cash_allowed = false;

  v_slot := ((current_date + 4 + interval '21 hours') at time zone 'Africa/Cairo');
  delete from booking where pitch_id = v_pitch and during && tstzrange(v_slot, v_slot + interval '1 hour');
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Basel Elsayed');
  return query select 'and the next hold is refused, on the server',
                      coalesce(h.reason, '(allowed!)'),
                      h.ok = false
                      and h.reason like 'Cash-deposit booking is restricted%';

  select count(*)::integer into v_n
    from booking where pitch_id = v_pitch and during && tstzrange(v_slot, v_slot + interval '1 hour');
  return query select 'nothing was written', v_n::text, v_n = 0;

  -- Someone else is unaffected.
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Karim Tarek');
  return query select 'another player is unaffected', coalesce(h.reason, 'held'), h.ok;
  perform release_hold(h.booking_id);

  -- Raising the limit lifts the restriction without a deploy.
  update policy_setting set value = 5 where key = 'no_show_limit';
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Basel Elsayed');
  return query select 'the limit is data, so changing it lifts the restriction',
                      coalesce(h.reason, 'held'), h.ok;
  update policy_setting set value = 2 where key = 'no_show_limit';

  -- -------------------------------------------------------------------------
  -- BKG-007 — collecting the cash
  -- -------------------------------------------------------------------------
  -- As Karim: Basel is restricted by the block above, so a hold of his would
  -- return no booking and every case here would silently test a null id.
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  v_slot := ((current_date + 5 + interval '21 hours') at time zone 'Africa/Cairo');
  delete from booking where pitch_id = v_pitch and during && tstzrange(v_slot, v_slot + interval '1 hour');
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Karim Tarek');
  v_bk := h.booking_id;
  perform confirm_booking(v_bk);

  select * into r from record_payment(v_bk, 'cash_deposit', 'book 4 p12');
  return query select 'a player cannot mark their own deposit collected',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'You do not have access to that venue.';

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from record_payment(v_bk, 'cash_deposit', 'book 4 p12');
  return query select 'the gate can', coalesce(r.reason, 'collected'), r.ok;

  select state into v_txt from payment_reference where booking_id = v_bk and kind = 'cash_deposit';
  return query select 'and it is recorded against the venue''s own reference',
                      v_txt, v_txt = 'collected';

  select * into r from record_payment(v_bk, 'cash_deposit');
  return query select 'collecting twice is refused',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from cancellation_probe();
rollback;

drop function cancellation_probe();
