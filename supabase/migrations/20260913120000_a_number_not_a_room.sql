-- Chat comes out. A phone number goes in.
--
-- The product shipped its own messaging: lobby rooms, team rooms, club rooms,
-- direct messages between two people who had shared a pitch, and a thread a
-- venue and a captain settled a payment in. All of it is removed here.
--
-- The reason is that running a message channel means running everything that
-- has to sit behind one. Somebody has to read what gets reported, act on it
-- the same day, and answer for what was said in the meantime; the schema has
-- `report` and `hidden_at` and no one on the other end of them. A channel with
-- no moderation behind it is not a feature that needs hardening, it is a
-- liability the product does not need to carry — X League's job is to get a
-- match booked and played, and every conversation in it was between people who
-- already have each other's numbers or are about to.
--
-- So the replacement is the number itself. Where there was a room, there is a
-- button that opens WhatsApp, and the conversation happens somewhere that has
-- spent a decade building the moderation, the encryption and the block list
-- that this product would otherwise have to build badly.
--
-- **The privacy rule does not get looser.** `direct_conversation` refused to
-- open a room between strangers — you could message somebody you had shared a
-- team or a pitch with, and nobody else — because player search would
-- otherwise be a way to reach anybody whose name you could guess. A phone
-- number is more exposing than a message box, not less, so the same rule gates
-- it: `whatsapp_for_player` answers for a club-mate, a team-mate or somebody
-- in the same match, and refuses for everybody else. A block still means no.

-- ---------------------------------------------------------------------------
-- The number, to whoever is entitled to it
-- ---------------------------------------------------------------------------

/**
 * A player's number, in the form `wa.me` wants, or a refusal that says why.
 *
 * `normalise_phone` already produces exactly the right spelling — digits with
 * the country code and no `+` — because that is what GoTrue is keyed on, so
 * the link is built from the same value sign-in resolves.
 *
 * The relationship rule is `direct_conversation`'s, with clubs added: a club
 * is the standing side that enters cups, and its squad is the group most
 * likely to need to reach each other. Everything else is refused.
 */
create or replace function whatsapp_for_player(p_player_id uuid)
returns table (ok boolean, display_name text, wa_number text, reason text)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_me    uuid := auth.uid();
  v_name  text;
  v_phone text;
begin
  if v_me is null then
    return query select false, null::text, null::text, 'Sign in first.';
    return;
  end if;
  if p_player_id = v_me then
    return query select false, null::text, null::text, 'That is your own number.';
    return;
  end if;

  select pp.display_name, normalise_phone(pp.phone)
    into v_name, v_phone
    from player_profile pp where pp.id = p_player_id;

  if v_name is null then
    return query select false, null::text, null::text, 'That player does not have an X League account.';
    return;
  end if;

  -- Either direction. Somebody who blocked you should not be reachable, and
  -- somebody you blocked should not be one tap away by accident.
  if exists (select 1 from player_block b
              where (b.blocker_id = v_me and b.blocked_id = p_player_id)
                 or (b.blocker_id = p_player_id and b.blocked_id = v_me)) then
    return query select false, null::text, null::text,
      'You can message players you have shared a club, a team or a pitch with.';
    return;
  end if;

  if not exists (
        select 1 from club_membership m1
          join club_membership m2 on m2.club_id = m1.club_id
         where m1.player_id = v_me and m1.state = 'active'
           and m2.player_id = p_player_id and m2.state = 'active'
      )
     and not exists (
        select 1 from team_membership m1
          join team_membership m2 on m2.team_id = m1.team_id
         where m1.player_id = v_me and m1.state = 'active'
           and m2.player_id = p_player_id and m2.state = 'active'
      )
     and not exists (
        select 1 from booking_participant b1
          join booking_participant b2 on b2.booking_id = b1.booking_id
         where b1.player_id = v_me and b1.state in ('accepted', 'invited')
           and b2.player_id = p_player_id and b2.state in ('accepted', 'invited')
      )
     and not exists (
        select 1 from booking b
          join booking_participant bp on bp.booking_id = b.id
         where b.captain_id = v_me
           and bp.player_id = p_player_id and bp.state in ('accepted', 'invited')
      )
     and not exists (
        select 1 from booking b
          join booking_participant bp on bp.booking_id = b.id
         where b.captain_id = p_player_id
           and bp.player_id = v_me and bp.state in ('accepted', 'invited')
      )
  then
    return query select false, null::text, null::text,
      'You can message players you have shared a club, a team or a pitch with.';
    return;
  end if;

  if v_phone is null or length(v_phone) < 8 then
    return query select false, v_name, null::text, 'They have not given us a number to reach them on.';
    return;
  end if;

  return query select true, v_name, v_phone, null::text;
end;
$$;

/**
 * The other side of a booking, for the one conversation about money.
 *
 * A captain pays by InstaPay outside this app and says so; the venue checks it
 * arrived and confirms. When that goes wrong somebody has to be able to ask a
 * question, and the thread they asked it in is gone — so each side gets the
 * other's number, and only for a booking they are actually on.
 *
 * Which number comes back depends on who is asking, which is why this is one
 * function rather than two: there is exactly one counterparty on a booking,
 * and the caller should not have to know whether they are the venue today.
 */
create or replace function booking_whatsapp(p_booking_id uuid)
returns table (ok boolean, who text, display_name text, wa_number text, reason text)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_me      uuid := auth.uid();
  v_venue   uuid;
  v_captain uuid;
  v_name    text;
  v_phone   text;
begin
  if v_me is null then
    return query select false, null::text, null::text, null::text, 'Sign in first.';
    return;
  end if;

  select venue_of_pitch(b.pitch_id), b.captain_id
    into v_venue, v_captain
    from booking b where b.id = p_booking_id;

  if v_venue is null then
    return query select false, null::text, null::text, null::text, 'That booking no longer exists.';
    return;
  end if;

  if v_captain is not distinct from v_me then
    select v.name, normalise_phone(v.phone) into v_name, v_phone
      from venue v where v.id = v_venue;
    if v_phone is null or length(v_phone) < 8 then
      return query select false, 'venue', v_name, null::text,
        'This venue has not given us a number to reach them on.';
      return;
    end if;
    return query select true, 'venue', v_name, v_phone, null::text;
    return;
  end if;

  if is_venue_staff(v_venue) then
    select coalesce(pp.display_name, b.captain_name, 'The captain'),
           normalise_phone(coalesce(pp.phone, b.captain_phone))
      into v_name, v_phone
      from booking b left join player_profile pp on pp.id = b.captain_id
     where b.id = p_booking_id;
    if v_phone is null or length(v_phone) < 8 then
      return query select false, 'captain', v_name, null::text,
        'They have not given us a number to reach them on.';
      return;
    end if;
    return query select true, 'captain', v_name, v_phone, null::text;
    return;
  end if;

  return query select false, null::text, null::text, null::text, 'You are not on that booking.';
end;
$$;

-- ---------------------------------------------------------------------------
-- The two functions that wrote into the money thread
-- ---------------------------------------------------------------------------
--
-- Both did the same thing twice: a `booking_event` row, which is the record
-- that survives, and a message in a room, which was the copy somebody read.
-- The event row and the notification stay; the message has nowhere to go.
--
-- `claim_booking_payment` returned the conversation it had just written into,
-- so the app could open the thread. There is no thread, so the column goes
-- rather than coming back null forever.

-- The return type changes, so this is a drop and a create rather than a
-- replace: Postgres will not widen or narrow a function's result in place.
drop function if exists claim_booking_payment(uuid, payment_channel_kind, text);

create or replace function claim_booking_payment(
  p_booking_id uuid,
  p_kind       payment_channel_kind default 'wallet',
  p_note       text default null
)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_venue uuid; v_captain uuid; v_code text; v_name text;
begin
  select venue_of_pitch(b.pitch_id), b.captain_id, b.code
    into v_venue, v_captain, v_code from booking b where b.id = p_booking_id;

  if v_venue is null then
    return query select false, 'That booking no longer exists.';
    return;
  end if;
  if v_captain is distinct from auth.uid() then
    return query select false, 'Only the captain who booked can confirm the payment.';
    return;
  end if;
  if length(btrim(coalesce(p_note, ''))) < 3 then
    return query select false, 'Say what you sent and how, so it can be matched.';
    return;
  end if;

  update booking
     set payment_claimed_at = now(), payment_note = btrim(p_note), payment_kind = p_kind
   where id = p_booking_id;

  insert into booking_event (booking_id, event, actor, detail)
  values (p_booking_id, 'Payment claimed', current_actor(),
          jsonb_build_object('kind', p_kind, 'note', btrim(p_note)));

  select coalesce(pp.display_name, b.captain_name, 'The captain') into v_name
    from booking b left join player_profile pp on pp.id = b.captain_id
   where b.id = p_booking_id;

  perform notify(vs.user_id, 'payment_claimed',
                 v_name || ' says they have paid',
                 'Booking ' || v_code || '. Check it arrived, then confirm.',
                 jsonb_build_object('screen', 'owner_money', 'booking_id', p_booking_id))
     from venue_staff vs where vs.venue_id = v_venue and vs.active;

  return query select true, null::text;
end;
$$;

create or replace function confirm_booking_payment(p_booking_id uuid, p_reference text default null)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_venue uuid; v_code text; v_rows integer;
begin
  select venue_of_pitch(b.pitch_id), b.code into v_venue, v_code
    from booking b where b.id = p_booking_id;

  if v_venue is null then
    return query select false, 'That booking no longer exists.';
    return;
  end if;
  if not is_venue_staff(v_venue) then
    return query select false, 'You do not have access to that venue.';
    return;
  end if;

  update payment_reference
     set state = 'collected', collected_by = auth.uid(), collected_at = now(),
         reference = coalesce(p_reference,
                              (select b.payment_note from booking b where b.id = p_booking_id),
                              reference)
   where booking_id = p_booking_id and kind = 'balance' and state = 'due';
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return query select false, 'There is nothing outstanding on that booking.';
    return;
  end if;

  insert into booking_event (booking_id, event, actor, detail)
  values (p_booking_id, 'Payment confirmed', current_actor(),
          jsonb_build_object('reference', p_reference));

  perform notify(b.captain_id, 'payment_confirmed',
                 'The venue confirmed your payment',
                 'Booking ' || v_code || ' is settled.',
                 jsonb_build_object('screen', 'booking', 'booking_id', p_booking_id))
     from booking b where b.id = p_booking_id and b.captain_id is not null;

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reporting a message, when there are no messages
-- ---------------------------------------------------------------------------
--
-- `message` stays a reportable subject for exactly as long as the reports
-- already filed about one need to remain readable — which is why the existing
-- rows are left alone and only the ability to file a new one is withdrawn.

create or replace function submit_report(
  p_subject_kind text,
  p_subject_id   uuid,
  p_reason       text,
  p_body         text default null
)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return query select false, 'Sign in to report something.';
    return;
  end if;
  if p_subject_kind not in ('player', 'venue', 'booking') then
    return query select false, 'That is not something you can report.';
    return;
  end if;
  if p_reason not in ('abuse', 'no_show', 'unsafe', 'spam', 'wrong_info', 'other') then
    return query select false, 'Choose a reason.';
    return;
  end if;
  if p_subject_kind = 'player' and p_subject_id = v_uid then
    return query select false, 'You cannot report yourself.';
    return;
  end if;

  insert into report (reporter_id, subject_kind, subject_id, reason, body)
  values (v_uid, p_subject_kind, p_subject_id, p_reason,
          nullif(btrim(coalesce(p_body, '')), ''))
  on conflict do nothing;

  return query select true, null::text;
end;
$$;

-- The moderation queue looked a reported message's text up to show it in the
-- list. With the table gone it shows what it has: the subject kind, and the
-- reporter's own words.
create or replace function admin_reports(p_state text default 'open', p_limit integer default 50)
returns table (
  report_id    uuid,
  reporter     text,
  subject_kind text,
  subject_id   uuid,
  subject_name text,
  reason       text,
  body         text,
  state        text,
  created_at   timestamptz
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform('moderator') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select r.id, coalesce(rp.display_name, 'Someone'), r.subject_kind, r.subject_id,
         case r.subject_kind
           when 'player' then (select pp.display_name from player_profile pp where pp.id = r.subject_id)
           when 'venue'  then (select v.name from venue v where v.id = r.subject_id)
           else null
         end,
         r.reason, r.body, r.state, r.created_at
    from report r
    left join player_profile rp on rp.id = r.reporter_id
   where (p_state is null or r.state = p_state)
   order by r.created_at
   limit greatest(1, least(p_limit, 200));
end;
$$;

-- ---------------------------------------------------------------------------
-- Taking the rooms out
-- ---------------------------------------------------------------------------

drop function if exists send_message(uuid, text);
drop function if exists conversation_messages(uuid, integer, timestamptz);
drop function if exists my_conversations(integer);
drop function if exists mark_conversation_read(uuid);
drop function if exists mute_conversation(uuid, boolean);
drop function if exists conversation_audience(uuid);
drop function if exists is_conversation_member(uuid);
drop function if exists lobby_conversation(uuid);
drop function if exists team_conversation(uuid);
drop function if exists club_conversation(uuid);
drop function if exists direct_conversation(uuid);
drop function if exists venue_conversation(uuid);

drop table if exists message cascade;
drop table if exists conversation_member cascade;
drop table if exists conversation cascade;
drop type if exists conversation_kind;

-- Every notification that pointed at a room now points at nothing. Tapping one
-- landed on a screen that no longer exists, so they go rather than sitting in
-- the list as dead ends.
delete from notification where kind = 'message' or payload ->> 'screen' = 'chat';

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

revoke execute on function public.whatsapp_for_player(uuid) from public, anon;
grant  execute on function public.whatsapp_for_player(uuid) to authenticated;

revoke execute on function public.booking_whatsapp(uuid) from public, anon;
grant  execute on function public.booking_whatsapp(uuid) to authenticated;

revoke execute on function public.claim_booking_payment(uuid, payment_channel_kind, text)
  from public, anon;
grant  execute on function public.claim_booking_payment(uuid, payment_channel_kind, text)
  to authenticated;

revoke execute on function public.confirm_booking_payment(uuid, text) from public, anon;
grant  execute on function public.confirm_booking_payment(uuid, text) to authenticated;

revoke execute on function public.submit_report(text, uuid, text, text) from public, anon;
grant  execute on function public.submit_report(text, uuid, text, text) to authenticated;

revoke execute on function public.admin_reports(text, integer) from public, anon;
grant  execute on function public.admin_reports(text, integer) to authenticated;

comment on function public.whatsapp_for_player(uuid) is
  'A player''s WhatsApp number, to somebody who shares a club, a team or a match with them. The rule that gated the old direct messages, gating the number instead.';
