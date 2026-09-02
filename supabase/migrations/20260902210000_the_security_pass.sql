-- What a security pass over the whole product found, and the three things in
-- it that were this project's to fix rather than a decision for somebody.
--
-- The posture held up under an attempt to break it. As an ordinary signed-in
-- player: every table read refused, every console function refused, another
-- venue's customers, takings and staff refused, a stranger's match refused, and
-- a cup's entry money refused. As a guest: every write refused and every table
-- refused. All 202 SECURITY DEFINER functions pin `search_path`, which is the
-- classic way a database like this is taken over and is closed everywhere.
--
-- Three things were wrong.
--
-- 1. `referee` was the only table in the project with grants. Postgres gives
--    new tables in `public` to anon and authenticated by default, and every
--    other table in this schema has had that revoked; the referee migration,
--    written yesterday, forgot. Row-level security was on with no policies, so
--    the escalation was actually refused — a player could not insert themselves
--    as a referee, and the attempt returns "new row violates row-level security
--    policy". But the only thing standing between a signed-in stranger and a
--    referee's badge was one setting, and the project's own invariant is that no
--    table is reachable at all. Revoked here, and the access probe now asserts
--    it for every table so it cannot come back.
--
-- 2. Three console lists answered an unauthorised caller with an empty list
--    rather than a refusal. Nothing leaked — the authorisation was in a WHERE
--    clause and it worked — but "there are no clubs waiting" and "you may not
--    see the clubs waiting" are different sentences, and this product has spent
--    weeks removing places where it said the first when it meant the second.
--    They now refuse out loud, which is also what the console needs to show an
--    error instead of an empty table.
--
--    `referee_fixtures` and `tournaments_i_run` keep the empty list on purpose:
--    both are "your own", both are legitimately empty for somebody with none,
--    and the app only offers them to people who have some.

-- ---------------------------------------------------------------------------
-- 1. The one table with grants
-- ---------------------------------------------------------------------------

revoke all on table public.referee from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 2. A refusal, out loud
-- ---------------------------------------------------------------------------

create or replace function admin_club_queue(p_state text default 'pending', p_limit integer default 50)
returns table (
  club_id uuid, name text, home_area text, verification text,
  captain_name text, captain_phone text, members integer, created_at timestamptz
)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform('moderator') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select c.id, c.name, c.home_area, c.verification,
         coalesce(p.display_name, 'Captain'), p.phone,
         (select count(*)::integer from club_membership m
           where m.club_id = c.id and m.state = 'active'),
         c.created_at
    from club c
    left join player_profile p on p.id = c.captain_id
   where (p_state is null or c.verification = p_state)
   order by c.created_at desc
   limit greatest(1, least(p_limit, 200));
end;
$$;

create or replace function admin_venues()
returns table (venue_id uuid, name text, area text, verification text, pitches integer)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform('support') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select v.id, v.name, v.area, v.verification,
         (select count(*)::integer from pitch p where p.venue_id = v.id)
    from venue v
   order by v.name;
end;
$$;

create or replace function admin_referees()
returns table (
  referee_id uuid, display_name text, phone text,
  active boolean, matches integer, created_at timestamptz
)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform('moderator') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select r.id,
         coalesce(pp.display_name, '—'),
         pp.phone,
         r.active,
         (select count(*)::integer from match m where m.refereed_by = r.id),
         r.created_at
    from referee r
    left join player_profile pp on pp.id = r.id
   order by r.active desc, pp.display_name;
end;
$$;

revoke execute on function public.admin_club_queue(text, integer) from public, anon;
revoke execute on function public.admin_venues() from public, anon;
revoke execute on function public.admin_referees() from public, anon;
grant execute on function public.admin_club_queue(text, integer) to authenticated;
grant execute on function public.admin_venues() to authenticated;
grant execute on function public.admin_referees() to authenticated;
