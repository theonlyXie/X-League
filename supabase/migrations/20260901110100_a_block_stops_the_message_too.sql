-- Hiding a blocked person's messages is only half of it.
--
-- In a room of two there is nobody else the message could be for, so it is
-- refused outright rather than written and then hidden. In a bigger room a
-- block stays what it says on the tin — one person not hearing another — and
-- the read side handles that; the sender is not told, and nor should they be.
--
-- Both functions are restated whole because that is the only way Postgres lets
-- a function body be edited. Nothing else in either has changed.

create or replace function direct_conversation(p_player_id uuid)
returns table (ok boolean, conversation_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    return query select false, null::uuid, 'Sign in to send a message.';
    return;
  end if;
  if v_uid = p_player_id then
    return query select false, null::uuid, 'You cannot message yourself.';
    return;
  end if;
  if not exists (select 1 from player_profile where id = p_player_id) then
    return query select false, null::uuid, 'That player does not have an X League account.';
    return;
  end if;

  if is_blocked_between(v_uid, p_player_id) then
    return query select false, null::uuid, 'You cannot message that player.';
    return;
  end if;

  if not exists (
        select 1 from team_membership m1
          join team_membership m2 on m2.team_id = m1.team_id
         where m1.player_id = v_uid and m1.state = 'active'
           and m2.player_id = p_player_id and m2.state = 'active'
      )
     and not exists (
        select 1 from booking_participant b1
          join booking_participant b2 on b2.booking_id = b1.booking_id
         where b1.player_id = v_uid and b1.state in ('accepted', 'invited')
           and b2.player_id = p_player_id and b2.state in ('accepted', 'invited')
      )
  then
    return query select false, null::uuid,
      'You can message players you have shared a team or a pitch with.';
    return;
  end if;

  select c.id into v_id
    from conversation c
   where c.kind = 'direct'
     and (select count(*) from conversation_member cm where cm.conversation_id = c.id) = 2
     and exists (select 1 from conversation_member cm
                  where cm.conversation_id = c.id and cm.player_id = v_uid)
     and exists (select 1 from conversation_member cm
                  where cm.conversation_id = c.id and cm.player_id = p_player_id)
   limit 1;

  if v_id is null then
    insert into conversation (kind) values ('direct') returning id into v_id;
    insert into conversation_member (conversation_id, player_id)
    values (v_id, v_uid), (v_id, p_player_id);
  end if;

  return query select true, v_id, null::text;
end;
$$;

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

  update conversation_member set last_read_at = now()
   where conversation_id = p_conversation_id and player_id = v_uid;

  -- Everybody else in the room, unless they muted it or blocked the sender.
  perform notify(cm.player_id, 'message',
                 coalesce(pp.display_name, 'Someone') || ' sent a message',
                 left(v_body, 120),
                 jsonb_build_object('screen', 'chat', 'conversation_id', p_conversation_id))
     from conversation_member cm
     left join player_profile pp on pp.id = v_uid
    where cm.conversation_id = p_conversation_id
      and cm.player_id <> v_uid
      and not cm.muted
      and not exists (
        select 1 from player_block b
         where b.blocker_id = cm.player_id and b.blocked_id = v_uid
      );

  return query select true, v_id, null::text;
end;
$$;

revoke execute on function public.direct_conversation(uuid) from public, anon;
revoke execute on function public.send_message(uuid, text) from public, anon;
grant execute on function public.direct_conversation(uuid) to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;
