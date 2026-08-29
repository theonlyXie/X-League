-- RBAC-002 / RBAC-001 acceptance probe.
--
-- Each case sets the JWT claim the way PostgREST does before calling the real
-- function, so `auth.uid()` sees exactly what it would in production. Create
-- it, run it, drop it — test scaffolding does not live in a production schema.
--
--   psql -f supabase/tests/rbac_probe.sql
--
-- Expects the three identities from supabase/seed_identities.sql.

create or replace function rbac_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  BASEL uuid := '11111111-1111-1111-1111-111111111111';
  SALMA uuid := '22222222-2222-2222-2222-222222222222';  -- staff at Stadium One
  KARIM uuid := '33333333-3333-3333-3333-333333333333';  -- staff at The Box
  stadium_pitch uuid; box_pitch uuid;
  stadium_venue uuid; box_venue uuid;
  stadium_booking uuid; box_booking uuid;
  r record;
  h hold_outcome;
begin
  select p.id, p.venue_id into stadium_pitch, stadium_venue
    from pitch p join venue v on v.id = p.venue_id
   where v.name = 'Stadium One' and p.label = 'Pitch A';
  select p.id, p.venue_id into box_pitch, box_venue
    from pitch p join venue v on v.id = p.venue_id
   where v.name = 'The Box' and p.label = 'Indoor 1';

  select b.id into stadium_booking from booking b
   where b.pitch_id = stadium_pitch and b.state = 'confirmed' limit 1;
  select b.id into box_booking from booking b
   where b.pitch_id = box_pitch and b.state = 'confirmed' limit 1;

  perform set_config('request.jwt.claims', null, true);
  select * into h from hold_slot(stadium_pitch,
    ((current_date + 1 + interval '19 hours') at time zone 'Africa/Cairo'), 60);
  return query select 'anon cannot hold a slot', coalesce(h.reason,'(allowed!)'),
                      h.ok = false and h.reason = 'Sign in to hold a slot.';

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);

  select * into r from check_in_booking(stadium_booking);
  return query select 'Stadium One staff checks in a Stadium One booking',
                      coalesce(r.reason,'accepted'), r.ok = true;

  select * into r from check_in_booking(box_booking);
  return query select 'Stadium One staff checks in a THE BOX booking',
                      coalesce(r.reason,'(allowed!)'),
                      r.ok = false and r.reason = 'You do not have access to that venue.';

  begin
    perform * from owner_day(box_venue, current_date);
    return query select 'Stadium One staff reads The Box calendar', '(allowed!)', false;
  exception when insufficient_privilege then
    return query select 'Stadium One staff reads The Box calendar', 'refused', true;
  end;

  return query select 'Stadium One staff reads their own calendar',
                      (select count(*)::text || ' cells' from owner_day(stadium_venue, current_date)),
                      (select count(*) > 0 from owner_day(stadium_venue, current_date));

  select * into r from record_offline_booking(box_pitch,
    ((current_date + interval '23 hours') at time zone 'Africa/Cairo'), 60, 'phone', 'Someone');
  return query select 'Stadium One staff writes into The Box calendar',
                      coalesce(r.reason,'(allowed!)'), r.ok = false;

  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from check_in_booking(box_booking);
  return query select 'The Box staff checks in a The Box booking',
                      coalesce(r.reason,'accepted'), r.ok = true;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from check_in_booking(stadium_booking);
  return query select 'a player with no staff role checks anyone in',
                      coalesce(r.reason,'(allowed!)'), r.ok = false;

  return query select 'my_venues for a plain player',
                      (select count(*)::text || ' venues' from my_venues()),
                      (select count(*) = 0 from my_venues());

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  return query select 'my_venues for Stadium One staff',
                      (select string_agg(name, ', ') from my_venues()),
                      (select count(*) = 1 from my_venues());

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into h from hold_slot(stadium_pitch,
    ((current_date + 1 + interval '19 hours') at time zone 'Africa/Cairo'), 60);
  return query select 'a signed-in player can hold', coalesce(h.reason,'held'), h.ok = true;

  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from confirm_booking(h.booking_id);
  return query select 'someone else cannot confirm that hold',
                      coalesce(r.reason,'(allowed!)'),
                      r.ok = false and r.reason = 'That hold belongs to someone else.';

  return query select 'someone else cannot release it either',
                      (select release_hold(h.booking_id))::text,
                      (select release_hold(h.booking_id)) = false;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from confirm_booking(h.booking_id);
  return query select 'the captain can confirm their own hold',
                      coalesce(r.code, r.reason), r.ok = true;

  return query select 'the audit log names the real actor',
                      (select e.actor from booking_event e
                        where e.booking_id = h.booking_id order by e.at desc limit 1),
                      (select e.actor = 'staff · Basel Elsayed' from booking_event e
                        where e.booking_id = h.booking_id order by e.at desc limit 1);
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from rbac_probe();
rollback;

drop function rbac_probe();
