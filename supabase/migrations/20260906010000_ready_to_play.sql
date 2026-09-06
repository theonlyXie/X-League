-- Ready to play, and a call for the people who are.
--
-- Two halves of one problem. A captain three days out has a pitch and six
-- people; a player on a Tuesday has nothing on and no way to say so. Until now
-- the only way they met was the captain already knowing the player's name well
-- enough to search for it, which is a rule that quietly says the app is for
-- squads that are already complete.
--
-- So: a player says they are ready, a captain calls for what is missing, and
-- the app puts the two together.
--
-- ## Ready
--
-- `player_profile.available_until` is a timestamp, not a flag. A flag would be
-- wrong within a fortnight — half the people listed as available would not be,
-- and a captain who is let down twice stops looking. Pressing the button means
-- "tonight": it is set to the end of the day in Cairo and it expires by itself.
-- Nothing has to sweep the table, because every read compares against `now()`,
-- so an expired availability is simply not available and never a row somebody
-- has to remember to clean up.
--
-- ## The call
--
-- One open call per booking, holding what is actually missing: which positions,
-- how many, and — behind "advanced" in the app — a minimum rating. Positions
-- are an array because a captain short of two is usually short of two
-- different things, and an empty array means "anybody", which is the common
-- case and should not require choosing four chips.
--
-- ## Answering
--
-- Answering is an offer, not a seat. The captain confirms. A first-come model
-- fills a match faster and hands the captain whoever was quickest, which is
-- the wrong trade for five-a-side, where the squad is a social fact before it
-- is a headcount. So `answer_call` records an offer, `accept_response` puts
-- them in the squad, and `decline_response` closes it politely.
--
-- Confirming goes through `invite_to_booking` rather than writing a
-- participant row here. Capacity, the already-in-this-squad check and the
-- booking event log all live in that function, and a second way into the squad
-- table is a second place for those rules to drift. The participant is then
-- moved straight to 'accepted': the player's offer was their acceptance, and
-- asking somebody to accept an invitation they asked for is a step that exists
-- only because the schema was not thought about.

-- ---------------------------------------------------------------------------
-- Ready
-- ---------------------------------------------------------------------------

alter table player_profile
  add column if not exists available_until timestamptz;

comment on column player_profile.available_until is
  'When this player stops being open to invitations. Null, or in the past, means not available.';

create index if not exists player_profile_available_idx
  on player_profile (available_until) where available_until is not null;

-- ---------------------------------------------------------------------------
-- The call
-- ---------------------------------------------------------------------------

create table if not exists player_call (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references booking(id) on delete cascade,
  opened_by   uuid not null references player_profile(id) on delete cascade,
  positions   text[] not null default '{}',
  min_ovr     smallint,
  wanted      smallint not null default 1,
  note        text,
  state       text not null default 'open',
  created_at  timestamptz not null default now(),
  closed_at   timestamptz,
  constraint player_call_state check (state in ('open', 'closed')),
  constraint player_call_wanted check (wanted between 1 and 10),
  constraint player_call_min_ovr check (min_ovr is null or min_ovr between 1 and 99),
  constraint player_call_positions check (positions <@ array['GK','DEF','MID','FWD']::text[])
);

-- One open call per booking. A second is not more reach, it is the same match
-- appearing twice in everybody's list.
create unique index if not exists player_call_one_open_per_booking
  on player_call (booking_id) where state = 'open';

create table if not exists call_response (
  id         uuid primary key default gen_random_uuid(),
  call_id    uuid not null references player_call(id) on delete cascade,
  player_id  uuid not null references player_profile(id) on delete cascade,
  state      text not null default 'offered',
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint call_response_state check (state in ('offered', 'accepted', 'declined', 'withdrawn')),
  constraint call_response_once unique (call_id, player_id)
);

create index if not exists call_response_call_idx on call_response (call_id, state);
create index if not exists call_response_player_idx on call_response (player_id, state);

-- Nothing reads these tables directly. Every path is a function below.
revoke all on table player_call from anon, authenticated, public;
revoke all on table call_response from anon, authenticated, public;
alter table player_call enable row level security;
alter table call_response enable row level security;

-- ---------------------------------------------------------------------------
-- Saying you are ready
-- ---------------------------------------------------------------------------

/**
 * Turn availability on until the end of today, or off now.
 *
 * "The end of today" is in Cairo rather than UTC, because a player pressing
 * this at eleven at night means tonight, and in UTC that is tomorrow.
 */
create or replace function set_availability(p_on boolean)
returns table (available_until timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_until timestamptz;
begin
  if v_uid is null then
    raise exception 'Sign in to say you are available.' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(p_on, false) then
    v_until := ((current_date + 1) + time '00:00') at time zone 'Africa/Cairo';
  else
    v_until := null;
  end if;

  update player_profile pp set available_until = v_until where pp.id = v_uid;
  return query select v_until;
end;
$$;

revoke all on function set_availability(boolean) from public;
grant execute on function set_availability(boolean) to authenticated;

/**
 * Whether I am currently available, and how many calls are waiting for me.
 *
 * The count is here rather than derived in the app so the button can say what
 * pressing it is worth — "3 matches want a defender" is a reason to say yes,
 * "Available" on its own is not.
 */
create or replace function my_availability()
returns table (available boolean, available_until timestamptz, open_calls integer)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to see this.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select pp.available_until > now(),
         pp.available_until,
         (select count(*)::integer from calls_for(v_uid))
    from player_profile pp
   where pp.id = v_uid;
end;
$$;

revoke all on function my_availability() from public;
grant execute on function my_availability() to authenticated;

-- ---------------------------------------------------------------------------
-- Who a call is for
-- ---------------------------------------------------------------------------

/**
 * The open calls that match one player, as call ids.
 *
 * The matching rule lives here and nowhere else. It is asked three times — for
 * the badge on the button, for the list a player reads, and for the people to
 * notify when a call opens — and three copies of a rule this fiddly would
 * disagree within a month.
 *
 * Internal. Not granted to anybody: it takes a player id, and a version of it
 * that `authenticated` could call would answer "what is this other person
 * being offered" for any id somebody typed.
 */
create or replace function calls_for(p_player uuid)
returns table (call_id uuid)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select c.id
    from player_call c
    join booking b on b.id = c.booking_id
    join player_profile me on me.id = p_player
    left join lateral (
      select a.ovr, a.position from attribute_snapshot a
       where a.player_id = p_player order by a.seq desc limit 1
    ) card on true
   where c.state = 'open'
     and b.state in ('confirmed', 'checked_in')
     and lower(b.during) > now()
     and me.available_until > now()
     and (me.suspended_until is null or me.suspended_until <= now())
     and b.captain_id is distinct from p_player
     and not exists (
       select 1 from booking_participant bp
        where bp.booking_id = c.booking_id
          and bp.player_id = p_player
          and bp.state in ('invited', 'accepted')
     )
     and not exists (
       select 1 from call_response cr
        where cr.call_id = c.id and cr.player_id = p_player
          and cr.state in ('offered', 'accepted')
     )
     -- Both filters treat a missing card the same way, and the reason is the
     -- same both times: a player with no card yet is short of evidence, not
     -- short of ability, and a filter that reads absence as failure quietly
     -- excludes every newcomer — the people most likely to be free tonight.
     -- Most accounts in the live database have no recorded position, so the
     -- strict reading would have made a call for a defender reach nobody.
     -- Somebody who has said where they play is matched on it; somebody who
     -- has not is still shown the call and can decide for themselves.
     and (cardinality(c.positions) = 0
          or card.position is null
          or card.position = any (c.positions))
     and (c.min_ovr is null or card.ovr is null or card.ovr >= c.min_ovr)
     and not is_blocked_between(b.captain_id, p_player)
   order by lower(b.during);
$$;

revoke all on function calls_for(uuid) from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Calling
-- ---------------------------------------------------------------------------

/**
 * Open a call on a booking, or replace the one that is open.
 *
 * Re-opening rather than refusing is deliberate: a captain who filled the
 * defender slot and now needs a keeper is editing the same call, and making
 * them find and close the old one first is a step that teaches nothing.
 *
 * Everyone the call matches is notified once, here. Nobody is notified twice
 * for the same booking, because reopening reuses the row and the people
 * already offered are excluded by `calls_for`.
 */
create or replace function open_call(
  p_booking_id uuid,
  p_positions  text[] default '{}',
  p_min_ovr    integer default null,
  p_wanted     integer default 1,
  p_note       text default null
)
returns table (ok boolean, call_id uuid, reason text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_captain uuid;
  v_state   booking_state;
  v_kick    timestamptz;
  v_venue   text;
  v_id      uuid;
  v_player  uuid;
  v_n       integer := 0;
begin
  if v_uid is null then
    return query select false, null::uuid, 'Sign in to call for players.';
    return;
  end if;

  select b.captain_id, b.state, lower(b.during), v.name
    into v_captain, v_state, v_kick, v_venue
    from booking b
    join pitch p on p.id = b.pitch_id
    join venue v on v.id = p.venue_id
   where b.id = p_booking_id;

  if v_captain is null and v_state is null then
    return query select false, null::uuid, 'That booking no longer exists.';
    return;
  end if;

  if v_captain is distinct from v_uid then
    return query select false, null::uuid, 'Only the captain can call for players.';
    return;
  end if;

  if v_state not in ('confirmed', 'checked_in') then
    return query select false, null::uuid, 'Confirm the booking before calling for players.';
    return;
  end if;

  if v_kick <= now() then
    return query select false, null::uuid, 'That match has already kicked off.';
    return;
  end if;

  if not (coalesce(p_positions, '{}') <@ array['GK','DEF','MID','FWD']::text[]) then
    return query select false, null::uuid, 'That is not a position.';
    return;
  end if;

  if p_min_ovr is not null and (p_min_ovr < 1 or p_min_ovr > 99) then
    return query select false, null::uuid, 'A rating is between 1 and 99.';
    return;
  end if;

  if coalesce(p_wanted, 1) < 1 or coalesce(p_wanted, 1) > 10 then
    return query select false, null::uuid, 'Ask for between one and ten players.';
    return;
  end if;

  select c.id into v_id from player_call c
   where c.booking_id = p_booking_id and c.state = 'open';

  if v_id is null then
    insert into player_call (booking_id, opened_by, positions, min_ovr, wanted, note)
    values (p_booking_id, v_uid, coalesce(p_positions, '{}'), p_min_ovr::smallint,
            coalesce(p_wanted, 1)::smallint, nullif(btrim(coalesce(p_note, '')), ''))
    returning id into v_id;
  else
    update player_call c
       set positions = coalesce(p_positions, '{}'),
           min_ovr   = p_min_ovr::smallint,
           wanted    = coalesce(p_wanted, 1)::smallint,
           note      = nullif(btrim(coalesce(p_note, '')), '')
     where c.id = v_id;
  end if;

  -- Everybody this now matches hears about it once.
  for v_player in
    select pp.id from player_profile pp
     where pp.available_until > now()
       and v_id in (select cf.call_id from calls_for(pp.id) cf)
  loop
    perform notify(
      v_player, 'call',
      'A match needs players',
      coalesce(v_venue, 'A pitch') || ' — ' ||
      to_char(v_kick at time zone 'Africa/Cairo', 'Dy DD Mon, HH24:MI'),
      jsonb_build_object('call_id', v_id, 'booking_id', p_booking_id)
    );
    v_n := v_n + 1;
  end loop;

  insert into booking_event (booking_id, event, actor, detail)
  values (p_booking_id, 'Called for players', current_actor(),
          jsonb_build_object('positions', coalesce(p_positions, '{}'),
                             'min_ovr', p_min_ovr,
                             'told', v_n));

  return query select true, v_id, null::text;
end;
$$;

revoke all on function open_call(uuid, text[], integer, integer, text) from public;
grant execute on function open_call(uuid, text[], integer, integer, text) to authenticated;

/** Stop asking. */
create or replace function close_call(p_booking_id uuid)
returns table (ok boolean, reason text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  select c.id into v_id
    from player_call c join booking b on b.id = c.booking_id
   where c.booking_id = p_booking_id and c.state = 'open' and b.captain_id = v_uid;

  if v_id is null then
    return query select false, 'There is no call to close.';
    return;
  end if;

  update player_call set state = 'closed', closed_at = now() where id = v_id;
  -- Offers nobody acted on end with the call rather than sitting as a request
  -- that is never going to be answered.
  update call_response set state = 'withdrawn', settled_at = now()
   where call_id = v_id and state = 'offered';

  return query select true, null::text;
end;
$$;

revoke all on function close_call(uuid) from public;
grant execute on function close_call(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading and answering a call
-- ---------------------------------------------------------------------------

/** The calls open to me, soonest first. */
create or replace function open_calls(p_limit integer default 20)
returns table (
  call_id     uuid,
  booking_id  uuid,
  venue_name  text,
  area        text,
  kick_off    timestamptz,
  price_egp   integer,
  positions   text[],
  min_ovr     smallint,
  wanted      smallint,
  note        text,
  captain     text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to see who needs players.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select c.id, c.booking_id, v.name, v.area, lower(b.during), b.price_egp,
         c.positions, c.min_ovr, c.wanted, c.note,
         coalesce(cap.display_name, b.captain_name)
    from calls_for(v_uid) f
    join player_call c on c.id = f.call_id
    join booking b on b.id = c.booking_id
    join pitch p on p.id = b.pitch_id
    join venue v on v.id = p.venue_id
    left join player_profile cap on cap.id = b.captain_id
   order by lower(b.during)
   limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

revoke all on function open_calls(integer) from public;
grant execute on function open_calls(integer) to authenticated;

/**
 * Offer to play.
 *
 * `calls_for` is asked again rather than trusted from the list the app is
 * holding: the list was true when it was drawn, and the squad may have filled
 * since. Everything that decides whether this player may answer is in that one
 * place, so this cannot drift from what the list showed.
 */
create or replace function answer_call(p_call_id uuid)
returns table (ok boolean, reason text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_captain uuid;
  v_venue   text;
  v_name    text;
begin
  if v_uid is null then
    return query select false, 'Sign in to answer a call.';
    return;
  end if;

  if not exists (select 1 from calls_for(v_uid) f where f.call_id = p_call_id) then
    return query select false, 'That call is not open to you any more.';
    return;
  end if;

  insert into call_response (call_id, player_id) values (p_call_id, v_uid)
  on conflict (call_id, player_id)
  do update set state = 'offered', settled_at = null;

  select b.captain_id, v.name, pp.display_name
    into v_captain, v_venue, v_name
    from player_call c
    join booking b on b.id = c.booking_id
    join pitch p on p.id = b.pitch_id
    join venue v on v.id = p.venue_id
    join player_profile pp on pp.id = v_uid
   where c.id = p_call_id;

  perform notify(
    v_captain, 'call',
    v_name || ' can play',
    'They answered your call for ' || coalesce(v_venue, 'the match') || '.',
    jsonb_build_object('call_id', p_call_id)
  );

  return query select true, null::text;
end;
$$;

revoke all on function answer_call(uuid) from public;
grant execute on function answer_call(uuid) to authenticated;

/** Change your mind before the captain has answered. */
create or replace function withdraw_answer(p_call_id uuid)
returns table (ok boolean, reason text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_n   integer;
begin
  update call_response cr set state = 'withdrawn', settled_at = now()
   where cr.call_id = p_call_id and cr.player_id = v_uid and cr.state = 'offered';
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return query select false, 'There is nothing to withdraw.';
    return;
  end if;
  return query select true, null::text;
end;
$$;

revoke all on function withdraw_answer(uuid) from public;
grant execute on function withdraw_answer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The captain's side
-- ---------------------------------------------------------------------------

/** The call on my booking, and who has offered. */
create or replace function my_call(p_booking_id uuid)
returns table (
  call_id    uuid,
  positions  text[],
  min_ovr    smallint,
  wanted     smallint,
  note       text,
  offers     integer
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to see this.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from booking b where b.id = p_booking_id and b.captain_id = v_uid) then
    raise exception 'Only the captain can see this.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select c.id, c.positions, c.min_ovr, c.wanted, c.note,
         (select count(*)::integer from call_response cr
           where cr.call_id = c.id and cr.state = 'offered')
    from player_call c
   where c.booking_id = p_booking_id and c.state = 'open';
end;
$$;

revoke all on function my_call(uuid) from public;
grant execute on function my_call(uuid) to authenticated;

/**
 * Who has offered to play, with enough of a card to decide by.
 *
 * The captain asked for a position and a rating, so they see the position and
 * the rating. Nothing else about a stranger is shown here — a phone number is
 * not a thing you get for answering a call.
 */
create or replace function call_offers(p_booking_id uuid)
returns table (
  response_id  uuid,
  player_id    uuid,
  display_name  text,
  photo_url     text,
  position_code text,
  ovr           smallint,
  area         text,
  offered_at   timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to see this.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from booking b where b.id = p_booking_id and b.captain_id = v_uid) then
    raise exception 'Only the captain can see who answered.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select cr.id, pp.id, pp.display_name, pp.photo_url, card.position, card.ovr,
         pp.preferred_area, cr.created_at
    from call_response cr
    join player_call c on c.id = cr.call_id
    join player_profile pp on pp.id = cr.player_id
    left join lateral (
      select a.ovr, a.position from attribute_snapshot a
       where a.player_id = cr.player_id order by a.seq desc limit 1
    ) card on true
   where c.booking_id = p_booking_id
     and c.state = 'open'
     and cr.state = 'offered'
   order by cr.created_at;
end;
$$;

revoke all on function call_offers(uuid) from public;
grant execute on function call_offers(uuid) to authenticated;

/**
 * Take somebody up on their offer.
 *
 * `invite_to_booking` does the work, because capacity, the duplicate check and
 * the event log are its rules and a second door into the squad is a second
 * place for them to rot. The participant is then moved to 'accepted' in the
 * same breath: this player asked to play, and making them accept an invitation
 * they requested is a round trip that exists only in the schema's head.
 */
create or replace function accept_offer(p_response_id uuid, p_slot_kind text default 'starter')
returns table (ok boolean, reason text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_booking uuid;
  v_player  uuid;
  v_venue   text;
  r         record;
begin
  select c.booking_id, cr.player_id, v.name
    into v_booking, v_player, v_venue
    from call_response cr
    join player_call c on c.id = cr.call_id
    join booking b on b.id = c.booking_id
    join pitch p on p.id = b.pitch_id
    join venue v on v.id = p.venue_id
   where cr.id = p_response_id and cr.state = 'offered' and b.captain_id = v_uid;

  if v_booking is null then
    return query select false, 'That offer is no longer open.';
    return;
  end if;

  select * into r from invite_to_booking(v_booking, v_player, null, p_slot_kind, null);
  if not r.ok then
    return query select false, r.reason;
    return;
  end if;

  update booking_participant bp
     set state = 'accepted', responded_at = now()
   where bp.id = r.participant_id;

  update call_response cr set state = 'accepted', settled_at = now()
   where cr.id = p_response_id;

  perform notify(
    v_player, 'call',
    'You are in the squad',
    coalesce(v_venue, 'The captain') || ' confirmed you.',
    jsonb_build_object('booking_id', v_booking)
  );

  return query select true, null::text;
end;
$$;

revoke all on function accept_offer(uuid, text) from public;
grant execute on function accept_offer(uuid, text) to authenticated;

/**
 * Turn an offer down.
 *
 * Silently, as far as the player is concerned: they are told the offer was
 * settled, not that they were judged. A captain filling a five-a-side match
 * does not owe a stranger a reason, and a notification that reads as a
 * rejection is a good way to lose the player for good.
 */
create or replace function decline_offer(p_response_id uuid)
returns table (ok boolean, reason text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_n   integer;
begin
  update call_response cr set state = 'declined', settled_at = now()
   where cr.id = p_response_id
     and cr.state = 'offered'
     and exists (
       select 1 from player_call c join booking b on b.id = c.booking_id
        where c.id = cr.call_id and b.captain_id = v_uid
     );
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return query select false, 'That offer is no longer open.';
    return;
  end if;
  return query select true, null::text;
end;
$$;

revoke all on function decline_offer(uuid) from public;
grant execute on function decline_offer(uuid) to authenticated;
