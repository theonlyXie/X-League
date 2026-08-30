-- Close `staff_email`, and put the recovery internals under the probe.
--
-- Two things the SQL suite caught, which is the whole reason it runs on every
-- change to `supabase/`.
--
-- First, `access_probe` asserts the anonymous surface is *exactly* the browsing
-- functions plus the two somebody needs before they have a session. The staff
-- recovery functions deliberately widen that set, so the probe is updated to
-- say so — the point of an exact list is that growing it is a decision somebody
-- writes down, not something that happens quietly.
--
-- Second, and less comfortably: `staff_email` was revoked from `public, anon`
-- and left reachable by `authenticated`. It only turns a username into an
-- address, so the harm is small, but the rule in this schema is that internals
-- are reachable by nobody, and it was not. `unexpected_grants()` did not catch
-- it because that function guards an explicit list of internal names and the
-- new ones were not on it — a gap that would have hidden the next one too.

revoke execute on function public.staff_email(text) from public, anon, authenticated;

-- The four helpers behind staff recovery, added to the list the probe watches.
-- `staff_user_id` and `issue_recovery_code` are the ones that matter: the first
-- maps a username to an account, the second mints a code. Neither should ever
-- be callable over the API, and now a change that made one so would fail the
-- suite rather than ship.
create or replace function unexpected_grants()
returns table (function_name text, reachable_by text)
language sql stable
set search_path = public, pg_temp as $$
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         case when has_function_privilege('anon', p.oid, 'execute') then 'anon'
              else 'authenticated' end
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     -- btree_gist ships its support functions into public; they are called by
     -- the index machinery, not over the API.
     and p.proname not like 'gbt%'
     and p.proname not like 'gbtreekey%'
     and p.proname not like '%\_dist'
     and p.proname in (
       'rebuild_card', 'award_match_points', 'verify_match_if_ready', 'notify',
       'write_audit', 'rebuild_standings', 'player_standing', 'policy_value',
       'venue_of_pitch', 'current_actor', 'expire_stale_holds',
       'generate_booking_code', 'refresh_venue_rating', 'seed_captain_participant',
       'seed_deposit_obligation', 'notify_participant_change', 'touch_booking',
       'card_confidence', 'compute_ovr', 'self_assessment_weight',
       'level_for_xp', 'points_for', 'known_attribute', 'distance_km',
       'format_capacity',
       'staff_email', 'staff_user_id', 'new_recovery_code', 'issue_recovery_code'
     )
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
   order by 1;
$$;

revoke execute on function public.unexpected_grants() from public, anon, authenticated;
