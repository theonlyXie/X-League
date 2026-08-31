-- The leaderboards were counting matches through their booking.
--
-- Both boards joined `match` to `booking` to find the venue, which was safe for
-- as long as every match had one. It stopped being true the moment a cup fixture
-- could be played on a ground the organiser arranged themselves: that match has
-- no booking, so an inner join dropped it, and the board silently stopped
-- counting the goals scored in it.
--
-- The board's whole subject is cup performance — it reports `cup_matches` and
-- `cup_goals` beside the totals — so the matches it was dropping are exactly the
-- ones it exists to rank. Nobody would have seen an error. A striker would have
-- scored four in a Giza cup and stayed on nought.
--
-- The venue now comes from the booking's pitch or, when there is no booking,
-- from the pitch the fixture was placed at. It is a scalar subquery rather than
-- a join to `fixture`, because nothing stops two fixtures naming one match and a
-- join would then count that match's goals twice.

create or replace function leaderboard(
  p_venue_id uuid default null,
  p_since    date default null,
  p_limit    integer default 50
)
returns table (
  place integer, player_id uuid, display_name text, photo_url text,
  matches integer, goals integer, assists integer,
  cup_matches integer, cup_goals integer
)
language sql stable security definer
set search_path = public, pg_temp as $$
  with played as (
    select mp.player_id,
           coalesce(pp.display_name, mp.display_name) as display_name,
           pp.photo_url,
           mp.goals, mp.assists,
           exists (select 1 from fixture f where f.match_id = m.id) as in_a_cup
      from match_participant mp
      join match m on m.id = mp.match_id
      left join booking b on b.id = m.booking_id
      left join pitch pi on pi.id = coalesce(
        b.pitch_id,
        (select f.pitch_id from fixture f
          where f.match_id = m.id and f.pitch_id is not null
          order by f.round, f.sequence limit 1))
      left join player_profile pp on pp.id = mp.player_id
     where mp.player_id is not null
       and (p_venue_id is null or pi.venue_id = p_venue_id)
       and (p_since is null or m.played_at >= p_since)
  ),
  tallied as (
    select player_id, min(display_name) as display_name, min(photo_url) as photo_url,
           count(*)::integer                                   as matches,
           coalesce(sum(goals), 0)::integer                    as goals,
           coalesce(sum(assists), 0)::integer                  as assists,
           count(*) filter (where in_a_cup)::integer           as cup_matches,
           coalesce(sum(goals) filter (where in_a_cup), 0)::integer as cup_goals
      from played
     group by player_id
  )
  select (row_number() over (order by goals desc, assists desc, matches asc, display_name))::integer,
         player_id, display_name, photo_url, matches, goals, assists, cup_matches, cup_goals
    from tallied
   where goals > 0 or assists > 0
   order by goals desc, assists desc, matches asc, display_name
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

/** The same question about goalkeepers, which is a different question. */
create or replace function keeper_leaderboard(
  p_venue_id uuid default null,
  p_since    date default null,
  p_limit    integer default 25
)
returns table (
  place integer, player_id uuid, display_name text, photo_url text,
  matches integer, clean_sheets integer, conceded integer
)
language sql stable security definer
set search_path = public, pg_temp as $$
  with kept as (
    select mp.player_id,
           coalesce(pp.display_name, mp.display_name) as display_name,
           pp.photo_url,
           case when mp.side = 'home' then m.score_away else m.score_home end as conceded
      from match_participant mp
      join match m on m.id = mp.match_id
      left join booking b on b.id = m.booking_id
      left join pitch pi on pi.id = coalesce(
        b.pitch_id,
        (select f.pitch_id from fixture f
          where f.match_id = m.id and f.pitch_id is not null
          order by f.round, f.sequence limit 1))
      left join player_profile pp on pp.id = mp.player_id
     where mp.player_id is not null
       and mp.position = 'GK'
       and m.score_home is not null and m.score_away is not null
       and (p_venue_id is null or pi.venue_id = p_venue_id)
       and (p_since is null or m.played_at >= p_since)
  ),
  tallied as (
    select player_id, min(display_name) as display_name, min(photo_url) as photo_url,
           count(*)::integer                             as matches,
           count(*) filter (where conceded = 0)::integer as clean_sheets,
           coalesce(sum(conceded), 0)::integer           as conceded
      from kept
     group by player_id
  )
  select (row_number() over (order by clean_sheets desc, conceded asc, matches desc, display_name))::integer,
         player_id, display_name, photo_url, matches, clean_sheets, conceded
    from tallied
   order by clean_sheets desc, conceded asc, matches desc, display_name
   limit greatest(1, least(coalesce(p_limit, 25), 200));
$$;

revoke execute on function public.leaderboard(uuid, date, integer) from public;
grant execute on function public.leaderboard(uuid, date, integer) to anon, authenticated;
revoke execute on function public.keeper_leaderboard(uuid, date, integer) from public;
grant execute on function public.keeper_leaderboard(uuid, date, integer) to anon, authenticated;
