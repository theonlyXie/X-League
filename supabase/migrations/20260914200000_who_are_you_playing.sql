-- Who are you playing?
--
-- A booking has always been one captain and a squad of individuals. `match`
-- has carried `score_home` and `score_away` since the day it was written, and
-- nothing anywhere recorded who "away" was — so an ordinary Thursday match was
-- a pitch, an hour, and a list of names with nobody on the other side of it.
--
-- This is the other side. The captain challenges somebody; that somebody says
-- yes or no; until they answer, the match is waiting for an opponent.
--
-- Three decisions worth writing down, because each of them closes off an
-- option somebody will reasonably ask about later.
--
-- *The opponent is a player or a club, never a team.* `team` exists in the
-- schema and nobody uses it — there are no teams in the app — so a challenge
-- goes to a person, who brings whoever they like, or to a club, which answers
-- through its captain.
--
-- *Accepting is the whole of it.* The away side does not build a line-up here.
-- Their players are not invited individually, do not appear in
-- `booking_participant`, and are not rated. That is a bigger feature and this
-- one is useful without it: knowing the match is on, and against whom, is what
-- was missing.
--
-- *The booking does not wait for an answer.* The pitch is held and confirmed
-- exactly as before. A captain who has paid for an hour does not lose it
-- because nobody replied, and a venue-made booking has no opponent to ask.

-- ---------------------------------------------------------------------------
-- The challenge
-- ---------------------------------------------------------------------------

do $$ begin
  create type challenge_state as enum ('invited', 'accepted', 'declined', 'withdrawn');
exception when duplicate_object then null;
end $$;

create table if not exists match_challenge (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references booking(id) on delete cascade,

  -- Exactly one of these two, enforced below. A challenge is to a person or
  -- to a club, and the difference matters: a club answers through its captain
  -- and carries its name and crest into the fixture, a person answers for
  -- themselves.
  opponent_player_id uuid references auth.users(id) on delete cascade,
  opponent_club_id   uuid references club(id) on delete cascade,

  state       challenge_state not null default 'invited',
  invited_by  uuid not null references auth.users(id) on delete cascade,
  -- A line from the captain: "bring your keeper", "we are the ones in red".
  note        text check (note is null or length(note) <= 200),
  responded_at timestamptz,
  created_at  timestamptz not null default now(),

  constraint one_kind_of_opponent check (
    (opponent_player_id is not null) <> (opponent_club_id is not null)
  )
);

-- One live challenge per booking.
--
-- The alternative — several out at once, first to accept takes it — is a race
-- with a loser who was told they had a match. A captain whose challenge is
-- declined can send another immediately; what they cannot do is have two
-- people believing they are playing the same hour.
create unique index if not exists match_challenge_one_live
  on match_challenge (booking_id) where state in ('invited', 'accepted');

create index if not exists match_challenge_for_player
  on match_challenge (opponent_player_id, state) where opponent_player_id is not null;
create index if not exists match_challenge_for_club
  on match_challenge (opponent_club_id, state) where opponent_club_id is not null;

alter table match_challenge enable row level security;
revoke all on table match_challenge from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Answering for a club
-- ---------------------------------------------------------------------------

-- Internal. A club speaks through its captain, and that is the only person who
-- can accept a match on its behalf — the same rule that governs entering a cup
-- or promising a share of a prize.
create or replace function club_speaks_for(p_club_id uuid, p_player_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from club c where c.id = p_club_id and c.captain_id = p_player_id);
$$;

revoke all on function club_speaks_for(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Issuing one
-- ---------------------------------------------------------------------------

create or replace function challenge_opponent(
  p_booking_id uuid,
  p_player_id  uuid default null,
  p_club_id    uuid default null,
  p_note       text default null
)
returns table (ok boolean, challenge_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_captain uuid;
  v_state   booking_state;
  v_ends    timestamptz;
  v_venue   text;
  v_when    timestamptz;
  v_tell    uuid;
  v_name    text;
  v_id      uuid;
begin
  select b.captain_id, b.state, upper(b.during), lower(b.during), v.name
    into v_captain, v_state, v_ends, v_when, v_venue
    from booking b
    join pitch p on p.id = b.pitch_id
    join venue v on v.id = p.venue_id
   where b.id = p_booking_id
     for update of b;

  if v_captain is null then
    return query select false, null::uuid, 'That booking no longer exists.';
    return;
  end if;

  if v_captain is distinct from auth.uid() then
    return query select false, null::uuid, 'Only the captain can call a match on.';
    return;
  end if;

  if v_state not in ('held', 'confirmed', 'checked_in') then
    return query select false, null::uuid, 'That booking is not on any more.';
    return;
  end if;

  -- Nobody can accept a match that has already been played.
  if v_ends <= now() then
    return query select false, null::uuid, 'That match has already been played.';
    return;
  end if;

  if (p_player_id is not null) = (p_club_id is not null) then
    return query select false, null::uuid, 'Name one opponent: a player or a club.';
    return;
  end if;

  if p_player_id = auth.uid() then
    return query select false, null::uuid, 'You cannot play yourself.';
    return;
  end if;

  if p_player_id is not null
     and not exists (select 1 from player_profile pp where pp.id = p_player_id) then
    return query select false, null::uuid, 'That player is not on X League.';
    return;
  end if;

  if p_club_id is not null then
    if not exists (select 1 from club c where c.id = p_club_id) then
      return query select false, null::uuid, 'That club no longer exists.';
      return;
    end if;
    if club_speaks_for(p_club_id, auth.uid()) then
      return query select false, null::uuid, 'You cannot play your own club.';
      return;
    end if;
  end if;

  if exists (
    select 1 from match_challenge mc
     where mc.booking_id = p_booking_id and mc.state in ('invited', 'accepted')
  ) then
    return query select false, null::uuid, 'This match already has an opponent.';
    return;
  end if;

  insert into match_challenge (booking_id, opponent_player_id, opponent_club_id, invited_by, note)
  values (p_booking_id, p_player_id, p_club_id, auth.uid(), nullif(btrim(p_note), ''))
  returning id into v_id;

  -- Who reads it: the player themselves, or the club's captain. A club with a
  -- captain who has since been deleted cannot be challenged usefully, and
  -- `notify` already ignores a null recipient rather than failing the call.
  if p_player_id is not null then
    v_tell := p_player_id;
  else
    select c.captain_id into v_tell from club c where c.id = p_club_id;
  end if;

  select coalesce(pp.display_name, 'A captain') into v_name
    from player_profile pp where pp.id = auth.uid();

  perform notify(
    v_tell,
    'challenge',
    v_name || ' wants to play you',
    to_char(v_when at time zone 'Africa/Cairo', 'FMDay FMDD Mon · FMHH12:MI AM') || ' at ' || v_venue,
    -- Not 'booking': the person reading this is the opponent, who is not on
    -- the booking and is refused by both the bookings list and the lobby.
    -- The challenges screen is the one surface they can actually act on.
    jsonb_build_object('screen', 'challenges', 'booking_id', p_booking_id, 'challenge_id', v_id)
  );

  insert into booking_event (booking_id, event, actor, detail)
  values (p_booking_id, 'Opponent challenged', current_actor(),
          jsonb_build_object('challenge_id', v_id,
                             'player_id', p_player_id,
                             'club_id', p_club_id));

  return query select true, v_id, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Answering one
-- ---------------------------------------------------------------------------

create or replace function respond_to_challenge(p_challenge_id uuid, p_accept boolean)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_booking uuid;
  v_state   challenge_state;
  v_player  uuid;
  v_club    uuid;
  v_captain uuid;
  v_ends    timestamptz;
  v_bstate  booking_state;
  v_who     text;
begin
  select mc.booking_id, mc.state, mc.opponent_player_id, mc.opponent_club_id
    into v_booking, v_state, v_player, v_club
    from match_challenge mc where mc.id = p_challenge_id for update;

  if v_booking is null then
    return query select false, 'That challenge no longer exists.';
    return;
  end if;

  if v_state <> 'invited' then
    return query select false, 'That challenge has already been answered.';
    return;
  end if;

  -- Entitled to answer: the player it was sent to, or the captain of the club
  -- it was sent to. Nobody else, including the club's other members.
  --
  -- The `coalesce` is the whole guard, not a tidy-up. On a challenge sent to a
  -- club, `v_player` is null, so `v_player = auth.uid()` is null rather than
  -- false; `null or false` is null; and `not null` is null, which is not true,
  -- so the `if` never fires and the refusal never happens. Written without it,
  -- any signed-in player could accept a match on behalf of a club they have
  -- nothing to do with. Three-valued logic reads as false everywhere it is
  -- tested by eye and as "carry on" everywhere it is tested by Postgres.
  if not coalesce(
       v_player = auth.uid()
       or (v_club is not null and club_speaks_for(v_club, auth.uid())),
     false) then
    return query select false, 'That challenge is not yours to answer.';
    return;
  end if;

  select b.captain_id, upper(b.during), b.state
    into v_captain, v_ends, v_bstate
    from booking b where b.id = v_booking;

  if v_bstate not in ('held', 'confirmed', 'checked_in') then
    return query select false, 'That match is off.';
    return;
  end if;

  if v_ends <= now() then
    return query select false, 'That match has already been played.';
    return;
  end if;

  update match_challenge
     set state = case when p_accept then 'accepted' else 'declined' end::challenge_state,
         responded_at = now()
   where id = p_challenge_id;

  select coalesce(c.name, pp.display_name, 'Your opponent') into v_who
    from match_challenge mc
    left join club c on c.id = mc.opponent_club_id
    left join player_profile pp on pp.id = mc.opponent_player_id
   where mc.id = p_challenge_id;

  perform notify(
    v_captain,
    case when p_accept then 'challenge_accepted' else 'challenge_declined' end,
    case when p_accept then v_who || ' is on' else v_who || ' cannot play' end,
    case when p_accept then null else 'Challenge somebody else and the hour is still yours.' end,
    jsonb_build_object('screen', 'lobby', 'booking_id', v_booking)
  );

  insert into booking_event (booking_id, event, actor, detail)
  values (v_booking,
          case when p_accept then 'Opponent accepted' else 'Opponent declined' end,
          current_actor(),
          jsonb_build_object('challenge_id', p_challenge_id));

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Taking one back
-- ---------------------------------------------------------------------------

-- Withdrawing covers both "I asked the wrong person" and "they said yes and
-- now it is off". The second is why this accepts an accepted challenge too:
-- an opponent who is no longer coming has to be removable, or the captain can
-- never challenge anybody else.
create or replace function withdraw_challenge(p_booking_id uuid)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_captain uuid;
  v_id      uuid;
  v_tell    uuid;
  v_name    text;
begin
  select b.captain_id into v_captain from booking b where b.id = p_booking_id;

  if v_captain is null then
    return query select false, 'That booking no longer exists.';
    return;
  end if;

  if v_captain is distinct from auth.uid() then
    return query select false, 'Only the captain can call a match off.';
    return;
  end if;

  select mc.id,
         coalesce(mc.opponent_player_id, (select c.captain_id from club c where c.id = mc.opponent_club_id))
    into v_id, v_tell
    from match_challenge mc
   where mc.booking_id = p_booking_id and mc.state in ('invited', 'accepted')
     for update;

  if v_id is null then
    return query select false, 'There is no opponent to call off.';
    return;
  end if;

  update match_challenge set state = 'withdrawn', responded_at = now() where id = v_id;

  select coalesce(pp.display_name, 'The captain') into v_name
    from player_profile pp where pp.id = auth.uid();

  perform notify(
    v_tell,
    'challenge_withdrawn',
    v_name || ' called the match off',
    null,
    jsonb_build_object('screen', 'challenges', 'booking_id', p_booking_id)
  );

  insert into booking_event (booking_id, event, actor, detail)
  values (p_booking_id, 'Opponent called off', current_actor(),
          jsonb_build_object('challenge_id', v_id));

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading it
-- ---------------------------------------------------------------------------

-- What the booking screen shows where it used to show nothing. Readable by
-- anybody on the booking — the squad needs to know who they are playing — and
-- by the opponent, who needs to see what they have been asked.
create or replace function booking_opponent(p_booking_id uuid)
returns table (
  challenge_id uuid,
  state        text,
  kind         text,
  opponent_id  uuid,
  display_name text,
  image_url    text,
  note         text,
  mine_to_answer boolean
)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from booking b
     where b.id = p_booking_id
       and (b.captain_id = auth.uid()
            or exists (select 1 from booking_participant bp
                        where bp.booking_id = b.id and bp.player_id = auth.uid())
            or exists (select 1 from match_challenge mc
                        where mc.booking_id = b.id
                          and (mc.opponent_player_id = auth.uid()
                               or (mc.opponent_club_id is not null
                                   and club_speaks_for(mc.opponent_club_id, auth.uid())))))
  ) then
    return;
  end if;

  return query
  select mc.id,
         mc.state::text,
         case when mc.opponent_club_id is not null then 'club' else 'player' end,
         coalesce(mc.opponent_club_id, mc.opponent_player_id),
         coalesce(c.name, pp.display_name),
         coalesce(c.crest_url, pp.photo_url),
         mc.note,
         mc.state = 'invited'
           and (mc.opponent_player_id = auth.uid()
                or (mc.opponent_club_id is not null and club_speaks_for(mc.opponent_club_id, auth.uid())))
    from match_challenge mc
    left join club c on c.id = mc.opponent_club_id
    left join player_profile pp on pp.id = mc.opponent_player_id
   where mc.booking_id = p_booking_id
     and mc.state in ('invited', 'accepted')
   limit 1;
end;
$$;

-- Everything waiting on this player's word, as themselves or as a club they
-- captain. The notification carries people here; this is what the screen reads.
create or replace function my_challenges()
returns table (
  challenge_id uuid,
  booking_id   uuid,
  as_club      text,
  from_name    text,
  venue_name   text,
  pitch_label  text,
  starts_at    timestamptz,
  note         text
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select mc.id,
         mc.booking_id,
         c.name,
         coalesce(pp.display_name, 'A captain'),
         v.name,
         p.label,
         lower(b.during),
         mc.note
    from match_challenge mc
    join booking b on b.id = mc.booking_id
    join pitch p on p.id = b.pitch_id
    join venue v on v.id = p.venue_id
    left join club c on c.id = mc.opponent_club_id
    left join player_profile pp on pp.id = mc.invited_by
   where mc.state = 'invited'
     and upper(b.during) > now()
     and b.state in ('held', 'confirmed', 'checked_in')
     and (mc.opponent_player_id = auth.uid()
          or (mc.opponent_club_id is not null and club_speaks_for(mc.opponent_club_id, auth.uid())))
   order by lower(b.during);
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- `create or replace` resets these, so they are restated every time rather
-- than assumed to have survived.
revoke all on function challenge_opponent(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function respond_to_challenge(uuid, boolean) from public, anon, authenticated;
revoke all on function withdraw_challenge(uuid) from public, anon, authenticated;
revoke all on function booking_opponent(uuid) from public, anon, authenticated;
revoke all on function my_challenges() from public, anon, authenticated;

grant execute on function challenge_opponent(uuid, uuid, uuid, text) to authenticated;
grant execute on function respond_to_challenge(uuid, boolean) to authenticated;
grant execute on function withdraw_challenge(uuid) to authenticated;
grant execute on function booking_opponent(uuid) to authenticated;
grant execute on function my_challenges() to authenticated;
