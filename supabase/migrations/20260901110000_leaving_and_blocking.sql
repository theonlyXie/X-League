-- The two things a store will not ship an app without.
--
-- 1. An account that can be created and never deleted. Apple has required
--    in-app deletion since 2022 and Play wants a route to it from the listing
--    as well. There was nothing anywhere in this schema that removed a person.
--
-- 2. A chat with no way to block anybody. The app has three kinds of room now,
--    and the rule for user-generated content asks for a filter, a report, a
--    block, and a way to reach a human. Reporting existed and was wired to one
--    screen; blocking did not exist at all.

-- ---------------------------------------------------------------------------
-- Leaving
-- ---------------------------------------------------------------------------

/**
 * Delete this account.
 *
 * A real delete, not a flag. Every foreign key in this schema already says what
 * should happen to a row when its person goes: their own things cascade, and
 * the places where somebody *else's* record depends on them — a message in a
 * room other people are still reading, an audit entry, the captain recorded
 * against a booking that happened — are `on delete set null`, so the record
 * survives without the identity. That graph was built carefully; this function
 * trusts it rather than second-guessing it row by row.
 *
 * Two refusals, and both are honest rather than protective. A club captain and
 * a venue's only owner are load-bearing for other people: `club.captain_id` is
 * `on delete restrict` precisely so a squad cannot lose the person who runs it
 * to somebody tidying up their phone. Hand it over first, and then leave.
 */
create or replace function delete_my_account()
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_me   uuid := auth.uid();
  v_club text;
  v_venue text;
begin
  if v_me is null then
    return query select false, 'Sign in first.';
    return;
  end if;

  select c.name into v_club
    from club c
   where c.captain_id = v_me
     and exists (
       select 1 from club_membership m
        where m.club_id = c.id and m.player_id <> v_me and m.state = 'active'
     )
   limit 1;

  if v_club is not null then
    return query select false,
      format('You captain %s. Hand the club to somebody else before you leave.', v_club);
    return;
  end if;

  select v.name into v_venue
    from venue_staff vs
    join venue v on v.id = vs.venue_id
   where vs.user_id = v_me and vs.active and vs.role = 'owner'
     and not exists (
       select 1 from venue_staff other
        where other.venue_id = vs.venue_id and other.user_id <> v_me
          and other.active and other.role = 'owner'
     )
   limit 1;

  if v_venue is not null then
    return query select false,
      format('You are the only owner of %s. Add another owner before you leave.', v_venue);
    return;
  end if;

  -- Written before the rows go, and it survives: `audit_log.actor_id` is
  -- `on delete set null`, and the actor's name is already stored as text.
  perform write_audit('account.deleted', 'player', v_me, '{}'::jsonb);

  delete from auth.users where id = v_me;

  return query select true, null::text;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Blocking
-- ---------------------------------------------------------------------------

create table if not exists player_block (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_blocking_yourself check (blocker_id <> blocked_id)
);

create index if not exists player_block_by_blocked on player_block (blocked_id);

alter table player_block enable row level security;
revoke all on table player_block from public, anon, authenticated;

comment on table player_block is
  'One person refusing to hear another. Symmetric in effect and one-sided in
   record: the blocked person is never told, which is the point.';

create or replace function is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from player_block b
     where (b.blocker_id = p_a and b.blocked_id = p_b)
        or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

create or replace function block_player(p_player_id uuid)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return query select false, 'Sign in first.';
    return;
  end if;
  if p_player_id = v_me then
    return query select false, 'You cannot block yourself.';
    return;
  end if;
  if not exists (select 1 from player_profile p where p.id = p_player_id) then
    return query select false, 'That player does not exist.';
    return;
  end if;

  insert into player_block (blocker_id, blocked_id)
  values (v_me, p_player_id)
  on conflict do nothing;

  return query select true, null::text;
end;
$$;

create or replace function unblock_player(p_player_id uuid)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    return query select false, 'Sign in first.';
    return;
  end if;
  delete from player_block
   where blocker_id = auth.uid() and blocked_id = p_player_id;
  return query select true, null::text;
end;
$$;

/** Who this person has blocked, so the account screen can undo it. */
create or replace function my_blocks()
returns table (player_id uuid, display_name text, photo_url text, since timestamptz)
language sql stable security definer
set search_path = public, pg_temp as $$
  select b.blocked_id, coalesce(p.display_name, 'Someone'), p.photo_url, b.created_at
    from player_block b
    left join player_profile p on p.id = b.blocked_id
   where b.blocker_id = auth.uid()
   order by b.created_at desc;
$$;

revoke execute on function public.block_player(uuid) from public, anon;
revoke execute on function public.unblock_player(uuid) from public, anon;
revoke execute on function public.my_blocks() from public, anon;
grant execute on function public.block_player(uuid) to authenticated;
grant execute on function public.unblock_player(uuid) to authenticated;
grant execute on function public.my_blocks() to authenticated;

/** Silence a room without leaving it. The column has been here unused. */
create or replace function mute_conversation(p_conversation_id uuid, p_muted boolean)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
begin
  if not is_conversation_member(p_conversation_id) then
    return query select false, 'You are not in that conversation.';
    return;
  end if;
  update conversation_member
     set muted = coalesce(p_muted, false)
   where conversation_id = p_conversation_id and player_id = auth.uid();
  return query select true, null::text;
end;
$$;

revoke execute on function public.mute_conversation(uuid, boolean) from public, anon;
grant execute on function public.mute_conversation(uuid, boolean) to authenticated;

-- A blocked person's messages simply are not there for the person who blocked
-- them. Leaving them in place behind a "(blocked)" label keeps the abuse on
-- screen as a taunt, which is not what anybody pressing block is asking for.
create or replace function conversation_messages(
  p_conversation_id uuid,
  p_limit integer default 50,
  p_before timestamptz default null
)
returns table (
  message_id uuid, sender_id uuid, sender_name text, body text,
  mine boolean, at timestamptz
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_conversation_member(p_conversation_id) then
    raise exception 'You are not in that conversation.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select m.id, m.sender_id, coalesce(pp.display_name, 'Someone'),
         case when m.hidden_at is null then m.body else '(removed)' end,
         m.sender_id is not distinct from auth.uid(),
         m.created_at
    from message m
    left join player_profile pp on pp.id = m.sender_id
   where m.conversation_id = p_conversation_id
     and (p_before is null or m.created_at < p_before)
     and (
       m.sender_id is null
       or m.sender_id = auth.uid()
       or not exists (
         select 1 from player_block b
          where b.blocker_id = auth.uid() and b.blocked_id = m.sender_id
       )
     )
   order by m.created_at desc
   limit greatest(1, least(p_limit, 200));
end;
$$;

revoke execute on function public.conversation_messages(uuid, integer, timestamptz) from public, anon;
grant execute on function public.conversation_messages(uuid, integer, timestamptz) to authenticated;

