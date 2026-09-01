-- A club can talk to itself. (2 of 2.)
alter table conversation add column if not exists club_id uuid references club(id) on delete cascade;

alter table conversation drop constraint if exists conversation_subject;
alter table conversation add constraint conversation_subject check (
  (kind = 'lobby'  and booking_id is not null and team_id is null     and club_id is null) or
  (kind = 'team'   and team_id is not null    and booking_id is null  and club_id is null) or
  (kind = 'club'   and club_id is not null    and booking_id is null  and team_id is null) or
  (kind = 'direct' and booking_id is null     and team_id is null     and club_id is null)
);

create unique index if not exists conversation_one_per_club
  on conversation (club_id) where club_id is not null;

/**
 * The club's room, opened on demand.
 *
 * Idempotent, like the other two: a screen calls it on the way in and gets the
 * existing room back rather than a second empty one. Everyone active in the
 * club is a member, and the membership is topped up on every call so somebody
 * who joined after the room was made is in it.
 */
create or replace function club_conversation(p_club_id uuid)
returns table (ok boolean, conversation_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from club_membership m
     where m.club_id = p_club_id and m.player_id = auth.uid() and m.state = 'active'
  ) then
    return query select false, null::uuid, 'You are not in that club.';
    return;
  end if;

  select c.id into v_id from conversation c
   where c.kind = 'club' and c.club_id = p_club_id;

  if v_id is null then
    insert into conversation (kind, club_id) values ('club', p_club_id)
    returning id into v_id;
  end if;

  insert into conversation_member (conversation_id, player_id)
  select v_id, m.player_id from club_membership m
   where m.club_id = p_club_id and m.state = 'active'
  on conflict do nothing;

  return query select true, v_id, null::text;
end;
$$;

revoke execute on function public.club_conversation(uuid) from public, anon;
grant execute on function public.club_conversation(uuid) to authenticated;

-- The list has to be able to name the new room, or a club's messages arrive in
-- something called "Direct message".
drop function if exists my_conversations(integer);
create or replace function my_conversations(p_limit integer default 30)
returns table (
  conversation_id uuid,
  kind        conversation_kind,
  title       text,
  last_body   text,
  last_at     timestamptz,
  unread      integer,
  booking_id  uuid,
  team_id     uuid,
  club_id     uuid
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
        and (cm.last_read_at is null or m2.created_at > cm.last_read_at)),
    c.booking_id,
    c.team_id,
    c.club_id
  from conversation_member cm
  join conversation c on c.id = cm.conversation_id
  left join booking b on b.id = c.booking_id
  left join pitch p on p.id = b.pitch_id
  left join venue v on v.id = p.venue_id
  left join team t on t.id = c.team_id
  left join club cl on cl.id = c.club_id
  left join lateral (
    select m.body, m.created_at from message m
     where m.conversation_id = c.id
     order by m.created_at desc limit 1
  ) last on true
  where cm.player_id = auth.uid()
  order by coalesce(last.created_at, c.created_at) desc
  limit greatest(1, least(p_limit, 100));
$$;

revoke execute on function public.my_conversations(integer) from public, anon;
grant execute on function public.my_conversations(integer) to authenticated;
