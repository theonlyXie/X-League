-- A club you can challenge has to be a club you can find.
--
-- `challenge_opponent` accepts a club as the opponent, and nothing in the app
-- could name one: the only club function a player can call is `my_clubs`, and
-- the one club it returns is the one they are forbidden to play. So the club
-- half of the feature was reachable by the API and unreachable by a person.
--
-- This is `find_players` for clubs, and deliberately the same shape: the same
-- two-character floor, the same server-side ordering, the same cap. What it
-- does not copy is the visibility rule, because a club does not have one — a
-- club is a public thing with a name and a crest, and the ones worth hiding
-- are the ones that have not been admitted yet.
--
-- Only admitted clubs come back. A club waiting on admission cannot be entered
-- into a cup either, and a fixture against one is a fixture against something
-- X League has not yet agreed exists.

create or replace function find_clubs(p_query text, p_limit integer default 20)
returns table (
  club_id    uuid,
  name       text,
  crest_url  text,
  home_area  text,
  trophies   integer,
  /** Whether the reader speaks for this club, and so cannot play it. */
  mine       boolean
)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_q   text := btrim(coalesce(p_query, ''));
begin
  if v_uid is null then
    raise exception 'Sign in to search for clubs.' using errcode = 'insufficient_privilege';
  end if;
  if length(v_q) < 2 then
    return;
  end if;

  return query
  select c.id,
         c.name,
         c.crest_url,
         c.home_area,
         (select count(*)::integer from club_honour ch where ch.club_id = c.id),
         -- Returned rather than filtered out. A captain searching for their own
         -- club and finding nothing would conclude the search is broken; a row
         -- that says "this is yours" answers the question they asked.
         c.captain_id = v_uid
    from club c
   where c.verification = 'verified'
     and c.name ilike '%' || v_q || '%'
   order by c.name
   limit greatest(1, least(p_limit, 50));
end;
$$;

revoke all on function find_clubs(text, integer) from public, anon, authenticated;
grant execute on function find_clubs(text, integer) to authenticated;
