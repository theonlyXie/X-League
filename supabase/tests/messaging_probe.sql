-- Conversation, notification and report probe (MSG / ADM-008 / NFR-PRIV-003).
--
-- The rule under test is that a conversation is derived from a relationship
-- that already exists. Player search honours PRO-006 visibility; messaging has
-- to honour the same boundary, or it becomes the open channel to any account
-- that PRO-006 exists to prevent.
--
--   psql -f supabase/tests/messaging_probe.sql

create or replace function messaging_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  BASEL uuid := '11111111-1111-1111-1111-111111111111';
  SALMA uuid := '22222222-2222-2222-2222-222222222222';
  KARIM uuid := '33333333-3333-3333-3333-333333333333';
  ALONE uuid := '55555555-5555-5555-5555-555555555555';
  v_pitch uuid;
  v_slot  timestamptz;
  v_bk    uuid;
  v_conv  uuid;
  v_n     integer;
  v_txt   text;
  h       hold_outcome;
  r       record;
begin
  -- Somebody with no shared history at all.
  insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
  values (ALONE, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', now(), now()) on conflict do nothing;
  insert into player_profile (id, display_name) values (ALONE, 'Stranger')
  on conflict do nothing;

  select p.id into v_pitch
    from pitch p join venue v on v.id = p.venue_id
   where v.name = 'Stadium One' and p.label = 'Pitch B';

  v_slot := ((current_date + 2 + interval '19 hours') at time zone 'Africa/Cairo');
  delete from booking where pitch_id = v_pitch and during && tstzrange(v_slot, v_slot + interval '1 hour');

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Basel Elsayed');
  v_bk := h.booking_id;
  perform confirm_booking(v_bk);

  -- -------------------------------------------------------------------------
  -- Notifications fan out from the squad, without any caller asking
  -- -------------------------------------------------------------------------
  perform invite_to_booking(v_bk, SALMA, null, 'starter', 'MID');

  select count(*)::integer into v_n
    from notification where player_id = SALMA and kind = 'squad_invite';
  return query select 'an invitation notifies the invited player', v_n::text, v_n = 1;

  select title into v_txt
    from notification where player_id = SALMA and kind = 'squad_invite'
   order by created_at desc limit 1;
  return query select 'and names the venue rather than an id',
                      v_txt, v_txt like '%Stadium One%';

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  perform respond_to_invitation(
    (select id from booking_participant where booking_id = v_bk and player_id = SALMA), true);

  select count(*)::integer into v_n
    from notification where player_id = BASEL and kind = 'squad_accepted';
  return query select 'accepting notifies the captain who is waiting', v_n::text, v_n = 1;

  select unread_notifications() into v_n;
  return query select 'the invitee has an unread count', v_n::text, v_n >= 1;

  perform mark_notifications_read();
  select unread_notifications() into v_n;
  return query select 'and can clear it', v_n::text, v_n = 0;

  -- -------------------------------------------------------------------------
  -- MSG-001 — the lobby belongs to the squad
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', ALONE)::text, true);
  select * into r from lobby_conversation(v_bk);
  return query select 'somebody outside the squad cannot open its lobby',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'You are not part of that match.';

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from lobby_conversation(v_bk);
  v_conv := r.conversation_id;
  return query select 'the captain can', coalesce(r.reason, 'opened'), r.ok;

  select * into r from lobby_conversation(v_bk);
  return query select 'and opening it twice returns the same room',
                      case when r.conversation_id = v_conv then 'same' else 'duplicated!' end,
                      r.conversation_id = v_conv;

  select count(*)::integer into v_n from conversation_member where conversation_id = v_conv;
  return query select 'everybody holding a place is in it', v_n::text, v_n = 2;

  -- -------------------------------------------------------------------------
  -- Messages
  -- -------------------------------------------------------------------------
  select * into r from send_message(v_conv, '   ');
  return query select 'an empty message is refused',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from send_message(v_conv, 'Pitch B, 7pm. Bring bibs.');
  return query select 'a member can post', coalesce(r.reason, 'sent'), r.ok;

  perform set_config('request.jwt.claims', json_build_object('sub', ALONE)::text, true);
  select * into r from send_message(v_conv, 'let me in');
  return query select 'a non-member cannot post',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'You are not in that conversation.';

  begin
    perform conversation_messages(v_conv);
    return query select 'nor read the history', '(allowed!)', false;
  exception when insufficient_privilege then
    return query select 'nor read the history', 'refused', true;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select count(*)::integer into v_n from conversation_messages(v_conv);
  return query select 'another member reads it', v_n::text, v_n = 1;

  select mine into r from conversation_messages(v_conv) limit 1;
  return query select 'and the message is not marked as theirs',
                      r.mine::text, r.mine = false;

  select unread into v_n from my_conversations() where conversation_id = v_conv;
  return query select 'the Chat tab shows it unread', v_n::text, v_n = 1;

  perform mark_conversation_read(v_conv);
  select unread into v_n from my_conversations() where conversation_id = v_conv;
  return query select 'and reading it clears the count', v_n::text, v_n = 0;

  select count(*)::integer into v_n
    from notification where player_id = SALMA and kind = 'message';
  return query select 'a message notifies the rest of the room', v_n::text, v_n = 1;

  select title into v_txt from my_conversations() where conversation_id = v_conv;
  return query select 'the room is named after the venue, not an id',
                      v_txt, v_txt = 'Stadium One lobby';

  -- -------------------------------------------------------------------------
  -- A room is whoever is in the group, not whoever opened it first
  --
  -- The room above was opened while the squad happened to be complete, which is
  -- the one ordering that used to work. Everything else wrote a room of one:
  -- membership was snapshotted when somebody opened it, and the only thing that
  -- wrote a membership row was opening it — so a player who joined afterwards
  -- could never get in, and never knew there was anything to get into.
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  perform invite_to_booking(v_bk, KARIM, null, 'starter', 'FWD');

  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  perform respond_to_invitation(
    (select id from booking_participant where booking_id = v_bk and player_id = KARIM), true);

  select count(*)::integer into v_n
    from my_conversations() where conversation_id = v_conv;
  return query select 'somebody who joins after the room opened still sees it',
                      v_n::text, v_n = 1;

  select count(*)::integer into v_n from conversation_messages(v_conv);
  return query select 'and can read what was said before they arrived',
                      v_n::text, v_n = 1;

  select * into r from send_message(v_conv, 'On my way.');
  return query select 'and can post without ever having opened the room',
                      coalesce(r.reason, 'sent'), r.ok;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  perform send_message(v_conv, 'Karim is in.');
  select count(*)::integer into v_n
    from notification where player_id = KARIM and kind = 'message';
  return query select 'and is notified like everybody else', v_n::text, v_n = 1;

  -- -------------------------------------------------------------------------
  -- MSG-002 — a direct message needs a shared history
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', ALONE)::text, true);
  select * into r from direct_conversation(BASEL);
  return query select 'a stranger cannot open a direct message',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false
                      and r.reason = 'You can message players you have shared a team or a pitch with.';

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from direct_conversation(BASEL);
  return query select 'nobody messages themselves',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from direct_conversation(SALMA);
  v_conv := r.conversation_id;
  return query select 'two people who shared a pitch can',
                      coalesce(r.reason, 'opened'), r.ok;

  select * into r from direct_conversation(SALMA);
  return query select 'and it is the same conversation each time',
                      case when r.conversation_id = v_conv then 'same' else 'duplicated!' end,
                      r.conversation_id = v_conv;

  select count(*)::integer into v_n from conversation_member where conversation_id = v_conv;
  return query select 'with exactly two members', v_n::text, v_n = 2;

  -- -------------------------------------------------------------------------
  -- ADM-008 — reporting
  -- -------------------------------------------------------------------------
  select * into r from submit_report('player', BASEL, 'abuse', 'Rude in the lobby');
  return query select 'nobody reports themselves',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from submit_report('player', KARIM, 'abuse', 'Rude in the lobby');
  return query select 'a player can be reported', coalesce(r.reason, 'reported'), r.ok;

  select * into r from submit_report('player', KARIM, 'spam', 'again');
  perform submit_report('player', KARIM, 'spam', 'again');
  select count(*)::integer into v_n
    from report where reporter_id = BASEL and subject_id = KARIM and state = 'open';
  return query select 'reporting the same subject twice does not stack the queue',
                      v_n::text, v_n = 1;

  select * into r from submit_report('player', KARIM, 'vibes', null);
  return query select 'an invented reason is refused',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  -- -------------------------------------------------------------------------
  -- notify() is not an API
  -- -------------------------------------------------------------------------
  return query select 'notify is not reachable by a client',
    case when has_function_privilege('authenticated', 'notify(uuid,text,text,text,jsonb)', 'execute')
              or has_function_privilege('anon', 'notify(uuid,text,text,text,jsonb)', 'execute')
         then '(reachable!)' else 'closed' end,
    not has_function_privilege('authenticated', 'notify(uuid,text,text,text,jsonb)', 'execute')
    and not has_function_privilege('anon', 'notify(uuid,text,text,text,jsonb)', 'execute');
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from messaging_probe();
rollback;

drop function messaging_probe();
