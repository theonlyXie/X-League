-- X League — teams, squads and invitations.
--
-- A booking has been a transaction between one player and one venue. The lobby
-- screen (P-13) drew a squad of five with sub slots open, and every one of those
-- faces was a fixture, because there was nowhere to put a person: no table said
-- who else was playing.
--
-- §7.1's Team, TeamMembership and BookingParticipant are that missing middle.
-- The rule that shapes them: a squad place is a *claim on inventory the captain
-- already paid for*, so capacity is enforced in the database exactly like pitch
-- occupancy is, and an invitation is a row with a state rather than a message
-- that may or may not have been read.

-- ---------------------------------------------------------------------------
-- Teams (§7.1 Team, TeamMembership)
-- ---------------------------------------------------------------------------

create table if not exists team (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- TEAM-002: a team belongs to whoever founded it until they hand it on.
  captain_id  uuid not null references auth.users(id) on delete cascade,
  home_area   text,
  crest_hue   smallint check (crest_hue between 0 and 360),
  created_at  timestamptz not null default now()
);

create index if not exists team_captain_idx on team (captain_id);

do $$ begin
  create type membership_state as enum ('invited', 'active', 'declined', 'left', 'removed');
exception when duplicate_object then null;
end $$;

create table if not exists team_membership (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references team(id) on delete cascade,
  player_id  uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'player' check (role in ('captain', 'player')),
  state      membership_state not null default 'invited',
  invited_by uuid references auth.users(id) on delete set null,
  joined_at  timestamptz,
  created_at timestamptz not null default now(),
  -- TEAM-004: one row per person per team. Rejoining moves the state back,
  -- it does not stack a second membership.
  unique (team_id, player_id)
);

create index if not exists team_membership_player_idx
  on team_membership (player_id) where state = 'active';

-- ---------------------------------------------------------------------------
-- Squads (§7.1 BookingParticipant)
-- ---------------------------------------------------------------------------

do $$ begin
  create type participant_state as enum ('invited', 'accepted', 'declined', 'withdrawn', 'removed');
exception when duplicate_object then null;
end $$;

-- BKG-013 / P-07: who is actually playing. A guest with no account is allowed
-- a place — five-a-side is full of them — which is why `player_id` is nullable
-- and a display name is always present.
create table if not exists booking_participant (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references booking(id) on delete cascade,
  player_id   uuid references auth.users(id) on delete cascade,
  display_name text not null,
  -- A starter or one of the subs the lobby counts separately.
  slot_kind   text not null default 'starter' check (slot_kind in ('starter', 'sub')),
  position    text check (position in ('GK', 'DEF', 'MID', 'FWD')),
  state       participant_state not null default 'invited',
  invited_by  uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at  timestamptz not null default now()
);

-- One place per person per booking. Guests are exempt (their player_id is
-- null), so a partial unique index rather than a table constraint.
create unique index if not exists booking_participant_unique_player
  on booking_participant (booking_id, player_id) where player_id is not null;

create index if not exists booking_participant_booking_idx on booking_participant (booking_id);
create index if not exists booking_participant_player_idx
  on booking_participant (player_id) where state in ('invited', 'accepted');

-- ---------------------------------------------------------------------------
-- Capacity
-- ---------------------------------------------------------------------------

-- The squad sizes the product actually sells. Parsed from the pitch format
-- rather than hardcoded at every call site, so adding 7-a-side is one row of
-- this function and not a search across the codebase.
create or replace function format_capacity(p_format text)
returns table (starters integer, subs integer)
language sql immutable
set search_path = public, pg_temp as $$
  select case p_format
           when '5-a-side' then 5
           when '7-a-side' then 7
           when '11-a-side' then 11
           else 5
         end,
         case p_format
           when '11-a-side' then 5
           when '7-a-side' then 3
           else 2
         end;
$$;

-- ---------------------------------------------------------------------------
-- The captain is always in their own squad
-- ---------------------------------------------------------------------------

-- Confirming a booking makes its captain the first accepted starter. Done as a
-- trigger rather than inside confirm_booking so that every route into the
-- confirmed state — the app, a staff entry that names a captain, a future
-- import — produces the same squad, and so that confirm_booking's own logic
-- stays about the hold.
create or replace function seed_captain_participant() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
declare
  v_name text;
begin
  if new.captain_id is null then
    return null;
  end if;
  if new.state not in ('confirmed', 'checked_in', 'completed') then
    return null;
  end if;

  select coalesce(new.captain_name, pp.display_name, 'Captain') into v_name
    from player_profile pp where pp.id = new.captain_id;

  insert into booking_participant (booking_id, player_id, display_name, slot_kind,
                                   state, invited_by, responded_at)
  values (new.id, new.captain_id, coalesce(v_name, 'Captain'), 'starter',
          'accepted', new.captain_id, now())
  on conflict (booking_id, player_id) where player_id is not null
  do nothing;

  return null;
end;
$$;

drop trigger if exists booking_seed_captain on booking;
create trigger booking_seed_captain
  after insert or update of state on booking
  for each row execute function seed_captain_participant();

-- ---------------------------------------------------------------------------
-- Reading a squad
-- ---------------------------------------------------------------------------

-- Who may see a squad: the captain, anyone holding a place in it, and staff at
-- the venue hosting it. RBAC-006 — nobody else learns who is playing.
create or replace function can_see_squad(p_booking_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from booking b
     where b.id = p_booking_id
       and (
         b.captain_id = auth.uid()
         or is_venue_staff(venue_of_pitch(b.pitch_id))
         or exists (
           select 1 from booking_participant bp
            where bp.booking_id = b.id
              and bp.player_id = auth.uid()
              and bp.state in ('invited', 'accepted')
         )
       )
  );
$$;

-- P-13's roster, plus the counts the header reads.
create or replace function booking_squad(p_booking_id uuid)
returns table (
  participant_id uuid,
  player_id      uuid,
  display_name   text,
  slot_kind      text,
  -- `position` is reserved in a RETURNS TABLE list, hence position_code —
  -- the same rename submit_self_assessment already carries.
  position_code  text,
  state          participant_state,
  is_captain     boolean,
  ovr            smallint
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not can_see_squad(p_booking_id) then
    raise exception 'You are not part of that match.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select bp.id, bp.player_id, bp.display_name, bp.slot_kind, bp.position, bp.state,
         bp.player_id is not distinct from b.captain_id,
         -- The card as it stood at read time. A squad list showing ratings is
         -- the point of the lobby, and it comes from the same snapshot table
         -- the player's own card reads.
         (select s.ovr from attribute_snapshot s
           where s.player_id = bp.player_id
           order by s.seq desc limit 1)
    from booking_participant bp
    join booking b on b.id = bp.booking_id
   where bp.booking_id = p_booking_id
     and bp.state in ('invited', 'accepted')
   order by (bp.player_id is not distinct from b.captain_id) desc,
            bp.slot_kind, bp.created_at;
end;
$$;

-- The lobby header: "4 of 5 confirmed · 2 sub slots open" without the client
-- counting rows it may only partly have.
create or replace function squad_counts(p_booking_id uuid)
returns table (
  accepted_starters integer,
  starter_capacity  integer,
  accepted_subs     integer,
  sub_capacity      integer,
  pending           integer
)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_format text;
  v_start  integer;
  v_subs   integer;
begin
  if not can_see_squad(p_booking_id) then
    raise exception 'You are not part of that match.' using errcode = 'insufficient_privilege';
  end if;

  select p.format into v_format
    from booking b join pitch p on p.id = b.pitch_id
   where b.id = p_booking_id;

  select fc.starters, fc.subs into v_start, v_subs from format_capacity(v_format) fc;

  return query
  select
    count(*) filter (where bp.state = 'accepted' and bp.slot_kind = 'starter')::integer,
    v_start,
    count(*) filter (where bp.state = 'accepted' and bp.slot_kind = 'sub')::integer,
    v_subs,
    count(*) filter (where bp.state = 'invited')::integer
  from booking_participant bp
  where bp.booking_id = p_booking_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inviting
-- ---------------------------------------------------------------------------

-- P-07 / BKG-013. Only the captain fills their squad, capacity is checked
-- against the format rather than assumed, and an invitation that would overfill
-- the pitch is refused here rather than discovered at the gate.
create or replace function invite_to_booking(
  p_booking_id uuid,
  p_player_id  uuid default null,
  p_guest_name text default null,
  p_slot_kind  text default 'starter',
  p_position   text default null
)
returns table (ok boolean, participant_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_captain uuid;
  v_state   booking_state;
  v_format  text;
  v_cap     integer;
  v_taken   integer;
  v_name    text;
  v_id      uuid;
begin
  select b.captain_id, b.state, p.format into v_captain, v_state, v_format
    from booking b join pitch p on p.id = b.pitch_id
   where b.id = p_booking_id;

  if v_captain is null and v_state is null then
    return query select false, null::uuid, 'That booking no longer exists.';
    return;
  end if;

  if v_captain is distinct from auth.uid() then
    return query select false, null::uuid, 'Only the captain can invite players.';
    return;
  end if;

  if v_state not in ('confirmed', 'checked_in') then
    return query select false, null::uuid, 'Confirm the booking before inviting your squad.';
    return;
  end if;

  if p_slot_kind not in ('starter', 'sub') then
    return query select false, null::uuid, 'A place is either a starter or a sub.';
    return;
  end if;

  if p_player_id is null and nullif(btrim(coalesce(p_guest_name, '')), '') is null then
    return query select false, null::uuid, 'Name the player you are inviting.';
    return;
  end if;

  -- Capacity, per slot kind. Invited places count: a pending invitation is
  -- holding that shirt, exactly as a hold holds a pitch-hour.
  select case when p_slot_kind = 'starter' then fc.starters else fc.subs end
    into v_cap
    from format_capacity(v_format) fc;

  select count(*)::integer into v_taken
    from booking_participant bp
   where bp.booking_id = p_booking_id
     and bp.slot_kind = p_slot_kind
     and bp.state in ('invited', 'accepted');

  if v_taken >= v_cap then
    return query select false, null::uuid,
      case when p_slot_kind = 'starter'
           then 'The starting five is full.'
           else 'Both sub places are taken.' end;
    return;
  end if;

  if p_player_id is not null then
    select pp.display_name into v_name from player_profile pp where pp.id = p_player_id;
    if v_name is null then
      return query select false, null::uuid, 'That player does not have an X League account.';
      return;
    end if;

    -- Re-inviting somebody who declined is allowed; inviting them twice is not.
    if exists (
      select 1 from booking_participant bp
       where bp.booking_id = p_booking_id and bp.player_id = p_player_id
         and bp.state in ('invited', 'accepted')
    ) then
      return query select false, null::uuid, 'They are already in this squad.';
      return;
    end if;

    insert into booking_participant (booking_id, player_id, display_name, slot_kind,
                                     position, state, invited_by)
    values (p_booking_id, p_player_id, v_name, p_slot_kind, p_position, 'invited', auth.uid())
    on conflict (booking_id, player_id) where player_id is not null
    do update set state = 'invited', slot_kind = excluded.slot_kind,
                  position = excluded.position, invited_by = excluded.invited_by,
                  responded_at = null
    returning id into v_id;
  else
    -- A guest has no account to accept with, so their place is taken as given.
    insert into booking_participant (booking_id, display_name, slot_kind, position,
                                     state, invited_by, responded_at)
    values (p_booking_id, btrim(p_guest_name), p_slot_kind, p_position,
            'accepted', auth.uid(), now())
    returning id into v_id;
  end if;

  insert into booking_event (booking_id, event, actor, detail)
  values (p_booking_id, 'Squad place offered', current_actor(),
          jsonb_build_object('slot_kind', p_slot_kind,
                             'to', coalesce(v_name, btrim(p_guest_name))));

  return query select true, v_id, null::text;
end;
$$;

-- The invited person answers for themselves. Nobody answers on their behalf,
-- including the captain — that is what makes "4 of 5 confirmed" mean anything.
create or replace function respond_to_invitation(p_participant_id uuid, p_accept boolean)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_player  uuid;
  v_state   participant_state;
  v_booking uuid;
begin
  select bp.player_id, bp.state, bp.booking_id
    into v_player, v_state, v_booking
    from booking_participant bp where bp.id = p_participant_id for update;

  if v_player is null then
    return query select false, 'That invitation no longer exists.';
    return;
  end if;

  if v_player is distinct from auth.uid() then
    return query select false, 'That invitation is not yours.';
    return;
  end if;

  if v_state <> 'invited' then
    return query select false, 'You have already answered that invitation.';
    return;
  end if;

  update booking_participant
     set state = case when p_accept then 'accepted' else 'declined' end::participant_state,
         responded_at = now()
   where id = p_participant_id;

  insert into booking_event (booking_id, event, actor, detail)
  values (v_booking,
          case when p_accept then 'Squad place accepted' else 'Squad place declined' end,
          current_actor(), '{}'::jsonb);

  return query select true, null::text;
end;
$$;

-- Leaving after accepting. Distinct from declining, because the squad list has
-- to be able to say a place opened back up rather than was never taken.
create or replace function leave_booking(p_booking_id uuid)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_captain uuid;
  v_rows    integer;
begin
  select b.captain_id into v_captain from booking b where b.id = p_booking_id;

  if v_captain is distinct from auth.uid() then
    update booking_participant
       set state = 'withdrawn', responded_at = now()
     where booking_id = p_booking_id
       and player_id = auth.uid()
       and state in ('invited', 'accepted');
    get diagnostics v_rows = row_count;

    if v_rows = 0 then
      return query select false, 'You do not have a place in that match.';
      return;
    end if;

    insert into booking_event (booking_id, event, actor, detail)
    values (p_booking_id, 'Squad place given up', current_actor(), '{}'::jsonb);
    return query select true, null::text;
    return;
  end if;

  -- A captain leaving would orphan the booking they are paying for, so this
  -- refuses and points at the action that actually exists.
  return query select false, 'You are the captain — cancel the booking instead.';
end;
$$;

-- The captain removing somebody. Separate from the player leaving so the audit
-- log can tell the two apart.
create or replace function remove_participant(p_participant_id uuid)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_booking uuid;
  v_captain uuid;
  v_player  uuid;
begin
  select bp.booking_id, bp.player_id into v_booking, v_player
    from booking_participant bp where bp.id = p_participant_id;

  if v_booking is null then
    return query select false, 'That place no longer exists.';
    return;
  end if;

  select b.captain_id into v_captain from booking b where b.id = v_booking;

  if v_captain is distinct from auth.uid() then
    return query select false, 'Only the captain can change the squad.';
    return;
  end if;

  if v_player is not distinct from v_captain and v_player is not null then
    return query select false, 'You cannot remove yourself from your own booking.';
    return;
  end if;

  update booking_participant set state = 'removed', responded_at = now()
   where id = p_participant_id;

  insert into booking_event (booking_id, event, actor, detail)
  values (v_booking, 'Squad place withdrawn by captain', current_actor(), '{}'::jsonb);

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- What Home shows (P-02's invitation card)
-- ---------------------------------------------------------------------------

create or replace function my_invitations()
returns table (
  participant_id uuid,
  booking_id     uuid,
  starts_at      timestamptz,
  venue_name     text,
  area           text,
  pitch_label    text,
  slot_kind      text,
  position_code  text,
  from_name      text,
  price_egp      integer
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select bp.id, b.id, lower(b.during), v.name, v.area, p.label,
         bp.slot_kind, bp.position,
         coalesce(inviter.display_name, b.captain_name, 'A captain'),
         b.price_egp
    from booking_participant bp
    join booking b on b.id = bp.booking_id
    join pitch p on p.id = b.pitch_id
    join venue v on v.id = p.venue_id
    left join player_profile inviter on inviter.id = bp.invited_by
   where bp.player_id = auth.uid()
     and bp.state = 'invited'
     and upper(b.during) > now()
     and b.state in ('confirmed', 'checked_in')
   order by lower(b.during);
$$;

-- Matches the player is in but did not book — so Home can show "tonight" for a
-- squad member, not only for the captain who paid.
create or replace function my_squad_matches(p_limit integer default 10)
returns table (
  booking_id  uuid,
  starts_at   timestamptz,
  venue_name  text,
  area        text,
  pitch_label text,
  slot_kind   text,
  is_captain  boolean
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select b.id, lower(b.during), v.name, v.area, p.label, bp.slot_kind,
         b.captain_id is not distinct from auth.uid()
    from booking_participant bp
    join booking b on b.id = bp.booking_id
    join pitch p on p.id = b.pitch_id
    join venue v on v.id = p.venue_id
   where bp.player_id = auth.uid()
     and bp.state = 'accepted'
     and upper(b.during) > now()
     and b.state in ('confirmed', 'checked_in')
   order by lower(b.during)
   limit greatest(1, least(p_limit, 50));
$$;

-- ---------------------------------------------------------------------------
-- Finding somebody to invite (P-11)
-- ---------------------------------------------------------------------------

-- PRO-006: a player is searchable by everyone, by their connections only, or by
-- nobody. "Connections" is not a friends list the product does not have — it is
-- the honest version of it: people you have shared a team or a pitch with.
--
-- NFR-PRIV-003: the phone number never appears here, whatever the visibility.
create or replace function find_players(p_query text, p_limit integer default 20)
returns table (
  player_id    uuid,
  display_name text,
  preferred_area text,
  ovr          smallint,
  position_code text
)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_q   text := btrim(coalesce(p_query, ''));
begin
  if v_uid is null then
    raise exception 'Sign in to search for players.' using errcode = 'insufficient_privilege';
  end if;
  if length(v_q) < 2 then
    return;
  end if;

  return query
  select pp.id, pp.display_name, pp.preferred_area,
         s.ovr, s.position
    from player_profile pp
    left join lateral (
      select a.ovr, a.position from attribute_snapshot a
       where a.player_id = pp.id order by a.seq desc limit 1
    ) s on true
   where pp.id <> v_uid
     and pp.display_name ilike '%' || v_q || '%'
     and (
       pp.visibility = 'everyone'
       or (pp.visibility = 'connections' and (
            exists (
              select 1 from team_membership m1
                join team_membership m2 on m2.team_id = m1.team_id
               where m1.player_id = v_uid and m1.state = 'active'
                 and m2.player_id = pp.id and m2.state = 'active'
            )
            or exists (
              select 1 from booking_participant b1
                join booking_participant b2 on b2.booking_id = b1.booking_id
               where b1.player_id = v_uid and b1.state = 'accepted'
                 and b2.player_id = pp.id and b2.state = 'accepted'
            )
          ))
     )
   order by pp.display_name
   limit greatest(1, least(p_limit, 50));
end;
$$;

-- ---------------------------------------------------------------------------
-- Teams (P-10)
-- ---------------------------------------------------------------------------

create or replace function create_team(p_name text, p_home_area text default null, p_crest_hue integer default null)
returns table (ok boolean, team_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    return query select false, null::uuid, 'Sign in to start a team.';
    return;
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then
    return query select false, null::uuid, 'Give the team a name.';
    return;
  end if;

  insert into team (name, captain_id, home_area, crest_hue)
  values (btrim(p_name), v_uid, p_home_area, p_crest_hue::smallint)
  returning id into v_id;

  insert into team_membership (team_id, player_id, role, state, invited_by, joined_at)
  values (v_id, v_uid, 'captain', 'active', v_uid, now());

  return query select true, v_id, null::text;
end;
$$;

create or replace function invite_to_team(p_team_id uuid, p_player_id uuid)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_captain uuid;
begin
  select t.captain_id into v_captain from team t where t.id = p_team_id;

  if v_captain is null then
    return query select false, 'That team no longer exists.';
    return;
  end if;
  if v_captain is distinct from auth.uid() then
    return query select false, 'Only the captain can invite players.';
    return;
  end if;
  if not exists (select 1 from player_profile where id = p_player_id) then
    return query select false, 'That player does not have an X League account.';
    return;
  end if;

  insert into team_membership (team_id, player_id, state, invited_by)
  values (p_team_id, p_player_id, 'invited', auth.uid())
  on conflict (team_id, player_id) do update
    set state = (case when team_membership.state = 'active' then 'active' else 'invited' end)::membership_state,
        invited_by = excluded.invited_by;

  return query select true, null::text;
end;
$$;

create or replace function respond_to_team_invite(p_team_id uuid, p_accept boolean)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_rows integer;
begin
  update team_membership
     set state = case when p_accept then 'active' else 'declined' end::membership_state,
         joined_at = case when p_accept then now() else null end
   where team_id = p_team_id
     and player_id = auth.uid()
     and state = 'invited';
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return query select false, 'You have no open invitation to that team.';
    return;
  end if;
  return query select true, null::text;
end;
$$;

create or replace function my_teams()
returns table (
  team_id   uuid,
  name      text,
  home_area text,
  crest_hue smallint,
  role      text,
  state     membership_state,
  members   integer
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select t.id, t.name, t.home_area, t.crest_hue, m.role, m.state,
         (select count(*)::integer from team_membership x
           where x.team_id = t.id and x.state = 'active')
    from team_membership m
    join team t on t.id = m.team_id
   where m.player_id = auth.uid()
     and m.state in ('active', 'invited')
   order by (m.state = 'invited') desc, t.name;
$$;

create or replace function team_roster(p_team_id uuid)
returns table (
  player_id    uuid,
  display_name text,
  role         text,
  state        membership_state,
  ovr          smallint,
  position_code text
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  -- Only members read a roster (RBAC-006).
  if not exists (
    select 1 from team_membership m
     where m.team_id = p_team_id and m.player_id = auth.uid()
       and m.state in ('active', 'invited')
  ) then
    raise exception 'You are not a member of that team.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select m.player_id, pp.display_name, m.role, m.state, s.ovr, s.position
    from team_membership m
    join player_profile pp on pp.id = m.player_id
    left join lateral (
      select a.ovr, a.position from attribute_snapshot a
       where a.player_id = m.player_id order by a.seq desc limit 1
    ) s on true
   where m.team_id = p_team_id
     and m.state in ('active', 'invited')
   order by (m.role = 'captain') desc, pp.display_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

alter table team                enable row level security;
alter table team_membership     enable row level security;
alter table booking_participant enable row level security;

alter function public.seed_captain_participant() set search_path = public, pg_temp;

grant execute on function public.format_capacity(text)                        to anon, authenticated;

grant execute on function public.can_see_squad(uuid)                          to authenticated;
grant execute on function public.booking_squad(uuid)                          to authenticated;
grant execute on function public.squad_counts(uuid)                           to authenticated;
grant execute on function public.invite_to_booking(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.respond_to_invitation(uuid, boolean)         to authenticated;
grant execute on function public.leave_booking(uuid)                          to authenticated;
grant execute on function public.remove_participant(uuid)                     to authenticated;
grant execute on function public.my_invitations()                             to authenticated;
grant execute on function public.my_squad_matches(integer)                    to authenticated;
grant execute on function public.find_players(text, integer)                  to authenticated;
grant execute on function public.create_team(text, text, integer)             to authenticated;
grant execute on function public.invite_to_team(uuid, uuid)                   to authenticated;
grant execute on function public.respond_to_team_invite(uuid, boolean)        to authenticated;
grant execute on function public.my_teams()                                   to authenticated;
grant execute on function public.team_roster(uuid)                            to authenticated;

comment on table public.booking_participant is
  'Squad places. A pending invitation occupies a shirt the way a hold occupies a pitch-hour, so capacity is checked before an invitation is issued rather than at the gate.';
