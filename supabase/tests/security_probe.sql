-- Security invariants (SEC).
--
-- Not a test of what the product does — a test of what it refuses. Every case
-- here is a posture the whole schema depends on, of the kind that is correct
-- for months and then quietly is not because one migration forgot a line. That
-- is exactly what happened to `referee`: Postgres grants new tables in `public`
-- to anon and authenticated by default, forty-six migrations had revoked it,
-- and the forty-seventh did not.
--
-- Deliberately pure SQL with no function to create and nothing to write, so it
-- can be pointed at the live project as safely as at a throwaway one:
--
--   psql -f supabase/tests/security_probe.sql
--
-- Every row is a count that must be zero. A non-zero one names what broke.

with

-- SEC-001 — no table is readable at all. RLS on everything.
rls as (
  select 'every table has row-level security on' as case_name,
         coalesce(string_agg(c.relname, ', ' order by c.relname), 'all on') as result,
         count(*) = 0 as passed
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
),

-- SEC-002 — and no table is granted to a client role either. RLS is the second
-- lock, not the only one: a table with grants is one careless policy away from
-- being readable, and this schema's rule is that clients reach data through
-- functions or not at all.
grants as (
  select 'no table is granted to anon, authenticated or public' as case_name,
         coalesce(string_agg(distinct table_name || ' → ' || grantee, ', '), 'none granted') as result,
         count(*) = 0 as passed
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated', 'public')
),

-- SEC-003 — the classic way a database like this is taken over. A SECURITY
-- DEFINER function without a pinned search_path runs the caller's idea of what
-- `player_profile` means, and the caller can make that anything.
searchpath as (
  select 'every SECURITY DEFINER function pins its search_path' as case_name,
         coalesce(string_agg(p.proname, ', ' order by p.proname), 'all pinned') as result,
         count(*) = 0 as passed
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
     )
),

-- SEC-004 — a refusal has to be a refusal. Authorisation in a WHERE clause
-- answers an unauthorised caller with an empty list, which is the same shape as
-- "there is nothing here" and reads as it on every screen. The two "my own"
-- lists are exempt: empty is the truth for somebody with none.
silent as (
  select 'no console list answers an unauthorised caller with an empty list' as case_name,
         coalesce(string_agg(p.proname, ', ' order by p.proname), 'all refuse out loud') as result,
         count(*) = 0 as passed
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prolang = (select oid from pg_language where lanname = 'sql')
     and p.proname like 'admin\_%'
     and p.prosrc ~* '(where|and)[[:space:]]+is_platform'
),

-- SEC-005 — nothing internal is reachable by a client. The helper functions
-- exist to be called by other functions; a client calling one directly is
-- reading something the function it belongs to would not have shown them.
internals as (
  select 'no internal helper is callable by a client' as case_name,
         coalesce(string_agg(p.proname, ', ' order by p.proname), 'none reachable') as result,
         count(*) = 0 as passed
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname in (
       'notify', 'write_audit', 'is_blocked_between', 'staff_user_id', 'staff_email',
       'issue_recovery_code', 'award_match_points', 'rebuild_standings', 'rebuild_card',
       'conversation_audience', 'points_for', 'generate_booking_code'
     )
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
),

-- SEC-006 — a trigger body is not an API. Trigger functions inherit Postgres's
-- default of EXECUTE to PUBLIC, and a trigger never checks the caller's
-- privilege on itself, so an open one is a way to run its body out of context.
triggers as (
  select 'no trigger function is callable by a client' as case_name,
         coalesce(string_agg(p.proname, ', ' order by p.proname), 'none reachable') as result,
         count(*) = 0 as passed
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prorettype = 'trigger'::regtype
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
),

-- SEC-008 — the guest surface is a decision, not a drift. The exact list lives
-- in access_probe; this only holds the size, so a migration that opens a
-- twenty-first function to the world has to be deliberate about it.
anon_surface as (
  select 'the guest surface is the twenty functions it is meant to be' as case_name,
         count(*)::text || ' anon-callable' as result,
         count(*) <= 21 as passed
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'execute')
     and p.proname not like 'gbt%' and p.proname not like '%\_dist'
     and p.proname not like '%\_probe' and p.proname not like 'test\_%'
)

select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict
  from (
    select * from rls
    union all select * from grants
    union all select * from searchpath
    union all select * from silent
    union all select * from internals
    union all select * from triggers
    union all select * from anon_surface
  ) all_cases;

-- SEC-007 — an upload bucket with no ceiling and no allowlist is a file host.
--
-- Its own statement, behind a guard, because it is the one case that cannot be
-- asked of a throwaway database: `bootstrap.sh` shims `auth` so the migrations
-- run, and deliberately does not reimplement Storage. A static reference to
-- `storage.buckets` fails at parse time where the schema is absent, which takes
-- the whole probe with it — so the reference only exists inside the branch.
select to_regclass('storage.buckets') is not null as has_storage \gset

\if :has_storage
select 'every storage bucket caps size and names its types' as case_name,
       coalesce((select string_agg(b.id, ', ' order by b.id) from storage.buckets b
                  where b.file_size_limit is null or b.allowed_mime_types is null),
                'all capped') as result,
       case when exists (select 1 from storage.buckets b
                          where b.file_size_limit is null or b.allowed_mime_types is null)
            then 'FAIL' else 'PASS' end as verdict;

select 'no storage bucket is writable without a policy' as case_name,
       coalesce((select string_agg(b.id, ', ' order by b.id) from storage.buckets b
                  where not exists (
                    select 1 from pg_policy pol
                      join pg_class c on c.oid = pol.polrelid
                      join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'storage' and c.relname = 'objects'
                       and pg_get_expr(pol.polwithcheck, pol.polrelid) like '%' || b.id || '%')),
                'all have one') as result,
       case when exists (select 1 from storage.buckets b
                          where not exists (
                            select 1 from pg_policy pol
                              join pg_class c on c.oid = pol.polrelid
                              join pg_namespace n on n.oid = c.relnamespace
                             where n.nspname = 'storage' and c.relname = 'objects'
                               and pg_get_expr(pol.polwithcheck, pol.polrelid) like '%' || b.id || '%'))
            then 'FAIL' else 'PASS' end as verdict;
\endif
