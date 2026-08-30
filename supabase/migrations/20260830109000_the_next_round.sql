-- A knockout that gets past the first round.
--
-- `generate_fixtures` drew a knockout's opening round and stopped, because the
-- rounds after it cannot be drawn in advance: who is in round two is decided by
-- round one. Nothing drew them afterwards either, so a knockout cup reached the
-- end of its first round and simply stayed there — the one shape of tournament
-- this product names in its own format list and could not finish.
--
-- `advance_knockout` is that missing step, and it is deliberately a button an
-- organiser presses rather than something that happens on the last result: a
-- round is not over until the person running it says so, and a score typed
-- wrong is much easier to fix before the next round exists than after.

-- ---------------------------------------------------------------------------
-- A score can be corrected
-- ---------------------------------------------------------------------------

/**
 * The organiser's score, and their correction of it.
 *
 * The first version refused a second write outright. That is wrong in one case
 * that matters: a knockout tie level after ninety minutes is decided on
 * penalties, the product has nowhere to record a shoot-out, and an amateur cup
 * writes the result down as the score that sent somebody through. Refusing to
 * amend meant refusing to record the only fact the next round depends on.
 *
 * So a later call corrects, which is what `complete_match` has always done for
 * the booking-backed route. What it never does is make a second match.
 */
create or replace function report_fixture_result(
  p_fixture_id uuid,
  p_score_home integer,
  p_score_away integer
)
returns table (ok boolean, match_id uuid, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_tournament uuid;
  v_booking    uuid;
  v_match      uuid;
  v_kicks      timestamptz;
  v_home_reg   uuid;
  v_away_reg   uuid;
  v_match_id   uuid;
begin
  select f.tournament_id, f.booking_id, f.match_id, f.kicks_off_at,
         f.home_entrant_id, f.away_entrant_id
    into v_tournament, v_booking, v_match, v_kicks, v_home_reg, v_away_reg
    from fixture f where f.id = p_fixture_id;

  if v_tournament is null then
    return query select false, null::uuid, 'That fixture no longer exists.';
    return;
  end if;
  if not can_run_tournament(v_tournament) then
    return query select false, null::uuid, 'You do not manage that cup.';
    return;
  end if;
  if v_booking is not null then
    return query select false, null::uuid,
      'That match was booked through the app. The captain reports it.';
    return;
  end if;
  if v_home_reg is null or v_away_reg is null then
    return query select false, null::uuid, 'A bye has no result.';
    return;
  end if;
  if v_kicks is null then
    return query select false, null::uuid, 'Put the match on a ground and an hour first.';
    return;
  end if;
  if v_kicks > now() then
    return query select false, null::uuid, 'That match has not been played yet.';
    return;
  end if;
  if p_score_home is null or p_score_away is null
     or p_score_home < 0 or p_score_away < 0 then
    return query select false, null::uuid, 'Give both scores.';
    return;
  end if;

  -- A correction. The match, the team sheet and every rating on it stand; only
  -- the score changes, and the table is rebuilt from it.
  if v_match is not null then
    update match
       set score_home = p_score_home::smallint,
           score_away = p_score_away::smallint,
           reported_by = auth.uid()
     where id = v_match;

    update fixture
       set score_home = p_score_home::smallint,
           score_away = p_score_away::smallint
     where id = p_fixture_id;

    perform award_match_points(v_match);
    perform rebuild_standings(v_tournament);

    return query select true, v_match, null::text;
    return;
  end if;

  insert into match (booking_id, played_at, state, score_home, score_away, reported_by)
  values (null, v_kicks, 'played', p_score_home::smallint, p_score_away::smallint, auth.uid())
  returning id into v_match_id;

  -- The two squads. A club's team sheet is the members who hold a slot; a
  -- casual team's is everyone active in it. `position` is the one the player
  -- assessed themselves at, which is what the card is already keyed on. The
  -- conflict clause is for somebody who belongs to both clubs in a tie: they
  -- are listed once rather than crashing the write.
  insert into match_participant (match_id, player_id, display_name, side, position)
  select v_match_id, m.player_id, coalesce(pp.display_name, '—'), m.side,
         (select sa.position from self_assessment sa
           where sa.player_id = m.player_id
           order by sa.created_at desc limit 1)
    from (
      select cm.player_id, 'home' as side
        from tournament_registration r
        join club_membership cm on cm.club_id = r.club_id
       where r.id = v_home_reg and cm.state = 'active' and cm.slot_kind is not null
      union
      select tm.player_id, 'home'
        from tournament_registration r
        join team_membership tm on tm.team_id = r.team_id
       where r.id = v_home_reg and r.club_id is null and tm.state = 'active'
      union
      select cm.player_id, 'away'
        from tournament_registration r
        join club_membership cm on cm.club_id = r.club_id
       where r.id = v_away_reg and cm.state = 'active' and cm.slot_kind is not null
      union
      select tm.player_id, 'away'
        from tournament_registration r
        join team_membership tm on tm.team_id = r.team_id
       where r.id = v_away_reg and r.club_id is null and tm.state = 'active'
    ) m
    left join player_profile pp on pp.id = m.player_id
  on conflict do nothing;

  update fixture
     set match_id = v_match_id,
         score_home = p_score_home::smallint,
         score_away = p_score_away::smallint,
         state = 'played'
   where id = p_fixture_id;

  perform award_match_points(v_match_id);
  perform rebuild_standings(v_tournament);

  return query select true, v_match_id, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- The next round
-- ---------------------------------------------------------------------------

/**
 * Draw the round after the one just finished.
 *
 * Winners carry down the bracket in the order they were drawn — the winner of
 * the first tie meets the winner of the second, and so on — which is what makes
 * a bracket a bracket rather than a second random draw every round. An odd
 * number of survivors gives the last one a bye, the same rule the opening round
 * uses.
 *
 * It refuses while anything in the round is unresolved, and it refuses a tie
 * left level: a knockout has to say who went through, and the score that sent
 * them is the only place this product records it.
 */
create or replace function advance_knockout(p_tournament_id uuid)
returns table (ok boolean, created integer, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_format tournament_format;
  v_round  integer;
  v_open   integer;
  v_level  integer;
  v_wins   uuid[];
  v_n      integer;
  v_i      integer;
  v_seq    integer := 0;
  v_made   integer := 0;
begin
  if not can_run_tournament(p_tournament_id) then
    return query select false, 0, 'You do not manage that cup.';
    return;
  end if;

  select t.format into v_format from tournament t where t.id = p_tournament_id;
  if v_format is null then
    return query select false, 0, 'That cup no longer exists.';
    return;
  end if;
  if v_format <> 'knockout' then
    return query select false, 0, 'Only a knockout has rounds to draw.';
    return;
  end if;

  select max(f.round) into v_round from fixture f where f.tournament_id = p_tournament_id;
  if v_round is null then
    return query select false, 0, 'Make the draw first.';
    return;
  end if;

  select count(*)::integer into v_open
    from fixture f
   where f.tournament_id = p_tournament_id and f.round = v_round
     and f.state not in ('played', 'walkover');
  if v_open > 0 then
    return query select false, 0, 'Every match in the round has to be played first.';
    return;
  end if;

  select count(*)::integer into v_level
    from fixture f
   where f.tournament_id = p_tournament_id and f.round = v_round
     and f.state = 'played'
     and (f.score_home is null or f.score_away is null or f.score_home = f.score_away);
  if v_level > 0 then
    return query select false, 0,
      'A knockout tie cannot be left level. Record the score that decided it.';
    return;
  end if;

  select array_agg(w.winner order by w.sequence) into v_wins
    from (
      select f.sequence,
             case when f.state = 'walkover'
                    then coalesce(f.home_entrant_id, f.away_entrant_id)
                  when f.score_home > f.score_away then f.home_entrant_id
                  else f.away_entrant_id end as winner
        from fixture f
       where f.tournament_id = p_tournament_id and f.round = v_round
    ) w
   where w.winner is not null;

  v_n := coalesce(array_length(v_wins, 1), 0);
  if v_n <= 1 then
    return query select false, 0, 'That was the final. Settle the cup to award it.';
    return;
  end if;

  v_i := 1;
  while v_i <= v_n loop
    v_seq := v_seq + 1;
    insert into fixture (tournament_id, round, sequence,
                         home_entrant_id, away_entrant_id, state)
    values (p_tournament_id, (v_round + 1)::smallint, v_seq::smallint,
            v_wins[v_i], v_wins[v_i + 1],
            (case when v_wins[v_i + 1] is null then 'walkover' else 'scheduled' end)::fixture_state);
    v_made := v_made + 1;
    v_i := v_i + 2;
  end loop;

  perform rebuild_standings(p_tournament_id);

  return query select true, v_made, null::text;
end;
$$;

revoke execute on function public.report_fixture_result(uuid, integer, integer) from public, anon;
grant execute on function public.report_fixture_result(uuid, integer, integer) to authenticated;
revoke execute on function public.advance_knockout(uuid) from public, anon;
grant execute on function public.advance_knockout(uuid) to authenticated;
