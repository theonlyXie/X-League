-- Your own profile, through a function like everything else.
--
-- Found by watching the network while signing in: every sign-in fired
--
--   GET /rest/v1/player_profile?select=display_name&id=eq.<uid>
--
-- and every sign-in got 403 back, with PostgREST helpfully suggesting
-- `GRANT SELECT ON public.player_profile TO authenticated`. That grant is
-- exactly what this schema does not do — RLS is on, no table has grants, and
-- SECURITY DEFINER functions are the only door. The read was the one place in
-- either client that reached for a table directly.
--
-- The failure was invisible because the caller wrapped it in a try/catch and
-- carried on, so `displayName` simply stayed null for ever. Home then fell back
-- to the design fixture and greeted every signed-out visitor, and every
-- signed-in player, as "Basel" — a person who does not exist. A swallowed 403
-- became a fabricated identity.
--
-- More than display_name is returned because the caller needing a name today
-- is the caller needing an area and a language tomorrow, and a second round
-- trip for those is the reason people reach for the table again.

create or replace function my_profile()
returns table (
  player_id      uuid,
  display_name   text,
  phone          text,
  area           text,
  visibility     text,
  language       text,
  birth_year     smallint,
  terms_version  text,
  suspended_until timestamptz,
  created_at     timestamptz
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select p.id, p.display_name, p.phone, p.preferred_area, p.visibility,
         p.language, p.birth_year, p.terms_version, p.suspended_until, p.created_at
    from player_profile p
   where p.id = auth.uid();
$$;

-- Closed here and handed back by 20260822109000_access_control.sql, which runs
-- after this one and is the single authoritative statement of who may call what.
revoke execute on function public.my_profile() from public, anon, authenticated;
