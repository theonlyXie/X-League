-- Match, peer rating and progression probe (§5.1 / MCH / PRO / PTS).
--
-- The claim under test is the one §5.1 makes and the card has never been able
-- to keep: that a self-assessment is provisional, and completed-match evidence
-- progressively displaces it. Every case here is either that ladder working, or
-- one of the ways somebody would try to fake standing on it.
--
--   psql -f supabase/tests/match_probe.sql
--
-- Expects the three identities from supabase/seed_identities.sql.

create or replace function match_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  BASEL uuid := '11111111-1111-1111-1111-111111111111';
  SALMA uuid := '22222222-2222-2222-2222-222222222222';
  KARIM uuid := '33333333-3333-3333-3333-333333333333';
  v_pitch uuid;
  v_slot  timestamptz;
  v_bk    uuid;
  v_match uuid;
  v_n     integer;
  v_num   numeric;
  v_txt   text;
  h       hold_outcome;
  r       record;
begin
  select p.id into v_pitch
    from pitch p join venue v on v.id = p.venue_id
   where v.name = 'Stadium One' and p.label = 'Pitch A';

  -- Yesterday evening: a match that has actually finished. Set up directly,
  -- because hold_slot correctly refuses to sell an hour that has already
  -- started; everything after this point runs through the real functions.
  v_slot := ((current_date - 1 + interval '21 hours') at time zone 'Africa/Cairo');
  v_bk := test_past_booking(v_pitch, v_slot, BASEL);

  -- -------------------------------------------------------------------------
  -- Only a checked-in booking becomes evidence
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);

  select * into r from complete_match(v_bk, 3, 2);
  return query select 'a booking nobody checked in is not a match',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Only a checked-in booking becomes a match.';

  -- Fill the squad, then let the venue confirm they turned up.
  perform invite_to_booking(v_bk, SALMA, null, 'starter', 'MID');
  perform invite_to_booking(v_bk, KARIM, null, 'starter', 'DEF');
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  perform respond_to_invitation(
    (select id from booking_participant where booking_id = v_bk and player_id = SALMA), true);
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  perform respond_to_invitation(
    (select id from booking_participant where booking_id = v_bk and player_id = KARIM), true);

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  perform check_in_booking(v_bk);

  -- -------------------------------------------------------------------------
  -- Reporting the result
  -- -------------------------------------------------------------------------

  -- What the app reads to decide whether to offer the result screen at all.
  -- It has to agree with complete_match's own precondition, or the button
  -- appears where the server will refuse it.
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select awaiting_result, match_id into r from my_bookings(50) where booking_id = v_bk;
  return query select 'a finished checked-in booking is awaiting its result',
                      r.awaiting_result::text, r.awaiting_result and r.match_id is null;

  -- The same list, seen by somebody who played but did not book it: my_bookings
  -- is the captain's list, and only the captain may report.
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select count(*)::integer into v_n from my_bookings(50) where booking_id = v_bk;
  return query select 'and it is not in a squad member''s list', v_n::text, v_n = 0;

  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from complete_match(v_bk, 3, 2);
  return query select 'a squad member who is not the captain cannot report it',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from complete_match(v_bk, 3, 2);
  v_match := r.match_id;
  return query select 'the captain can', coalesce(r.reason, 'reported'), r.ok;

  select state into v_txt from booking where id = v_bk;
  return query select 'and the booking is completed', v_txt, v_txt = 'completed';

  select count(*)::integer into v_n from match_participant where match_id = v_match;
  return query select 'the team sheet is the accepted squad', v_n::text, v_n = 3;

  select awaiting_result, match_id into r from my_bookings(50) where booking_id = v_bk;
  return query select 'once reported it stops asking, and points at the match',
                      coalesce(r.match_id::text, '(none)'),
                      r.awaiting_result = false and r.match_id = v_match;

  -- -------------------------------------------------------------------------
  -- PTS-001 — the ledger pays once
  -- -------------------------------------------------------------------------
  select count(*)::integer into v_n
    from point_ledger where match_id = v_match and kind = 'match_played';
  return query select 'everyone who played is credited', v_n::text, v_n = 3;

  perform complete_match(v_bk, 3, 2);
  perform complete_match(v_bk, 3, 2);
  select count(*)::integer into v_n
    from point_ledger where match_id = v_match and kind = 'match_played';
  return query select 'reporting it three times still pays once', v_n::text, v_n = 3;

  select count(*)::integer into v_n
    from point_ledger where match_id = v_match and kind = 'match_won';
  return query select 'only the winning side is credited with a win', v_n::text, v_n > 0 and v_n < 3;

  -- -------------------------------------------------------------------------
  -- PRO-009 — who may rate
  -- -------------------------------------------------------------------------
  select * into r from submit_peer_rating(v_match, BASEL, '{"PAS":80}'::jsonb);
  return query select 'nobody rates themselves',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'You cannot rate yourself.';

  select * into r from submit_peer_rating(v_match, SALMA, '{"VIB":80}'::jsonb);
  return query select 'an invented attribute is refused',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from submit_peer_rating(v_match, SALMA, '{"PAS":140}'::jsonb);
  return query select 'a rating outside 1-99 is refused',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from submit_peer_rating(v_match, SALMA, '{}'::jsonb);
  return query select 'an empty rating is refused',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from submit_peer_rating(v_match, SALMA, '{"PAS":85,"DRI":80}'::jsonb);
  return query select 'a teammate can be rated', coalesce(r.reason, 'rated'), r.ok;

  -- Somebody who was not on the pitch.
  insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
  values ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', now(), now()) on conflict do nothing;
  insert into player_profile (id, display_name) values
    ('44444444-4444-4444-4444-444444444444', 'Outsider') on conflict do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '44444444-4444-4444-4444-444444444444')::text, true);
  select * into r from submit_peer_rating(v_match, BASEL, '{"PAS":99}'::jsonb);
  return query select 'somebody who did not play cannot rate',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'You can only rate a match you played in.';

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from submit_peer_rating(v_match, '44444444-4444-4444-4444-444444444444',
                                          '{"PAS":10}'::jsonb);
  return query select 'and cannot be rated either',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'They did not play in that match.';

  -- PRO-009: rating the same person twice edits, it does not stack.
  perform submit_peer_rating(v_match, SALMA, '{"PAS":70,"DRI":70}'::jsonb);
  select count(*)::integer into v_n
    from peer_rating where match_id = v_match and rater_id = BASEL and subject_id = SALMA;
  return query select 'rating the same player twice edits rather than stacks', v_n::text, v_n = 1;

  -- -------------------------------------------------------------------------
  -- MCH-003 — a match becomes evidence once enough people corroborate it
  -- -------------------------------------------------------------------------
  select state into v_txt from match where id = v_match;
  return query select 'one rater does not verify a match', v_txt, v_txt = 'played';

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  perform submit_peer_rating(v_match, BASEL, '{"PAS":75,"DRI":70,"DEF":60}'::jsonb);
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  perform submit_peer_rating(v_match, BASEL, '{"PAS":65,"DRI":60,"DEF":70}'::jsonb);

  select state into v_txt from match where id = v_match;
  return query select 'three independent raters do', v_txt, v_txt = 'verified';

  select count(*)::integer into v_n
    from point_ledger where match_id = v_match and kind = 'match_verified';
  return query select 'and verification pays everyone who played', v_n::text, v_n = 3;

  -- -------------------------------------------------------------------------
  -- §5.1 — the ladder actually moves
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  perform submit_self_assessment('MID',
    '{"SPD":50,"SHO":50,"PAS":50,"DRI":50,"DEF":50,"PHY":50}'::jsonb);

  select evidence_count, self_weight, confidence into r from my_card();
  return query select 'the card now counts a verified match as evidence',
                      r.evidence_count::text, r.evidence_count = 1;
  return query select 'and it is still Provisional at one match',
                      r.confidence, r.confidence = 'provisional';

  -- Basel was rated PAS 75 and 65 by his two teammates; his own answer was 50.
  -- At one match the self-assessment still supplies 70%, so the blend should
  -- land at 0.7*50 + 0.3*70 = 56.
  select (attributes ->> 'PAS')::numeric into v_num from my_card();
  return query select 'a rated attribute blends self and peers at the ladder weight',
                      coalesce(v_num::text, '(none)'), v_num = 56;

  select (attributes ->> 'SHO')::numeric into v_num from my_card();
  return query select 'an attribute nobody rated keeps the self-assessed value',
                      coalesce(v_num::text, '(none)'), v_num = 50;

  select self_weight into v_num from my_card();
  return query select 'self-assessment still supplies 70% at one match',
                      v_num::text, v_num = 0.70;

  -- -------------------------------------------------------------------------
  -- PRO-010 — the rating window closes
  -- -------------------------------------------------------------------------
  update match set played_at = now() - interval '8 days' where id = v_match;
  select * into r from submit_peer_rating(v_match, SALMA, '{"PAS":99}'::jsonb);
  return query select 'ratings close a week after the match',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Ratings for that match have closed.';
  update match set played_at = v_slot where id = v_match;

  -- -------------------------------------------------------------------------
  -- Progression
  -- -------------------------------------------------------------------------
  select xp, level, verified_matches, rater_count, form into r from my_card_evidence();
  return query select 'XP is the sum of the ledger', r.xp::text,
                      r.xp = (select sum(points) from point_ledger where player_id = BASEL);
  return query select 'the card knows how many people rated it',
                      r.rater_count::text, r.rater_count = 2;
  return query select 'and the form strip reads the real result',
                      array_to_string(r.form, ''), r.form[1] = 'W';

  select level, into_level, to_next into r from level_for_xp(0);
  return query select 'a new player is level 1', r.level::text, r.level = 1;
  select level into r from level_for_xp(100);
  return query select '100 XP is level 2', r.level::text, r.level = 2;
  select level into r from level_for_xp(1000);
  return query select '1000 XP is level 5', r.level::text, r.level = 5;
  select level, to_next into r from level_for_xp(150);
  return query select 'and the gap to the next level is real',
                      r.to_next::text, r.level = 2 and r.to_next = 150;

  -- -------------------------------------------------------------------------
  -- RBAC — the internals are not an API
  -- -------------------------------------------------------------------------
  -- Asserted against the catalogue rather than by calling it: this probe is
  -- owned by a superuser, which bypasses privilege checks, so a successful call
  -- here would prove nothing about what a client can reach.
  return query select 'rebuild_card is not reachable by anon or authenticated',
    case when has_function_privilege('authenticated', 'rebuild_card(uuid)', 'execute')
              or has_function_privilege('anon', 'rebuild_card(uuid)', 'execute')
         then '(reachable!)' else 'closed' end,
    not has_function_privilege('authenticated', 'rebuild_card(uuid)', 'execute')
    and not has_function_privilege('anon', 'rebuild_card(uuid)', 'execute');

  return query select 'nor is award_match_points or verify_match_if_ready',
    case when has_function_privilege('authenticated', 'award_match_points(uuid)', 'execute')
              or has_function_privilege('authenticated', 'verify_match_if_ready(uuid)', 'execute')
         then '(reachable!)' else 'closed' end,
    not has_function_privilege('authenticated', 'award_match_points(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'verify_match_if_ready(uuid)', 'execute');

  return query select 'but submit_peer_rating is, for a signed-in player',
    case when has_function_privilege('authenticated', 'submit_peer_rating(uuid,uuid,jsonb)', 'execute')
         then 'granted' else '(closed!)' end,
    has_function_privilege('authenticated', 'submit_peer_rating(uuid,uuid,jsonb)', 'execute')
    and not has_function_privilege('anon', 'submit_peer_rating(uuid,uuid,jsonb)', 'execute');
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from match_probe();
rollback;

drop function match_probe();
