-- Reaching somebody, notifications and reports (ADM-008 / NFR-PRIV-003).
--
-- This replaces the messaging probe. The product no longer hosts conversations:
-- where there was a room there is a button that opens WhatsApp, and the thing
-- worth testing moved with it. A room could be opened by the wrong person; a
-- phone number can be *given* to the wrong person, which is worse and
-- permanent, so the rule that used to gate opening a conversation now gates the
-- number.
--
-- The rule: a club-mate, a team-mate, or somebody in the same match. Nobody
-- else, in either direction of a block, and never your own.
--
--   psql -f supabase/tests/reach_probe.sql

create or replace function reach_probe()
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
  v_n     integer;
  v_txt   text;
  h       hold_outcome;
  r       record;
begin
  -- Somebody with no shared history at all.
  insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
  values (ALONE, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', now(), now()) on conflict do nothing;
  insert into player_profile (id, display_name, phone) values (ALONE, 'Stranger', '+201000000055')
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
  -- The number goes only to somebody entitled to it
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', ALONE)::text, true);
  select * into r from whatsapp_for_player(BASEL);
  return query select 'a stranger cannot get a player''s number',
                      coalesce(r.reason, '(given out!)'),
                      r.ok = false and r.wa_number is null;

  -- Sharing a booking is the relationship the lobby used to be built on.
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from whatsapp_for_player(BASEL);
  return query select 'somebody in the same match can',
                      coalesce(r.reason, r.wa_number), r.ok;

  return query select 'and it comes back in the shape wa.me wants',
                      coalesce(r.wa_number, '(none)'),
                      r.wa_number = '201000000001';

  select * into r from whatsapp_for_player(SALMA);
  return query select 'nobody is handed their own number',
                      coalesce(r.reason, '(given out!)'), r.ok = false;

  select * into r from whatsapp_for_player(ALONE);
  return query select 'and not somebody they have never played with',
                      coalesce(r.reason, '(given out!)'), r.ok = false;

  -- A block closes the door both ways, which is the half that is easy to miss:
  -- the person who did the blocking must not be reachable either.
  perform block_player(BASEL);
  select * into r from whatsapp_for_player(BASEL);
  return query select 'blocking somebody takes their number away',
                      coalesce(r.reason, '(given out!)'), r.ok = false;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from whatsapp_for_player(SALMA);
  return query select 'and hides yours from them',
                      coalesce(r.reason, '(given out!)'), r.ok = false;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  perform unblock_player(BASEL);

  -- -------------------------------------------------------------------------
  -- The one conversation about money
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from booking_whatsapp(v_bk);
  return query select 'the captain gets the venue''s number',
                      coalesce(r.reason, r.who || ' ' || coalesce(r.wa_number, '')),
                      r.ok and r.who = 'venue' and r.wa_number = '201000000010';

  -- Salma is a manager at Stadium One in the seed, so she is the venue here.
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from booking_whatsapp(v_bk);
  return query select 'and the venue gets the captain''s',
                      coalesce(r.reason, r.who || ' ' || coalesce(r.wa_number, '')),
                      r.ok and r.who = 'captain' and r.wa_number = '201000000001';

  perform set_config('request.jwt.claims', json_build_object('sub', ALONE)::text, true);
  select * into r from booking_whatsapp(v_bk);
  return query select 'somebody on neither side gets nothing',
                      coalesce(r.reason, '(given out!)'),
                      r.ok = false and r.reason = 'You are not on that booking.';

  -- -------------------------------------------------------------------------
  -- ADM-008 — reporting
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from submit_report('player', BASEL, 'abuse', 'Rude at the pitch');
  return query select 'nobody reports themselves',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from submit_report('player', KARIM, 'abuse', 'Rude at the pitch');
  return query select 'a player can be reported', coalesce(r.reason, 'reported'), r.ok;

  perform submit_report('player', KARIM, 'spam', 'again');
  select count(*)::integer into v_n
    from report where reporter_id = BASEL and subject_id = KARIM and state = 'open';
  return query select 'reporting the same subject twice does not stack the queue',
                      v_n::text, v_n = 1;

  select * into r from submit_report('player', KARIM, 'vibes', null);
  return query select 'an invented reason is refused',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  -- A message is no longer a thing that exists, so it is no longer a thing that
  -- can be reported. The rows already filed about one are left alone; only
  -- filing a new one is withdrawn.
  select * into r from submit_report('message', KARIM, 'abuse', 'said something');
  return query select 'a message cannot be reported now there are none',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'That is not something you can report.';

  -- -------------------------------------------------------------------------
  -- notify() is not an API
  -- -------------------------------------------------------------------------
  return query select 'notify is not reachable by a client',
    case when has_function_privilege('authenticated', 'notify(uuid,text,text,text,jsonb)', 'execute')
              or has_function_privilege('anon', 'notify(uuid,text,text,text,jsonb)', 'execute')
         then '(reachable!)' else 'closed' end,
    not has_function_privilege('authenticated', 'notify(uuid,text,text,text,jsonb)', 'execute')
    and not has_function_privilege('anon', 'notify(uuid,text,text,text,jsonb)', 'execute');

  -- And neither is anybody's number, to somebody with no session at all.
  return query select 'a signed-out visitor cannot ask for a number',
    case when has_function_privilege('anon', 'whatsapp_for_player(uuid)', 'execute')
         then '(reachable!)' else 'closed' end,
    not has_function_privilege('anon', 'whatsapp_for_player(uuid)', 'execute');
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from reach_probe();
rollback;

drop function reach_probe();
