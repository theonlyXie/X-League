-- Settling a cup: who won it, who scored in it, and what a club carries after.
--
-- The claim worth testing is that the name on the trophy comes off the table
-- people watched. A second calculation of "who won" is a second chance to
-- disagree with the standings the app showed all season, so `settle_tournament`
-- reads the last snapshot rather than re-tallying, and this probe proves the
-- champion it writes is the side at the top of that snapshot.
--
--   psql -f supabase/tests/honours_probe.sql

create or replace function honours_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  SALMA uuid := '22222222-2222-2222-2222-222222222222';  -- manager, Stadium One
  ADMIN uuid := '99999999-9999-9999-9999-999999999999';
  CAP_A uuid := 'd0000000-0000-0000-0000-00000000000a';
  CAP_B uuid := 'd0000000-0000-0000-0000-00000000000b';
  v_venue uuid;
  v_pitch uuid;
  v_trn   uuid;
  v_club_a uuid;
  v_club_b uuid;
  v_reg_a uuid;
  v_reg_b uuid;
  v_fix   uuid;
  v_alpha_home boolean;
  v_bk    uuid;
  v_match uuid;
  v_slot  timestamptz;
  v_gk    uuid;
  v_star  uuid;
  v_pid   uuid;
  v_i     integer;
  v_n     integer;
  v_txt   text;
  r       record;
begin
  select id into v_venue from venue where name = 'Stadium One';
  select p.id into v_pitch from pitch p where p.venue_id = v_venue and p.label = 'Pitch C';

  for v_i in 1 .. 2 loop
    v_pid := case when v_i = 1 then CAP_A else CAP_B end;
    insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
    values (v_pid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now())
    on conflict do nothing;
    insert into player_profile (id, display_name)
    values (v_pid, 'Honours Captain ' || v_i) on conflict do nothing;
  end loop;

  perform set_config('request.jwt.claims', json_build_object('sub', CAP_A)::text, true);
  select * into r from create_club('Honours Alpha', 'Giza', null);
  v_club_a := r.club_id;
  perform set_config('request.jwt.claims', json_build_object('sub', CAP_B)::text, true);
  select * into r from create_club('Honours Beta', 'Giza', null);
  v_club_b := r.club_id;

  -- Both admitted, because a club X League has not admitted cannot enter
  -- anything, and what follows is about what winning does to a club.
  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  perform admin_set_club_verification(v_club_a, 'verified');
  perform admin_set_club_verification(v_club_b, 'verified');

  for v_i in 1 .. 14 loop
    v_pid := ('d1000000-0000-0000-0000-0000000000' || lpad(v_i::text, 2, '0'))::uuid;
    insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
    values (v_pid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now())
    on conflict do nothing;
    insert into player_profile (id, display_name)
    values (v_pid, 'Honours Player ' || v_i) on conflict do nothing;

    -- One to seven play for Alpha, eight to fourteen for Beta.
    if v_i <= 7 then
      perform set_config('request.jwt.claims', json_build_object('sub', CAP_A)::text, true);
      perform invite_to_club(v_club_a, v_pid, case when v_i <= 5 then 'starter' else 'sub' end);
      perform set_config('request.jwt.claims', json_build_object('sub', v_pid)::text, true);
      perform respond_to_club_invite(v_club_a, true);
      if v_i = 1 then v_gk   := v_pid; end if;
      if v_i = 2 then v_star := v_pid; end if;
    else
      perform set_config('request.jwt.claims', json_build_object('sub', CAP_B)::text, true);
      perform invite_to_club(v_club_b, v_pid, case when v_i - 7 <= 5 then 'starter' else 'sub' end);
      perform set_config('request.jwt.claims', json_build_object('sub', v_pid)::text, true);
      perform respond_to_club_invite(v_club_b, true);
    end if;
  end loop;

  -- A free cup in Giza, so the money path is not in the way of this one.
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from create_tournament(v_venue, 'Honours Cup', 'league', 8, null, null, 0);
  v_trn := r.tournament_id;

  select * into r from set_tournament_region(v_trn, 'Giza');
  return query select 'an organiser can name where the cup is', coalesce(r.reason, 'named'), r.ok;

  -- Asked after the cup opens, because the public list hides drafts and is
  -- right to: a cup nobody has opened is not news, whatever place it is in.
  perform set_tournament_state(v_trn, 'open');

  select region into v_txt from list_tournaments(50, 'Giza') where tournament_id = v_trn;
  return query select 'and it is findable by that place', coalesce(v_txt, '(missing)'), v_txt = 'Giza';

  select count(*)::integer into v_n from list_tournaments(50, 'Nowhere') where tournament_id = v_trn;
  return query select 'and not by another', v_n::text, v_n = 0;

  select cups into v_n from tournament_regions() where region = 'Giza';
  return query select 'the place is offered as a filter', coalesce(v_n::text, '(absent)'), v_n >= 1;

  perform set_config('request.jwt.claims', json_build_object('sub', CAP_A)::text, true);
  select * into r from register_club_for_tournament(v_trn, v_club_a, null, 0, null);
  v_reg_a := r.registration_id;
  perform set_config('request.jwt.claims', json_build_object('sub', CAP_B)::text, true);
  select * into r from register_club_for_tournament(v_trn, v_club_b, null, 0, null);
  v_reg_b := r.registration_id;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  perform decide_registration(v_reg_a, true);
  perform decide_registration(v_reg_b, true);

  -- -------------------------------------------------------------------------
  -- Settling before there is anything to settle
  -- -------------------------------------------------------------------------
  select * into r from settle_tournament(v_trn);
  return query select 'a cup with no table cannot be settled',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'There is no table to settle from.';

  select * into r from generate_fixtures(v_trn);
  return query select 'the draw is made', r.created::text, r.ok and r.created = 1;

  select * into r from settle_tournament(v_trn);
  return query select 'and a cup nobody has played cannot be settled either',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'No fixture in this cup has been played.';

  -- -------------------------------------------------------------------------
  -- Play it
  -- -------------------------------------------------------------------------
  select f.id into v_fix from fixture f where f.tournament_id = v_trn limit 1;

  -- The draw is a draw: which side Alpha are on is decided by it, not by the
  -- order they entered. Ask, rather than assume — this probe hardcoded `home`
  -- and started failing the moment the shuffle went in, which is the shuffle
  -- working.
  select (reg.club_id = v_club_a) into v_alpha_home
    from fixture f join tournament_registration reg on reg.id = f.home_entrant_id
   where f.id = v_fix;
  v_slot := ((current_date - 1 + interval '20 hours') at time zone 'Africa/Cairo');
  v_bk := test_past_booking(v_pitch, v_slot, CAP_A);

  insert into match (booking_id, played_at, state, score_home, score_away, reported_by)
  values (v_bk, v_slot, 'played',
          case when v_alpha_home then 3 else 0 end,
          case when v_alpha_home then 0 else 3 end,
          CAP_A)
  returning id into v_match;

  -- Alpha win three nil. Their keeper keeps a clean sheet, their forward scores
  -- twice and makes the third — so every award has a different right answer and
  -- a function that returned the same player for all of them would be caught.
  insert into match_participant (match_id, player_id, display_name, side, position, goals, assists)
  values
    (v_match, v_gk,   'Honours Player 1', case when v_alpha_home then 'home' else 'away' end, 'GK',  0, 0),
    (v_match, v_star, 'Honours Player 2', case when v_alpha_home then 'home' else 'away' end, 'FWD', 2, 1),
    (v_match, 'd1000000-0000-0000-0000-000000000003'::uuid, 'Honours Player 3',
      case when v_alpha_home then 'home' else 'away' end, 'MID', 1, 0),
    (v_match, 'd1000000-0000-0000-0000-000000000008'::uuid, 'Honours Player 8',
      case when v_alpha_home then 'away' else 'home' end, 'GK',  0, 0),
    (v_match, 'd1000000-0000-0000-0000-000000000009'::uuid, 'Honours Player 9',
      case when v_alpha_home then 'away' else 'home' end, 'FWD', 0, 0);

  update fixture set booking_id = v_bk, match_id = v_match,
                     score_home = case when v_alpha_home then 3 else 0 end,
                     score_away = case when v_alpha_home then 0 else 3 end,
                     state = 'played'
   where id = v_fix;
  perform rebuild_standings(v_trn);

  -- -------------------------------------------------------------------------
  -- Settle it
  -- -------------------------------------------------------------------------
  select * into r from settle_tournament(v_trn);
  return query select 'the cup settles', coalesce(r.reason, 'settled'), r.ok;
  return query select 'and produces every award it can', r.awards::text, r.awards = 5;

  select state::text into v_txt from tournament where id = v_trn;
  return query select 'the cup is complete', v_txt, v_txt = 'complete';

  select * into r from settle_tournament(v_trn);
  return query select 'settling twice is refused',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'That cup has already been settled.';

  -- The champion is the side at the top of the table people watched.
  select (standings -> 0 ->> 'entrant_name') into v_txt from tournament_detail(v_trn);
  select display_name into r from tournament_award where tournament_id = v_trn and kind = 'champion';
  return query select 'the champion is whoever topped the table',
                      coalesce(r.display_name, '(none)'), r.display_name = v_txt;

  select display_name, value into r from tournament_award where tournament_id = v_trn and kind = 'top_scorer';
  return query select 'the top scorer is the player who scored most',
                      coalesce(r.display_name, '(none)') || ' on ' || coalesce(r.value::text, '-'),
                      r.display_name = 'Honours Player 2' and r.value = 2;

  select display_name, value into r from tournament_award where tournament_id = v_trn and kind = 'best_player';
  return query select 'the best player counts goals and assists',
                      coalesce(r.value::text, '-'), r.value = 3;

  select display_name, value, note into r
    from tournament_award where tournament_id = v_trn and kind = 'best_goalkeeper';
  return query select 'the best goalkeeper is the one who kept a clean sheet',
                      coalesce(r.display_name, '(none)'), r.display_name = 'Honours Player 1';
  return query select 'and what they conceded is said plainly',
                      coalesce(r.note, '(silent)'), r.note = '0 conceded';

  -- -------------------------------------------------------------------------
  -- What the club carries afterwards
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', CAP_A)::text, true);
  select count(*)::integer into v_n from club_honours(v_club_a);
  return query select 'the winning club has a trophy', v_n::text, v_n = 1;

  select title, region into r from club_honours(v_club_a) limit 1;
  return query select 'named after the cup', coalesce(r.title, '(none)'), r.title = 'Honours Cup';
  return query select 'and placed where the cup was', coalesce(r.region, '(none)'), r.region = 'Giza';

  select trophies into v_n from my_clubs() where club_id = v_club_a;
  return query select 'which shows on the captain''s own list', v_n::text, v_n = 1;

  select count(*)::integer into v_n from club_honours(v_club_b);
  return query select 'the losing club has none', v_n::text, v_n = 0;

  select count(*)::integer into v_n from featured_clubs() where club_id = v_club_a;
  return query select 'and the holder is featured', v_n::text, v_n = 1;

  select count(*)::integer into v_n from featured_clubs() where club_id = v_club_b;
  return query select 'while a club that has won nothing is not', v_n::text, v_n = 0;

  select count(*)::integer into v_n from tournament_awards(v_trn);
  return query select 'the cup page can show the whole roll', v_n::text, v_n = 5;

  -- -------------------------------------------------------------------------
  -- Leaderboards
  -- -------------------------------------------------------------------------
  select place, goals, cup_goals into r from leaderboard() where player_id = v_star;
  return query select 'the scorer leads the global board', coalesce(r.place::text, '(absent)'), r.place = 1;
  return query select 'on the goals the match sheet recorded', coalesce(r.goals::text, '-'), r.goals = 2;
  return query select 'all of which were in a cup', coalesce(r.cup_goals::text, '-'), r.cup_goals = 2;

  select count(*)::integer into v_n from leaderboard(v_venue) where player_id = v_star;
  return query select 'and they appear on the venue''s board', v_n::text, v_n = 1;

  select count(*)::integer into v_n
    from leaderboard((select id from venue where name = 'The Box')) where player_id = v_star;
  return query select 'but not on a venue they never played at', v_n::text, v_n = 0;

  select count(*)::integer into v_n from leaderboard() where player_id = v_gk;
  return query select 'a keeper who scored nothing is not on the scorers'' board', v_n::text, v_n = 0;

  select place, clean_sheets, conceded into r from keeper_leaderboard() where player_id = v_gk;
  return query select 'but leads the keepers'' board', coalesce(r.place::text, '(absent)'), r.place = 1;
  return query select 'on a clean sheet', coalesce(r.clean_sheets::text, '-'), r.clean_sheets = 1;

  select place, conceded into r from keeper_leaderboard()
   where player_id = 'd1000000-0000-0000-0000-000000000008'::uuid;
  return query select 'and the keeper who let three in is below them',
                      coalesce(r.place::text, '(absent)') || ' on ' || coalesce(r.conceded::text, '-'),
                      r.place = 2 and r.conceded = 3;

  -- -------------------------------------------------------------------------
  -- Who scored, written by the product rather than by this probe
  -- -------------------------------------------------------------------------
  -- Everything above ran on `goals` inserted directly by the setup above, which
  -- is a fixture writing state no screen could reach. These cases use the
  -- function a person actually calls.
  declare
    v_sheet_match uuid;
    v_scorer  uuid;
    v_other   uuid;
  begin
    select f.match_id into v_sheet_match
      from fixture f where f.tournament_id = v_trn and f.match_id is not null limit 1;

    -- From the side that actually scored: crediting a goal to a player whose
    -- team was kept out is refused, and rightly, so the probe has to ask the
    -- score rather than assume home.
    select case when m.score_home > 0 then 'home' else 'away' end into v_txt
      from match m where m.id = v_sheet_match;

    select mp.player_id into v_scorer
      from match_participant mp
     where mp.match_id = v_sheet_match and mp.side = v_txt limit 1;
    select mp.player_id into v_other
      from match_participant mp
     where mp.match_id = v_sheet_match and mp.side <> v_txt limit 1;

    perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);

    select count(*)::integer into v_n from match_sheet(v_sheet_match);
    return query select 'the organiser can read the team sheet', v_n::text, v_n > 0;

    select * into r from set_match_scorers(v_sheet_match,
      jsonb_build_array(jsonb_build_object('player_id', v_scorer, 'goals', 99)));
    return query select 'a sheet claiming more goals than the score is refused',
                        coalesce(r.reason, '(allowed!)'),
                        r.ok = false and r.reason = 'More goals on the sheet than in the score.';

    select * into r from set_match_scorers(v_sheet_match,
      jsonb_build_array(jsonb_build_object(
        'player_id', 'b0000009-0000-0000-0000-000000000009', 'goals', 1)));
    return query select 'and one naming somebody who did not play',
                        coalesce(r.reason, '(allowed!)'),
                        r.ok = false and r.reason like '%did not play%';

    select * into r from set_match_scorers(v_sheet_match,
      jsonb_build_array(jsonb_build_object('player_id', v_scorer, 'goals', 1, 'assists', 0)));
    return query select 'a sheet inside the score is taken',
                        coalesce(r.reason, 'recorded'), r.ok;

    select goals into r from match_participant
     where match_id = v_sheet_match and player_id = v_scorer;
    return query select 'and the goal is on the scorer', r.goals::text, r.goals = 1;

    -- Sending the sheet again replaces it rather than adding to it.
    perform set_match_scorers(v_sheet_match,
      jsonb_build_array(jsonb_build_object('player_id', v_scorer, 'goals', 1)));
    select goals into r from match_participant
     where match_id = v_sheet_match and player_id = v_scorer;
    return query select 'sending it twice does not double the goal', r.goals::text, r.goals = 1;

    -- And somebody dropped from the sheet loses the credit.
    perform set_match_scorers(v_sheet_match,
      jsonb_build_array(jsonb_build_object('player_id', v_other, 'goals', 0)));
    select goals into r from match_participant
     where match_id = v_sheet_match and player_id = v_scorer;
    return query select 'and dropping them from it takes it back', r.goals::text, r.goals = 0;

    perform set_config('request.jwt.claims', json_build_object('sub',
      'd1000000-0000-0000-0000-000000000008')::text, true);
    select * into r from set_match_scorers(v_sheet_match,
      jsonb_build_array(jsonb_build_object('player_id', v_scorer, 'goals', 1)));
    return query select 'somebody who merely played cannot write the sheet',
                        coalesce(r.reason, '(allowed!)'), r.ok = false;
  end;
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from honours_probe();
rollback;

drop function honours_probe();
