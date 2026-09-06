-- Ready-to-play and calling for players.
--
-- Two rules under test. Availability is a time, not a flag, so it has to stop
-- being true on its own — a probe that only checks "on" and "off" would pass
-- against a boolean and let the list rot in production. And a call is an offer
-- both ways: the player offers, the captain confirms, and nothing about the
-- match changes until they do.
--
--   psql -f supabase/tests/ready_probe.sql

create or replace function ready_probe()
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
  v_call  uuid;
  v_resp  uuid;
  v_n     integer;
  v_txt   text;
  v_ts    timestamptz;
  h       hold_outcome;
  r       record;
begin
  insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
  values (ALONE, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', now(), now()) on conflict do nothing;
  insert into player_profile (id, display_name) values (ALONE, 'Stranger')
  on conflict do nothing;

  select p.id into v_pitch
    from pitch p join venue v on v.id = p.venue_id
   where v.name = 'Stadium One' and p.label = 'Pitch B';

  v_slot := ((current_date + 3 + interval '20 hours') at time zone 'Africa/Cairo');
  delete from booking where pitch_id = v_pitch and during && tstzrange(v_slot, v_slot + interval '1 hour');

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Basel Elsayed');
  v_bk := h.booking_id;
  perform confirm_booking(v_bk);

  -- ---------------------------------------------------------------------------
  -- Saying you are ready
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);

  select mine.available into v_txt from my_availability() mine;
  return query select 'a player starts unavailable', coalesce(v_txt, '(null)'),
                      v_txt is distinct from 'true';

  select sa.available_until into v_ts from set_availability(true) sa;
  return query select 'saying you are ready sets a time, not a flag',
                      coalesce(v_ts::text, '(null)'), v_ts is not null and v_ts > now();

  return query select 'and that time is the end of today, not a week out',
                      v_ts::text, v_ts <= now() + interval '48 hours';

  select mine.available into v_txt from my_availability() mine;
  return query select 'the player now reads as available', coalesce(v_txt, '(null)'), v_txt = 'true';

  -- An availability that has run out is not availability. This is the case a
  -- boolean column would quietly pass.
  update player_profile set available_until = now() - interval '1 minute' where id = KARIM;
  select mine.available into v_txt from my_availability() mine;
  return query select 'yesterday''s availability has expired by itself',
                      coalesce(v_txt, '(null)'), v_txt is distinct from 'true';

  perform set_availability(true);

  -- ---------------------------------------------------------------------------
  -- Calling
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from open_call(v_bk, array['DEF']::text[], null, 1, 'Need a defender');
  return query select 'only the captain can call for players',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Only the captain can call for players.';

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from open_call(v_bk, array['ZZ']::text[], null, 1, null);
  return query select 'a position that does not exist is refused',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from open_call(v_bk, array['DEF']::text[], null, 1, 'Need a defender');
  v_call := r.call_id;
  return query select 'the captain opens a call', coalesce(r.reason, 'opened'), r.ok;

  select count(*)::integer into v_n from player_call where booking_id = v_bk and state = 'open';
  return query select 'and there is exactly one open call on the booking', v_n::text, v_n = 1;

  select * into r from open_call(v_bk, array['DEF','GK']::text[], null, 2, 'Keeper too');
  select count(*)::integer into v_n from player_call where booking_id = v_bk and state = 'open';
  return query select 'calling again edits it rather than opening a second',
                      v_n::text, v_n = 1 and r.call_id = v_call;

  -- ---------------------------------------------------------------------------
  -- Who it reaches
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', ALONE)::text, true);
  select count(*)::integer into v_n from open_calls(20);
  return query select 'a player who has not said they are ready sees nothing',
                      v_n::text, v_n = 0;

  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select count(*)::integer into v_n from open_calls(20) oc where oc.call_id = v_call;
  return query select 'an available player with no stated position still sees a call for one',
                      v_n::text, v_n = 1;

  -- Somebody who has said where they play is matched on it, both ways.
  insert into attribute_snapshot (player_id, position, ovr, attributes, confidence,
                                  evidence_count, self_weight, rule_version)
  values (KARIM, 'FWD', 70, '{}'::jsonb, 'provisional', 0, 1, 'probe');
  select count(*)::integer into v_n from open_calls(20) oc where oc.call_id = v_call;
  return query select 'a forward is not sent a call for a defender', v_n::text, v_n = 0;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  perform open_call(v_bk, array['FWD']::text[], null, 1, 'A forward then');
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select count(*)::integer into v_n from open_calls(20) oc where oc.call_id = v_call;
  return query select 'and is sent a call for a forward', v_n::text, v_n = 1;

  -- A rating floor they cannot clear takes them back off it.
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  perform open_call(v_bk, array['FWD']::text[], 90, 1, null);
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select count(*)::integer into v_n from open_calls(20) oc where oc.call_id = v_call;
  return query select 'a rating floor above their card excludes them', v_n::text, v_n = 0;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  perform open_call(v_bk, '{}'::text[], null, 1, null);
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);

  select oc.venue_name into v_txt from open_calls(20) oc where oc.call_id = v_call;
  return query select 'and it names the venue rather than an id',
                      coalesce(v_txt, '(null)'), v_txt = 'Stadium One';

  select count(*)::integer into v_n
    from notification where player_id = KARIM and kind = 'call';
  return query select 'the call notified them when it opened', v_n::text, v_n >= 1;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select count(*)::integer into v_n from open_calls(20) oc where oc.call_id = v_call;
  return query select 'the captain is not offered their own match', v_n::text, v_n = 0;

  -- A rating floor nobody could clear still reaches a player who has no card,
  -- which is the same rule as the position one and for the same reason.
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  perform set_availability(true);
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  perform open_call(v_bk, '{}'::text[], 99, 1, null);
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select count(*)::integer into v_n from open_calls(20) oc where oc.call_id = v_call;
  return query select 'a rating floor no card can clear still reaches an unrated player',
                      v_n::text, v_n = 1;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  perform open_call(v_bk, '{}'::text[], null, 1, null);

  -- ---------------------------------------------------------------------------
  -- Answering
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from answer_call(v_call);
  return query select 'an available player can offer to play',
                      coalesce(r.reason, 'offered'), r.ok;

  select count(*)::integer into v_n
    from booking_participant where booking_id = v_bk and player_id = KARIM;
  return query select 'and answering does not put them in the squad', v_n::text, v_n = 0;

  select count(*)::integer into v_n from open_calls(20) oc where oc.call_id = v_call;
  return query select 'a call already answered is off their list', v_n::text, v_n = 0;

  select count(*)::integer into v_n
    from notification where player_id = BASEL and kind = 'call';
  return query select 'the captain is told somebody answered', v_n::text, v_n >= 1;

  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  begin
    select count(*)::integer into v_n from call_offers(v_bk);
    return query select 'a player cannot read who answered somebody else''s call',
                        '(allowed! ' || v_n || ' rows)', false;
  exception when insufficient_privilege then
    return query select 'a player cannot read who answered somebody else''s call',
                        'refused', true;
  end;

  -- ---------------------------------------------------------------------------
  -- Confirming
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select co.response_id into v_resp from call_offers(v_bk) co where co.player_id = KARIM;
  return query select 'the captain sees the offer with a card to judge by',
                      coalesce(v_resp::text, '(none)'), v_resp is not null;

  select mc.offers into v_n from my_call(v_bk) mc;
  return query select 'and the lobby knows how many are waiting', v_n::text, v_n = 1;

  select * into r from accept_offer(v_resp, 'starter');
  return query select 'confirming puts them in the squad', coalesce(r.reason, 'confirmed'), r.ok;

  select bp.state::text into v_txt
    from booking_participant bp where bp.booking_id = v_bk and bp.player_id = KARIM;
  return query select 'as accepted, not as another invitation to answer',
                      coalesce(v_txt, '(none)'), v_txt = 'accepted';

  select count(*)::integer into v_n
    from booking_event where booking_id = v_bk and event = 'Squad place offered';
  return query select 'and it went through the one door into a squad, so it is logged',
                      v_n::text, v_n >= 1;

  select count(*)::integer into v_n
    from notification where player_id = KARIM and kind = 'call' and title = 'You are in the squad';
  return query select 'the player is told they are in', v_n::text, v_n = 1;

  select * into r from accept_offer(v_resp, 'starter');
  return query select 'the same offer cannot be confirmed twice',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  -- ---------------------------------------------------------------------------
  -- Turning one down, and closing the call
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  perform set_availability(true);
  select * into r from answer_call(v_call);
  return query select 'somebody else offers', coalesce(r.reason, 'offered'), r.ok;

  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  begin
    select co.response_id into v_resp from call_offers(v_bk) co where co.player_id = SALMA;
    return query select 'a squad member still cannot read the offers', '(allowed!)', false;
  exception when insufficient_privilege then
    return query select 'a squad member still cannot read the offers', 'refused', true;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select co.response_id into v_resp from call_offers(v_bk) co where co.player_id = SALMA;
  select * into r from decline_offer(v_resp);
  return query select 'the captain can turn an offer down', coalesce(r.reason, 'declined'), r.ok;

  select count(*)::integer into v_n
    from booking_participant where booking_id = v_bk and player_id = SALMA
     and state in ('invited', 'accepted');
  return query select 'and nothing about the squad changed', v_n::text, v_n = 0;

  select count(*)::integer into v_n
    from notification where player_id = SALMA and kind = 'call' and body ilike '%turn%';
  return query select 'the player is not sent a rejection', v_n::text, v_n = 0;

  select * into r from close_call(v_bk);
  return query select 'the captain closes the call', coalesce(r.reason, 'closed'), r.ok;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select count(*)::integer into v_n from open_calls(20) oc where oc.call_id = v_call;
  return query select 'and it is gone from everybody''s list', v_n::text, v_n = 0;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from answer_call(v_call);
  return query select 'a closed call cannot be answered',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'That call is not open to you any more.';

  -- ---------------------------------------------------------------------------
  -- The tables are not reachable
  -- ---------------------------------------------------------------------------
  return query select 'nothing may read player_call directly',
    case when has_table_privilege('authenticated', 'player_call', 'select')
           or has_table_privilege('anon', 'player_call', 'select')
         then '(reachable!)' else 'closed' end,
    not has_table_privilege('authenticated', 'player_call', 'select')
    and not has_table_privilege('anon', 'player_call', 'select');

  return query select 'nor call_response',
    case when has_table_privilege('authenticated', 'call_response', 'select')
           or has_table_privilege('anon', 'call_response', 'select')
         then '(reachable!)' else 'closed' end,
    not has_table_privilege('authenticated', 'call_response', 'select')
    and not has_table_privilege('anon', 'call_response', 'select');

  return query select 'and the matching rule is not callable with somebody else''s id',
    case when has_function_privilege('authenticated', 'calls_for(uuid)', 'execute')
         then '(reachable!)' else 'closed' end,
    not has_function_privilege('authenticated', 'calls_for(uuid)', 'execute');
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from ready_probe();
rollback;

drop function ready_probe();
