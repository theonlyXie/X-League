-- X League — the API surface, stated once.
--
-- Grants have been accumulating migration by migration, and two things kept
-- going wrong in ways that are invisible unless you go looking:
--
--   1. Postgres grants EXECUTE to PUBLIC on every newly created function. The
--      blanket revoke in the first access-control migration could not cover
--      functions that did not exist yet, so `owner_arrivals` and
--      `owner_summary` — both venue-scoped — were reachable by `anon`. They
--      check `is_venue_staff` internally and raise, so nothing leaked, but
--      RBAC-001 says those doors are not open to anonymous callers at all.
--
--   2. CREATE OR REPLACE resets a function's grants along with its body. The
--      snapshot-ordering migration replaced `my_card()` to fix its ordering and
--      silently handed it back to PUBLIC.
--
-- Both are the same lesson: a grant written next to a function is a grant that
-- drifts. So this migration is the single authoritative statement of who may
-- call what. It runs last, revokes everything, and hands back exactly the
-- surface the product needs — and because it enumerates every name, a function
-- added later without being listed here is *closed* rather than open, which is
-- the failure direction to prefer.

-- ---------------------------------------------------------------------------
-- Close everything
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

-- Tables are not part of the API. Every one of them has RLS on and no policies,
-- so PostgREST cannot read or write a row directly; the functions below are the
-- only door. Restated here so the whole access story is in one file.
revoke all on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Guests (§2) — browsing needs no account
-- ---------------------------------------------------------------------------

grant execute on function public.search_availability(uuid, date, text)            to anon, authenticated;
grant execute on function public.nearest_alternatives(uuid, timestamptz, integer) to anon, authenticated;
grant execute on function public.search_venues(date, text, numeric, numeric, smallint, smallint, text, integer) to anon, authenticated;
grant execute on function public.venue_detail(uuid)                               to anon, authenticated;
grant execute on function public.venue_reviews(uuid, integer)                     to anon, authenticated;
grant execute on function public.list_tournaments(integer)                        to anon, authenticated;
grant execute on function public.tournament_detail(uuid)                          to anon, authenticated;

-- The one write-shaped function anon may reach, and only so it can answer
-- "Sign in to hold a slot" in the player's own language instead of a bare
-- 42501. It writes nothing without auth.uid() — proved by the spine suite.
grant execute on function public.hold_slot(uuid, timestamptz, integer, text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Signed-in players
-- ---------------------------------------------------------------------------

do $$
declare fn text;
begin
  foreach fn in array array[
    -- Booking
    'confirm_booking(uuid)',
    'release_hold(uuid)',
    'cancel_booking(uuid)',
    'cancellation_cutoff(uuid, text)',
    'booking_terms(uuid)',
    'my_next_booking(text)',
    'my_bookings(integer)',
    'my_standing()',
    'submit_review(uuid, integer, text)',

    -- Squad and teams
    'can_see_squad(uuid)',
    'booking_squad(uuid)',
    'squad_counts(uuid)',
    'invite_to_booking(uuid, uuid, text, text, text)',
    'respond_to_invitation(uuid, boolean)',
    'leave_booking(uuid)',
    'remove_participant(uuid)',
    'my_invitations()',
    'my_squad_matches(integer)',
    'find_players(text, integer)',
    'create_team(text, text, integer)',
    'invite_to_team(uuid, uuid)',
    'respond_to_team_invite(uuid, boolean)',
    'my_teams()',
    'team_roster(uuid)',

    -- The card
    'submit_self_assessment(text, jsonb)',
    'my_card()',
    'my_card_evidence()',
    'my_match_evidence(integer)',
    'my_points(integer)',
    'complete_match(uuid, integer, integer)',
    'submit_peer_rating(uuid, uuid, jsonb)',
    'rate_targets(uuid)',

    -- Messaging
    'is_conversation_member(uuid)',
    'lobby_conversation(uuid)',
    'team_conversation(uuid)',
    'direct_conversation(uuid)',
    'send_message(uuid, text)',
    'conversation_messages(uuid, integer, timestamptz)',
    'my_conversations(integer)',
    'mark_conversation_read(uuid)',
    'my_notifications(integer)',
    'unread_notifications()',
    'mark_notifications_read(uuid)',
    'submit_report(text, uuid, text, text)',

    -- Tournaments
    'my_tournaments()',
    'register_team(uuid, uuid)',

    -- Which workspaces this person may open. Each returns nothing rather than
    -- raising for somebody with no role, so the client can hide a door without
    -- deciding who may walk through it.
    'my_venues()',
    'my_platform_role()',
    'is_venue_staff(uuid, venue_role)',
    'is_platform(platform_role_kind)',
    'can_run_tournament(uuid)',

    -- Venue operations. Signed in at the grant level, then scoped inside the
    -- function to the venues the caller actually works at (RBAC-002).
    'check_in_booking(uuid)',
    'record_offline_booking(uuid, timestamptz, integer, booking_source, text)',
    'record_payment(uuid, text, text)',
    'mark_no_show(uuid)',
    'owner_day(uuid, date, text)',
    'owner_arrivals(uuid, date, text)',
    'owner_summary(uuid, date, text)',
    'set_price_rule(uuid, integer, integer, integer, integer, date)',
    'venue_price_rules(uuid)',
    'close_slot(uuid, timestamptz, integer, text, text)',
    'reopen_slot(uuid)',
    'venue_closures(uuid, date)',
    'set_venue_staff(uuid, uuid, venue_role, boolean)',
    'venue_staff_list(uuid)',
    'venue_payouts(uuid, date, date, text)',
    'update_venue_profile(uuid, text, text, text, text, text, text[], text, numeric, numeric)',
    'venue_review_summary(uuid)',
    'create_tournament(uuid, text, tournament_format, integer, date, date, integer, text)',
    'set_tournament_state(uuid, tournament_state)',
    'decide_registration(uuid, boolean)',
    'generate_fixtures(uuid)',
    'schedule_fixture(uuid, uuid)',
    'record_fixture_result(uuid)',

    -- Platform operations, scoped inside the function by platform_role
    -- (RBAC-003).
    'admin_verification_queue()',
    'admin_set_verification(uuid, text, text)',
    'admin_reports(text, integer)',
    'admin_resolve_report(uuid, text, text)',
    'admin_find_users(text, integer)',
    'admin_suspend_user(uuid, integer, text)',
    'admin_overview(integer, text)',
    'admin_ledger(integer)',
    'admin_settings()',
    'admin_set_setting(text, integer)',
    'admin_audit(integer, uuid)'
  ] loop
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Everything else stays shut
-- ---------------------------------------------------------------------------

-- Not listed above, and therefore not callable by any client:
--
--   rebuild_card, award_match_points, verify_match_if_ready — SECURITY DEFINER
--     and take a caller-supplied id, so an open grant would let anyone rebuild
--     anyone's card or force a match to count as verified evidence.
--   notify — a client that could write notifications could write them to
--     anybody.
--   write_audit — an audit log a client can write is not an audit log.
--   rebuild_standings — a tournament table is computed, not submitted.
--   player_standing, policy_value, venue_of_pitch, current_actor,
--     expire_stale_holds, generate_booking_code — internals with no business
--     being an API. `my_standing()` is the version a player may call, and it
--     can only ask about itself.
--   The trigger functions, which run as the owner of the table they hang off
--     and are never invoked by name.
--   card_confidence, compute_ovr, self_assessment_weight, level_for_xp,
--     points_for, known_attribute, distance_km, format_capacity — pure
--     computations used by the functions above. Harmless to expose and
--     pointless, so they are not.

-- A standing check anyone can run against a deployment: this must return zero
-- rows, and names anything that has drifted open.
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
       'format_capacity'
     )
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
   order by 1;
$$;

revoke execute on function public.unexpected_grants() from public, anon, authenticated;

comment on function public.unexpected_grants() is
  'Returns rows only when an internal function has drifted open to a client role. Zero rows is the passing state.';
