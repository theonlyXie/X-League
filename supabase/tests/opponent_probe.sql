-- Who are you playing?
--
-- A booking used to be an hour on a pitch and nothing else: the app knew where
-- and when, and had no idea against whom. This is the other half — the captain
-- names an opponent, the opponent is asked, and the match is on only when they
-- say so.
--
-- The rule the cases below exist to hold: an invitation is not an agreement.
-- Nothing about the fixture changes because one captain wishes it; it changes
-- when the other side answers. Everything else here follows from that.
--
-- Also under test: the booking and the challenge are independent. An opponent
-- who declines does not cancel the hour — the captain still has the pitch and
-- can ask somebody else. That was a deliberate decision, and it is the kind of
-- decision that quietly reverses itself unless something checks.
--
--   psql -f supabase/tests/opponent_probe.sql
--
-- Expects the identities from supabase/seed_identities.sql.

create or replace function opponent_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  BASEL uuid := '11111111-1111-1111-1111-111111111111';
  SALMA uuid := '22222222-2222-2222-2222-222222222222';
  KARIM uuid := '33333333-3333-3333-3333-333333333333';
  GHOST uuid := 'deadbeef-0000-0000-0000-000000000000';
  v_pitch uuid;
  v_slot  timestamptz;
  v_bk    uuid;
  v_bk2   uuid;
  v_ch    uuid;
  v_club  uuid;
  v_n     integer;
  v_txt   text;
  v_bool  boolean;
  h       record;
  r       record;
begin
  select p.id into v_pitch
    from pitch p join venue v on v.id = p.venue_id
   where v.name = 'Stadium One' and p.label = 'Pitch C';

  v_slot := ((current_date + 4 + interval '20 hours') at time zone 'Africa/Cairo');
  delete from booking where pitch_id = v_pitch and during && tstzrange(v_slot, v_slot + interval '1 hour');

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Basel Elsayed');
  v_bk := h.booking_id;

  -- -------------------------------------------------------------------------
  -- A booking with nobody to play
  -- -------------------------------------------------------------------------
  select count(*)::integer into v_n from booking_opponent(v_bk);
  return query select 'a new booking has no opponent', v_n::text, v_n = 0;

  -- -------------------------------------------------------------------------
  -- Only the captain calls the match on
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from challenge_opponent(v_bk, SALMA);
  return query select 'somebody else cannot name your opponent', r.reason,
                      not r.ok and r.reason = 'Only the captain can call a match on.';

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);

  select * into r from challenge_opponent(v_bk, BASEL);
  return query select 'a captain cannot play themselves', r.reason,
                      not r.ok and r.reason = 'You cannot play yourself.';

  select * into r from challenge_opponent(v_bk, GHOST);
  return query select 'an opponent who is not on the app is refused', r.reason,
                      not r.ok and r.reason = 'That player is not on X League.';

  -- Exactly one kind of opponent. Both, or neither, is a caller that has not
  -- decided, and guessing on its behalf is how a match ends up with two.
  select * into r from challenge_opponent(v_bk, null, null);
  return query select 'naming nobody is refused', r.reason,
                      not r.ok and r.reason = 'Name one opponent: a player or a club.';

  -- -------------------------------------------------------------------------
  -- The invitation
  -- -------------------------------------------------------------------------
  select * into r from challenge_opponent(v_bk, SALMA, null, 'Bring bibs');
  v_ch := r.challenge_id;
  return query select 'the captain invites an opponent', coalesce(r.reason, 'ok'),
                      r.ok and v_ch is not null;

  select count(*)::integer into v_n
    from notification n where n.player_id = SALMA and n.kind = 'challenge';
  return query select 'and the opponent is told', v_n::text, v_n = 1;

  -- Invited is not playing. The captain's screen has to say "waiting", and it
  -- can only do that if the state is legible before the answer.
  select bo.state into v_txt from booking_opponent(v_bk) bo;
  return query select 'the match reads as invited, not as on', coalesce(v_txt, '(none)'),
                      v_txt = 'invited';

  select bo.note into v_txt from booking_opponent(v_bk) bo;
  return query select 'the note the captain wrote travels with it',
                      coalesce(v_txt, '(none)'), v_txt = 'Bring bibs';

  -- One live challenge per booking, enforced by a partial unique index rather
  -- than by the function remembering to look. Two accepted opponents on one
  -- pitch is the failure this whole feature exists to prevent.
  select * into r from challenge_opponent(v_bk, KARIM);
  return query select 'a second opponent cannot be invited at the same time', r.reason,
                      not r.ok and r.reason = 'This match already has an opponent.';

  -- -------------------------------------------------------------------------
  -- Answering
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from respond_to_challenge(v_ch, true);
  return query select 'a stranger cannot answer it', r.reason,
                      not r.ok and r.reason = 'That challenge is not yours to answer.';

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from respond_to_challenge(v_ch, true);
  return query select 'nor can the captain answer on their behalf', r.reason,
                      not r.ok and r.reason = 'That challenge is not yours to answer.';

  -- The opponent sees it waiting for them, named by who asked and where.
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select mc.from_name into v_txt from my_challenges() mc where mc.challenge_id = v_ch;
  return query select 'the opponent sees who asked', coalesce(v_txt, '(none)'),
                      v_txt = 'Basel Elsayed';

  select mc.venue_name into v_txt from my_challenges() mc where mc.challenge_id = v_ch;
  return query select 'and where it is, by name rather than by id',
                      coalesce(v_txt, '(none)'), v_txt = 'Stadium One';

  select bo.mine_to_answer into v_bool from booking_opponent(v_bk) bo;
  return query select 'and knows the answer is theirs to give',
                      coalesce(v_bool::text, '(null)'), v_bool;

  select * into r from respond_to_challenge(v_ch, true);
  return query select 'the opponent accepts', coalesce(r.reason, 'ok'), r.ok;

  select bo.state into v_txt from booking_opponent(v_bk) bo;
  return query select 'and now the match is on', coalesce(v_txt, '(none)'), v_txt = 'accepted';

  select count(*)::integer into v_n
    from notification n where n.player_id = BASEL and n.kind = 'challenge_accepted';
  return query select 'the captain is told somebody is coming', v_n::text, v_n = 1;

  -- Answered once. A second tap on a notification that is still on screen must
  -- not re-open a decided match.
  select * into r from respond_to_challenge(v_ch, false);
  return query select 'answering twice changes nothing', r.reason,
                      not r.ok and r.reason = 'That challenge has already been answered.';

  -- -------------------------------------------------------------------------
  -- Declining leaves the booking alone
  -- -------------------------------------------------------------------------
  v_slot := ((current_date + 4 + interval '22 hours') at time zone 'Africa/Cairo');
  delete from booking where pitch_id = v_pitch and during && tstzrange(v_slot, v_slot + interval '1 hour');
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Basel Elsayed');
  v_bk2 := h.booking_id;

  select * into r from challenge_opponent(v_bk2, SALMA);
  v_ch := r.challenge_id;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from respond_to_challenge(v_ch, false);
  return query select 'an opponent can decline', coalesce(r.reason, 'ok'), r.ok;

  -- The decision the product made, written down so it cannot drift: no
  -- opponent is not the same as no booking. The captain paid for an hour and
  -- still has it.
  select b.state::text into v_txt from booking b where b.id = v_bk2;
  return query select 'the hour is still the captain''s', coalesce(v_txt, '(gone)'),
                      v_txt = 'held';

  select count(*)::integer into v_n from booking_opponent(v_bk2);
  return query select 'and the match is open to somebody else again', v_n::text, v_n = 0;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from challenge_opponent(v_bk2, KARIM);
  return query select 'so a new opponent can be invited after a refusal',
                      coalesce(r.reason, 'ok'), r.ok;

  -- -------------------------------------------------------------------------
  -- Taking it back
  -- -------------------------------------------------------------------------
  select * into r from withdraw_challenge(v_bk2);
  return query select 'the captain can call it off', coalesce(r.reason, 'ok'), r.ok;

  select count(*)::integer into v_n from booking_opponent(v_bk2);
  return query select 'and there is nobody to play again', v_n::text, v_n = 0;

  select * into r from withdraw_challenge(v_bk2);
  return query select 'calling off twice is refused rather than silent', r.reason,
                      not r.ok and r.reason = 'There is no opponent to call off.';

  -- -------------------------------------------------------------------------
  -- Playing a club
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from create_club('Opponent Probe FC', 'Giza', null);
  v_club := r.club_id;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from challenge_opponent(v_bk2, null, v_club, 'Your lot vs ours');
  v_ch := r.challenge_id;
  return query select 'a club can be the opponent', coalesce(r.reason, 'ok'), r.ok;

  select bo.kind into v_txt from booking_opponent(v_bk2) bo;
  return query select 'and it reads as a club, not as a player',
                      coalesce(v_txt, '(none)'), v_txt = 'club';

  select bo.display_name into v_txt from booking_opponent(v_bk2) bo;
  return query select 'named as the club is named', coalesce(v_txt, '(none)'),
                      v_txt = 'Opponent Probe FC';

  -- The club's captain answers for it. A member cannot commit the club to a
  -- fixture, which is the same rule the rest of the club surface already has.
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from respond_to_challenge(v_ch, true);
  return query select 'a member cannot answer for the club', r.reason,
                      not r.ok and r.reason = 'That challenge is not yours to answer.';

  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from respond_to_challenge(v_ch, true);
  return query select 'the club captain answers for it', coalesce(r.reason, 'ok'), r.ok;

  -- A captain cannot arrange a match against a club they run. It is not a
  -- fixture, and it would let one person accept their own invitation.
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  v_slot := ((current_date + 5 + interval '20 hours') at time zone 'Africa/Cairo');
  delete from booking where pitch_id = v_pitch and during && tstzrange(v_slot, v_slot + interval '1 hour');
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Karim Tarek');
  select * into r from challenge_opponent(h.booking_id, null, v_club);
  return query select 'nobody can play their own club', r.reason,
                      not r.ok and r.reason = 'You cannot play your own club.';

  -- -------------------------------------------------------------------------
  -- The past
  -- -------------------------------------------------------------------------
  -- A match that has finished cannot acquire an opponent afterwards. Without
  -- this, a result could be attached to a fixture nobody agreed to play.
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  v_bk := test_past_booking(v_pitch, now() - interval '3 hours', BASEL);
  select * into r from challenge_opponent(v_bk, SALMA);
  return query select 'a match already played cannot be challenged', r.reason,
                      not r.ok and r.reason = 'That match has already been played.';

  -- -------------------------------------------------------------------------
  -- The helper is not an API
  -- -------------------------------------------------------------------------
  return query select 'the club-authority helper is not reachable by a client',
    case when has_function_privilege('authenticated', 'club_speaks_for(uuid,uuid)', 'execute')
              or has_function_privilege('anon', 'club_speaks_for(uuid,uuid)', 'execute')
         then '(reachable!)' else 'closed' end,
    not has_function_privilege('authenticated', 'club_speaks_for(uuid,uuid)', 'execute')
    and not has_function_privilege('anon', 'club_speaks_for(uuid,uuid)', 'execute');
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from opponent_probe();
rollback;

drop function opponent_probe();
