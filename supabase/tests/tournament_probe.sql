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

  -- The organiser's two lookups.
  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  select count(*)::integer into v_n from admin_venues();
  return query select 'an admin can see every venue to hold a cup at',
                      v_n::text, v_n >= 3;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select count(*)::integer into v_n from admin_venues();
  return query select 'a player sees none', v_n::text, v_n = 0;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from create_tournament(v_venue, 'Nasr City Cup', 'league', 4,
                                         current_date + 7, current_date + 28, 500);
  v_trn := r.tournament_id;
  return query select 'the venue manager can', coalesce(r.reason, 'created'), r.ok;

  select count(*)::integer into v_n from list_tournaments();
  return query select 'a draft cup is not listed publicly', v_n::text, v_n = 0;

  -- But the person who made it has to be able to reach it, or "create, then
  -- open for entries" is a state the product can enter and never leave.
  select count(*)::integer into v_n from tournament_detail(v_trn);
  return query select 'the organiser can still open their own draft',
                      v_n::text, v_n = 1;

  select count(*)::integer into v_n from tournaments_i_run() where tournament_id = v_trn;
  return query select 'and find it again in their own list', v_n::text, v_n = 1;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select count(*)::integer into v_n from tournament_detail(v_trn);
  return query select 'while a player still cannot see a draft', v_n::text, v_n = 0;

  select count(*)::integer into v_n from tournaments_i_run();
  return query select 'nor does a player run any cups', v_n::text, v_n = 0;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);

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
                      r.ok = false and r.reason = 'You need at least two accepted entrants.';

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
    select least(home_entrant_id::text, away_entrant_id::text) as a,
           greatest(home_entrant_id::text, away_entrant_id::text) as b
      from fixture where tournament_id = v_trn
     group by 1, 2 having count(*) > 1
  ) dup;
  return query select 'no pair is drawn twice', v_n::text, v_n = 0;

  select count(*)::integer into v_n from (
    select least(home_entrant_id::text, away_entrant_id::text) as a,
           greatest(home_entrant_id::text, away_entrant_id::text) as b
      from fixture where tournament_id = v_trn
     group by 1, 2
  ) pairs;
  return query select 'and every pair is drawn once', v_n::text, v_n = 6;

  -- Nobody plays twice in a round.
  select count(*)::integer into v_n from (
    select round, team_id from (
      select round, home_entrant_id as team_id from fixture where tournament_id = v_trn
      union all
      select round, away_entrant_id from fixture where tournament_id = v_trn
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
    select f.id, f.home_entrant_id, f.away_entrant_id into v_fix, v_home, v_away
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
    -- v_home is now the entry, not the team, so the captain comes through it.
    select tm.captain_id into v_cap
      from tournament_registration reg join team tm on tm.id = reg.team_id
     where reg.id = v_home;
    v_bk := test_past_booking(v_pitch, v_slot, v_cap);
    perform set_config('request.jwt.claims', json_build_object('sub', v_cap)::text, true);

    -- The list the dashboard schedules from: this is where the organiser finds
    -- the booking id that schedule_fixture wants.
    perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
    select count(*)::integer into v_n
      from tournament_bookings(v_trn, (v_slot at time zone 'Africa/Cairo')::date)
     where booking_id = v_bk;
    return query select 'the organiser can find that booking to schedule it',
                        v_n::text, v_n = 1;

    select reported, fixture_id into r
      from tournament_bookings(v_trn, (v_slot at time zone 'Africa/Cairo')::date)
     where booking_id = v_bk;
    return query select 'and it is not yet reported or spoken for',
                        r.reported::text, r.reported = false and r.fixture_id is null;

    -- A maintenance block holds the hour in the booking table so nobody can
    -- sell it. It is not a fixture slot, and must not be offered as one.
    insert into booking (pitch_id, during, state, source, captain_name, captain_id,
                         price_egp, deposit_egp)
    values (v_pitch, tstzrange(v_slot + interval '2 hours',
                               v_slot + interval '3 hours', '[)'),
            'confirmed', 'block', 'Blocked · watering', null, 0, 0);

    select count(*)::integer into v_n
      from tournament_bookings(v_trn, (v_slot at time zone 'Africa/Cairo')::date)
     where captain_name = 'Blocked · watering';
    return query select 'a maintenance block is not offered as a fixture slot',
                        v_n::text, v_n = 0;

    perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
    begin
      perform count(*) from tournament_bookings(v_trn, null);
      return query select 'a player cannot list a cup''s bookings', '(allowed!)', false;
    exception when insufficient_privilege then
      return query select 'a player cannot list a cup''s bookings', 'refused', true;
    end;

    perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
    select * into r from schedule_fixture(v_fix, v_bk);
    return query select 'the fixture is put on a real pitch-hour',
                        coalesce(r.reason, 'scheduled'), r.ok;

    select fixture_id into r
      from tournament_bookings(v_trn, (v_slot at time zone 'Africa/Cairo')::date)
     where booking_id = v_bk;
    return query select 'after which the hour reads as spoken for',
                        coalesce(r.fixture_id::text, '(free)'), r.fixture_id = v_fix;

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
        select round, home_entrant_id as team_id from fixture where tournament_id = v_odd
        union all
        select round, away_entrant_id from fixture where tournament_id = v_odd
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

  -- -------------------------------------------------------------------------
  -- A knockout that reaches a final
  -- -------------------------------------------------------------------------
  -- Nothing tested a knockout at all, which is how a format the product offers
  -- in its own dropdown came to stop dead after one round.
  declare
    v_ko    uuid;
    v_kfix  uuid;
    v_pid   uuid;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
    select * into r from create_tournament(v_venue, 'Knockout Probe Cup', 'knockout', 8);
    v_ko := r.tournament_id;

    select * into r from advance_knockout(v_ko);
    return query select 'a knockout with no draw yet has no round to draw',
                        coalesce(r.reason, '(allowed!)'),
                        r.ok = false and r.reason = 'Make the draw first.';

    perform set_tournament_state(v_ko, 'open');
    -- Only a team's own captain may enter it, which is a1..a4 rather than the
    -- organiser.
    for v_i in 1 .. 4 loop
      perform set_config('request.jwt.claims', json_build_object('sub',
        ('a0000000-0000-0000-0000-00000000000' || v_i)::uuid)::text, true);
      perform register_team(v_ko, v_teams[v_i]);
    end loop;
    perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
    for r in select id from tournament_registration where tournament_id = v_ko loop
      perform decide_registration(r.id, true);
    end loop;

    select * into r from generate_fixtures(v_ko);
    return query select 'four teams make two ties', r.created::text, r.created = 2;

    select * into r from advance_knockout(v_ko);
    return query select 'and the next round waits for them to be played',
                        coalesce(r.reason, '(allowed!)'),
                        r.ok = false and r.reason like '%has to be played first%';

    -- Both ties played, one of them level.
    select p.id into v_pid from pitch p where p.venue_id = v_venue limit 1;
    for r in select id, sequence from fixture where tournament_id = v_ko and round = 1 loop
      perform place_fixture(r.id, v_pid, now() - interval '3 hours');
      perform report_fixture_result(r.id, case when r.sequence = 1 then 2 else 1 end, 1);
    end loop;

    select * into r from advance_knockout(v_ko);
    return query select 'a tie left level cannot send anybody through',
                        coalesce(r.reason, '(allowed!)'),
                        r.ok = false and r.reason like '%cannot be left level%';

    -- Penalties, written down the way an amateur cup writes them down.
    select id into v_kfix from fixture where tournament_id = v_ko and round = 1 and sequence = 2;
    select * into r from report_fixture_result(v_kfix, 4, 3);
    return query select 'the organiser can correct the score', coalesce(r.reason, 'corrected'), r.ok;

    select count(*)::integer into v_n
      from match m join fixture f on f.match_id = m.id where f.id = v_kfix;
    return query select 'and correcting does not make a second match', v_n::text, v_n = 1;

    select * into r from advance_knockout(v_ko);
    return query select 'the winners meet in the next round', r.created::text,
                        r.ok and r.created = 1;

    select count(*)::integer into v_n from fixture where tournament_id = v_ko and round = 2;
    return query select 'which is one final', v_n::text, v_n = 1;

    -- The two teams in the final are the two that won, not the two that lost.
    select count(*)::integer into v_n
      from fixture f2
     where f2.tournament_id = v_ko and f2.round = 2
       and f2.home_entrant_id in (
         select case when f.score_home > f.score_away
                     then f.home_entrant_id else f.away_entrant_id end
           from fixture f where f.tournament_id = v_ko and f.round = 1)
       and f2.away_entrant_id in (
         select case when f.score_home > f.score_away
                     then f.home_entrant_id else f.away_entrant_id end
           from fixture f where f.tournament_id = v_ko and f.round = 1);
    return query select 'contested by the two winners', v_n::text, v_n = 1;

    select id into v_kfix from fixture where tournament_id = v_ko and round = 2;
    perform place_fixture(v_kfix, v_pid, now() - interval '1 hour');
    perform report_fixture_result(v_kfix, 3, 0);

    select * into r from advance_knockout(v_ko);
    return query select 'and after the final there is nothing left to draw',
                        coalesce(r.reason, '(allowed!)'),
                        r.ok = false and r.reason like '%That was the final%';

    perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
    select * into r from advance_knockout(v_ko);
    return query select 'and a stranger cannot draw a round at all',
                        coalesce(r.reason, '(allowed!)'),
                        r.ok = false and r.reason = 'You do not manage that cup.';

    perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
    select * into r from advance_knockout(v_trn);
    return query select 'nor is there a next round in a league',
                        coalesce(r.reason, '(allowed!)'),
                        r.ok = false and r.reason = 'Only a knockout has rounds to draw.';

    -- -----------------------------------------------------------------------
    -- Both sides have to say the same thing before anybody is paid
    -- -----------------------------------------------------------------------
    declare
      v_tie    uuid;
      v_mid    uuid;
      v_capA   uuid;
      v_capB   uuid;
      v_player uuid;
      v_pts    integer;
      v_notes  integer;
    begin
      select id into v_tie from fixture
       where tournament_id = v_ko and round = 1 and sequence = 1;
      select match_id into v_mid from fixture where id = v_tie;

      select tm.player_id into v_capA
        from fixture f
        join tournament_registration reg on reg.id = f.home_entrant_id
        join team_membership tm on tm.team_id = reg.team_id
       where f.id = v_tie and tm.role = 'captain' and tm.state = 'active';
      select tm.player_id into v_capB
        from fixture f
        join tournament_registration reg on reg.id = f.away_entrant_id
        join team_membership tm on tm.team_id = reg.team_id
       where f.id = v_tie and tm.role = 'captain' and tm.state = 'active';

      select mp.player_id into v_player
        from match_participant mp where mp.match_id = v_mid limit 1;

      -- The organiser already wrote a score for this tie further up. Nobody has
      -- been paid for it, because only one side has spoken.
      select coalesce(sum(points), 0)::integer into v_pts
        from point_ledger where match_id = v_mid;
      return query select 'the organiser''s score alone pays nobody', v_pts::text, v_pts = 0;

      perform set_config('request.jwt.claims', json_build_object('sub', v_capA)::text, true);
      select state into r from match_agreement(v_mid);
      return query select 'and the match is waiting on the two captains',
                          coalesce(r.state, '(none)'), r.state = 'waiting';

      select * into r from report_side_result(v_mid, 2, 1);
      return query select 'one captain can say what happened',
                          coalesce(r.state, r.reason), r.ok and r.state = 'waiting';

      select count(*)::integer into v_notes
        from notification where player_id = v_capB and kind = 'result_reported';
      return query select 'and the other captain is told', v_notes::text, v_notes = 1;

      select title into v_txt from notification
       where player_id = v_capB and kind = 'result_reported' order by created_at desc limit 1;
      return query select 'in their own terms, as a defeat', v_txt, v_txt = 'They say you lost 1–2';

      select coalesce(sum(points), 0)::integer into v_pts
        from point_ledger where match_id = v_mid;
      return query select 'one side''s word still pays nobody', v_pts::text, v_pts = 0;

      -- The other captain remembers it differently.
      perform set_config('request.jwt.claims', json_build_object('sub', v_capB)::text, true);
      select * into r from report_side_result(v_mid, 3, 3);
      return query select 'a second captain who disagrees makes it a dispute',
                          coalesce(r.state, r.reason), r.ok and r.state = 'disputed';

      select state::text into v_txt from match where id = v_mid;
      return query select 'and the match says so', v_txt, v_txt = 'disputed';

      select coalesce(sum(points), 0)::integer into v_pts
        from point_ledger where match_id = v_mid;
      return query select 'a disputed match pays nobody either', v_pts::text, v_pts = 0;

      -- They look again and agree.
      select * into r from report_side_result(v_mid, 2, 1);
      return query select 'when they agree the result stands',
                          coalesce(r.state, r.reason), r.ok and r.state = 'agreed';

      select score_home, state into r from match where id = v_mid;
      return query select 'the score is the one both said', r.score_home::text, r.score_home = 2;
      return query select 'and it is played rather than disputed', r.state::text, r.state = 'played';

      select coalesce(sum(points), 0)::integer into v_pts
        from point_ledger where match_id = v_mid and player_id = v_player;
      return query select 'now everybody who played is paid', v_pts::text, v_pts > 0;

      -- Somebody who is not either captain cannot speak for a side.
      perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
      select * into r from report_side_result(v_mid, 9, 0);
      return query select 'a stranger cannot report the tie',
                          coalesce(r.reason, '(allowed!)'),
                          r.ok = false and r.reason = 'Only the two captains report this match.';
    end;
  end;

  -- -------------------------------------------------------------------------
  -- A cup across several grounds, and a draw that is a draw
  -- -------------------------------------------------------------------------
  declare
    v_box   uuid;
    v_bpitch uuid;
    v_fix2  uuid;
    v_when  timestamptz := (current_date + 3 + interval '19 hours') at time zone 'Africa/Cairo';
    v_orders text[] := '{}';
    v_k integer;
  begin
    select id into v_box from venue where name = 'The Box';
    select p.id into v_bpitch from pitch p where p.venue_id = v_box limit 1;

    perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);

    select count(*)::integer into v_n from tournament_venues(v_trn);
    return query select 'a cup starts at its host ground', v_n::text, v_n = 1;

    select * into r from place_fixture(
      (select id from fixture where tournament_id = v_trn limit 1), v_bpitch, v_when);
    return query select 'a match cannot be put at a ground the cup is not played on',
                        coalesce(r.reason, '(allowed!)'),
                        r.ok = false and r.reason like '%not at a ground%';

    select * into r from add_tournament_venue(v_trn, v_box);
    return query select 'a second ground can be added', coalesce(r.reason, 'added'), r.ok;

    select count(*)::integer into v_n from tournament_venues(v_trn);
    return query select 'and the cup now lists both', v_n::text, v_n = 2;

    select is_host into r from tournament_venues(v_trn) limit 1;
    return query select 'with the host first', r.is_host::text, r.is_host;

    -- The fixture this player is actually in. `limit 1` over the whole round
    -- used to pick an arbitrary one, and once the draw became random that was a
    -- coin flip: half the time it chose the tie between two teams the player
    -- has nothing to do with, and `my_cup_fixtures` correctly returned nothing.
    select f.id into v_fix2
      from fixture f
      join tournament_registration reg
        on reg.id in (f.home_entrant_id, f.away_entrant_id)
      join team_membership tm on tm.team_id = reg.team_id
     where f.tournament_id = v_trn
       and tm.player_id = 'b0000001-0000-0000-0000-000000000001'
       and tm.state = 'active'
     limit 1;
    select * into r from place_fixture(v_fix2, v_bpitch, v_when);
    return query select 'and a match can be put there', coalesce(r.reason, 'placed'), r.ok;

    select count(*)::integer into v_n
      from fixture where id = v_fix2 and pitch_id = v_bpitch and kicks_off_at = v_when;
    return query select 'the ground and the hour are recorded', v_n::text, v_n = 1;

    -- The cup page has to carry it, or the player cannot be told.
    -- The fixture we placed, not the first one in the list: the draw is random,
    -- so which tie holds sequence 1 is not ours to assume.
    select (fx ->> 'venue_name') into v_txt
      from tournament_detail(v_trn), jsonb_array_elements(fixtures) fx
     where (fx ->> 'fixture_id')::uuid = v_fix2;
    return query select 'the cup page names the ground',
                        coalesce(v_txt, '(missing)'), v_txt = 'The Box';

    select jsonb_array_length(venues)::integer into v_n from tournament_detail(v_trn);
    return query select 'and lists the grounds it is played on', v_n::text, v_n = 2;

    -- Placing a match means picking from every pitch the cup may use, in one
    -- list rather than one call per ground.
    select count(*)::integer into v_n from tournament_pitches(v_trn);
    return query select 'the pitches of both grounds come back together',
                        v_n::text, v_n >= 2;

    select count(*)::integer into v_n
      from tournament_pitches(v_trn) where pitch_id = v_bpitch and venue_name = 'The Box';
    return query select 'each pitch says which ground it is at', v_n::text, v_n = 1;

    select is_host into r from tournament_pitches(v_trn) limit 1;
    return query select 'and the host ground leads that list too', r.is_host::text, r.is_host;

    select * into r from remove_tournament_venue(v_trn, v_box);
    return query select 'a ground with matches on it cannot be dropped',
                        coalesce(r.reason, '(allowed!)'),
                        r.ok = false and r.reason like '%already placed%';

    select * into r from remove_tournament_venue(v_trn, v_venue);
    return query select 'nor can the home ground',
                        coalesce(r.reason, '(allowed!)'),
                        r.ok = false and r.reason = 'That is the cup''s home ground.';

    -- The player whose match it is can find out where and when.
    perform set_config('request.jwt.claims', json_build_object('sub',
      'b0000001-0000-0000-0000-000000000001')::text, true);
    select count(*)::integer into v_n from my_cup_fixtures();
    return query select 'a player in an entered club sees their match', v_n::text, v_n >= 1;

    select venue_name, kicks_off_at into r from my_cup_fixtures() where fixture_id = v_fix2;
    return query select 'and is told the ground',
                        coalesce(r.venue_name, '(missing)'), r.venue_name = 'The Box';
    return query select 'and the hour',
                        case when r.kicks_off_at is null then '(missing)' else 'set' end,
                        r.kicks_off_at is not null;

    perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
    select count(*)::integer into v_n from my_cup_fixtures();
    return query select 'somebody not in the cup sees none of it', v_n::text, v_n = 0;

    -- The draw is a draw. Ten draws over the same four entrants should not all
    -- produce the same opening pair; one that does is the old behaviour, where
    -- the order of entry decided the tournament.
    perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
    for v_k in 1 .. 10 loop
      delete from fixture where tournament_id = v_trn;
      update tournament set state = 'open' where id = v_trn;
      perform generate_fixtures(v_trn);
      select (coalesce(home_entrant_id::text, '-') || '/' || coalesce(away_entrant_id::text, '-'))
        into v_txt from fixture
       where tournament_id = v_trn and round = 1 and sequence = 1;
      v_orders := v_orders || v_txt;
    end loop;
    select count(distinct x)::integer into v_n from unnest(v_orders) x;
    return query select 'ten draws do not all pair the same two first',
                        v_n::text || ' different openings', v_n > 1;
  end;

end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from tournament_probe();
rollback;

drop function tournament_probe();
