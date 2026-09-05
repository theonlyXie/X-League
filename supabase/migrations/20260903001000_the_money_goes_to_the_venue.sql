-- The money for a pitch goes to the venue, and both sides say so.
--
-- Until now a booking was settled in cash at the gate: the venue collected, and
-- `record_payment` wrote that down. That still works and is still the default.
-- What was missing is the way most people in Egypt actually pay — a transfer to
-- a wallet or an InstaPay handle before they turn up — and, more importantly,
-- the two halves of trust that go with it. The player needs somewhere to send
-- it and a way to say they did. The venue needs to see that claim and answer it.
--
-- Three decisions worth stating, because they are what the shape below is for.
--
--   The venue's handles are the venue's. `payment_channel` already held the
--   platform's and each cup's; it now holds a venue's too, and a row belongs to
--   exactly one of the three. Nothing here routes money through X League: a
--   transfer goes from a player to a venue, and the app is where they agree it
--   happened.
--
--   A claim is not a payment. "I sent it" and "it arrived" are different facts
--   said by different people, and conflating them is how a venue ends up
--   holding a pitch for money that never came. The claim is on the booking; the
--   payment is `payment_reference`, and only the venue moves it.
--
--   It happens in a room, not a form. A transfer that needs explaining — wrong
--   amount, wrong day, a screenshot — needs somewhere to explain it, and a
--   notification that vanishes is not that. Every booking can have one room
--   between its captain and the venue's staff, the claim and the confirmation
--   are posted into it as they happen, and anything either side needs to say
--   afterwards has a place to go.

-- ---------------------------------------------------------------------------
-- Where the money goes
-- ---------------------------------------------------------------------------

alter table payment_channel
  add column if not exists venue_id uuid references venue(id) on delete cascade;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payment_channel_belongs_to_one'
  ) then
    -- Platform-wide (both null), a cup's, or a venue's. Never two at once: a
    -- row that is both is a row nobody can say who is owed.
    alter table payment_channel
      add constraint payment_channel_belongs_to_one
      check (num_nonnulls(tournament_id, venue_id) <= 1);
  end if;
end $$;

create index if not exists payment_channel_venue_idx
  on payment_channel (venue_id) where venue_id is not null;

-- What the captain said they sent, and how. The payment itself stays in
-- `payment_reference`, where it always was.
alter table booking
  add column if not exists payment_claimed_at timestamptz,
  add column if not exists payment_note text,
  add column if not exists payment_kind payment_channel_kind;

-- A venue room hangs off a booking, like a lobby does. The constraint that says
-- which subject column each kind must carry predates the kind, so it is
-- restated rather than added to — a check constraint cannot be extended in
-- place, and leaving it as it was would make the room unopenable.
alter table conversation drop constraint if exists conversation_subject;
alter table conversation add constraint conversation_subject check (
  (kind = 'lobby'  and booking_id is not null and team_id is null and club_id is null)
  or (kind = 'venue' and booking_id is not null and team_id is null and club_id is null)
  or (kind = 'team'  and team_id is not null and booking_id is null and club_id is null)
  or (kind = 'club'  and club_id is not null and booking_id is null and team_id is null)
  or (kind = 'direct' and booking_id is null and team_id is null and club_id is null)
);

-- One venue room per booking, so two people cannot end up settling up in two
-- different places.
create unique index if not exists conversation_one_venue_room_per_booking
  on conversation (booking_id) where kind = 'venue';

-- ---------------------------------------------------------------------------
-- A venue's handles
-- ---------------------------------------------------------------------------

/**
 * Where to send the money for a booking at this venue.
 *
 * Shown to the venue's own staff, and to a player who has a booking there —
 * not to anybody browsing. A wallet number is a real-world identifier, and a
 * list of every venue's is a thing worth not handing out.
 */
create or replace function venue_payment_channels(p_venue_id uuid)
returns table (
  channel_id uuid,
  kind payment_channel_kind,
  label text,
  value text,
  instructions text,
  active boolean,
  sort smallint
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select c.id, c.kind, c.label, c.value, c.instructions, c.active, c.sort
    from payment_channel c
   where c.venue_id = p_venue_id
     and (
       is_venue_staff(p_venue_id)
       or (c.active and exists (
         select 1 from booking b
          where venue_of_pitch(b.pitch_id) = p_venue_id
            and b.captain_id = auth.uid()
            and b.state in ('held', 'pending_payment', 'confirmed', 'checked_in', 'completed')
       ))
     )
   order by c.sort, c.label;
$$;

create or replace function set_venue_payment_channel(
  p_id uuid,
  p_venue_id uuid,
  p_kind payment_channel_kind,
  p_label text,
  p_value text,
  p_instructions text default null,
  p_active boolean default true,
  p_sort smallint default 0
)
returns table (ok boolean, channel_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if not is_venue_staff(p_venue_id, 'manager') then
    return query select false, null::uuid, 'You do not manage that venue.';
    return;
  end if;
  if length(btrim(coalesce(p_label, ''))) < 2 then
    return query select false, null::uuid, 'Give the destination a name.';
    return;
  end if;
  -- The one field nobody can invent on the venue's behalf. A wallet number
  -- typed wrong sends a player's money to a stranger.
  if length(btrim(coalesce(p_value, ''))) < 3 then
    return query select false, null::uuid, 'Give the number or handle to send to.';
    return;
  end if;

  if p_id is null then
    insert into payment_channel (venue_id, kind, label, value, instructions, active, sort)
    values (p_venue_id, p_kind, btrim(p_label), btrim(p_value),
            nullif(btrim(coalesce(p_instructions, '')), ''),
            coalesce(p_active, true), coalesce(p_sort, 0))
    returning id into v_id;
  else
    update payment_channel
       set kind = p_kind,
           label = btrim(p_label),
           value = btrim(p_value),
           instructions = nullif(btrim(coalesce(p_instructions, '')), ''),
           active = coalesce(p_active, true),
           sort = coalesce(p_sort, 0)
     where id = p_id and venue_id = p_venue_id
    returning id into v_id;

    if v_id is null then
      return query select false, null::uuid, 'That destination is not this venue''s.';
      return;
    end if;
  end if;

  return query select true, v_id, null::text;
end;
$$;

create or replace function delete_venue_payment_channel(p_id uuid)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_venue uuid;
begin
  select c.venue_id into v_venue from payment_channel c where c.id = p_id;

  if v_venue is null then
    return query select false, 'That destination no longer exists.';
    return;
  end if;
  if not is_venue_staff(v_venue, 'manager') then
    return query select false, 'You do not manage that venue.';
    return;
  end if;

  delete from payment_channel where id = p_id;
  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- The room
-- ---------------------------------------------------------------------------

/**
 * The room a captain and a venue settle a booking in.
 *
 * One per booking, created the first time either side needs it. It is a
 * different room from the match lobby, which is the squad's and which the venue
 * has no business reading.
 */
create or replace function venue_conversation(p_booking_id uuid)
returns table (ok boolean, conversation_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_venue   uuid;
  v_captain uuid;
  v_id      uuid;
begin
  select venue_of_pitch(b.pitch_id), b.captain_id
    into v_venue, v_captain
    from booking b where b.id = p_booking_id;

  if v_venue is null then
    return query select false, null::uuid, 'That booking no longer exists.';
    return;
  end if;
  if not (v_captain = auth.uid() or is_venue_staff(v_venue)) then
    return query select false, null::uuid, 'That booking is not yours.';
    return;
  end if;

  select c.id into v_id from conversation c
   where c.kind = 'venue' and c.booking_id = p_booking_id;

  if v_id is null then
    insert into conversation (kind, booking_id) values ('venue', p_booking_id)
    returning id into v_id;
  end if;

  return query select true, v_id, null::text;
end;
$$;

-- Who may read a venue room: the captain who booked, and the venue's staff.
-- Derived, like every other room, so a member of staff hired next week can read
-- the thread without anybody re-opening it.
create or replace function conversation_audience(p_conversation_id uuid)
returns table (player_id uuid)
language sql stable security definer
set search_path = public, pg_temp as $$
  select cm.player_id
    from conversation_member cm
   where cm.conversation_id = p_conversation_id
  union
  select bp.player_id
    from conversation c
    join booking_participant bp on bp.booking_id = c.booking_id
   where c.id = p_conversation_id and c.kind = 'lobby'
     and bp.player_id is not null
     and bp.state in ('invited', 'accepted')
  union
  select b.captain_id
    from conversation c
    join booking b on b.id = c.booking_id
   where c.id = p_conversation_id and c.kind in ('lobby', 'venue')
     and b.captain_id is not null
  union
  select vs.user_id
    from conversation c
    join booking b on b.id = c.booking_id
    join pitch p on p.id = b.pitch_id
    join venue_staff vs on vs.venue_id = p.venue_id and vs.active
   where c.id = p_conversation_id and c.kind = 'venue'
  union
  select tm.player_id
    from conversation c
    join team_membership tm on tm.team_id = c.team_id
   where c.id = p_conversation_id and c.kind = 'team'
     and tm.state = 'active'
  union
  select clm.player_id
    from conversation c
    join club_membership clm on clm.club_id = c.club_id
   where c.id = p_conversation_id and c.kind = 'club'
     and clm.state = 'active';
$$;

-- ---------------------------------------------------------------------------
-- "I sent it" and "it arrived"
-- ---------------------------------------------------------------------------

/**
 * The captain says they transferred the money.
 *
 * A claim, not a payment. It goes on the booking, it is posted into the room so
 * the venue reads it where they can answer it, and the venue's staff are told.
 * Nothing about what the venue is owed changes until somebody at the venue says
 * the money arrived.
 */
create or replace function claim_booking_payment(
  p_booking_id uuid,
  p_kind payment_channel_kind default 'wallet',
  p_note text default null
)
returns table (ok boolean, conversation_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_venue   uuid;
  v_captain uuid;
  v_code    text;
  v_conv    uuid;
  v_name    text;
  r         record;
begin
  select venue_of_pitch(b.pitch_id), b.captain_id, b.code
    into v_venue, v_captain, v_code
    from booking b where b.id = p_booking_id;

  if v_venue is null then
    return query select false, null::uuid, 'That booking no longer exists.';
    return;
  end if;
  if v_captain is distinct from auth.uid() then
    return query select false, null::uuid, 'Only the captain who booked can confirm the payment.';
    return;
  end if;
  if length(btrim(coalesce(p_note, ''))) < 3 then
    return query select false, null::uuid, 'Say what you sent and how, so it can be matched.';
    return;
  end if;

  update booking
     set payment_claimed_at = now(),
         payment_note = btrim(p_note),
         payment_kind = p_kind
   where id = p_booking_id;

  insert into booking_event (booking_id, event, actor, detail)
  values (p_booking_id, 'Payment claimed', current_actor(),
          jsonb_build_object('kind', p_kind, 'note', btrim(p_note)));

  select * into r from venue_conversation(p_booking_id);
  v_conv := r.conversation_id;

  select coalesce(pp.display_name, b.captain_name, 'The captain')
    into v_name
    from booking b left join player_profile pp on pp.id = b.captain_id
   where b.id = p_booking_id;

  -- Written by nobody, which is what a null sender means here: this is the app
  -- reporting what happened, not a person typing.
  insert into message (conversation_id, sender_id, body)
  values (v_conv, null,
          v_name || ' says the money for ' || v_code || ' has been sent: ' || btrim(p_note));

  perform notify(vs.user_id, 'payment_claimed',
                 v_name || ' says they have paid',
                 'Booking ' || v_code || '. Check it arrived, then confirm.',
                 jsonb_build_object('screen', 'owner_money', 'booking_id', p_booking_id))
     from venue_staff vs
    where vs.venue_id = v_venue and vs.active;

  return query select true, v_conv, null::text;
end;
$$;

/**
 * The venue says the money arrived.
 *
 * This is the half that moves what the venue is owed: the outstanding balance
 * becomes collected, exactly as it would have if it had been handed over at the
 * gate, so the takings and the payout report do not have to know which way it
 * came. It is also posted into the room, so the captain sees the answer where
 * they made the claim.
 */
create or replace function confirm_booking_payment(
  p_booking_id uuid,
  p_reference text default null
)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_venue uuid;
  v_code  text;
  v_rows  integer;
  v_conv  uuid;
  r       record;
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

  select * into r from venue_conversation(p_booking_id);
  v_conv := r.conversation_id;

  insert into message (conversation_id, sender_id, body)
  values (v_conv, null, 'The venue confirmed the money for ' || v_code || ' arrived.');

  perform notify(b.captain_id, 'payment_confirmed',
                 'The venue confirmed your payment',
                 'Booking ' || v_code || ' is settled.',
                 jsonb_build_object('screen', 'booking', 'booking_id', p_booking_id))
     from booking b
    where b.id = p_booking_id and b.captain_id is not null;

  return query select true, null::text;
end;
$$;

/**
 * What the venue has been told about, and has not answered yet.
 *
 * The claims first, oldest first, because somebody is waiting on each one.
 */
create or replace function venue_payment_claims(p_venue_id uuid, p_limit integer default 50)
returns table (
  booking_id uuid,
  code text,
  captain_name text,
  captain_phone text,
  starts_at timestamptz,
  pitch_label text,
  price_egp integer,
  claimed_at timestamptz,
  note text,
  kind payment_channel_kind,
  settled boolean
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select b.id, b.code,
         coalesce(pp.display_name, b.captain_name, 'Walk-in'),
         b.captain_phone,
         lower(b.during),
         p.label,
         b.price_egp,
         b.payment_claimed_at,
         b.payment_note,
         b.payment_kind,
         not exists (
           select 1 from payment_reference pr
            where pr.booking_id = b.id and pr.kind = 'balance' and pr.state = 'due'
         )
    from booking b
    join pitch p on p.id = b.pitch_id
    left join player_profile pp on pp.id = b.captain_id
   where p.venue_id = p_venue_id
     and b.payment_claimed_at is not null
     and is_venue_staff(p_venue_id)
   order by
     not exists (select 1 from payment_reference pr
                  where pr.booking_id = b.id and pr.kind = 'balance' and pr.state = 'due'),
     b.payment_claimed_at
   limit greatest(1, least(p_limit, 200));
$$;

-- ---------------------------------------------------------------------------
-- The room in the list
-- ---------------------------------------------------------------------------

create or replace function my_conversations(p_limit integer default 30)
returns table (
  conversation_id uuid,
  kind conversation_kind,
  title text,
  last_body text,
  last_at timestamptz,
  unread integer,
  booking_id uuid,
  team_id uuid,
  club_id uuid
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select
    c.id,
    c.kind,
    case c.kind
      when 'lobby' then coalesce(v.name, 'Match') || ' lobby'
      when 'team'  then coalesce(t.name, 'Team')
      when 'club'  then coalesce(cl.name, 'Club')
      -- Read from both ends. The venue's staff see who owes them; the captain
      -- sees which ground they are talking to.
      when 'venue' then case
        when is_venue_staff(p.venue_id)
          then coalesce(cap.display_name, b.captain_name, 'Player') || ' · ' || coalesce(b.code, '')
        else coalesce(v.name, 'Venue')
      end
      else coalesce((
        select pp.display_name from conversation_member cm2
          join player_profile pp on pp.id = cm2.player_id
         where cm2.conversation_id = c.id and cm2.player_id <> auth.uid()
         limit 1
      ), 'Direct message')
    end,
    last.body,
    last.created_at,
    (select count(*)::integer from message m2
      where m2.conversation_id = c.id
        and m2.sender_id is distinct from auth.uid()
        and (mem.last_read_at is null or m2.created_at > mem.last_read_at)
        and (
          m2.sender_id is null
          or not exists (
            select 1 from player_block bl
             where bl.blocker_id = auth.uid() and bl.blocked_id = m2.sender_id
          )
        )),
    c.booking_id,
    c.team_id,
    c.club_id
  from conversation c
  left join conversation_member mem
         on mem.conversation_id = c.id and mem.player_id = auth.uid()
  left join booking b on b.id = c.booking_id
  left join player_profile cap on cap.id = b.captain_id
  left join pitch p on p.id = b.pitch_id
  left join venue v on v.id = p.venue_id
  left join team t on t.id = c.team_id
  left join club cl on cl.id = c.club_id
  left join lateral (
    select case when m.hidden_at is null then m.body else '(removed)' end as body,
           m.created_at
      from message m
     where m.conversation_id = c.id
       and (
         m.sender_id is null
         or m.sender_id = auth.uid()
         or not exists (
           select 1 from player_block bb
            where bb.blocker_id = auth.uid() and bb.blocked_id = m.sender_id
         )
       )
     order by m.created_at desc limit 1
  ) last on true
  where auth.uid() is not null
    and (
      mem.player_id is not null
      or (c.kind = 'lobby' and (
            exists (select 1 from booking_participant bp
                     where bp.booking_id = c.booking_id
                       and bp.player_id = auth.uid()
                       and bp.state in ('invited', 'accepted'))
            or exists (select 1 from booking b2
                        where b2.id = c.booking_id and b2.captain_id = auth.uid())
          ))
      or (c.kind = 'venue' and (
            exists (select 1 from booking b3
                     where b3.id = c.booking_id and b3.captain_id = auth.uid())
            or is_venue_staff(p.venue_id)
          ))
      or (c.kind = 'team' and exists (
            select 1 from team_membership tm
             where tm.team_id = c.team_id and tm.player_id = auth.uid()
               and tm.state = 'active'))
      or (c.kind = 'club' and exists (
            select 1 from club_membership clm
             where clm.club_id = c.club_id and clm.player_id = auth.uid()
               and clm.state = 'active'))
    )
  order by coalesce(last.created_at, c.created_at) desc
  limit greatest(1, least(p_limit, 100));
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

revoke execute on function public.venue_payment_channels(uuid) from public, anon;
revoke execute on function public.set_venue_payment_channel(uuid, uuid, payment_channel_kind, text, text, text, boolean, smallint) from public, anon;
revoke execute on function public.delete_venue_payment_channel(uuid) from public, anon;
revoke execute on function public.venue_conversation(uuid) from public, anon;
revoke execute on function public.claim_booking_payment(uuid, payment_channel_kind, text) from public, anon;
revoke execute on function public.confirm_booking_payment(uuid, text) from public, anon;
revoke execute on function public.venue_payment_claims(uuid, integer) from public, anon;
revoke execute on function public.conversation_audience(uuid) from public, anon, authenticated;
revoke execute on function public.my_conversations(integer) from public, anon;

grant execute on function public.venue_payment_channels(uuid) to authenticated;
grant execute on function public.set_venue_payment_channel(uuid, uuid, payment_channel_kind, text, text, text, boolean, smallint) to authenticated;
grant execute on function public.delete_venue_payment_channel(uuid) to authenticated;
grant execute on function public.venue_conversation(uuid) to authenticated;
grant execute on function public.claim_booking_payment(uuid, payment_channel_kind, text) to authenticated;
grant execute on function public.confirm_booking_payment(uuid, text) to authenticated;
grant execute on function public.venue_payment_claims(uuid, integer) to authenticated;
grant execute on function public.my_conversations(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- What the player needs to know about the money, in one answer
-- ---------------------------------------------------------------------------

/**
 * Restated with three columns added, which is why it is dropped first: Postgres
 * will not change a function's OUT parameters under `create or replace`.
 *
 * The screen needs the venue to ask it where to send the money, whether a claim
 * has already been made, and whether the venue has answered it. Deriving any of
 * those on the client from what it happens to have loaded is how a screen ends
 * up offering "I have sent it" to somebody who already did.
 */
drop function if exists booking_terms(uuid);

create or replace function booking_terms(p_booking_id uuid)
returns table (
  cutoff_at timestamptz,
  free_now boolean,
  deposit_egp integer,
  balance_egp integer,
  deposit_state text,
  venue_id uuid,
  payment_claimed_at timestamptz,
  balance_settled boolean
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select cancellation_cutoff(b.id),
         now() < cancellation_cutoff(b.id),
         b.deposit_egp,
         greatest(0, b.price_egp - b.deposit_egp),
         coalesce((select pr.state from payment_reference pr
                    where pr.booking_id = b.id and pr.kind = 'cash_deposit'
                    order by pr.created_at desc limit 1), 'due'),
         venue_of_pitch(b.pitch_id),
         b.payment_claimed_at,
         not exists (
           select 1 from payment_reference pr
            where pr.booking_id = b.id and pr.kind = 'balance' and pr.state = 'due'
         )
    from booking b
   where b.id = p_booking_id
     and (b.captain_id = auth.uid() or is_venue_staff(venue_of_pitch(b.pitch_id)));
$$;

revoke execute on function public.booking_terms(uuid) from public, anon;
grant execute on function public.booking_terms(uuid) to authenticated;
