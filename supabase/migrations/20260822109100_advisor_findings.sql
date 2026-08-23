-- What Supabase's own linters flagged, and what was worth acting on.
--
-- Running the security and performance advisors against the live project
-- returns 133 security notices and 51 performance ones. Almost all of the
-- security notices describe this schema's deliberate shape rather than a
-- defect, so this migration does not chase the count down. It fixes the two
-- findings that are real: policies that re-evaluate `auth.uid()` once per row,
-- and foreign keys on hot read paths with nothing to index-scan.
--
-- Why the rest are left alone, so the next person reading a red advisor page
-- does not have to re-derive it:
--
--   * `rls_enabled_no_policy` (30 tables). Intended. Every table has RLS on and
--     no grants, so PostgREST cannot reach any of them directly; all access is
--     through SECURITY DEFINER functions that check the caller themselves. A
--     policy would be dead code guarding a door with no handle.
--
--   * `..._security_definer_function_executable` (101). Intended, and it is the
--     API. The eight anon-callable ones are the browsing surface a signed-out
--     visitor needs; the rest require a session and check `auth.uid()` in their
--     first statement. `access_probe.sql` asserts that this list is exactly the
--     list in 20260822109000_access_control.sql, which is the real guard.
--
--   * `extension_in_public` (btree_gist). Deliberately not moved. The booking
--     exclusion constraint depends on its operator classes, and Postgres finds
--     a default operator class only in schemas on the search path — moving the
--     extension would work for the existing constraint and quietly break the
--     next migration that writes one. A hygiene warning is the cheaper problem.
--
--   * `unused_index` (21). An artefact of a database with almost no traffic:
--     `pg_stat_user_indexes` counts scans, and nobody has run the queries these
--     serve yet. Revisit once there is real usage to read.
--
--   * `auth_leaked_password_protection`. A project setting rather than schema,
--     and not reachable from a migration. Worth turning on in the dashboard
--     (Authentication -> Providers -> Email) before real accounts exist.

-- ---------------------------------------------------------------------------
-- Evaluate the caller once per query, not once per row
-- ---------------------------------------------------------------------------

-- `auth.uid()` is stable, not immutable, so a bare call in a policy is
-- re-executed for every row the planner tests. Wrapping it in a scalar
-- subquery turns it into an InitPlan evaluated once. The predicates are
-- otherwise unchanged — same tables, same columns, same access.

drop policy if exists player_profile_self_read on player_profile;
create policy player_profile_self_read on player_profile
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists player_profile_self_write on player_profile;
create policy player_profile_self_write on player_profile
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists player_profile_self_insert on player_profile;
create policy player_profile_self_insert on player_profile
  for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists venue_staff_self_read on venue_staff;
create policy venue_staff_self_read on venue_staff
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists self_assessment_own on self_assessment;
create policy self_assessment_own on self_assessment
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists attribute_snapshot_own on attribute_snapshot;
create policy attribute_snapshot_own on attribute_snapshot
  for select to authenticated using (player_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Foreign keys the API actually reads by
-- ---------------------------------------------------------------------------

-- The advisor lists 23 unindexed foreign keys. Most of them are provenance
-- columns — `created_by`, `invited_by`, `collected_by`, `resolved_by`,
-- `reported_by`, `granted_by`, `updated_by`, `actor_id`. Nothing filters by
-- them; they are read back with the row they belong to. Indexing those would
-- buy a write cost on every insert and serve no query.
--
-- These nine are different: each one is a column a function in this schema
-- filters or joins on, on a path a player waits for.

-- search_availability and the price quote read every rule for one pitch.
create index if not exists availability_rule_pitch_idx
  on availability_rule (pitch_id);
create index if not exists price_rule_pitch_idx
  on price_rule (pitch_id, valid_from desc);

-- venue_detail lists a pitch's reviews; refresh_venue_rating re-aggregates
-- them on every write.
create index if not exists pitch_review_pitch_idx
  on pitch_review (pitch_id, created_at desc) where not hidden;

-- is_venue_staff runs first in every owner-side function. The existing index
-- leads with user_id, which answers "where do I work"; this one answers "who
-- works here", for venue_staff_list and set_venue_staff.
create index if not exists venue_staff_venue_idx
  on venue_staff (venue_id) where active;

-- A team's fixtures come from both sides of the draw, and rebuild_standings
-- walks them per team.
create index if not exists fixture_home_team_idx on fixture (home_team_id);
create index if not exists fixture_away_team_idx on fixture (away_team_id);

-- my_tournaments asks which cups a team is in — the registration table read
-- from the team side rather than the tournament side.
create index if not exists tournament_registration_team_idx
  on tournament_registration (team_id);

-- award_match_points writes a ledger row per participant and reads back what
-- it already wrote for that match, so this one is on the write path.
create index if not exists point_ledger_match_idx
  on point_ledger (match_id);

-- rate_targets excludes the people the caller has already rated.
create index if not exists peer_rating_rater_idx
  on peer_rating (rater_id, match_id);

-- ---------------------------------------------------------------------------
-- Two indexes superseded by the seq ordering
-- ---------------------------------------------------------------------------

-- The card originally ordered snapshots by `created_at`; ties inside one
-- transaction made that ambiguous, so both tables gained a `seq` and every
-- reader moved to `(player_id, seq desc)`. The older pair now duplicates the
-- leading column of the newer one and serves no remaining query.
drop index if exists self_assessment_player_idx;
drop index if exists attribute_snapshot_player_idx;
