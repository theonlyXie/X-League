-- Owner Mode and admin console probe (OWN / ADM / RBAC-002 / RBAC-003).
--
-- Two authority models meet in this migration and they are different shapes.
-- Venue authority is per venue and by role; platform authority is global and
-- lives in its own table. Most of these cases are the boundary between them:
-- a venue manager must never reach a platform control, and a platform
-- moderator must never quietly become a venue's owner.
--
--   psql -f supabase/tests/owner_admin_probe.sql

create or replace function owner_admin_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  BASEL uuid := '11111111-1111-1111-1111-111111111111';  -- plain player
  SALMA uuid := '22222222-2222-2222-2222-222222222222';  -- manager, Stadium One
  KARIM uuid := '33333333-3333-3333-3333-333333333333';  -- staff, The Box
  ADMIN uuid := '99999999-9999-9999-9999-999999999999';  -- platform admin
  v_venue uuid;
  v_box   uuid;
  v_pitch uuid;
  v_new_pitch uuid;
  v_slot  timestamptz;
  v_bk    uuid;
  v_n     integer;
  v_price integer;
  v_txt   text;
  v_num   numeric;
  v_bool  boolean;
  h       hold_outcome;
  r       record;
begin
  select id into v_venue from venue where name = 'Stadium One';
  select id into v_box   from venue where name = 'The Box';
  select id into v_pitch from pitch where venue_id = v_venue and label = 'Pitch C';

  -- =========================================================================
  -- O-03 Pricing
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from set_price_rule(v_pitch, 18, 20, 400);
  return query select 'a player cannot change a price',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'You do not manage that venue.';

  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from set_price_rule(v_pitch, 18, 20, 400);
  return query select 'nor can staff at another venue',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from set_price_rule(v_pitch, 20, 18, 400);
  return query select 'an inverted hour range is refused',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from set_price_rule(v_pitch, 18, 20, -1);
  return query select 'a negative price is refused',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'A price cannot be negative.';

  select * into r from set_price_rule(v_pitch, 18, 20, 400);
  return query select 'the manager can set a price', coalesce(r.reason, 'set'), r.ok;

  select price_egp into v_n from search_availability(v_pitch, current_date) where hour = 18;
  return query select 'and the new price reaches player search', v_n::text, v_n = 400;

  -- PAY: a price is all a rule carries now. Nothing a venue can set asks a
  -- player for money before the match.
  select deposit_egp into v_n from search_availability(v_pitch, current_date) where hour = 18;
  return query select 'and it asks for nothing up front', v_n::text, v_n = 0;

  select price_egp into v_n from search_availability(v_pitch, current_date) where hour = 21;
  return query select 'and the hours it did not cover keep their old price',
                      v_n::text, v_n = 300;

  select price_egp into v_n from search_availability(v_pitch, current_date) where hour = 23;
  return query select 'including a separate later-hour rule', v_n::text, v_n = 260;

  select count(*)::integer into v_n
    from venue_price_rules(v_venue) where pitch_id = v_pitch and start_hour = 18;
  return query select 'the superseded rule is closed, not deleted', v_n::text, v_n = 2;

  select count(*)::integer into v_n
    from venue_price_rules(v_venue) where pitch_id = v_pitch and start_hour = 18 and live;
  return query select 'and exactly one of them is live', v_n::text, v_n = 1;

  -- =========================================================================
  -- O-02 Hours and pitches — a venue that can open
  -- =========================================================================
  -- availability_rule was read in five places and written in none, so a venue
  -- registered through the product had no sellable hours and no way to get any.
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from set_venue_hours(v_pitch, 1, 10, 24);
  return query select 'a player cannot set opening hours',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'You do not manage that venue.';

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from set_venue_hours(v_pitch, 1, 20, 10);
  return query select 'closing before opening is refused',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason like 'Closing time%';

  select * into r from set_venue_hours(v_pitch, 9, 10, 24);
  return query select 'and there is no ninth day',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from set_venue_hours(v_pitch, 1, 9, 23);
  return query select 'the manager can set them', coalesce(r.reason, 'set'), r.ok;

  select count(*)::integer into v_n
    from venue_hours(v_venue) where pitch_id = v_pitch and day_of_week = 1
      and open_hour = 9 and close_hour = 23;
  return query select 'and read them back', v_n::text, v_n = 1;

  -- Setting the same day twice replaces rather than appends: two rules for one
  -- day would generate every hour twice in the booking grid.
  perform set_venue_hours(v_pitch, 1, 8, 22);
  select count(*)::integer into v_n
    from venue_hours(v_venue) where pitch_id = v_pitch and day_of_week = 1;
  return query select 'setting a day twice leaves one rule', v_n::text, v_n = 1;

  -- Equal hours is how a venue says it does not open that day.
  perform set_venue_hours(v_pitch, 1, 0, 0);
  select count(*)::integer into v_n
    from venue_hours(v_venue)
   where pitch_id = v_pitch and day_of_week = 1 and open_hour is not null;
  return query select 'and equal hours closes the day', v_n::text, v_n = 0;
  perform set_venue_hours(v_pitch, 1, 18, 24);

  -- Pitches: nothing could create one, so every venue was permanently a
  -- one-pitch venue and both pitch pickers were unreachable.
  select * into r from add_pitch(v_venue, 'Pitch A');
  return query select 'a duplicate pitch name is refused',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason like 'There is already%';

  select * into r from add_pitch(v_venue, 'Pitch Z');
  return query select 'the manager can add a pitch', coalesce(r.reason, 'added'), r.ok;
  v_new_pitch := r.pitch_id;

  -- A pitch with no hours cannot be sold, which is the trap this closes.
  select count(*)::integer into v_n from availability_rule where pitch_id = v_new_pitch;
  return query select 'and it inherits the venue''s week', v_n::text, v_n > 0;

  select * into r from update_pitch(v_new_pitch, 'Pitch Omega');
  return query select 'and can be renamed', coalesce(r.reason, 'renamed'), r.ok;

  select * into r from update_pitch(v_new_pitch, null, null, false);
  return query select 'and taken out of service', coalesce(r.reason, 'retired'), r.ok;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from add_pitch(v_venue, 'Sneaky');
  return query select 'a player cannot add a pitch',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);

  -- =========================================================================
  -- O-04 Closures
  -- =========================================================================
  v_slot := ((current_date + 1 + interval '22 hours') at time zone 'Africa/Cairo');
  select * into r from close_slot(v_pitch, v_slot, 60, 'maintenance', 'Watering');
  return query select 'the manager can close an hour', coalesce(r.reason, 'closed'), r.ok;

  select available into v_txt
    from search_availability(v_pitch, (current_date + 1)) where hour = 22;
  return query select 'and it leaves player search', v_txt, v_txt = 'false';

  select * into r from reopen_slot(
    (select exception_id from venue_closures(v_venue) limit 1));
  return query select 'and can be reopened', coalesce(r.reason, 'reopened'), r.ok;

  -- Closing an hour somebody bought would strand them.
  v_slot := ((current_date + 1 + interval '19 hours') at time zone 'Africa/Cairo');
  delete from booking where pitch_id = v_pitch and during && tstzrange(v_slot, v_slot + interval '1 hour');
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Basel Elsayed');
  v_bk := h.booking_id;
  perform confirm_booking(v_bk);

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from close_slot(v_pitch, v_slot, 60, 'maintenance', 'Watering');
  return query select 'closing an hour somebody already bought is refused',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false
                      and r.reason = 'Somebody has already booked that hour. Cancel the booking first.';

  -- =========================================================================
  -- O-01 The gate — what is owed, and taking it
  -- =========================================================================
  -- All three of these read `booking.deposit_egp`, which no_deposit set to
  -- zero everywhere, so the screen a venue works its evening from said there
  -- was no cash to collect from anybody.
  select price_egp into v_price from booking where id = v_bk;

  select due_egp into v_num from owner_arrivals(v_venue, current_date + 1)
   where booking_id = v_bk;
  return query select 'the arrival says what is owed at the gate',
                      v_num::text, v_num = v_price;

  select cash_due_egp into v_num from owner_summary(v_venue, current_date + 1);
  return query select 'and the tile totals it', v_num::text, v_num >= v_price;

  -- The default kind used to be `cash_deposit`, so the one call a gate makes
  -- without thinking — record_payment(id) — refused.
  select * into r from record_payment(v_bk);
  return query select 'the cash can be taken without naming a kind',
                      coalesce(r.reason, 'collected'), r.ok;

  select due_egp into v_num from owner_arrivals(v_venue, current_date + 1)
   where booking_id = v_bk;
  return query select 'and then nothing is owed', v_num::text, v_num = 0;

  select paid into v_bool from owner_arrivals(v_venue, current_date + 1)
   where booking_id = v_bk;
  return query select 'while the arrival still says it was paid', v_bool::text, v_bool;

  -- A no-show has to stay on the shift, or the operator cannot see that they
  -- marked it.
  select count(*)::integer into v_n from owner_arrivals(v_venue, current_date + 1);
  return query select 'and every channel is on the shift', v_n::text, v_n > 0;

  -- =========================================================================
  -- O-05 Staff
  -- =========================================================================
  select * into r from set_venue_staff(v_venue, BASEL, 'staff');
  return query select 'the manager can add staff', coalesce(r.reason, 'added'), r.ok;

  select * into r from set_venue_staff(v_venue, BASEL, 'owner');
  return query select 'but cannot grant a role above their own',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'You cannot grant a role above your own.';

  select * into r from set_venue_staff(v_venue, SALMA, 'owner');
  return query select 'nor change their own role at all',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'You cannot change your own role.';

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from set_venue_staff(v_venue, KARIM, 'staff');
  return query select 'a plain staff member cannot manage staff',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select count(*)::integer into v_n from venue_staff_list(v_venue);
  return query select 'the roster lists everybody who works there', v_n::text, v_n = 2;

  perform set_venue_staff(v_venue, BASEL, 'staff', false);
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select count(*)::integer into v_n from my_venues();
  return query select 'suspending staff takes effect on the next call', v_n::text, v_n = 0;

  -- =========================================================================
  -- O-06 Payouts
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  -- Compared against what the day actually holds rather than a literal: an
  -- earlier case in this probe changed the price rule for one of these hours.
  select coalesce(sum(b.price_egp), 0)::integer into v_n
    from booking b join pitch p on p.id = b.pitch_id
   where p.venue_id = v_venue
     and (lower(b.during) at time zone 'Africa/Cairo')::date = current_date + 1
     and b.state in ('confirmed', 'checked_in', 'completed', 'no_show');
  select price_egp into v_price from booking where id = v_bk;

  -- Gross is what was sold. It used to be filtered on `kind = 'cash_deposit'`,
  -- which no_deposit made unreachable, so both money screens read zero — and
  -- admin_ledger sorted its venues by that zero.
  select gross_egp into v_num
    from venue_payouts(v_venue, current_date + 1, current_date + 1);
  return query select 'the payout row states what was sold', v_num::text, v_num = v_n;

  -- The gate took this one in O-01 above, and the payout row is where that
  -- lands. It used to land nowhere a venue could see.
  select collected_egp into v_num
    from venue_payouts(v_venue, current_date + 1, current_date + 1);
  return query select 'cash taken at the gate reaches the payout row',
                      v_num::text, v_num = v_price;

  select outstanding_egp into v_num
    from venue_payouts(v_venue, current_date + 1, current_date + 1);
  return query select 'and stops being outstanding', v_num::text, v_num = v_n - v_price;

  -- Gross is unchanged by collecting: one is what was sold, the other what
  -- came in. Counting a booking once per payment row is how the two drift.
  select gross_egp into v_num
    from venue_payouts(v_venue, current_date + 1, current_date + 1);
  return query select 'while gross still counts each booking once',
                      v_num::text, v_num = v_n;

  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  begin
    perform venue_payouts(v_venue, current_date - 1, current_date + 1);
    return query select 'another venue''s staff cannot read the payouts', '(allowed!)', false;
  exception when insufficient_privilege then
    return query select 'another venue''s staff cannot read the payouts', 'refused', true;
  end;

  -- =========================================================================
  -- O-07 Profile
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from update_venue_profile(v_venue, null, null, '+20 100 555 0000');
  return query select 'the manager can update the profile', coalesce(r.reason, 'updated'), r.ok;

  select phone into v_txt from venue where id = v_venue;
  return query select 'and it lands', v_txt, v_txt = '+20 100 555 0000';

  select name into v_txt from venue where id = v_venue;
  return query select 'while fields not passed are left alone', v_txt, v_txt = 'Stadium One';

  select verification into v_txt from venue where id = v_venue;
  return query select 'a venue cannot verify itself through the profile',
                      v_txt, v_txt = 'verified';

  -- =========================================================================
  -- RBAC-003 — a venue manager is not a platform moderator
  -- =========================================================================
  begin
    perform admin_verification_queue();
    return query select 'a venue manager cannot open the verification queue', '(allowed!)', false;
  exception when insufficient_privilege then
    return query select 'a venue manager cannot open the verification queue', 'refused', true;
  end;

  select * into r from admin_set_verification(v_box, 'verified');
  return query select 'nor verify a venue',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Not authorised.';

  -- One vocabulary. The constraint allows verified/pending/unverified and the
  -- function used to validate against pending/verified/rejected/suspended, so
  -- "reject" could never succeed in either console.
  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  select * into r from admin_set_verification(v_box, 'unverified');
  return query select 'an admin can reject a venue', coalesce(r.reason, 'rejected'), r.ok;

  return query select 'and the venue says so',
                      (select verification from venue where id = v_box),
                      (select verification from venue where id = v_box) = 'unverified';

  select * into r from admin_set_verification(v_box, 'rejected');
  return query select 'a word the venue table does not know is refused',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'That is not a verification state.';

  select * into r from admin_set_verification(v_box, 'verified');
  return query select 'and verifying still works', coalesce(r.reason, 'verified'), r.ok;

  -- Put it back the way the seed left it. A-02 below counts the queue, and a
  -- probe that quietly changes the fixture for the cases after it is worse
  -- than no probe.
  perform admin_set_verification(v_box, 'pending');

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  begin
    perform admin_ledger();
    return query select 'nor read the platform ledger', '(allowed!)', false;
  exception when insufficient_privilege then
    return query select 'nor read the platform ledger', 'refused', true;
  end;

  select coalesce(my_platform_role()::text, 'none') into v_txt;
  return query select 'and the client is told there is no console for them',
                      v_txt, v_txt = 'none';

  -- =========================================================================
  -- A-02 Verification
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  select coalesce(my_platform_role()::text, 'none') into v_txt;
  return query select 'the admin is told which console they may open',
                      v_txt, v_txt = 'admin';

  select count(*)::integer into v_n from admin_verification_queue();
  return query select 'the queue holds the unverified venues', v_n::text, v_n = 2;

  select * into r from admin_set_verification(v_box, 'verified', 'Site visit 22 Aug');
  return query select 'the platform can verify one', coalesce(r.reason, 'verified'), r.ok;

  select count(*)::integer into v_n from admin_verification_queue();
  return query select 'and it leaves the queue', v_n::text, v_n = 1;

  select * into r from admin_set_verification(v_box, 'gold_star');
  return query select 'an invented verification state is refused',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  -- =========================================================================
  -- A-03 Reports
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  perform submit_report('venue', v_box, 'wrong_info', 'The gate is on the other side');

  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  select count(*)::integer into v_n from admin_reports('open');
  return query select 'the report reaches the moderation queue', v_n::text, v_n = 1;

  select subject_name into v_txt from admin_reports('open') limit 1;
  return query select 'named, rather than shown as a bare id', v_txt, v_txt = 'The Box';

  select report_id into v_txt from admin_reports('open') limit 1;
  select * into r from admin_resolve_report(v_txt::uuid, 'actioned', 'Entry note corrected');
  return query select 'and can be resolved', coalesce(r.reason, 'resolved'), r.ok;

  select count(*)::integer into v_n from admin_reports('open');
  return query select 'leaving the queue empty', v_n::text, v_n = 0;

  -- =========================================================================
  -- A-04 Users
  -- =========================================================================
  select count(*)::integer into v_n from admin_find_users('Basel');
  return query select 'a user can be found by name', v_n::text, v_n = 1;

  select * into r from admin_suspend_user(ADMIN, 7, 'test');
  return query select 'an admin cannot suspend themselves',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from admin_suspend_user(BASEL, 7, 'Repeated no-shows');
  return query select 'but can suspend somebody', coalesce(r.reason, 'suspended'), r.ok;

  select count(*)::integer into v_n
    from admin_find_users('Basel') where suspended_until is not null;
  return query select 'and the suspension is visible', v_n::text, v_n = 1;

  perform admin_suspend_user(BASEL, 0);
  select count(*)::integer into v_n
    from admin_find_users('Basel') where suspended_until is null;
  return query select 'lifting it clears the expiry', v_n::text, v_n = 1;

  -- =========================================================================
  -- A-05 / A-06 Overview and ledger
  -- =========================================================================
  select venues_total, venues_verified, players into r from admin_overview();
  return query select 'the overview counts real rows',
                      r.venues_total || ' venues, ' || r.players || ' players',
                      r.venues_total = 3 and r.players >= 4;

  select count(*)::integer into v_n from admin_ledger();
  return query select 'the ledger has a row per trading venue', v_n::text, v_n >= 1;

  -- =========================================================================
  -- A-07 Configuration
  -- =========================================================================
  select count(*)::integer into v_n from admin_settings();
  return query select 'settings are readable', v_n::text, v_n >= 4;

  select * into r from admin_set_setting('no_such_key', 1);
  return query select 'an unknown setting is refused',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from admin_set_setting('cancellation_cutoff_hour', 17);
  return query select 'a real one can be changed', coalesce(r.reason, 'set'), r.ok;

  select policy_value('cancellation_cutoff_hour') into v_n;
  return query select 'and the change is live immediately', v_n::text, v_n = 17;
  perform admin_set_setting('cancellation_cutoff_hour', 15);

  -- =========================================================================
  -- A-08 Audit
  -- =========================================================================
  select count(*)::integer into v_n from admin_audit();
  return query select 'every privileged action is on the record', v_n::text, v_n >= 8;

  select actor into v_txt from admin_audit() where action = 'venue.verification' limit 1;
  return query select 'naming who did it', v_txt, v_txt = 'staff · Platform Admin';

  select count(*)::integer into v_n
    from admin_audit() where action = 'setting.changed';
  return query select 'including configuration changes', v_n::text, v_n = 2;

  -- write_audit is not something a client may call.
  return query select 'the audit log cannot be written by a client',
    case when has_function_privilege('authenticated', 'write_audit(text,text,uuid,jsonb)', 'execute')
         then '(reachable!)' else 'closed' end,
    not has_function_privilege('authenticated', 'write_audit(text,text,uuid,jsonb)', 'execute');
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from owner_admin_probe();
rollback;

drop function owner_admin_probe();
