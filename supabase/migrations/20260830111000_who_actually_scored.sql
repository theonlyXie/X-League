-- Who scored.
--
-- `match_participant.goals` and `.assists` have existed since the match spine
-- was written, with a default of nought and nothing anywhere that sets them.
-- Three things read them:
--
--   * the scorers' leaderboard, which ranks on goals and filters out anybody on
--     nought — so it could never show a single player;
--   * the `top_scorer` award, which needs `sum(goals) > 0` to award anything;
--   * `best_player`, which is goals plus assists.
--
-- So two of a cup's five awards were unawardable and the scorers' board was
-- permanently empty, with nothing on any screen to say why. The probes passed
-- because they insert `goals` directly — a fixture writing the state the product
-- itself cannot reach, which is the one thing a fixture must never do.
--
-- This is the missing write. The score stays the truth: a side's scorers may add
-- up to less than its score, because an own goal belongs to nobody on the sheet,
-- but never to more.

/**
 * Record who scored and who set them up.
 *
 * `p_lines` is `[{"player_id": "...", "goals": 2, "assists": 1}, ...]`. It is
 * the whole sheet, not a delta: anybody left out is set back to nought, so
 * correcting a mistake means sending the corrected sheet rather than hunting for
 * an undo.
 *
 * Who may write it is who may report the match: the captain who booked it or the
 * venue's staff, and — for a cup fixture — whoever runs the cup.
 */
create or replace function set_match_scorers(p_match_id uuid, p_lines jsonb)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_booking   uuid;
  v_captain   uuid;
  v_venue     uuid;
  v_home      smallint;
  v_away      smallint;
  v_may       boolean := false;
  v_line      jsonb;
  v_pid       uuid;
  v_goals     integer;
  v_assists   integer;
  v_side      text;
  v_home_sum  integer := 0;
  v_away_sum  integer := 0;
begin
  select m.booking_id, m.score_home, m.score_away
    into v_booking, v_home, v_away
    from match m where m.id = p_match_id;

  if not found then
    return query select false, 'That match no longer exists.';
    return;
  end if;

  if v_booking is not null then
    select b.captain_id, venue_of_pitch(b.pitch_id) into v_captain, v_venue
      from booking b where b.id = v_booking;
    v_may := v_captain = auth.uid() or is_venue_staff(v_venue);
  end if;

  if not v_may then
    v_may := exists (
      select 1 from fixture f
       where f.match_id = p_match_id and can_run_tournament(f.tournament_id));
  end if;

  if not v_may then
    return query select false, 'Only the captain, the venue or the organiser can record scorers.';
    return;
  end if;

  if v_home is null or v_away is null then
    return query select false, 'Report the score first.';
    return;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    return query select false, 'Send the sheet as a list.';
    return;
  end if;

  -- Everything is checked before anything is written, so a sheet that is wrong
  -- in its last line does not leave the first four applied.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    begin
      v_pid := (v_line ->> 'player_id')::uuid;
    exception when others then
      return query select false, 'That is not a player.';
      return;
    end;

    v_goals   := coalesce((v_line ->> 'goals')::integer, 0);
    v_assists := coalesce((v_line ->> 'assists')::integer, 0);

    if v_goals < 0 or v_assists < 0 then
      return query select false, 'Goals and assists cannot be negative.';
      return;
    end if;

    select mp.side into v_side
      from match_participant mp
     where mp.match_id = p_match_id and mp.player_id = v_pid;

    if v_side is null then
      return query select false, 'Somebody on that sheet did not play in the match.';
      return;
    end if;

    if v_side = 'home' then v_home_sum := v_home_sum + v_goals;
                       else v_away_sum := v_away_sum + v_goals; end if;
  end loop;

  -- Fewer is allowed: an own goal counts on the scoreboard and belongs to nobody
  -- on this sheet. More is not — that would be a sheet disagreeing with the
  -- result the cup is standing on.
  if v_home_sum > v_home or v_away_sum > v_away then
    return query select false, 'More goals on the sheet than in the score.';
    return;
  end if;

  update match_participant
     set goals = 0, assists = 0
   where match_id = p_match_id;

  update match_participant mp
     set goals = coalesce((l ->> 'goals')::integer, 0),
         assists = coalesce((l ->> 'assists')::integer, 0)
    from jsonb_array_elements(p_lines) l
   where mp.match_id = p_match_id
     and mp.player_id = (l ->> 'player_id')::uuid;

  return query select true, null::text;
end;
$$;

/**
 * The sheet as it stands, for whoever is filling it in.
 *
 * Returns everybody who played with what they are currently credited, plus the
 * score, so the screen can say how many goals are still unaccounted for rather
 * than making somebody hold it in their head.
 */
create or replace function match_sheet(p_match_id uuid)
returns table (
  player_id     uuid,
  display_name  text,
  side          text,
  -- `position` is reserved in a RETURNS TABLE list, which is why `rate_targets`
  -- calls it this too.
  position_code text,
  goals         smallint,
  assists       smallint,
  score_home    smallint,
  score_away    smallint
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select mp.player_id, mp.display_name, mp.side, mp.position, mp.goals, mp.assists,
         m.score_home, m.score_away
    from match_participant mp
    join match m on m.id = mp.match_id
   where mp.match_id = p_match_id
     and mp.player_id is not null
     and (
       exists (select 1 from match_participant me
                where me.match_id = p_match_id and me.player_id = auth.uid())
       or exists (select 1 from booking b
                   where b.id = m.booking_id
                     and (b.captain_id = auth.uid()
                          or is_venue_staff(venue_of_pitch(b.pitch_id))))
       or exists (select 1 from fixture f
                   where f.match_id = p_match_id and can_run_tournament(f.tournament_id))
     )
   order by mp.side, mp.display_name;
$$;


/**
 * The cup page, now naming the match behind each played fixture.
 *
 * Without it the console can show a result and offer no way to say who scored
 * it — and who scored is what the leaderboard and two of the five awards are
 * made of.
 */
drop function if exists tournament_detail(uuid);

create function tournament_detail(p_tournament_id uuid)
returns table (
  tournament_id uuid,
  name          text,
  venue_name    text,
  area          text,
  format        tournament_format,
  state         tournament_state,
  starts_on     date,
  ends_on       date,
  entry_fee_egp integer,
  max_teams     smallint,
  description   text,
  teams         jsonb,
  fixtures      jsonb,
  standings     jsonb,
  venues        jsonb
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select
    t.id, t.name, v.name, coalesce(t.region, v.area), t.format, t.state, t.starts_on, t.ends_on,
    t.entry_fee_egp, t.max_teams, t.description,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'registration_id', r.id,
               'entrant_name', r.team_name,
               'club_id', r.club_id, 'team_id', r.team_id,
               'crest_url', c.crest_url,
               'state', r.state,
               'paid', r.paid) order by r.created_at)
        from tournament_registration r
        left join club c on c.id = r.club_id
       where r.tournament_id = t.id and r.state <> 'withdrawn'
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'fixture_id', f.id, 'round', f.round, 'sequence', f.sequence,
               'home', hr.team_name, 'away', ar.team_name,
               'home_entrant_id', f.home_entrant_id, 'away_entrant_id', f.away_entrant_id,
               'score_home', f.score_home, 'score_away', f.score_away,
               'state', f.state, 'kicks_off_at', f.kicks_off_at,
               'venue_name', fv.name, 'pitch_label', fp.label,
               'booked', f.booking_id is not null,
               'match_id', f.match_id)
             order by f.round, f.sequence)
        from fixture f
        left join tournament_registration hr on hr.id = f.home_entrant_id
        left join tournament_registration ar on ar.id = f.away_entrant_id
        left join pitch fp on fp.id = f.pitch_id
        left join venue fv on fv.id = fp.venue_id
       where f.tournament_id = t.id
    ), '[]'::jsonb),
    coalesce((
      select s.table_json from standing_snapshot s
       where s.tournament_id = t.id order by s.seq desc limit 1
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'venue_id', tvv.venue_id, 'name', tvv.name,
               'area', tvv.area, 'is_host', tvv.is_host))
        from tournament_venues(t.id) tvv
    ), '[]'::jsonb)
  from tournament t
  join venue v on v.id = t.venue_id
  where t.id = p_tournament_id
    and (t.state <> 'draft' or can_run_tournament(t.id));
$$;

revoke execute on function public.tournament_detail(uuid) from public;
grant execute on function public.tournament_detail(uuid) to anon, authenticated;

revoke execute on function public.set_match_scorers(uuid, jsonb) from public, anon;
grant execute on function public.set_match_scorers(uuid, jsonb) to authenticated;
revoke execute on function public.match_sheet(uuid) from public, anon;
grant execute on function public.match_sheet(uuid) to authenticated;
