-- An organiser can see the cup they just made.
--
-- Found by driving the dashboard rather than by reading it: creating a cup
-- succeeded, the browser landed on its page, and the page said "That cup no
-- longer exists."
--
-- `tournament_detail` ended `where t.id = p_tournament_id and t.state <> 'draft'`.
-- Hiding a draft from players is right — a cup nobody has opened is not news —
-- but it hid the draft from the person who created it too, so the one screen
-- that can open a cup for entries could never be reached. Create, then open,
-- was impossible: the product had a state it could enter and not leave.
--
-- The same blind spot in the list: `list_tournaments` is the public list and
-- excludes drafts, so a cup created from the dashboard vanished from it. That
-- is correct for players and useless for an organiser, who needs to find the
-- draft again. Rather than bend the public list into serving two audiences,
-- this adds the organiser's own list next to it — the same shape as `my_venues`
-- and `my_tournaments`, each answering "what is mine" for one kind of person.

-- A draft is visible to whoever may run it, and to nobody else.
create or replace function tournament_detail(p_tournament_id uuid)
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
  standings     jsonb
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select
    t.id, t.name, v.name, v.area, t.format, t.state, t.starts_on, t.ends_on,
    t.entry_fee_egp, t.max_teams, t.description,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'registration_id', r.id, 'team_id', r.team_id,
               'team_name', r.team_name, 'state', r.state) order by r.created_at)
        from tournament_registration r
       where r.tournament_id = t.id and r.state <> 'withdrawn'
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'fixture_id', f.id, 'round', f.round, 'sequence', f.sequence,
               'home', ht.name, 'away', at.name,
               'home_team_id', f.home_team_id, 'away_team_id', f.away_team_id,
               'score_home', f.score_home, 'score_away', f.score_away,
               'state', f.state, 'kicks_off_at', f.kicks_off_at)
             order by f.round, f.sequence)
        from fixture f
        left join team ht on ht.id = f.home_team_id
        left join team at on at.id = f.away_team_id
       where f.tournament_id = t.id
    ), '[]'::jsonb),
    coalesce((
      select s.table_json from standing_snapshot s
       where s.tournament_id = t.id order by s.seq desc limit 1
    ), '[]'::jsonb)
  from tournament t
  join venue v on v.id = t.venue_id
  where t.id = p_tournament_id
    and (t.state <> 'draft' or can_run_tournament(t.id));
$$;

-- Every cup this person may run, drafts included. `list_tournaments` stays the
-- public list and stays unchanged; this is the organiser's.
create or replace function tournaments_i_run(p_limit integer default 100)
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
  max_teams     integer,
  entered       integer
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select t.id, t.name, v.name, v.area, t.format, t.state, t.starts_on, t.ends_on,
         t.entry_fee_egp, t.max_teams::integer,
         (select count(*)::integer from tournament_registration r
           where r.tournament_id = t.id and r.state = 'accepted')
    from tournament t
    join venue v on v.id = t.venue_id
   where is_venue_staff(t.venue_id, 'manager') or is_platform('admin')
   order by coalesce(t.starts_on, current_date) desc, t.name
   limit greatest(1, least(p_limit, 200));
$$;

-- Closed here and handed back by 20260822109000_access_control.sql, which runs
-- after this one and is the single authoritative statement of who may call
-- what. CREATE OR REPLACE resets grants, so tournament_detail would otherwise
-- silently keep whatever this statement left it with.
revoke execute on function public.tournament_detail(uuid) from public, anon, authenticated;
revoke execute on function public.tournaments_i_run(integer) from public, anon, authenticated;
