-- A room is whoever is in the group, not whoever happened to open it first.
--
-- Every room was a snapshot. `lobby_conversation`, `team_conversation` and
-- `club_conversation` each wrote a `conversation_member` row per person at the
-- moment somebody opened the room, and never again. Two things followed.
--
-- The first is a deadlock. A room only appears in your list if you already have
-- a membership row, and the only thing that writes one is the function you call
-- by opening the room. Whoever opens it first, before the others have accepted,
-- founds a room of one — and the people who join afterwards can never get in,
-- because getting in is what they cannot do.
--
-- The second is what that looks like from the phone. The live database had two
-- lobby rooms, one member each, four messages between them: somebody wrote to
-- their match and nobody else was in the room to read it. The sender sees their
-- own message. Everyone else sees no room at all, and `send_message` notifies
-- the members — of a room of one, that is nobody.
--
-- So membership stops being the gate. Who may read a room is derived from the
-- group the room is for, every time it is asked: the squad for a lobby, the
-- team for a team room, the club for a club room, and for a direct message the
-- two people in it, which is the one case where the rows really are the truth.
-- `conversation_member` keeps doing the job only it can do — where you had read
-- up to, and whether you muted it — and a row is written the first time you
-- need one.
--
-- While here, the list stops disagreeing with the room it opens. The preview
-- and the unread count read straight off `message`, so a message you had
-- blocked, or one a moderator had removed, was advertised in the list and then
-- absent from the thread — the same phantom in a smaller way.

-- Who is entitled to a room. One definition, used by everything below.
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
   where c.id = p_conversation_id and c.kind = 'lobby'
     and b.captain_id is not null

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

create or replace function is_conversation_member(p_conversation_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select auth.uid() is not null
     and exists (
       select 1 from conversation_audience(p_conversation_id) a
        where a.player_id = auth.uid()
     );
$$;

-- The rooms this player can open, in the order they were last spoken in.
--
-- Entitlement is spelled out here rather than routed through
-- `conversation_audience`, because that would run the whole union once per
-- conversation; the predicates below are the same rule, asked the other way
-- round, and stop at the first one that matches.
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
            select 1 from player_block b
             where b.blocker_id = auth.uid() and b.blocked_id = m2.sender_id
          )
        )),
    c.booking_id,
    c.team_id,
    c.club_id
  from conversation c
  left join conversation_member mem
         on mem.conversation_id = c.id and mem.player_id = auth.uid()
  left join booking b on b.id = c.booking_id
  left join pitch p on p.id = b.pitch_id
  left join venue v on v.id = p.venue_id
  left join team t on t.id = c.team_id
  left join club cl on cl.id = c.club_id
  -- The preview is the newest message this person is actually shown, under the
  -- same two rules the thread applies: a blocked sender is not there at all,
  -- and a removed message says so rather than showing what it said.
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

-- Reading and muting are the two things that need a row of your own, so these
-- are where one gets written.
create or replace function mark_conversation_read(p_conversation_id uuid)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_conversation_member(p_conversation_id) then
    return false;
  end if;

  insert into conversation_member (conversation_id, player_id)
  values (p_conversation_id, auth.uid())
  on conflict do nothing;

  update conversation_member set last_read_at = now()
   where conversation_id = p_conversation_id and player_id = auth.uid();
  return true;
end;
$$;

create or replace function mute_conversation(p_conversation_id uuid, p_muted boolean)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_conversation_member(p_conversation_id) then
    return query select false, 'You are not in that conversation.';
    return;
  end if;

  insert into conversation_member (conversation_id, player_id)
  values (p_conversation_id, auth.uid())
  on conflict do nothing;

  update conversation_member
     set muted = coalesce(p_muted, false)
   where conversation_id = p_conversation_id and player_id = auth.uid();
  return query select true, null::text;
end;
$$;

-- Sending is unchanged except for who hears about it: everybody entitled to the
-- room, rather than everybody who happens to have a row in it. A person with no
-- row has muted nothing, so the mute check has to tolerate the row's absence.
create or replace function send_message(p_conversation_id uuid, p_body text)
returns table (ok boolean, message_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_id   uuid;
  v_recent integer;
  v_other uuid;
begin
  if not is_conversation_member(p_conversation_id) then
    return query select false, null::uuid, 'You are not in that conversation.';
    return;
  end if;

  if length(v_body) = 0 then
    return query select false, null::uuid, 'Write something first.';
    return;
  end if;
  if length(v_body) > 2000 then
    return query select false, null::uuid, 'That message is too long.';
    return;
  end if;

  -- In a room of two, a block is the end of the conversation. In a bigger room
  -- it is one person not hearing another, which the read side takes care of.
  select cm.player_id into v_other
    from conversation c
    join conversation_member cm on cm.conversation_id = c.id and cm.player_id <> v_uid
   where c.id = p_conversation_id and c.kind = 'direct'
   limit 1;

  if v_other is not null and is_blocked_between(v_uid, v_other) then
    return query select false, null::uuid, 'You cannot message that player.';
    return;
  end if;

  -- A blunt flood guard. Not a full rate limiter, but enough that a loop
  -- cannot fill somebody's lobby faster than they can read it.
  select count(*)::integer into v_recent
    from message
   where sender_id = v_uid and created_at > now() - interval '10 seconds';
  if v_recent >= 10 then
    return query select false, null::uuid, 'Slow down a moment.';
    return;
  end if;

  insert into message (conversation_id, sender_id, body)
  values (p_conversation_id, v_uid, v_body)
  returning id into v_id;

  insert into conversation_member (conversation_id, player_id)
  values (p_conversation_id, v_uid)
  on conflict do nothing;

  update conversation_member set last_read_at = now()
   where conversation_id = p_conversation_id and player_id = v_uid;

  perform notify(a.player_id, 'message',
                 coalesce(pp.display_name, 'Someone') || ' sent a message',
                 left(v_body, 120),
                 jsonb_build_object('screen', 'chat', 'conversation_id', p_conversation_id))
     from conversation_audience(p_conversation_id) a
     left join conversation_member cm
            on cm.conversation_id = p_conversation_id and cm.player_id = a.player_id
     left join player_profile pp on pp.id = v_uid
    where a.player_id <> v_uid
      and not coalesce(cm.muted, false)
      and not exists (
        select 1 from player_block b
         where b.blocker_id = a.player_id and b.blocked_id = v_uid
      );

  return query select true, v_id, null::text;
end;
$$;

revoke execute on function public.conversation_audience(uuid) from public, anon, authenticated;
revoke execute on function public.my_conversations(integer) from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.mute_conversation(uuid, boolean) from public, anon;
revoke execute on function public.send_message(uuid, text) from public, anon;
grant execute on function public.my_conversations(integer) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.mute_conversation(uuid, boolean) to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;

-- Two helpers that drifted open.
--
-- Both were created without a revoke and so inherited Postgres's default of
-- EXECUTE to PUBLIC. `is_blocked_between` answers whether two named people have
-- blocked each other, which is nobody's business but theirs;
-- `refuse_unverified_venue` is a trigger body, which a client has no reason to
-- call at all — a trigger runs as part of the statement and never checks the
-- caller's privilege on it. The access probe found both.
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.refuse_unverified_venue() from public, anon, authenticated;
