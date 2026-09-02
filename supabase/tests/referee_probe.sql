-- Referee probe (REF).
--
-- A referee is the one authority in this product that a player cannot become.
-- The account is made from the console and nowhere else, so the cases worth
-- proving are mostly refusals: who cannot make one, who cannot use one, and
-- what happens to two captains who agree with each other after a referee has
-- already written the result down.
--
--   psql -f supabase/tests/referee_probe.sql

create or replace function referee_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  SALMA uuid := '22222222-2222-2222-2222-222222222222';  -- manager, Stadium One
  BASEL uuid := '11111111-1111-1111-1111-111111111111';
  ADMIN uuid := '99999999-9999-9999-9999-999999999999';  -- platform admin
  REF_PHONE text := '+20 100 555 0001';
  v_venue uuid;
  v_pitch uuid;
  v_trn   uuid;
  v_ref   uuid;
  v_ref2  uuid;
  v_fix   uuid;
  v_match uuid;
  v_cap   uuid;
  v_pid   uuid;
  v_teams uuid[] := '{}';
  v_hash  text;
  v_n     integer;
  v_i     integer;
  v_j     integer;
  v_txt   text;
  r       record;
begin
  select id into v_venue from venue where name = 'Stadium One';
  select id into v_pitch from pitch where venue_id = v_venue and label = 'Pitch A';

  -- Two captains with a full side each, so a cup can actually be drawn.
  for v_i in 1 .. 2 loop
    v_cap := ('f0000000-0000-0000-0000-00000000000' || v_i)::uuid;
    insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
    values (v_cap, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', now(), now()) on conflict do nothing;
    insert into player_profile (id, display_name)
    values (v_cap, 'Ref Captain ' || v_i) on conflict do nothing;

    perform set_config('request.jwt.claims', json_build_object('sub', v_cap)::text, true);
    select * into r from create_team('Ref Team ' || v_i, 'Nasr City', v_i * 40);
    v_teams := v_teams || r.team_id;

    for v_j in 1 .. 4 loop
      v_pid := ('f100000' || v_i || '-0000-0000-0000-00000000000' || v_j)::uuid;
      insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
      values (v_pid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', now(), now()) on conflict do nothing;
      insert into player_profile (id, display_name)
      values (v_pid, 'Ref Player ' || v_i || '-' || v_j) on conflict do nothing;
      insert into team_membership (team_id, player_id, state, joined_at)
      values (r.team_id, v_pid, 'active', now()) on conflict do nothing;
    end loop;
  end loop;

  -- -------------------------------------------------------------------------
  -- Only the console makes a referee
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from admin_create_referee(REF_PHONE, 'Whistle2026!', 'Referee One');
  return query select 'a player cannot make a referee',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Not authorised.';

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from admin_create_referee(REF_PHONE, 'Whistle2026!', 'Referee One');
  return query select 'nor can a venue manager',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  select * into r from admin_create_referee(REF_PHONE, 'short', 'Referee One');
  return query select 'a password too short to be one is refused',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason like 'Use a password of at least%';

  select * into r from admin_create_referee('12', 'Whistle2026!', 'Referee One');
  return query select 'and so is a number that is not one',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Enter a valid phone number.';

  select * into r from admin_create_referee(REF_PHONE, 'Whistle2026!', 'Referee One');
  v_ref := r.referee_id;
  return query select 'the console makes one', coalesce(r.reason, 'made'), r.ok;

  -- -------------------------------------------------------------------------
  -- And the account works like any other
  -- -------------------------------------------------------------------------
  select u.email into v_txt from auth.users u where u.id = v_ref;
  return query select 'signing in is by the same number, through the same door',
                      coalesce(v_txt, '(none)'),
                      v_txt = auth_email_for_phone(normalise_phone(REF_PHONE));

  select u.encrypted_password into v_hash from auth.users u where u.id = v_ref;
  return query select 'with the password the console set',
                      case when v_hash = extensions.crypt('Whistle2026!', v_hash)
                           then 'accepted' else 'refused!' end,
                      v_hash = extensions.crypt('Whistle2026!', v_hash);

  select display_name into v_txt from player_profile where id = v_ref;
  return query select 'and a profile behind it, like everybody else',
                      coalesce(v_txt, '(none)'), v_txt = 'Referee One';

  -- The same number twice is one person, not two accounts on one phone.
  select * into r from admin_create_referee(REF_PHONE, 'Whistle2026!', 'Referee One');
  v_ref2 := r.referee_id;
  return query select 'the same number twice is the same referee',
                      case when v_ref2 = v_ref then 'same' else 'duplicated!' end,
                      r.ok and v_ref2 = v_ref;

  select count(*)::integer into v_n from admin_referees();
  return query select 'and the console lists them', v_n::text, v_n >= 1;

  -- -------------------------------------------------------------------------
  -- A cup, drawn and placed
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from create_tournament(v_venue, 'Referee Probe Cup', 'league', 2);
  v_trn := r.tournament_id;
  perform set_tournament_state(v_trn, 'open');

  for v_i in 1 .. 2 loop
    perform set_config('request.jwt.claims', json_build_object('sub',
      ('f0000000-0000-0000-0000-00000000000' || v_i)::uuid)::text, true);
    perform register_team(v_trn, v_teams[v_i]);
  end loop;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  for r in select id from tournament_registration where tournament_id = v_trn loop
    perform decide_registration(r.id, true);
  end loop;
  perform generate_fixtures(v_trn);

  select id into v_fix from fixture where tournament_id = v_trn limit 1;
  return query select 'the cup has a fixture to referee',
                      case when v_fix is null then '(none)' else 'one' end,
                      v_fix is not null;

  -- -------------------------------------------------------------------------
  -- Nobody but a referee
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select count(*)::integer into v_n from referee_fixtures();
  return query select 'a player sees no matches to referee', v_n::text, v_n = 0;

  select * into r from referee_record(v_fix, 1, 0, '[]'::jsonb);
  return query select 'and cannot record one',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Not authorised.';

  begin
    perform referee_sheet(v_fix);
    return query select 'nor read the team sheet', '(allowed!)', false;
  exception when insufficient_privilege then
    return query select 'nor read the team sheet', 'refused', true;
  end;

  -- -------------------------------------------------------------------------
  -- What the referee does
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_ref)::text, true);

  select count(*)::integer into v_n from referee_fixtures() where fixture_id = v_fix;
  return query select 'the referee sees the fixture', v_n::text, v_n = 1;

  select * into r from referee_record(v_fix, 2, 1, '[]'::jsonb);
  return query select 'a match with no ground and no hour cannot be recorded',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Put the match on a ground and an hour first.';

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  perform place_fixture(v_fix, v_pitch, now() + interval '2 hours');

  perform set_config('request.jwt.claims', json_build_object('sub', v_ref)::text, true);
  select * into r from referee_record(v_fix, 2, 1, '[]'::jsonb);
  return query select 'and one that has not kicked off yet cannot either',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'That match has not been played yet.';

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  perform place_fixture(v_fix, v_pitch, now() - interval '2 hours');

  perform set_config('request.jwt.claims', json_build_object('sub', v_ref)::text, true);
  select count(*)::integer into v_n from referee_sheet(v_fix);
  return query select 'the sheet is both squads before anything is recorded',
                      v_n::text, v_n = 10;

  -- A sheet claiming more than the score is the classic way a table stops
  -- adding up, and it is refused before anything is written.
  select player_id into v_pid from referee_sheet(v_fix) where side = 'home' limit 1;
  select * into r from referee_record(v_fix, 1, 1,
    jsonb_build_array(jsonb_build_object('player_id', v_pid, 'goals', 3)));
  return query select 'more goals on the sheet than in the score is refused',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'More goals on the sheet than in the score.';

  select * into r from referee_record(v_fix, 2, 1,
    jsonb_build_array(jsonb_build_object(
      'player_id', BASEL, 'goals', 1)));
  return query select 'and so is somebody who was not on the pitch',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Somebody on that sheet did not play in the match.';

  select * into r from referee_record(v_fix, 2, 1,
    jsonb_build_array(jsonb_build_object(
      'player_id', v_pid, 'goals', 2, 'assists', 1, 'fouls', 3, 'yellows', 1, 'reds', 0)));
  v_match := r.match_id;
  return query select 'the referee records the match', coalesce(r.reason, 'recorded'), r.ok;

  select score_home || '-' || score_away into v_txt from fixture where id = v_fix;
  return query select 'the score is on the fixture', v_txt, v_txt = '2-1';

  select goals || '/' || assists || '/' || fouls || '/' || yellows
    into v_txt from match_participant where match_id = v_match and player_id = v_pid;
  return query select 'the goals, the assists, the fouls and the card are on the player',
                      v_txt, v_txt = '2/1/3/1';

  select refereed_by into v_txt from match where id = v_match;
  return query select 'and the match says who refereed it',
                      case when v_txt = v_ref::text then 'the referee' else coalesce(v_txt, '(nobody)') end,
                      v_txt = v_ref::text;

  -- The whole point: no waiting for two captains to agree with the referee.
  select count(*)::integer into v_n
    from point_ledger where match_id = v_match and kind = 'match_played';
  return query select 'the points are awarded there and then', v_n::text, v_n = 10;

  select (standings -> 0 ->> 'points')::integer into v_n from tournament_detail(v_trn);
  return query select 'and the table moves', v_n::text, v_n > 0;

  -- Coming back to correct it does not double anything.
  select * into r from referee_record(v_fix, 3, 1,
    jsonb_build_array(jsonb_build_object('player_id', v_pid, 'goals', 1)));
  return query select 'a correction is allowed', coalesce(r.reason, 'corrected'), r.ok;

  select goals || '/' || fouls into v_txt
    from match_participant where match_id = v_match and player_id = v_pid;
  return query select 'and replaces the sheet rather than adding to it',
                      v_txt, v_txt = '1/0';

  -- -------------------------------------------------------------------------
  -- The captains stand down
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub',
    'f0000000-0000-0000-0000-000000000001'::uuid)::text, true);
  select * into r from report_side_result(v_match, 9, 0);
  return query select 'a captain cannot report over the referee',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'The referee has recorded this match.';

  select score_home || '-' || score_away into v_txt from match where id = v_match;
  return query select 'and the referee''s score stands', v_txt, v_txt = '3-1';

  -- -------------------------------------------------------------------------
  -- Taking the whistle away
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from admin_set_referee_active(v_ref, false);
  return query select 'a player cannot stand a referee down',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  select * into r from admin_set_referee_active(v_ref, false);
  return query select 'the console can', coalesce(r.reason, 'stood down'), r.ok;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ref)::text, true);
  select count(*)::integer into v_n from referee_fixtures();
  return query select 'and a referee stood down sees nothing', v_n::text, v_n = 0;

  select * into r from referee_record(v_fix, 5, 0, '[]'::jsonb);
  return query select 'and records nothing',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Not authorised.';

  -- -------------------------------------------------------------------------
  -- The password can be replaced without making a second account
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  select * into r from admin_set_referee_password(v_ref, 'NewWhistle2026!');
  return query select 'the console can set a new password',
                      coalesce(r.reason, 'set'), r.ok;

  select u.encrypted_password into v_hash from auth.users u where u.id = v_ref;
  return query select 'which is the one that now works',
                      case when v_hash = extensions.crypt('NewWhistle2026!', v_hash)
                           then 'the new one' else 'the old one!' end,
                      v_hash = extensions.crypt('NewWhistle2026!', v_hash)
                      and v_hash <> extensions.crypt('Whistle2026!', v_hash);

  -- -------------------------------------------------------------------------
  -- Nothing here is reachable without an account
  -- -------------------------------------------------------------------------
  return query select 'no referee function is open to a guest',
    case when has_function_privilege('anon', 'referee_record(uuid,integer,integer,jsonb)', 'execute')
              or has_function_privilege('anon', 'admin_create_referee(text,text,text)', 'execute')
         then '(reachable!)' else 'closed' end,
    not has_function_privilege('anon', 'referee_record(uuid,integer,integer,jsonb)', 'execute')
    and not has_function_privilege('anon', 'admin_create_referee(text,text,text)', 'execute');
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from referee_probe();
rollback;

drop function referee_probe();
