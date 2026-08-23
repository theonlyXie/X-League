-- Tournament probe (TRN / §7.1 Tournament, Registration, Fixture, Standing).
--
-- The two claims worth proving here are structural. A round robin must pair
-- every team with every other exactly once and never twice in the same round —
-- a draw that quietly drops a fixture is the kind of bug nobody notices until
-- week three. And a fixture must take its result from the match the booking
-- spine produced, so a tournament game can never disagree with the game that
-- was actually played.
--
--   psql -f supabase/tests/tournament_probe.sql

create or replace function tournament_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  SALMA uuid := '22222222-2222-2222-2222-222222222222';  -- manager, Stadium One
  KARIM uuid := '33333333-3333-3333-3333-333333333333';  -- staff, The Box
  BASEL uuid := '11111111-1111-1111-1111-111111111111';
  ADMIN uuid := '99999999-9999-9999-9999-999999999999';  -- platform admin, no venue
  v_venue uuid;
  v_trn   uuid;
  v_admin_trn uuid;
  v_teams uuid[] := '{}';
  v_cap   uuid;
  v_pid   uuid;
  v_n     integer;
  v_i     integer;
  v_j     integer;
  v_txt   text;
  r       record;
begin
  select id into v_venue from venue where name = 'Stadium One';

  -- Four captains, each with a full five-a-side team. Built here rather than
  -- seeded because the entry rule under test is about squad size.
  for v_i in 1 .. 4 loop
    v_cap := ('a0000000-0000-0000-0000-00000000000' || v_i)::uuid;
    insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
    values (v_cap, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', now(), now()) on conflict do nothing;
    insert into player_profile (id, display_name)
    values (v_cap, 'Captain ' || v_i) on conflict do nothing;

    perform set_config('request.jwt.claims', json_build_object('sub', v_cap)::text, true);
    select * into r from create_team('Team ' || v_i, 'Nasr City', v_i * 40);
    v_teams := v_teams || r.team_id;

    -- Four more players so the side can actually be fielded.
    for v_j in 1 .. 4 loop
      v_pid := ('b000000' || v_i || '-0000-0000-0000-00000000000' || v_j)::uuid;
      insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
      values (v_pid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', now(), now()) on conflict do nothing;
      insert into player_profile (id, display_name)
      values (v_pid, 'Player ' || v_i || '-' || v_j) on conflict do nothing;
      insert into team_membership (team_id, player_id, state, joined_at)
      values (r.team_id, v_pid, 'active', now()) on conflict do nothing;
    end loop;
  end loop;

  -- -------------------------------------------------------------------------
  -- Who may run a cup
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from create_tournament(v_venue, 'Nasr City Cup');
  return query select 'a player cannot create a tournament at a venue',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'You do not manage that venue.';

  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from create_tournament(v_venue, 'Nasr City Cup');
  return query select 'nor can staff at a different venue',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from create_tournament(v_venue, 'Nasr City Cup', 'league', 4,
                                         current_date + 7, current_date + 28, 500);
  v_trn := r.tournament_id;
  return query select 'the venue manager can', coalesce(r.reason, 'created'), r.ok;

  select count(*)::integer into v_n from list_tournaments();
  return query select 'a draft cup is not listed publicly', v_n::text, v_n = 0;

  -- Cups are run from the admin dashboard, and a platform admin is staff at no
  -- venue at all — so the person whose job this is has to qualify without
  -- being on any venue's payroll.
  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  select * into r from create_tournament(v_venue, 'Platform Cup', 'league', 4);
  return query select 'a platform admin can create a cup at any venue',
                      coalesce(r.reason, 'created'), r.ok;
  v_admin_trn := r.tournament_id;

  return query select 'and may run the one the venue manager created',
                      can_run_tournament(v_trn)::text, can_run_tournament(v_trn);

  -- ADM-012: reach beyond what you own leaves a trace.
  select count(*)::integer into v_n
    from audit_log where action = 'tournament.create' and subject_id = v_admin_trn;
  return query select 'creating it as an admin is audited', v_n::text, v_n = 1;

  -- The venue manager's own cup is not audited: the tournament row already
  -- records who created it, and this is their venue.
  select count(*)::integer into v_n
    from audit_log where action = 'tournament.create' and subject_id = v_trn;
  return query select 'the venue manager''s own cup is not', v_n::text, v_n = 0;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  return query select 'a player still cannot run one',
                      can_run_tournament(v_trn)::text, not can_run_tournament(v_trn);

  select * into r from create_tournament(v_venue, 'Nowhere Cup');
  return query select 'nor create one', coalesce(r.reason, '(allowed!)'), r.ok = false;

  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  select * into r from create_tournament(
    '00000000-0000-0000-0000-0000000000ff'::uuid, 'Cup At Nowhere');
  return query select 'a venue that does not exist is named as such',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'That venue does not exist.';

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);

  -- -------------------------------------------------------------------------
  -- Entering
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub',
    'a0000000-0000-0000-0000-000000000001')::text, true);
  select * into r from register_team(v_trn, v_teams[1]);
  return query select 'entries are refused before the cup opens',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'That tournament is not open yet.';

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  perform set_tournament_state(v_trn, 'open');

  select count(*)::integer into v_n from list_tournaments();
  return query select 'an open cup is', v_n::text, v_n = 1;

  -- A team nobody has filled.
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from create_team('Basel Solo');
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from register_team(v_trn, r.team_id);
  return query select 'a team that cannot field a side is refused',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason like 'You need 5 players%';

  -- Somebody else's team.
  perform set_config('request.jwt.claims', json_build_object('sub',
    'a0000000-0000-0000-0000-000000000002')::text, true);
  select * into r from register_team(v_trn, v_teams[1]);
  return query select 'only the team captain may enter it',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Only the team captain can enter a tournament.';

  for v_i in 1 .. 4 loop
    perform set_config('request.jwt.claims', json_build_object('sub',
      ('a0000000-0000-0000-0000-00000000000' || v_i)::uuid)::text, true);
    perform register_team(v_trn, v_teams[v_i]);
  end loop;

  select count(*)::integer into v_n
    from tournament_registration where tournament_id = v_trn and state = 'pending';
  return query select 'four teams enter', v_n::text, v_n = 4;

  select state into v_txt from tournament where id = v_trn;
  return query select 'and filling the last place closes entries', v_txt, v_txt = 'full';

  -- -------------------------------------------------------------------------
  -- The draw
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from generate_fixtures(v_trn);
  return query select 'fixtures cannot be drawn before entries are accepted',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'You need at least two accepted teams.';

  for r in select id from tournament_registration where tournament_id = v_trn loop
    perform decide_registration(r.id, true);
  end loop;

  select count(*)::integer into v_n
    from notification where kind = 'tournament_accepted';
  return query select 'accepted captains are told', v_n::text, v_n = 4;

  select * into r from generate_fixtures(v_trn);
  return query select 'the draw is made', coalesce(r.reason, r.created || ' fixtures'), r.ok;

  -- Four teams: three rounds, six fixtures, every pair exactly once.
  select count(*)::integer into v_n from fixture where tournament_id = v_trn;
  return query select 'a four-team round robin is six fixtures', v_n::text, v_n = 6;

  select count(distinct round)::integer into v_n from fixture where tournament_id = v_trn;
  return query select 'over three rounds', v_n::text, v_n = 3;

  -- Every unordered pair appears exactly once.
  select count(*)::integer into v_n from (
    select least(home_team_id::text, away_team_id::text) as a,
           greatest(home_team_id::text, away_team_id::text) as b
      from fixture where tournament_id = v_trn
     group by 1, 2 having count(*) > 1
  ) dup;
  return query select 'no pair is drawn twice', v_n::text, v_n = 0;

  select count(*)::integer into v_n from (
    select least(home_team_id::text, away_team_id::text) as a,
           greatest(home_team_id::text, away_team_id::text) as b
      from fixture where tournament_id = v_trn
     group by 1, 2
  ) pairs;
  return query select 'and every pair is drawn once', v_n::text, v_n = 6;

  -- Nobody plays twice in a round.
  select count(*)::integer into v_n from (
    select round, team_id from (
      select round, home_team_id as team_id from fixture where tournament_id = v_trn
      union all
      select round, away_team_id from fixture where tournament_id = v_trn
    ) sides
     where team_id is not null
     group by round, team_id having count(*) > 1
  ) clash;
  return query select 'and no team plays twice in a round', v_n::text, v_n = 0;

  select * into r from generate_fixtures(v_trn);
  return query select 'drawing twice is refused',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Fixtures have already been drawn.';

  -- -------------------------------------------------------------------------
  -- Standings
  -- -------------------------------------------------------------------------
  select jsonb_array_length(standings)::integer into v_n from tournament_detail(v_trn);
  return query select 'the table lists every entrant from the start', v_n::text, v_n = 4;

  select (standings -> 0 ->> 'points')::integer into v_n from tournament_detail(v_trn);
  return query select 'with nobody on any points yet', v_n::text, v_n = 0;

  -- Play one fixture, through the ordinary spine.
  declare
    v_fix   uuid;
    v_home  uuid;
    v_away  uuid;
    v_pitch uuid;
    v_slot  timestamptz;
    v_bk    uuid;
    h       hold_outcome;
  begin
    select f.id, f.home_team_id, f.away_team_id into v_fix, v_home, v_away
      from fixture f where f.tournament_id = v_trn and f.round = 1 and f.sequence = 1;

    select p.id into v_pitch from pitch p
     where p.venue_id = v_venue and p.label = 'Pitch C';
    v_slot := ((current_date - 1 + interval '19 hours') at time zone 'Africa/Cairo');
    delete from booking where pitch_id = v_pitch
       and during && tstzrange(v_slot, v_slot + interval '1 hour');

    select * into r from record_fixture_result(v_fix);
    return query select 'a fixture with no pitch has no result',
                        coalesce(r.reason, '(allowed!)'),
                        r.ok = false and r.reason = 'That fixture has not been scheduled on a pitch.';

    -- The home captain's booking, set up directly because the fixture has to be
    -- in the past for a result to exist and hold_slot refuses to sell that.
    select t.captain_id into v_cap from team t where t.id = v_home;
    v_bk := test_past_booking(v_pitch, v_slot, v_cap);
    perform set_config('request.jwt.claims', json_build_object('sub', v_cap)::text, true);

    perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
    select * into r from schedule_fixture(v_fix, v_bk);
    return query select 'the fixture is put on a real pitch-hour',
                        coalesce(r.reason, 'scheduled'), r.ok;

    select * into r from record_fixture_result(v_fix);
    return query select 'and has no result until the match is played',
                        coalesce(r.reason, '(allowed!)'),
                        r.ok = false and r.reason = 'That match has not been played yet.';

    perform check_in_booking(v_bk);
    perform set_config('request.jwt.claims', json_build_object('sub', v_cap)::text, true);
    perform complete_match(v_bk, 4, 1);

    perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
    select * into r from record_fixture_result(v_fix);
    return query select 'once played, the result carries over', coalesce(r.reason, 'recorded'), r.ok;

    select score_home into v_n from fixture where id = v_fix;
    return query select 'from the match rather than typed in twice', v_n::text, v_n = 4;
  end;

  select (standings -> 0 ->> 'points')::integer into v_n from tournament_detail(v_trn);
  return query select 'the winner tops the table on three points', v_n::text, v_n = 3;

  select (standings -> 0 ->> 'gd')::integer into v_n from tournament_detail(v_trn);
  return query select 'with the goal difference to match', v_n::text, v_n = 3;

  select count(*)::integer into v_n from standing_snapshot where tournament_id = v_trn;
  return query select 'and every recomputation is appended, not overwritten',
                      v_n::text, v_n >= 2;

  -- -------------------------------------------------------------------------
  -- An odd number of teams gets byes, not a dropped entrant
  -- -------------------------------------------------------------------------
  declare
    v_odd uuid;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
    select * into r from create_tournament(v_venue, 'Three-Team Cup', 'league', 3);
    v_odd := r.tournament_id;
    perform set_tournament_state(v_odd, 'open');

    for v_i in 1 .. 3 loop
      perform set_config('request.jwt.claims', json_build_object('sub',
        ('a0000000-0000-0000-0000-00000000000' || v_i)::uuid)::text, true);
      perform register_team(v_odd, v_teams[v_i]);
    end loop;

    perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
    for r in select id from tournament_registration where tournament_id = v_odd loop
      perform decide_registration(r.id, true);
    end loop;
    perform generate_fixtures(v_odd);

    select count(*)::integer into v_n
      from fixture where tournament_id = v_odd and state = 'walkover';
    return query select 'three teams produce one bye per round', v_n::text, v_n = 3;

    select count(*)::integer into v_n
      from fixture where tournament_id = v_odd and state = 'scheduled';
    return query select 'and three real fixtures', v_n::text, v_n = 3;

    select count(*)::integer into v_n from (
      select round, team_id from (
        select round, home_team_id as team_id from fixture where tournament_id = v_odd
        union all
        select round, away_team_id from fixture where tournament_id = v_odd
      ) sides
       where team_id is not null
       group by round, team_id having count(*) > 1
    ) clash;
    return query select 'still nobody plays twice in a round', v_n::text, v_n = 0;
  end;

  -- -------------------------------------------------------------------------
  -- rebuild_standings is not an API
  -- -------------------------------------------------------------------------
  return query select 'standings cannot be written by a client',
    case when has_function_privilege('authenticated', 'rebuild_standings(uuid)', 'execute')
         then '(reachable!)' else 'closed' end,
    not has_function_privilege('authenticated', 'rebuild_standings(uuid)', 'execute');
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from tournament_probe();
rollback;

drop function tournament_probe();
