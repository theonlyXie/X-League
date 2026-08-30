-- Where a cup is, who is scoring, and what a club has won.
--
-- Three things that look separate and are one idea: a competition produces a
-- record, and the record has to be visible or the competition is just a series
-- of Thursdays. A cup happens somewhere, the goals scored in it rank people,
-- and the side that wins it carries that until somebody takes it off them.

-- ---------------------------------------------------------------------------
-- Where a cup is
-- ---------------------------------------------------------------------------

alter table tournament add column if not exists region text;

comment on column tournament.region is
  'The place people would name if asked where this cup is — Giza, 6th of October. Null falls back to the host venue''s area, because a cup at a pitch is in that pitch''s part of town unless somebody says otherwise.';

create index if not exists tournament_region_idx on tournament (region) where state <> 'draft';

-- ---------------------------------------------------------------------------
-- Awards
-- ---------------------------------------------------------------------------

do $$ begin
  create type award_kind as enum
    ('champion', 'runner_up', 'top_scorer', 'best_player', 'best_goalkeeper');
exception when duplicate_object then null; end $$;

/**
 * What a cup produced.
 *
 * One row per kind per cup, so settling a cup twice cannot mint a second
 * champion. The winner is stored by name as well as by id because an award is a
 * historical fact: a club that folds next season still won this.
 */
create table if not exists tournament_award (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references tournament(id) on delete cascade,
  kind            award_kind not null,
  registration_id uuid references tournament_registration(id) on delete set null,
  club_id         uuid references club(id) on delete set null,
  player_id       uuid references auth.users(id) on delete set null,
  display_name    text not null,
  value           integer,
  note            text,
  created_at      timestamptz not null default now(),
  unique (tournament_id, kind)
);

create index if not exists tournament_award_by_player on tournament_award (player_id);
create index if not exists tournament_award_by_club on tournament_award (club_id);

alter table tournament_award enable row level security;
revoke all on table tournament_award from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Settling a cup
-- ---------------------------------------------------------------------------

/**
 * Close a cup and write down what it produced.
 *
 * The champion comes off the standings the cup has been showing all along
 * rather than from a second calculation, so the table people watched and the
 * name on the trophy cannot disagree.
 *
 * Best player is goals plus assists, and best goalkeeper is clean sheets then
 * goals conceded. Both are stated here rather than left to a jury because a
 * definition somebody can check beats an opinion nobody can. When the numbers
 * are all zero — a cup where nobody recorded a scorer — no award is written at
 * all, because "best player: nobody, 0" is worse than silence.
 */
create or replace function settle_tournament(p_tournament_id uuid)
returns table (ok boolean, awards integer, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_state  tournament_state;
  v_table  jsonb;
  v_made   integer := 0;
  v_row    jsonb;
  v_club   uuid;
  v_name   text;
  r        record;
begin
  if not (can_run_tournament(p_tournament_id) or is_platform('admin')) then
    return query select false, 0, 'You do not manage that cup.';
    return;
  end if;

  select t.state into v_state from tournament t where t.id = p_tournament_id;
  if v_state is null then
    return query select false, 0, 'That cup no longer exists.';
    return;
  end if;
  if v_state = 'complete' then
    return query select false, 0, 'That cup has already been settled.';
    return;
  end if;

  select s.table_json into v_table
    from standing_snapshot s
   where s.tournament_id = p_tournament_id
   order by s.seq desc limit 1;

  if v_table is null or jsonb_array_length(v_table) = 0 then
    return query select false, 0, 'There is no table to settle from.';
    return;
  end if;

  if not exists (select 1 from fixture f
                  where f.tournament_id = p_tournament_id and f.state = 'played') then
    return query select false, 0, 'No fixture in this cup has been played.';
    return;
  end if;

  -- Champion, and the side that came second.
  v_row  := v_table -> 0;
  v_club := nullif(v_row ->> 'club_id', '')::uuid;
  v_name := v_row ->> 'entrant_name';

  insert into tournament_award (tournament_id, kind, registration_id, club_id, display_name, value)
  values (p_tournament_id, 'champion',
          nullif(v_row ->> 'entrant_id', '')::uuid, v_club, v_name,
          (v_row ->> 'points')::integer)
  on conflict (tournament_id, kind) do nothing;
  v_made := v_made + 1;

  if v_club is not null then
    insert into club_honour (club_id, tournament_id, title)
    select v_club, p_tournament_id, t.name from tournament t where t.id = p_tournament_id;
  end if;

  if jsonb_array_length(v_table) > 1 then
    v_row := v_table -> 1;
    insert into tournament_award (tournament_id, kind, registration_id, club_id, display_name, value)
    values (p_tournament_id, 'runner_up',
            nullif(v_row ->> 'entrant_id', '')::uuid,
            nullif(v_row ->> 'club_id', '')::uuid,
            v_row ->> 'entrant_name',
            (v_row ->> 'points')::integer)
    on conflict (tournament_id, kind) do nothing;
    v_made := v_made + 1;
  end if;

  -- Top scorer, and the player who did most of everything.
  select mp.player_id, mp.display_name, sum(mp.goals)::integer as goals
    into r
    from fixture f
    join match_participant mp on mp.match_id = f.match_id
   where f.tournament_id = p_tournament_id and f.match_id is not null
     and mp.player_id is not null
   group by mp.player_id, mp.display_name
   having sum(mp.goals) > 0
   order by sum(mp.goals) desc, mp.display_name
   limit 1;

  if r.player_id is not null then
    insert into tournament_award (tournament_id, kind, player_id, display_name, value)
    values (p_tournament_id, 'top_scorer', r.player_id, r.display_name, r.goals)
    on conflict (tournament_id, kind) do nothing;
    v_made := v_made + 1;
  end if;

  select mp.player_id, mp.display_name,
         sum(mp.goals + mp.assists)::integer as involvements
    into r
    from fixture f
    join match_participant mp on mp.match_id = f.match_id
   where f.tournament_id = p_tournament_id and f.match_id is not null
     and mp.player_id is not null
   group by mp.player_id, mp.display_name
   having sum(mp.goals + mp.assists) > 0
   order by sum(mp.goals + mp.assists) desc, mp.display_name
   limit 1;

  if r.player_id is not null then
    insert into tournament_award (tournament_id, kind, player_id, display_name, value, note)
    values (p_tournament_id, 'best_player', r.player_id, r.display_name, r.involvements,
            'Goals and assists')
    on conflict (tournament_id, kind) do nothing;
    v_made := v_made + 1;
  end if;

  -- Best goalkeeper: most clean sheets, then fewest conceded. A keeper concedes
  -- what the other side scored, which the match already records.
  select mp.player_id, mp.display_name,
         count(*) filter (where (case when mp.side = 'home' then m.score_away else m.score_home end) = 0)::integer as clean_sheets,
         coalesce(sum(case when mp.side = 'home' then m.score_away else m.score_home end), 0)::integer as conceded
    into r
    from fixture f
    join match m on m.id = f.match_id
    join match_participant mp on mp.match_id = m.id
   where f.tournament_id = p_tournament_id and f.match_id is not null
     and mp.player_id is not null and mp.position = 'GK'
     and m.score_home is not null and m.score_away is not null
   group by mp.player_id, mp.display_name
   order by count(*) filter (where (case when mp.side = 'home' then m.score_away else m.score_home end) = 0) desc,
            sum(case when mp.side = 'home' then m.score_away else m.score_home end) asc,
            mp.display_name
   limit 1;

  if r.player_id is not null then
    insert into tournament_award (tournament_id, kind, player_id, display_name, value, note)
    values (p_tournament_id, 'best_goalkeeper', r.player_id, r.display_name, r.clean_sheets,
            format('%s conceded', r.conceded))
    on conflict (tournament_id, kind) do nothing;
    v_made := v_made + 1;
  end if;

  update tournament set state = 'complete' where id = p_tournament_id;

  perform write_audit('tournament.settled', 'tournament', p_tournament_id,
    jsonb_build_object('champion', v_name, 'awards', v_made));

  return query select true, v_made, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading the record
-- ---------------------------------------------------------------------------

/** What a cup produced. Open to guests: a roll of honour nobody can see is not one. */
create or replace function tournament_awards(p_tournament_id uuid)
returns table (
  kind award_kind, display_name text, club_id uuid, crest_url text,
  player_id uuid, photo_url text, value integer, note text
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select a.kind, a.display_name, a.club_id, c.crest_url,
         a.player_id, p.photo_url, a.value, a.note
    from tournament_award a
    left join club c on c.id = a.club_id
    left join player_profile p on p.id = a.player_id
   where a.tournament_id = p_tournament_id
   order by a.kind;
$$;

/** A club's trophies, newest first. */
create or replace function club_honours(p_club_id uuid)
returns table (title text, won_on date, tournament_id uuid, region text)
language sql stable security definer
set search_path = public, pg_temp as $$
  select h.title, h.won_on, h.tournament_id, coalesce(t.region, v.area)
    from club_honour h
    left join tournament t on t.id = h.tournament_id
    left join venue v on v.id = t.venue_id
   where h.club_id = p_club_id
   order by h.won_on desc, h.title;
$$;

/**
 * The sides worth putting at the top of the cups tab.
 *
 * Holders first, then whoever has won most. This is the answer to "who should
 * be featured for the next tournament" — the clubs that have actually won
 * something, rather than whoever registered most recently.
 */
create or replace function featured_clubs(p_limit integer default 6)
returns table (
  club_id uuid, name text, crest_url text, home_area text,
  trophies integer, latest_title text, latest_won_on date
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select c.id, c.name, c.crest_url, c.home_area,
         count(h.id)::integer,
         (array_agg(h.title order by h.won_on desc))[1],
         max(h.won_on)
    from club c
    join club_honour h on h.club_id = c.id
   group by c.id, c.name, c.crest_url, c.home_area
   order by max(h.won_on) desc, count(h.id) desc, c.name
   limit greatest(1, least(coalesce(p_limit, 6), 50));
$$;

-- ---------------------------------------------------------------------------
-- Leaderboards
-- ---------------------------------------------------------------------------

/**
 * Who is scoring, across the app or at one venue.
 *
 * Goals come from the match sheet the players filled in after the game, which
 * is the only place they exist. `cup_goals` is the share of them scored in a
 * cup fixture, and it is reported separately rather than filtered on: a goal in
 * a Thursday friendly is a goal, and a goal in a cup is one somebody organised
 * a competition around. Showing both lets a player see the difference instead
 * of arguing with a number that silently ignored half their season.
 */
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
      join booking b on b.id = m.booking_id
      join pitch pi on pi.id = b.pitch_id
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
      join booking b on b.id = m.booking_id
      join pitch pi on pi.id = b.pitch_id
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

-- ---------------------------------------------------------------------------
-- Cups by place
-- ---------------------------------------------------------------------------

drop function if exists list_tournaments(integer);

create function list_tournaments(p_limit integer default 25, p_region text default null)
returns table (
  tournament_id uuid,
  name          text,
  venue_name    text,
  area          text,
  region        text,
  format        tournament_format,
  state         tournament_state,
  starts_on     date,
  ends_on       date,
  entry_fee_egp integer,
  max_teams     smallint,
  entered       integer
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select t.id, t.name, v.name, v.area, coalesce(t.region, v.area),
         t.format, t.state, t.starts_on, t.ends_on,
         t.entry_fee_egp, t.max_teams,
         (select count(*)::integer from tournament_registration r
           where r.tournament_id = t.id and r.state in ('pending', 'accepted'))
    from tournament t
    join venue v on v.id = t.venue_id
   where t.state <> 'draft'
     and (p_region is null or coalesce(t.region, v.area) = p_region)
   order by (t.state = 'open') desc, t.starts_on nulls last, t.name
   limit greatest(1, least(p_limit, 100));
$$;

/** The places that actually have cups, for a filter that offers no dead ends. */
create or replace function tournament_regions()
returns table (region text, cups integer)
language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(t.region, v.area) as region, count(*)::integer
    from tournament t
    join venue v on v.id = t.venue_id
   where t.state <> 'draft' and coalesce(t.region, v.area) is not null
   group by coalesce(t.region, v.area)
   order by count(*) desc, 1;
$$;

/** An organiser names the place, when it is not simply where the pitch is. */
create or replace function set_tournament_region(p_tournament_id uuid, p_region text)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
begin
  if not (can_run_tournament(p_tournament_id) or is_platform('admin')) then
    return query select false, 'You do not manage that cup.';
    return;
  end if;
  update tournament set region = nullif(trim(coalesce(p_region, '')), '')
   where id = p_tournament_id;
  if not found then
    return query select false, 'That cup no longer exists.';
    return;
  end if;
  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

revoke execute on function public.settle_tournament(uuid) from public, anon;
grant execute on function public.settle_tournament(uuid) to authenticated;
revoke execute on function public.set_tournament_region(uuid, text) from public, anon;
grant execute on function public.set_tournament_region(uuid, text) to authenticated;

-- Guests may look. A record of who won what, and who is scoring, is the reason
-- somebody downloads this before they have an account.
revoke execute on function public.tournament_awards(uuid) from public;
grant execute on function public.tournament_awards(uuid) to anon, authenticated;
revoke execute on function public.club_honours(uuid) from public;
grant execute on function public.club_honours(uuid) to anon, authenticated;
revoke execute on function public.featured_clubs(integer) from public;
grant execute on function public.featured_clubs(integer) to anon, authenticated;
revoke execute on function public.leaderboard(uuid, date, integer) from public;
grant execute on function public.leaderboard(uuid, date, integer) to anon, authenticated;
revoke execute on function public.keeper_leaderboard(uuid, date, integer) from public;
grant execute on function public.keeper_leaderboard(uuid, date, integer) to anon, authenticated;
revoke execute on function public.list_tournaments(integer, text) from public;
grant execute on function public.list_tournaments(integer, text) to anon, authenticated;
revoke execute on function public.tournament_regions() from public;
grant execute on function public.tournament_regions() to anon, authenticated;
