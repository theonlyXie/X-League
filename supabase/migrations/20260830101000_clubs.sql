-- Clubs: the thing that enters a league or a cup.
--
-- Deliberately not the same as a team. A team is who you are playing with on
-- Thursday — invite five friends, book an hour, done. A club is a standing
-- side with a name, a crest and a record: it enters competitions, it collects
-- trophies, and it is the row a league table points at. Conflating them would
-- mean every casual Thursday group appearing in a league table, and every club
-- being rebuilt each time somebody wanted a kickabout.
--
-- Two rules from the people who run this, and both matter to who may enter:
--
--   * the captain does not have to play. Plenty of sides are organised by
--     somebody who manages rather than turns out, so the captain's membership
--     carries no slot unless they ask for one, and a captain who does not play
--     does not count toward the squad.
--   * a club needs at least five starters and two substitutes before it can
--     enter anything. Seven playing members, not seven members.
--
-- Those two interact, which is the reason to state them together: a club of a
-- captain and six players looks like seven people and is not a squad.

create table club (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  crest_url  text,
  home_area  text,
  captain_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- One name, however it is capitalised. Two clubs called "Zamalek Boys" in a
-- league table is a table nobody can read.
create unique index club_name_unique on club (lower(name));
create index club_by_captain on club (captain_id);

alter table club enable row level security;
revoke all on table club from public, anon, authenticated;

/**
 * Who is in a club, and whether they play.
 *
 * `slot_kind` null means a member who does not take the field — the
 * non-playing captain, or a manager. It is nullable rather than a third value
 * in the enum because "not playing" is the absence of a slot, not a kind of
 * one, and every count of the squad is then `slot_kind is not null` rather
 * than a list of values to keep in step.
 */
create table club_membership (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references club(id) on delete cascade,
  player_id  uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'player' check (role in ('captain', 'player')),
  slot_kind  text check (slot_kind in ('starter', 'sub')),
  state      membership_state not null default 'invited',
  invited_by uuid references auth.users(id),
  joined_at  timestamptz,
  created_at timestamptz not null default now(),
  unique (club_id, player_id)
);

create index club_membership_by_player on club_membership (player_id, state);
create index club_membership_by_club on club_membership (club_id, state);

alter table club_membership enable row level security;
revoke all on table club_membership from public, anon, authenticated;

/** What a club has won. Populated when a competition is settled. */
create table club_honour (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references club(id) on delete cascade,
  tournament_id uuid references tournament(id) on delete set null,
  title         text not null,
  won_on        date not null default current_date,
  created_at    timestamptz not null default now()
);

create index club_honour_by_club on club_honour (club_id, won_on desc);

alter table club_honour enable row level security;
revoke all on table club_honour from public, anon, authenticated;

-- The squad minimum, in the table that holds this kind of number, so a
-- seven-a-side competition does not need a deployment to exist.
insert into policy_setting (key, value, description) values
  ('club_min_starters', 5, 'Starters a club needs before it may enter a competition.'),
  ('club_min_subs',     2, 'Substitutes a club needs before it may enter a competition.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

/** True when this person captains that club. Every write below asks first. */
create or replace function is_club_captain(p_club_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from club c where c.id = p_club_id and c.captain_id = auth.uid());
$$;

/**
 * Whether a club may enter anything, and what it is short of.
 *
 * Returns the shortfall rather than a bare false, because "not eligible" sends
 * a captain hunting through a member list to work out what is missing.
 */
create or replace function club_eligibility(p_club_id uuid)
returns table (starters integer, subs integer, playing integer, eligible boolean, reason text)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_starters integer;
  v_subs     integer;
  v_min_st   integer := policy_value('club_min_starters');
  v_min_sub  integer := policy_value('club_min_subs');
begin
  select count(*) filter (where m.slot_kind = 'starter'),
         count(*) filter (where m.slot_kind = 'sub')
    into v_starters, v_subs
    from club_membership m
   where m.club_id = p_club_id and m.state = 'active' and m.slot_kind is not null;

  return query select
    v_starters,
    v_subs,
    v_starters + v_subs,
    v_starters >= v_min_st and v_subs >= v_min_sub,
    case
      when v_starters >= v_min_st and v_subs >= v_min_sub then null
      when v_starters < v_min_st and v_subs < v_min_sub then
        format('Needs %s more starters and %s more substitutes.', v_min_st - v_starters, v_min_sub - v_subs)
      when v_starters < v_min_st then
        format('Needs %s more %s.', v_min_st - v_starters,
               case when v_min_st - v_starters = 1 then 'starter' else 'starters' end)
      else
        format('Needs %s more %s.', v_min_sub - v_subs,
               case when v_min_sub - v_subs = 1 then 'substitute' else 'substitutes' end)
    end;
end;
$$;

/** The clubs this person is in, captained or played for. */
create or replace function my_clubs()
returns table (
  club_id uuid, name text, crest_url text, home_area text,
  role text, slot_kind text, state membership_state,
  is_captain boolean, trophies integer, playing integer, eligible boolean
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select c.id, c.name, c.crest_url, c.home_area,
         m.role, m.slot_kind, m.state,
         c.captain_id = auth.uid(),
         (select count(*)::integer from club_honour h where h.club_id = c.id),
         e.playing, e.eligible
    from club_membership m
    join club c on c.id = m.club_id
    cross join lateral club_eligibility(c.id) e
   where m.player_id = auth.uid()
     and m.state in ('invited', 'active')
   order by c.name;
$$;

/** One club, for its own page. */
create or replace function club_detail(p_club_id uuid)
returns table (
  club_id uuid, name text, crest_url text, home_area text,
  captain_id uuid, captain_name text, captain_plays boolean,
  trophies integer, starters integer, subs integer, playing integer,
  eligible boolean, reason text
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select c.id, c.name, c.crest_url, c.home_area,
         c.captain_id,
         coalesce(p.display_name, 'Captain'),
         exists (select 1 from club_membership m
                  where m.club_id = c.id and m.player_id = c.captain_id
                    and m.state = 'active' and m.slot_kind is not null),
         (select count(*)::integer from club_honour h where h.club_id = c.id),
         e.starters, e.subs, e.playing, e.eligible, e.reason
    from club c
    left join player_profile p on p.id = c.captain_id
    cross join lateral club_eligibility(c.id) e
   where c.id = p_club_id;
$$;

/** Everyone in the club, in the order a team sheet reads. */
create or replace function club_squad(p_club_id uuid)
returns table (
  player_id uuid, display_name text, role text, slot_kind text,
  state membership_state, is_captain boolean, ovr smallint
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select m.player_id,
         coalesce(p.display_name, 'Player'),
         m.role, m.slot_kind, m.state,
         c.captain_id = m.player_id,
         -- Snapshots are append-only, so the card is the newest one and a join
         -- would return the player once per rating they have ever held.
         (select s.ovr from attribute_snapshot s
           where s.player_id = m.player_id
           order by s.seq desc limit 1)
    from club_membership m
    join club c on c.id = m.club_id
    left join player_profile p on p.id = m.player_id
   where m.club_id = p_club_id
     and m.state in ('invited', 'active')
   order by
     case m.slot_kind when 'starter' then 0 when 'sub' then 1 else 2 end,
     c.captain_id = m.player_id desc,
     coalesce(p.display_name, '');
$$;

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------

/**
 * Found a club. The founder captains it.
 *
 * `p_captain_slot` null leaves the captain managing rather than playing, which
 * is the default because it is the case the rule exists for. A captain who
 * does play passes 'starter' or 'sub' and is counted like anybody else.
 */
create or replace function create_club(
  p_name         text,
  p_home_area    text default null,
  p_captain_slot text default null
)
returns table (ok boolean, club_id uuid, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = 'insufficient_privilege';
  end if;

  if length(coalesce(trim(p_name), '')) < 2 then
    return query select false, null::uuid, 'A club needs a name.';
    return;
  end if;

  if p_captain_slot is not null and p_captain_slot not in ('starter', 'sub') then
    return query select false, null::uuid, 'A playing captain is a starter or a substitute.';
    return;
  end if;

  if exists (select 1 from club c where lower(c.name) = lower(trim(p_name))) then
    return query select false, null::uuid, 'A club already goes by that name.';
    return;
  end if;

  insert into club (name, home_area, captain_id)
  values (trim(p_name), nullif(trim(coalesce(p_home_area, '')), ''), auth.uid())
  returning id into v_id;

  insert into club_membership (club_id, player_id, role, slot_kind, state, joined_at)
  values (v_id, auth.uid(), 'captain', p_captain_slot, 'active', now());

  return query select true, v_id, null::text;
end;
$$;

/** The crest. Set once there is somewhere to upload it to. */
create or replace function set_club_crest(p_club_id uuid, p_url text)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
begin
  if not is_club_captain(p_club_id) then
    return query select false, 'Only the captain can change the crest.';
    return;
  end if;
  update club set crest_url = nullif(trim(coalesce(p_url, '')), '') where id = p_club_id;
  return query select true, null::text;
end;
$$;

/** Ask somebody to join, in a named slot. */
create or replace function invite_to_club(p_club_id uuid, p_player_id uuid, p_slot_kind text default 'starter')
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
begin
  if not is_club_captain(p_club_id) then
    return query select false, 'Only the captain can invite players.';
    return;
  end if;

  if p_slot_kind is not null and p_slot_kind not in ('starter', 'sub') then
    return query select false, 'A player is a starter or a substitute.';
    return;
  end if;

  if exists (select 1 from club_membership m
              where m.club_id = p_club_id and m.player_id = p_player_id
                and m.state in ('invited', 'active')) then
    return query select false, 'They are already in this club, or have been asked.';
    return;
  end if;

  insert into club_membership (club_id, player_id, role, slot_kind, state, invited_by)
  values (p_club_id, p_player_id, 'player', p_slot_kind, 'invited', auth.uid())
  on conflict (club_id, player_id) do update
    set state = 'invited', slot_kind = excluded.slot_kind, invited_by = auth.uid();

  perform notify(p_player_id, 'club_invite',
    format('You are invited to join %s', (select c.name from club c where c.id = p_club_id)),
    null, jsonb_build_object('screen', 'club', 'club_id', p_club_id));

  return query select true, null::text;
end;
$$;

/** Accept, or decline. The invitee's decision and nobody else's. */
create or replace function respond_to_club_invite(p_club_id uuid, p_accept boolean)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_found boolean;
begin
  update club_membership
     set state = case when p_accept then 'active'::membership_state else 'declined'::membership_state end,
         joined_at = case when p_accept then now() else joined_at end
   where club_id = p_club_id
     and player_id = auth.uid()
     and state = 'invited'
  returning true into v_found;

  if not coalesce(v_found, false) then
    return query select false, 'There is no open invitation for you here.';
    return;
  end if;

  return query select true, null::text;
end;
$$;

/**
 * Move somebody between starter and substitute, or off the team sheet.
 *
 * Null makes them a member who does not play — which is how a captain steps
 * back from the squad without leaving the club they run.
 */
create or replace function set_club_slot(p_club_id uuid, p_player_id uuid, p_slot_kind text)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
begin
  if not is_club_captain(p_club_id) then
    return query select false, 'Only the captain can pick the squad.';
    return;
  end if;

  if p_slot_kind is not null and p_slot_kind not in ('starter', 'sub') then
    return query select false, 'A player is a starter or a substitute.';
    return;
  end if;

  update club_membership set slot_kind = p_slot_kind
   where club_id = p_club_id and player_id = p_player_id and state = 'active';

  if not found then
    return query select false, 'They are not an active member of this club.';
    return;
  end if;

  return query select true, null::text;
end;
$$;

/** Remove a member. The captain cannot remove themselves. */
create or replace function remove_from_club(p_club_id uuid, p_player_id uuid)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
begin
  if not is_club_captain(p_club_id) then
    return query select false, 'Only the captain can remove players.';
    return;
  end if;

  if p_player_id = auth.uid() then
    return query select false, 'A captain cannot remove themselves. Hand the club over first.';
    return;
  end if;

  update club_membership set state = 'removed'
   where club_id = p_club_id and player_id = p_player_id and state in ('invited', 'active');

  if not found then
    return query select false, 'They are not in this club.';
    return;
  end if;

  return query select true, null::text;
end;
$$;

/** Leave. Not available to the captain, who would leave the club headless. */
create or replace function leave_club(p_club_id uuid)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
begin
  if is_club_captain(p_club_id) then
    return query select false, 'Hand the club to somebody else before leaving it.';
    return;
  end if;

  update club_membership set state = 'left'
   where club_id = p_club_id and player_id = auth.uid() and state in ('invited', 'active');

  if not found then
    return query select false, 'You are not in this club.';
    return;
  end if;

  return query select true, null::text;
end;
$$;

/** Hand the club over. The new captain must already be an active member. */
create or replace function hand_over_club(p_club_id uuid, p_player_id uuid)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
begin
  if not is_club_captain(p_club_id) then
    return query select false, 'Only the captain can hand the club over.';
    return;
  end if;

  if not exists (select 1 from club_membership m
                  where m.club_id = p_club_id and m.player_id = p_player_id and m.state = 'active') then
    return query select false, 'They are not an active member of this club.';
    return;
  end if;

  update club set captain_id = p_player_id where id = p_club_id;
  update club_membership set role = 'player' where club_id = p_club_id and role = 'captain';
  update club_membership set role = 'captain' where club_id = p_club_id and player_id = p_player_id;

  perform notify(p_player_id, 'club_handover',
    format('You now captain %s', (select c.name from club c where c.id = p_club_id)),
    null, jsonb_build_object('screen', 'club', 'club_id', p_club_id));

  return query select true, null::text;
end;
$$;

revoke execute on function public.is_club_captain(uuid) from public, anon, authenticated;

revoke execute on function public.club_eligibility(uuid) from public, anon;
grant execute on function public.club_eligibility(uuid) to authenticated;
revoke execute on function public.my_clubs() from public, anon;
grant execute on function public.my_clubs() to authenticated;
revoke execute on function public.club_detail(uuid) from public, anon;
grant execute on function public.club_detail(uuid) to authenticated;
revoke execute on function public.club_squad(uuid) from public, anon;
grant execute on function public.club_squad(uuid) to authenticated;
revoke execute on function public.create_club(text, text, text) from public, anon;
grant execute on function public.create_club(text, text, text) to authenticated;
revoke execute on function public.set_club_crest(uuid, text) from public, anon;
grant execute on function public.set_club_crest(uuid, text) to authenticated;
revoke execute on function public.invite_to_club(uuid, uuid, text) from public, anon;
grant execute on function public.invite_to_club(uuid, uuid, text) to authenticated;
revoke execute on function public.respond_to_club_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_to_club_invite(uuid, boolean) to authenticated;
revoke execute on function public.set_club_slot(uuid, uuid, text) from public, anon;
grant execute on function public.set_club_slot(uuid, uuid, text) to authenticated;
revoke execute on function public.remove_from_club(uuid, uuid) from public, anon;
grant execute on function public.remove_from_club(uuid, uuid) to authenticated;
revoke execute on function public.leave_club(uuid) from public, anon;
grant execute on function public.leave_club(uuid) to authenticated;
revoke execute on function public.hand_over_club(uuid, uuid) from public, anon;
grant execute on function public.hand_over_club(uuid, uuid) to authenticated;

-- `is_club_captain` is an internal: every club write asks it who is calling, and
-- nothing outside the schema should be able to. Revoking it above is half the
-- job — the other half is putting it on the list `unexpected_grants()` watches,
-- so that a later `create or replace` handing it back to `authenticated` (which
-- resets grants, silently) fails the suite instead of shipping.
create or replace function unexpected_grants()
returns table (function_name text, reachable_by text)
language sql stable
set search_path = public, pg_temp as $$
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         case when has_function_privilege('anon', p.oid, 'execute') then 'anon'
              else 'authenticated' end
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and p.proname not like 'gbt%'
     and p.proname not like 'gbtreekey%'
     and p.proname not like '%\_dist'
     and p.proname in (
       'rebuild_card', 'award_match_points', 'verify_match_if_ready', 'notify',
       'write_audit', 'rebuild_standings', 'player_standing', 'policy_value',
       'venue_of_pitch', 'current_actor', 'expire_stale_holds',
       'generate_booking_code', 'refresh_venue_rating', 'seed_captain_participant',
       'seed_deposit_obligation', 'notify_participant_change', 'touch_booking',
       'card_confidence', 'compute_ovr', 'self_assessment_weight',
       'level_for_xp', 'points_for', 'known_attribute', 'distance_km',
       'format_capacity',
       'staff_email', 'staff_user_id', 'new_recovery_code', 'issue_recovery_code',
       'is_club_captain'
     )
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
   order by 1;
$$;

revoke execute on function public.unexpected_grants() from public, anon, authenticated;
