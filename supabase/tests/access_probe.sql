-- Access-surface probe (RBAC-001).
--
-- Two failures this catches, both of which actually happened:
--   * a function created after the blanket revoke keeping the Postgres default
--     of EXECUTE to PUBLIC (owner_arrivals, owner_summary);
--   * CREATE OR REPLACE resetting a function's grants along with its body
--     (my_card, when snapshot ordering was fixed).
--
-- Neither is visible from the application. Both are visible here.
--
--   psql -f supabase/tests/access_probe.sql

create or replace function access_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  v_anon text[];
  -- Browsing, plus the two a person needs before they have a session at all.
  -- `sign_up` is the only anon-callable function in the schema that writes, and
  -- what makes that acceptable is what it cannot write: it never touches
  -- platform_role, which auth_probe asserts directly.
  --
  -- The three `staff_*` functions widen this set deliberately. Somebody
  -- recovering a console password has no session, so they cannot be reached any
  -- other way, and what makes that acceptable is what they refuse: they act
  -- only on accounts holding an active platform role, first-time setup declines
  -- an account that already has a password, and the reset needs a hashed
  -- recovery code and locks after five failures. The list is exact so that
  -- growing it is a decision somebody writes down.
  --
  -- The record widens it again, and on purpose. Who won what, who is scoring
  -- and where the cups are is the reason somebody opens this before they have
  -- an account: a roll of honour behind a sign-in is not a roll of honour.
  -- None of the six reads anything a person did not choose to put on a public
  -- card, and none of them writes.
  v_want text[] := array[
    'auth_email_for_sign_in', 'club_honours', 'featured_clubs', 'hold_slot',
    'keeper_leaderboard', 'leaderboard', 'list_tournaments',
    'nearest_alternatives', 'search_availability', 'search_venues', 'sign_up',
    'staff_auth_status', 'staff_reset_password', 'staff_set_first_password',
    'tournament_awards', 'tournament_detail', 'tournament_regions',
    'tournament_venues', 'venue_detail', 'venue_reviews'
  ];
  v_open text;
  v_n    integer;
begin
  -- -------------------------------------------------------------------------
  -- Nothing internal has drifted open
  -- -------------------------------------------------------------------------
  select string_agg(function_name || ' → ' || reachable_by, ', ')
    into v_open from unexpected_grants();
  return query select 'no internal function is reachable by a client',
                      coalesce(v_open, 'none'), v_open is null;

  -- -------------------------------------------------------------------------
  -- The guest surface is exactly what §2 says it is
  -- -------------------------------------------------------------------------
  select array_agg(p.proname order by p.proname) into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname not like 'gbt%' and p.proname not like 'gbtreekey%'
     and p.proname not like '%\_dist'
     -- This probe is itself created with the PUBLIC default, and so shows up
     -- in its own scan. Test scaffolding is created, run and dropped; it is
     -- not part of the surface being measured.
     and p.proname not like '%\_probe'
     and p.proname not like 'test\_%'
     and has_function_privilege('anon', p.oid, 'execute');

  return query select 'a guest can reach exactly the browsing surface',
                      array_to_string(coalesce(v_anon, '{}'), ', '),
                      coalesce(v_anon, '{}') = v_want;

  -- -------------------------------------------------------------------------
  -- The things most worth being sure about
  -- -------------------------------------------------------------------------
  return query select 'the player card is not readable anonymously',
    case when has_function_privilege('anon', 'my_card()', 'execute')
         then '(reachable!)' else 'closed' end,
    not has_function_privilege('anon', 'my_card()', 'execute')
    and has_function_privilege('authenticated', 'my_card()', 'execute');

  return query select 'owner screens are not anonymous',
    case when has_function_privilege('anon', 'owner_day(uuid,date,text)', 'execute')
              or has_function_privilege('anon', 'owner_arrivals(uuid,date,text)', 'execute')
              or has_function_privilege('anon', 'owner_summary(uuid,date,text)', 'execute')
         then '(reachable!)' else 'closed' end,
    not has_function_privilege('anon', 'owner_day(uuid,date,text)', 'execute')
    and not has_function_privilege('anon', 'owner_arrivals(uuid,date,text)', 'execute')
    and not has_function_privilege('anon', 'owner_summary(uuid,date,text)', 'execute');

  return query select 'the admin console is not anonymous',
    case when has_function_privilege('anon', 'admin_overview(integer,text)', 'execute')
              or has_function_privilege('anon', 'admin_ledger(integer)', 'execute')
         then '(reachable!)' else 'closed' end,
    not has_function_privilege('anon', 'admin_overview(integer,text)', 'execute')
    and not has_function_privilege('anon', 'admin_ledger(integer)', 'execute');

  -- -------------------------------------------------------------------------
  -- Tables are not an API at all
  -- -------------------------------------------------------------------------
  select count(*)::integer into v_n
    from pg_tables t
   where t.schemaname = 'public'
     and (has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'select')
       or has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'select'));
  return query select 'no table is directly selectable over the API', v_n::text, v_n = 0;

  select count(*)::integer into v_n
    from pg_tables t
   where t.schemaname = 'public' and not t.rowsecurity;
  return query select 'and every table has row-level security on', v_n::text, v_n = 0;
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from access_probe();
rollback;

drop function access_probe();
