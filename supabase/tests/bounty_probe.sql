-- A share of a cup, promised on a club invitation.
--
-- The rule under test is the one that makes the promise mean anything: a club
-- cannot promise away more than the prize. Four players on 40% each is the
-- argument this feature exists to prevent, not a thing to record faithfully.
--
-- Also under test: that the figure a player is shown is the percentage against
-- a named pot rather than a percentage of nothing, and that an *invited*
-- player can see it — the whole point of putting the offer in the invitation is
-- that it can be weighed before it is answered.
--
--   psql -f supabase/tests/bounty_probe.sql
--
-- Expects the identities from supabase/seed_identities.sql and the throwaway
-- accounts club_probe.sql creates.

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

create or replace function bounty_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  BASEL uuid := '11111111-1111-1111-1111-111111111111';
  SALMA uuid := '22222222-2222-2222-2222-222222222222';
  KARIM uuid := '33333333-3333-3333-3333-333333333333';
  ADMIN uuid := '99999999-9999-9999-9999-999999999999';
  FILL1 uuid := 'c1b00000-0000-0000-0000-000000000001';
  v_club  uuid;
  v_venue uuid;
  v_cup   uuid;
  v_n     integer;
  v_txt   text;
  v_pct   numeric;
  r       record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);

  delete from club where lower(name) = 'bounty probe fc';
  select * into r from create_club('Bounty Probe FC', 'Giza', null);
  v_club := r.club_id;

  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  perform admin_set_club_verification(v_club, 'verified');
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);

  -- -------------------------------------------------------------------------
  -- The offer, as it is made
  -- -------------------------------------------------------------------------
  select * into r from invite_to_club(v_club, SALMA, 'starter', 10);
  return query select 'a captain can promise a share when inviting',
                      coalesce(r.reason, 'invited'), r.ok;

  select bounty_pct into v_pct
    from club_membership where club_id = v_club and player_id = SALMA;
  return query select 'and it is recorded on the place', coalesce(v_pct::text, '(none)'), v_pct = 10;

  select body into v_txt
    from notification where player_id = SALMA and kind = 'club_invite'
   order by created_at desc limit 1;
  return query select 'the notification says what was offered',
                      coalesce(v_txt, '(silent)'),
                      v_txt = '10% of the prize if the club wins a cup.';

  -- An invitation with no share is the ordinary case and must stay quiet
  -- rather than saying nothing was offered.
  select * into r from invite_to_club(v_club, KARIM, 'starter', null);
  select body into v_txt
    from notification where player_id = KARIM and kind = 'club_invite'
   order by created_at desc limit 1;
  return query select 'an invitation with no share says nothing about one',
                      coalesce(v_txt, '(silent)'), v_txt is null;

  -- Zero is not a share. Storing it would put "0% of the prize" in front of
  -- somebody as though it were an offer.
  select * into r from invite_to_club(v_club, FILL1, 'starter', 0);
  select bounty_pct into v_pct
    from club_membership where club_id = v_club and player_id = FILL1;
  return query select 'offering zero is the same as offering nothing',
                      coalesce(v_pct::text, 'null'), v_pct is null;

  -- -------------------------------------------------------------------------
  -- A club cannot promise away more than it can win
  -- -------------------------------------------------------------------------
  select * into r from set_club_bounty(v_club, KARIM, 95);
  return query select 'the rest of the prize cannot be over-promised',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'You have already promised away the rest of the prize.';

  select * into r from set_club_bounty(v_club, KARIM, 150);
  return query select 'and no single share is more than all of it',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'A share of the prize cannot be more than all of it.';

  select * into r from set_club_bounty(v_club, KARIM, 90);
  return query select 'but exactly the rest of it is fine',
                      coalesce(r.reason, 'set'), r.ok;

  -- Changing somebody's share is not something to do quietly: they agreed to a
  -- number, and the number moved.
  select count(*)::integer into v_n
    from notification where player_id = KARIM and kind = 'club_bounty';
  return query select 'and the player is told their share changed', v_n::text, v_n = 1;

  select * into r from set_club_bounty(v_club, KARIM, null);
  select bounty_pct into v_pct
    from club_membership where club_id = v_club and player_id = KARIM;
  return query select 'a share can be withdrawn',
                      coalesce(v_pct::text, 'null'), r.ok and v_pct is null;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from set_club_bounty(v_club, KARIM, 20);
  return query select 'somebody who is not the captain cannot set one',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Only the captain can set a share of the prize.';

  -- -------------------------------------------------------------------------
  -- What it is worth
  -- -------------------------------------------------------------------------
  select id into v_venue from venue where name = 'Stadium One';

  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  select * into r from create_tournament(v_venue, 'Bounty Probe Cup', 'knockout', 8,
                                         current_date + 20, current_date + 21, 0, null);
  v_cup := r.tournament_id;

  select * into r from set_tournament_prize_pool(v_cup, 10000);
  return query select 'an organiser can name what the winner takes',
                      coalesce(r.reason, 'named'), r.ok;

  perform set_state(v_cup, 'open');

  -- The club has to actually be in the cup before a share of it means anything.
  insert into tournament_registration (tournament_id, club_id, team_name, state, registered_by)
  values (v_cup, v_club, 'Bounty Probe FC', 'accepted', BASEL);

  -- Salma has not answered yet, and this is exactly when she needs the figure.
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from my_bounties() where tournament_id = v_cup;
  return query select 'an invited player already sees what the share is worth',
                      coalesce(r.share_egp::text, '(nothing)'),
                      r.share_egp = 1000 and r.membership_state = 'invited';

  return query select 'and the pot it is a share of', coalesce(r.prize_pool_egp::text, '(none)'),
                      r.prize_pool_egp = 10000;

  perform respond_to_club_invite(v_club, true);
  select * into r from my_bounties() where tournament_id = v_cup;
  return query select 'accepting keeps the same figure and changes the standing',
                      coalesce(r.membership_state::text, '(gone)'),
                      r.share_egp = 1000 and r.membership_state = 'active';

  -- Somebody with no share in the club has nothing to read here, which is
  -- different from having a share of zero.
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select count(*)::integer into v_n from my_bounties() where tournament_id = v_cup;
  return query select 'a member promised nothing sees nothing', v_n::text, v_n = 0;

  -- -------------------------------------------------------------------------
  -- The helper that enforces the ceiling is not an API
  -- -------------------------------------------------------------------------
  return query select 'the committed-share helper is not reachable by a client',
    case when has_function_privilege('authenticated', 'club_bounty_committed(uuid,uuid)', 'execute')
              or has_function_privilege('anon', 'club_bounty_committed(uuid,uuid)', 'execute')
         then '(reachable!)' else 'closed' end,
    not has_function_privilege('authenticated', 'club_bounty_committed(uuid,uuid)', 'execute')
    and not has_function_privilege('anon', 'club_bounty_committed(uuid,uuid)', 'execute');
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from bounty_probe();
rollback;

drop function bounty_probe();
