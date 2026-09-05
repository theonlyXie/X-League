-- Venue money probe (PAY).
--
-- Two people who do not trust each other yet, agreeing that money moved. The
-- cases that matter are the ones where they disagree, or where somebody who is
-- neither of them tries to join in.
--
--   psql -f supabase/tests/venue_money_probe.sql

create or replace function venue_money_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  SALMA uuid := '22222222-2222-2222-2222-222222222222';  -- manager, Stadium One
  KARIM uuid := '33333333-3333-3333-3333-333333333333';  -- staff, The Box
  BASEL uuid := '11111111-1111-1111-1111-111111111111';  -- a player
  STRANGER uuid := '55555555-5555-5555-5555-555555555555';
  v_venue uuid;
  v_pitch uuid;
  v_slot  timestamptz;
  v_bk    uuid;
  v_chan  uuid;
  v_conv  uuid;
  v_n     integer;
  v_txt   text;
  h       hold_outcome;
  r       record;
begin
  insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
  values (STRANGER, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', now(), now()) on conflict do nothing;
  insert into player_profile (id, display_name) values (STRANGER, 'Stranger')
  on conflict do nothing;

  select v.id, p.id into v_venue, v_pitch
    from venue v join pitch p on p.venue_id = v.id
   where v.name = 'Stadium One' and p.label = 'Pitch B';

  -- -------------------------------------------------------------------------
  -- Only the venue says where its money goes
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from set_venue_payment_channel(
    null, v_venue, 'wallet', 'My wallet', '01000000000');
  return query select 'a player cannot add a destination to a venue',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'You do not manage that venue.';

  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from set_venue_payment_channel(
    null, v_venue, 'wallet', 'Not mine', '01000000000');
  return query select 'nor can staff at another venue',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from set_venue_payment_channel(
    null, v_venue, 'wallet', 'Vodafone Cash', '  ');
  return query select 'a destination with no number is refused',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Give the number or handle to send to.';

  select * into r from set_venue_payment_channel(
    null, v_venue, 'wallet', 'Vodafone Cash', '01001234567', 'Send the full amount before you arrive.');
  v_chan := r.channel_id;
  return query select 'the manager adds one', coalesce(r.reason, 'added'), r.ok;

  select * into r from set_venue_payment_channel(
    v_chan, v_venue, 'instapay', 'InstaPay', 'stadiumone@instapay');
  return query select 'and can change it', coalesce(r.reason, 'changed'), r.ok;

  select value into v_txt from payment_channel where id = v_chan;
  return query select 'the change stuck', coalesce(v_txt, '(gone)'), v_txt = 'stadiumone@instapay';

  -- A venue's row belongs to a venue and to nothing else.
  select count(*)::integer into v_n from payment_channel
   where id = v_chan and venue_id = v_venue and tournament_id is null;
  return query select 'and belongs to the venue, not to a cup', v_n::text, v_n = 1;

  -- -------------------------------------------------------------------------
  -- Who may see where to send it
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', STRANGER)::text, true);
  select count(*)::integer into v_n from venue_payment_channels(v_venue);
  return query select 'somebody with no booking there sees no wallet number',
                      v_n::text, v_n = 0;

  -- A booking, so the captain has standing.
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  v_slot := ((current_date + 3 + interval '20 hours') at time zone 'Africa/Cairo');
  delete from booking where pitch_id = v_pitch
     and during && tstzrange(v_slot, v_slot + interval '1 hour');
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Basel Elsayed');
  v_bk := h.booking_id;
  perform confirm_booking(v_bk);

  select count(*)::integer into v_n from venue_payment_channels(v_venue);
  return query select 'the captain who booked does', v_n::text, v_n = 1;

  -- -------------------------------------------------------------------------
  -- "I sent it"
  -- -------------------------------------------------------------------------
  select * into r from claim_booking_payment(v_bk, 'instapay', 'ok');
  return query select 'a claim with nothing to match it by is refused',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Say what you sent and how, so it can be matched.';

  perform set_config('request.jwt.claims', json_build_object('sub', STRANGER)::text, true);
  select * into r from claim_booking_payment(v_bk, 'instapay', 'I sent EGP 300 just now');
  return query select 'somebody else cannot claim to have paid your booking',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Only the captain who booked can confirm the payment.';

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from claim_booking_payment(v_bk, 'instapay', 'Sent EGP 300 from 010012, ref 88213');
  v_conv := r.conversation_id;
  return query select 'the captain says the money is sent', coalesce(r.reason, 'claimed'), r.ok;

  select payment_note into v_txt from booking where id = v_bk;
  return query select 'and what they said is on the booking',
                      coalesce(v_txt, '(nothing)'), v_txt like 'Sent EGP 300%';

  -- The claim moves nothing. That is the whole point of it being a claim.
  select state into v_txt from payment_reference
   where booking_id = v_bk and kind = 'balance';
  return query select 'but the venue is still owed the money',
                      coalesce(v_txt, '(no row)'), v_txt = 'due';

  -- -------------------------------------------------------------------------
  -- It happens in a room
  -- -------------------------------------------------------------------------
  select count(*)::integer into v_n from conversation_messages(v_conv);
  return query select 'the claim is posted into the room', v_n::text, v_n = 1;

  select body into v_txt from conversation_messages(v_conv) limit 1;
  return query select 'saying what was sent', coalesce(v_txt, '(silence)'),
                      v_txt like '%has been sent%88213%';

  select count(*)::integer into v_n
    from notification where player_id = SALMA and kind = 'payment_claimed';
  return query select 'and the venue is told', v_n::text, v_n = 1;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select count(*)::integer into v_n from my_conversations() where conversation_id = v_conv;
  return query select 'the room is in the venue''s own list', v_n::text, v_n = 1;

  select title into v_txt from my_conversations() where conversation_id = v_conv;
  return query select 'named after who owes them', coalesce(v_txt, '(none)'),
                      v_txt like 'Basel%';

  perform set_config('request.jwt.claims', json_build_object('sub', STRANGER)::text, true);
  begin
    perform conversation_messages(v_conv);
    return query select 'and nobody else can read it', '(allowed!)', false;
  exception when insufficient_privilege then
    return query select 'and nobody else can read it', 'refused', true;
  end;

  -- -------------------------------------------------------------------------
  -- "It arrived"
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from confirm_booking_payment(v_bk);
  return query select 'a player cannot confirm their own payment arrived',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'You do not have access to that venue.';

  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from confirm_booking_payment(v_bk);
  return query select 'nor can staff at another venue',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select count(*)::integer into v_n from venue_payment_claims(v_venue) where booking_id = v_bk;
  return query select 'the claim is on the venue''s list', v_n::text, v_n = 1;

  select settled::text into v_txt from venue_payment_claims(v_venue) where booking_id = v_bk;
  return query select 'marked as not settled yet', v_txt, v_txt = 'false';

  select * into r from confirm_booking_payment(v_bk);
  return query select 'the venue confirms it arrived', coalesce(r.reason, 'confirmed'), r.ok;

  select state into v_txt from payment_reference
   where booking_id = v_bk and kind = 'balance';
  return query select 'and the balance is collected', coalesce(v_txt, '(no row)'),
                      v_txt = 'collected';

  select reference into v_txt from payment_reference
   where booking_id = v_bk and kind = 'balance';
  return query select 'against what the captain said they sent',
                      coalesce(v_txt, '(nothing)'), v_txt like '%88213%';

  select settled::text into v_txt from venue_payment_claims(v_venue) where booking_id = v_bk;
  return query select 'the list says it is settled now', v_txt, v_txt = 'true';

  select count(*)::integer into v_n from conversation_messages(v_conv);
  return query select 'the answer is in the room too', v_n::text, v_n = 2;

  select count(*)::integer into v_n
    from notification where player_id = BASEL and kind = 'payment_confirmed';
  return query select 'and the captain is told', v_n::text, v_n = 1;

  select * into r from confirm_booking_payment(v_bk);
  return query select 'confirming twice takes no second payment',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'There is nothing outstanding on that booking.';

  -- -------------------------------------------------------------------------
  -- The lobby is still the squad's
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from lobby_conversation(v_bk);
  return query select 'the match lobby is a different room',
                      case when r.conversation_id = v_conv then 'the same room!' else 'separate' end,
                      r.ok and r.conversation_id <> v_conv;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select count(*)::integer into v_n from my_conversations() where conversation_id = r.conversation_id;
  return query select 'and the venue cannot read the squad''s', v_n::text, v_n = 0;
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict
  from venue_money_probe();
rollback;

drop function venue_money_probe();
