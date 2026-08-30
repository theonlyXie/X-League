-- A cup is what verifies a stat.
--
-- The card was built on a simpler claim: a booking proves the match happened at
-- a real pitch at a real hour, so three people who were there rating each other
-- is enough to call the result evidence. That is defensible, and it is not what
-- this product is for. A league is the thing being measured, and a Tuesday
-- kickabout with three friends willing to rate each other should not move a
-- card the same way a cup tie does.
--
-- So verification now requires both: the match is a cup fixture, *and* enough
-- independent people rated in it. The cup says the match was real and
-- adjudicated; the ratings say what happened inside it. Neither alone is
-- evidence.
--
-- That change on its own would have broken the main path. A fixture placed with
-- `place_fixture` — the organiser who agreed four grounds by phone — has no
-- booking, so it had no `match`, so it could produce no stats at all: the rule
-- would have been true and useless. A match therefore no longer needs a
-- booking behind it when a fixture stands in its place, and `report_fixture_result`
-- is the route that creates one.

-- ---------------------------------------------------------------------------
-- A match without a booking
-- ---------------------------------------------------------------------------

alter table match alter column booking_id drop not null;

comment on column match.booking_id is
  'The booking this match was played on, when it was booked through the app. Null for a cup fixture an organiser arranged directly — there the fixture is the evidence that it happened, and fixture.match_id is the link back.';

/**
 * Is this match part of a cup?
 *
 * The link lives on the fixture, which is where it was already kept, so there
 * is one direction to keep true rather than two that can disagree.
 */
create or replace function is_cup_match(p_match_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from fixture f where f.match_id = p_match_id);
$$;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------

-- MCH-003, narrowed: enough independent people rated in it, and it was a cup
-- match. A casual game still becomes a `match`, still earns points, still shows
-- in the form strip — it simply is not evidence about how good anybody is.
create or replace function verify_match_if_ready(p_match_id uuid)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_raters integer;
begin
  if not is_cup_match(p_match_id) then
    return false;
  end if;

  select count(distinct rater_id)::integer into v_raters
    from peer_rating where match_id = p_match_id;

  if v_raters < 3 then
    return false;
  end if;

  update match set state = 'verified', verified_at = coalesce(verified_at, now())
   where id = p_match_id and state = 'played';

  insert into point_ledger (player_id, match_id, kind, points)
  select mp.player_id, p_match_id, 'match_verified', points_for('match_verified')
    from match_participant mp
   where mp.match_id = p_match_id and mp.player_id is not null
  on conflict do nothing;

  perform rebuild_card(mp.player_id)
     from match_participant mp
    where mp.match_id = p_match_id and mp.player_id is not null;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recording a cup match that had no booking
-- ---------------------------------------------------------------------------

/**
 * The organiser writes down a score for a fixture played on a ground they
 * arranged themselves.
 *
 * The team sheet comes from the squads that entered, which is better than the
 * booking route can manage: a club has a declared squad, so home and away are
 * known rather than guessed from the order people joined. Everyone in it can
 * then rate everyone else, and three of them make the match evidence.
 *
 * A fixture that *does* have a booking is refused here and sent back to the
 * captain's report, because the booking carries a check-in and the check-in is
 * the venue's testimony that anybody turned up.
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
  if v_match is not null then
    return query select false, null::uuid, 'That result has already been recorded.';
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

  insert into match (booking_id, played_at, state, score_home, score_away, reported_by)
  values (null, v_kicks, 'played', p_score_home::smallint, p_score_away::smallint, auth.uid())
  returning id into v_match_id;

  -- The two squads. A club's team sheet is the members who hold a slot; a
  -- casual team's is everyone active in it. `position` is the one the player
  -- assessed themselves at, which is what the card is already keyed on.
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

/**
 * The booking-backed route, which now also asks whether the match is ready to
 * verify.
 *
 * Ratings can land before the organiser pulls the result, and until the fixture
 * names the match there is no cup behind it — so a match rated by five people
 * would have sat at `played` forever, waiting for a rating that never came.
 */
create or replace function record_fixture_result(p_fixture_id uuid)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_tournament uuid;
  v_booking    uuid;
  v_match      uuid;
  v_home       smallint;
  v_away       smallint;
begin
  select f.tournament_id, f.booking_id into v_tournament, v_booking
    from fixture f where f.id = p_fixture_id;

  if v_tournament is null then
    return query select false, 'That fixture no longer exists.';
    return;
  end if;
  if not can_run_tournament(v_tournament) then
    return query select false, 'You do not manage that tournament.';
    return;
  end if;
  if v_booking is null then
    return query select false, 'That fixture has not been scheduled on a pitch.';
    return;
  end if;

  select m.id, m.score_home, m.score_away into v_match, v_home, v_away
    from match m where m.booking_id = v_booking;

  if v_match is null then
    return query select false, 'That match has not been played yet.';
    return;
  end if;
  if v_home is null or v_away is null then
    return query select false, 'No score has been reported for that match.';
    return;
  end if;

  update fixture
     set match_id = v_match, score_home = v_home, score_away = v_away, state = 'played'
   where id = p_fixture_id;

  perform rebuild_standings(v_tournament);
  perform verify_match_if_ready(v_match);

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- The screens that read a match through its booking
-- ---------------------------------------------------------------------------

-- Both of these inner-joined `booking`, so a cup match played on an arranged
-- ground would have been missing from the card's evidence list and from the
-- ledger — and the evidence list is the only route to the rating screen, so the
-- match could never have been rated, so it could never have been verified.
create or replace function my_match_evidence(p_limit integer default 20)
returns table (
  match_id     uuid,
  played_at    timestamptz,
  venue_name   text,
  state        match_state,
  score_home   smallint,
  score_away   smallint,
  side         text,
  raters       integer,
  i_rated      integer,
  can_rate     boolean
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select m.id, m.played_at,
         coalesce(bv.name, fv.name),
         m.state, m.score_home, m.score_away, mp.side,
         (select count(distinct pr.rater_id)::integer from peer_rating pr where pr.match_id = m.id),
         (select count(*)::integer from peer_rating pr
           where pr.match_id = m.id and pr.rater_id = auth.uid()),
         m.played_at >= now() - interval '7 days'
    from match m
    join match_participant mp on mp.match_id = m.id and mp.player_id = auth.uid()
    left join booking b on b.id = m.booking_id
    left join pitch bp on bp.id = b.pitch_id
    left join venue bv on bv.id = bp.venue_id
    left join fixture f on f.match_id = m.id
    left join pitch fp on fp.id = f.pitch_id
    left join venue fv on fv.id = fp.venue_id
   order by m.played_at desc
   limit greatest(1, least(p_limit, 100));
$$;

create or replace function my_points(p_limit integer default 50)
returns table (
  at     timestamptz,
  kind   text,
  points integer,
  venue_name text
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select pl.created_at, pl.kind, pl.points, coalesce(bv.name, fv.name)
    from point_ledger pl
    left join match m on m.id = pl.match_id
    left join booking b on b.id = m.booking_id
    left join pitch bp on bp.id = b.pitch_id
    left join venue bv on bv.id = bp.venue_id
    left join fixture f on f.match_id = m.id
    left join pitch fp on fp.id = f.pitch_id
    left join venue fv on fv.id = fp.venue_id
   where pl.player_id = auth.uid()
   order by pl.created_at desc
   limit greatest(1, least(p_limit, 200));
$$;

/**
 * A player's cup matches, now carrying the match behind each one.
 *
 * Without it the Cups tab could show somebody their match and give them no way
 * to rate the people they played against — and rating is what turns the fixture
 * into evidence.
 */
drop function if exists my_cup_fixtures(integer);

create function my_cup_fixtures(p_limit integer default 20)
returns table (
  fixture_id    uuid,
  tournament_id uuid,
  cup_name      text,
  round         smallint,
  my_side       text,
  my_entrant    text,
  opponent      text,
  venue_name    text,
  area          text,
  pitch_label   text,
  kicks_off_at  timestamptz,
  state         fixture_state,
  score_home    smallint,
  score_away    smallint,
  match_id      uuid,
  can_rate      boolean
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select f.id, t.id, t.name, f.round,
         case when mine.id = f.home_entrant_id then 'home' else 'away' end,
         mine.team_name,
         other.team_name,
         v.name, v.area, p.label,
         f.kicks_off_at, f.state, f.score_home, f.score_away,
         f.match_id,
         f.match_id is not null
           and m.played_at >= now() - interval '7 days'
           and exists (select 1 from match_participant mp
                        where mp.match_id = f.match_id and mp.player_id = auth.uid())
    from fixture f
    join tournament t on t.id = f.tournament_id
    join tournament_registration mine
      on mine.id in (f.home_entrant_id, f.away_entrant_id)
    left join tournament_registration other
      on other.id = case when mine.id = f.home_entrant_id
                         then f.away_entrant_id else f.home_entrant_id end
    left join pitch p on p.id = f.pitch_id
    left join venue v on v.id = p.venue_id
    left join match m on m.id = f.match_id
   where mine.state = 'accepted'
     and (
       exists (select 1 from club_membership cm
                where cm.club_id = mine.club_id
                  and cm.player_id = auth.uid() and cm.state = 'active')
       or exists (select 1 from team_membership tm
                   where tm.team_id = mine.team_id
                     and tm.player_id = auth.uid() and tm.state = 'active')
     )
   order by (f.kicks_off_at is null), f.kicks_off_at, f.round, f.sequence
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

/**
 * The cup page, saying which route each fixture's result takes.
 *
 * Without `booked` the console would have to offer both — pull the result off
 * the captain's report, or write the score down — and one of them would always
 * be the wrong button, refused after the click. The fixture already knows.
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
               'booked', f.booking_id is not null)
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

revoke execute on function public.is_cup_match(uuid) from public, anon, authenticated;
revoke execute on function public.verify_match_if_ready(uuid) from public, anon, authenticated;
revoke execute on function public.report_fixture_result(uuid, integer, integer) from public, anon;
grant execute on function public.report_fixture_result(uuid, integer, integer) to authenticated;
revoke execute on function public.record_fixture_result(uuid) from public, anon;
grant execute on function public.record_fixture_result(uuid) to authenticated;
revoke execute on function public.my_match_evidence(integer) from public, anon;
grant execute on function public.my_match_evidence(integer) to authenticated;
revoke execute on function public.my_points(integer) from public, anon;
grant execute on function public.my_points(integer) to authenticated;
revoke execute on function public.my_cup_fixtures(integer) from public, anon;
grant execute on function public.my_cup_fixtures(integer) to authenticated;
