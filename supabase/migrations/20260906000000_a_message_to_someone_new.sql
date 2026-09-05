-- A message to someone new.
--
-- Direct rooms could only be opened between two people who had shared a team
-- or a pitch. That rule was written when there was no way to look a player up
-- from the chat section, and it made the chat list a record of who you had
-- already met rather than a way to reach anybody.
--
-- The app already has a way to look a player up — `find_players` — and it
-- already has the right rule for who may be found: the profile's own
-- `visibility`. Someone set to 'everyone' appears in anybody's search;
-- 'connections' appears only to people they have played with; 'nobody' is
-- never returned at all. That is a setting each player controls, and it is the
-- honest answer to "who may message me", so this defers to it rather than
-- inventing a second, quieter rule beside it.
--
-- The new condition is the old one plus that: you may open a room with someone
-- you have shared a team or a pitch with, as before, or with anyone whose
-- profile is open to everyone. A player who has narrowed their visibility is
-- reachable by the people they have actually played with and by nobody else,
-- which is exactly what narrowing it meant.
--
-- Blocking is untouched and still refuses first, in both directions.

create or replace function direct_conversation(p_player_id uuid)
returns table (ok boolean, conversation_id uuid, reason text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_id         uuid;
  v_visibility text;
  v_known      boolean;
begin
  if v_uid is null then
    return query select false, null::uuid, 'Sign in to send a message.';
    return;
  end if;
  if v_uid = p_player_id then
    return query select false, null::uuid, 'You cannot message yourself.';
    return;
  end if;

  select pp.visibility into v_visibility from player_profile pp where pp.id = p_player_id;
  if v_visibility is null then
    return query select false, null::uuid, 'That player does not have an X League account.';
    return;
  end if;

  if is_blocked_between(v_uid, p_player_id) then
    return query select false, null::uuid, 'You cannot message that player.';
    return;
  end if;

  v_known :=
    exists (
      select 1 from team_membership m1
        join team_membership m2 on m2.team_id = m1.team_id
       where m1.player_id = v_uid and m1.state = 'active'
         and m2.player_id = p_player_id and m2.state = 'active'
    )
    or exists (
      select 1 from booking_participant b1
        join booking_participant b2 on b2.booking_id = b1.booking_id
       where b1.player_id = v_uid and b1.state in ('accepted', 'invited')
         and b2.player_id = p_player_id and b2.state in ('accepted', 'invited')
    );

  if not v_known and v_visibility <> 'everyone' then
    return query select false, null::uuid,
      'That player only takes messages from people they have played with.';
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

revoke all on function direct_conversation(uuid) from public;
grant execute on function direct_conversation(uuid) to authenticated;
