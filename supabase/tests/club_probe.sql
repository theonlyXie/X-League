-- Club probe: the squad rule, and who may change a club.
--
-- The rule under test is the one that is easy to get wrong by counting people
-- instead of players: a club needs five starters and two substitutes, and a
-- captain who does not take the field is not one of them. A club of a
-- non-playing captain and six players is seven names and six players, and must
-- be refused.
--
--   psql -f supabase/tests/club_probe.sql
--
-- Expects the identities from supabase/seed_identities.sql, plus five throwaway
-- accounts this file creates — a squad needs eight people and the seed has four.

insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
select ('c1b00000-0000-0000-0000-00000000000' || i)::uuid,
       '00000000-0000-0000-0000-000000000000'::uuid,
       'authenticated', 'authenticated', '+2011000000' || i, now(), now(), now(), '{}', '{}'
  from generate_series(1, 5) i
on conflict (id) do nothing;

insert into player_profile (id, display_name, phone, birth_year, preferred_area, terms_version, terms_accepted_at)
select ('c1b00000-0000-0000-0000-00000000000' || i)::uuid,
       'Squad Filler ' || i, '+2011000000' || i, 1995, 'Giza', 'v1.1', now()
  from generate_series(1, 5) i
on conflict (id) do nothing;

create or replace function club_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  BASEL uuid := '11111111-1111-1111-1111-111111111111';
  SALMA uuid := '22222222-2222-2222-2222-222222222222';
  -- Six players besides the captain, then a seventh to complete the bench.
  v_six   uuid[] := array[
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    'c1b00000-0000-0000-0000-000000000001',
    'c1b00000-0000-0000-0000-000000000002',
    'c1b00000-0000-0000-0000-000000000003',
    'c1b00000-0000-0000-0000-000000000004']::uuid[];
  SEVENTH uuid := 'c1b00000-0000-0000-0000-000000000005';
  ADMIN   uuid := '99999999-9999-9999-9999-999999999999';
  v_club uuid;
  v_n    integer;
  p      uuid;
  i      integer := 0;
  r      record;
  e      record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);

  delete from club where lower(name) = 'club probe fc';

  -- The captain manages rather than plays: no slot.
  select * into r from create_club('Club Probe FC', 'Giza', null);
  v_club := r.club_id;
  return query select 'a club can be founded', coalesce(r.reason, 'founded'), r.ok;

  -- Founding a club is an application, not an admission. Everything below is
  -- about whether the squad is legal; none of it counts until X League has said
  -- the club exists, and the club is told which of the two it is waiting on.
  select * into e from club_eligibility(v_club);
  return query select 'but a club nobody has admitted may not enter',
                      coalesce(e.reason, '(silence)'),
                      e.eligible = false
                      and e.reason = 'This club is waiting to be admitted by X League.';

  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  perform admin_set_club_verification(v_club, 'verified');
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);

  select count(*)::integer into v_n
    from club_membership m where m.club_id = v_club and m.player_id = BASEL
     and m.role = 'captain' and m.state = 'active' and m.slot_kind is null;
  return query select 'and the founder captains it without a slot', v_n::text, v_n = 1;

  select * into r from club_detail(v_club);
  return query select 'the club says its captain does not play',
                      r.captain_plays::text, r.captain_plays = false;

  -- Five starters and one substitute.
  foreach p in array v_six loop
    i := i + 1;
    perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
    perform invite_to_club(v_club, p, case when i <= 5 then 'starter' else 'sub' end);
    perform set_config('request.jwt.claims', json_build_object('sub', p)::text, true);
    perform respond_to_club_invite(v_club, true);
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);

  select count(*)::integer into v_n
    from club_membership m where m.club_id = v_club and m.state = 'active';
  return query select 'seven people are in the club', v_n::text, v_n = 7;

  select * into e from club_eligibility(v_club);
  return query select 'but six of them play, so it may not enter',
                      e.playing::text || ' playing', e.eligible = false;
  return query select 'and it is told what it is short of',
                      coalesce(e.reason, '(silence)'), e.reason = 'Needs 1 more substitute.';

  -- The seventh player completes the bench.
  perform invite_to_club(v_club, SEVENTH, 'sub');
  perform set_config('request.jwt.claims', json_build_object('sub', SEVENTH)::text, true);
  perform respond_to_club_invite(v_club, true);
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);

  select * into e from club_eligibility(v_club);
  return query select 'five starters and two substitutes may enter',
                      e.starters::text || '+' || e.subs::text, e.eligible;

  -- Taking one off the sheet without removing them from the club.
  perform set_club_slot(v_club, SEVENTH, null);
  select * into e from club_eligibility(v_club);
  return query select 'a benched member stops counting', e.playing::text, e.eligible = false;

  select count(*)::integer into v_n
    from club_membership m where m.club_id = v_club and m.state = 'active';
  return query select 'while staying in the club', v_n::text, v_n = 8;

  -- A captain who does play is counted like anybody else.
  perform set_club_slot(v_club, BASEL, 'sub');
  select * into e from club_eligibility(v_club);
  return query select 'a captain who plays completes the squad',
                      e.starters::text || '+' || e.subs::text, e.eligible;

  -- -------------------------------------------------------------------------
  -- Who may change it
  -- -------------------------------------------------------------------------
  select * into r from create_club('club probe fc', null, null);
  return query select 'the name is taken whatever the casing',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from set_club_slot(v_club, SEVENTH, 'starter');
  return query select 'a member cannot pick the squad',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;
  select * into r from invite_to_club(v_club, '99999999-9999-9999-9999-999999999999', 'sub');
  return query select 'nor invite anybody',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from leave_club(v_club);
  return query select 'the captain cannot leave the club headless',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;
  select * into r from remove_from_club(v_club, BASEL);
  return query select 'nor remove themselves',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from invite_to_club(v_club, SALMA, 'starter');
  return query select 'inviting somebody already in the club is refused',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  -- Handing over.
  select * into r from hand_over_club(v_club, SALMA);
  return query select 'the captain can hand the club over', coalesce(r.reason, 'handed'), r.ok;

  select count(*)::integer into v_n from club c where c.id = v_club and c.captain_id = SALMA;
  return query select 'and the new captain holds it', v_n::text, v_n = 1;

  select * into r from set_club_crest(v_club, 'https://example.test/crest.png');
  return query select 'the old captain has no say any more',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  -- What the captain's own list says.
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from my_clubs() c where c.club_id = v_club;
  return query select 'my_clubs marks them as captain', coalesce(r.name, '(missing)'), r.is_captain;
  return query select 'and starts them on no trophies', r.trophies::text, r.trophies = 0;

  -- Honours are counted where they are shown.
  insert into club_honour (club_id, title) values (v_club, 'Giza Cup');
  select * into r from club_detail(v_club);
  return query select 'a trophy shows on the club', r.trophies::text, r.trophies = 1;
  return query select 'and the new captain, who starts, does play',
                      r.captain_plays::text, r.captain_plays = true;

  select count(*)::integer into v_n from club_squad(v_club);
  return query select 'the squad lists everybody in the club', v_n::text, v_n = 8;
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from club_probe();
rollback;

drop function club_probe();
