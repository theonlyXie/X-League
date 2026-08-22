-- X League — conversations, notifications and reports.
--
-- P-13 draws a lobby chat and a "Message squad" button; the tab bar has a Chat
-- tab. None of it had anywhere to write to. The same is true of every prompt
-- the product needs to push at somebody: an invitation arriving, a hold about
-- to expire, a match waiting to be rated. The app could only show those to a
-- player who happened to open the right screen.
--
-- Two rules shape this. A conversation is *derived from a relationship that
-- already exists* — a squad, a team, or two people who have played together —
-- so there is no way to open a channel to a stranger. And a notification is a
-- row, not a push: delivery is a separate concern, but the record of what the
-- player was told survives whether or not a device was reachable.

-- ---------------------------------------------------------------------------
-- Conversations (§7.1 Conversation, Message)
-- ---------------------------------------------------------------------------

do $$ begin
  create type conversation_kind as enum ('lobby', 'team', 'direct');
exception when duplicate_object then null;
end $$;

create table if not exists conversation (
  id         uuid primary key default gen_random_uuid(),
  kind       conversation_kind not null,
  -- Exactly one of these, depending on the kind. A direct conversation has
  -- neither and is identified by its two members.
  booking_id uuid references booking(id) on delete cascade,
  team_id    uuid references team(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversation_subject check (
    (kind = 'lobby'  and booking_id is not null and team_id is null) or
    (kind = 'team'   and team_id is not null and booking_id is null) or
    (kind = 'direct' and booking_id is null and team_id is null)
  )
);

-- One lobby per booking and one channel per team, so "open the chat" is
-- idempotent rather than a way to accumulate empty rooms.
create unique index if not exists conversation_lobby_unique
  on conversation (booking_id) where kind = 'lobby';
create unique index if not exists conversation_team_unique
  on conversation (team_id) where kind = 'team';

create table if not exists conversation_member (
  conversation_id uuid not null references conversation(id) on delete cascade,
  player_id       uuid not null references auth.users(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  -- Where the unread count is measured from.
  last_read_at    timestamptz,
  muted           boolean not null default false,
  primary key (conversation_id, player_id)
);

create index if not exists conversation_member_player_idx on conversation_member (player_id);

create table if not exists message (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversation(id) on delete cascade,
  sender_id       uuid references auth.users(id) on delete set null,
  body            text not null check (length(btrim(body)) between 1 and 2000),
  -- ADM-009: moderation hides rather than destroys, so a report stays
  -- investigable after the message is taken down.
  hidden_at       timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists message_conversation_idx on message (conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notifications (§7.1 Notification)
-- ---------------------------------------------------------------------------

create table if not exists notification (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  -- Where tapping it should go: {"screen":"lobby","booking_id":"…"}.
  payload    jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notification_player_idx
  on notification (player_id, created_at desc);
create index if not exists notification_unread_idx
  on notification (player_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- Reports (§7.1 Report)
-- ---------------------------------------------------------------------------

create table if not exists report (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references auth.users(id) on delete cascade,
  subject_kind text not null check (subject_kind in ('player', 'venue', 'message', 'booking')),
  subject_id   uuid not null,
  reason       text not null check (reason in
                 ('abuse', 'no_show', 'unsafe', 'spam', 'wrong_info', 'other')),
  body         text,
  state        text not null default 'open'
                 check (state in ('open', 'reviewing', 'actioned', 'dismissed')),
  resolved_by  uuid references auth.users(id) on delete set null,
  resolved_at  timestamptz,
  resolution   text,
  created_at   timestamptz not null default now()
);

create index if not exists report_open_idx on report (created_at desc) where state in ('open', 'reviewing');
-- One open report per person per subject: reporting the same thing repeatedly
-- is noise in the moderation queue, not extra signal.
create unique index if not exists report_one_open
  on report (reporter_id, subject_kind, subject_id) where state in ('open', 'reviewing');

-- ---------------------------------------------------------------------------
-- Telling somebody something
-- ---------------------------------------------------------------------------

-- Internal. Never granted: a client that could write notifications could write
-- them to anybody, which is a spam channel with the product's name on it.
create or replace function notify(
  p_player_id uuid,
  p_kind      text,
  p_title     text,
  p_body      text default null,
  p_payload   jsonb default '{}'
)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if p_player_id is null then
    return null;
  end if;
  insert into notification (player_id, kind, title, body, payload)
  values (p_player_id, p_kind, p_title, p_body, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- Invitations and answers to them are the two events the product most needs to
-- reach somebody who is not looking at the app. Done as a trigger so every
-- route that touches a squad place produces the same notification, rather than
-- each caller remembering to.
create or replace function notify_participant_change() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
declare
  v_captain uuid;
  v_when    timestamptz;
  v_venue   text;
  v_payload jsonb;
begin
  select b.captain_id, lower(b.during), v.name
    into v_captain, v_when, v_venue
    from booking b join pitch p on p.id = b.pitch_id join venue v on v.id = p.venue_id
   where b.id = new.booking_id;

  v_payload := jsonb_build_object('screen', 'lobby', 'booking_id', new.booking_id);

  if tg_op = 'INSERT' and new.state = 'invited' and new.player_id is not null then
    perform notify(new.player_id, 'squad_invite',
      format('You are invited to play at %s', coalesce(v_venue, 'a pitch')),
      null, v_payload);

  elsif tg_op = 'UPDATE' and new.player_id is not null
        and old.state = 'invited' and new.state in ('accepted', 'declined') then
    -- The captain is the one waiting on the answer.
    perform notify(v_captain,
      case when new.state = 'accepted' then 'squad_accepted' else 'squad_declined' end,
      format('%s %s your invitation', new.display_name,
             case when new.state = 'accepted' then 'accepted' else 'declined' end),
      null, v_payload);
  end if;

  return null;
end;
$$;

drop trigger if exists participant_notify on booking_participant;
create trigger participant_notify
  after insert or update of state on booking_participant
  for each row execute function notify_participant_change();

create or replace function my_notifications(p_limit integer default 30)
returns table (
  notification_id uuid,
  kind    text,
  title   text,
  body    text,
  payload jsonb,
  read    boolean,
  at      timestamptz
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select n.id, n.kind, n.title, n.body, n.payload, n.read_at is not null, n.created_at
    from notification n
   where n.player_id = auth.uid()
   order by n.created_at desc
   limit greatest(1, least(p_limit, 100));
$$;

create or replace function unread_notifications()
returns integer
language sql stable security definer
set search_path = public, pg_temp as $$
  select count(*)::integer from notification
   where player_id = auth.uid() and read_at is null;
$$;

-- Passing null marks everything read, which is what tapping into the list does.
create or replace function mark_notifications_read(p_notification_id uuid default null)
returns integer
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_rows integer;
begin
  update notification set read_at = now()
   where player_id = auth.uid()
     and read_at is null
     and (p_notification_id is null or id = p_notification_id);
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- Opening a conversation
-- ---------------------------------------------------------------------------

create or replace function is_conversation_member(p_conversation_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from conversation_member cm
     where cm.conversation_id = p_conversation_id and cm.player_id = auth.uid()
  );
$$;

-- MSG-001. The lobby exists because the squad exists; membership is recomputed
-- on open so somebody who joined after the last message still gets the history
-- of the match they are playing in.
create or replace function lobby_conversation(p_booking_id uuid)
returns table (ok boolean, conversation_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if not can_see_squad(p_booking_id) then
    return query select false, null::uuid, 'You are not part of that match.';
    return;
  end if;

  select c.id into v_id from conversation c
   where c.kind = 'lobby' and c.booking_id = p_booking_id;

  if v_id is null then
    insert into conversation (kind, booking_id) values ('lobby', p_booking_id)
    returning id into v_id;
  end if;

  -- Everyone holding a place, plus the captain.
  insert into conversation_member (conversation_id, player_id)
  select v_id, bp.player_id
    from booking_participant bp
   where bp.booking_id = p_booking_id
     and bp.player_id is not null
     and bp.state in ('invited', 'accepted')
  on conflict do nothing;

  insert into conversation_member (conversation_id, player_id)
  select v_id, b.captain_id from booking b
   where b.id = p_booking_id and b.captain_id is not null
  on conflict do nothing;

  return query select true, v_id, null::text;
end;
$$;

create or replace function team_conversation(p_team_id uuid)
returns table (ok boolean, conversation_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from team_membership m
     where m.team_id = p_team_id and m.player_id = auth.uid() and m.state = 'active'
  ) then
    return query select false, null::uuid, 'You are not a member of that team.';
    return;
  end if;

  select c.id into v_id from conversation c
   where c.kind = 'team' and c.team_id = p_team_id;

  if v_id is null then
    insert into conversation (kind, team_id) values ('team', p_team_id)
    returning id into v_id;
  end if;

  insert into conversation_member (conversation_id, player_id)
  select v_id, m.player_id from team_membership m
   where m.team_id = p_team_id and m.state = 'active'
  on conflict do nothing;

  return query select true, v_id, null::text;
end;
$$;

-- MSG-002 / NFR-PRIV-003. A direct conversation needs a relationship behind it:
-- a shared team or a shared pitch. Without that rule this is an open channel to
-- any account whose name somebody can guess, which is the thing PRO-006 exists
-- to prevent — and player search already honours it, so messaging must too.
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

  -- The existing 1:1, if there is one: a direct conversation is identified by
  -- having exactly these two members and nothing else.
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

-- ---------------------------------------------------------------------------
-- Saying something
-- ---------------------------------------------------------------------------

create or replace function send_message(p_conversation_id uuid, p_body text)
returns table (ok boolean, message_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_id   uuid;
  v_recent integer;
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

  -- Everybody else in the room, unless they muted it.
  perform notify(cm.player_id, 'message',
                 coalesce(pp.display_name, 'Someone') || ' sent a message',
                 left(v_body, 120),
                 jsonb_build_object('screen', 'chat', 'conversation_id', p_conversation_id))
     from conversation_member cm
     left join player_profile pp on pp.id = v_uid
    where cm.conversation_id = p_conversation_id
      and cm.player_id <> v_uid
      and not cm.muted;

  return query select true, v_id, null::text;
end;
$$;

create or replace function conversation_messages(
  p_conversation_id uuid,
  p_limit integer default 50,
  p_before timestamptz default null
)
returns table (
  message_id  uuid,
  sender_id   uuid,
  sender_name text,
  body        text,
  mine        boolean,
  at          timestamptz
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
   order by m.created_at desc
   limit greatest(1, least(p_limit, 200));
end;
$$;

-- The Chat tab: every room the player is in, most recently active first.
create or replace function my_conversations(p_limit integer default 30)
returns table (
  conversation_id uuid,
  kind        conversation_kind,
  title       text,
  last_body   text,
  last_at     timestamptz,
  unread      integer,
  booking_id  uuid,
  team_id     uuid
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select
    c.id,
    c.kind,
    case c.kind
      when 'lobby' then coalesce(v.name, 'Match') || ' lobby'
      when 'team'  then coalesce(t.name, 'Team')
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
    c.team_id
  from conversation_member cm
  join conversation c on c.id = cm.conversation_id
  left join booking b on b.id = c.booking_id
  left join pitch p on p.id = b.pitch_id
  left join venue v on v.id = p.venue_id
  left join team t on t.id = c.team_id
  left join lateral (
    select m.body, m.created_at from message m
     where m.conversation_id = c.id
     order by m.created_at desc limit 1
  ) last on true
  where cm.player_id = auth.uid()
  order by coalesce(last.created_at, c.created_at) desc
  limit greatest(1, least(p_limit, 100));
$$;

create or replace function mark_conversation_read(p_conversation_id uuid)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_conversation_member(p_conversation_id) then
    return false;
  end if;
  update conversation_member set last_read_at = now()
   where conversation_id = p_conversation_id and player_id = auth.uid();
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reporting (ADM-008)
-- ---------------------------------------------------------------------------

create or replace function submit_report(
  p_subject_kind text,
  p_subject_id   uuid,
  p_reason       text,
  p_body         text default null
)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return query select false, 'Sign in to report something.';
    return;
  end if;
  if p_subject_kind not in ('player', 'venue', 'message', 'booking') then
    return query select false, 'That is not something you can report.';
    return;
  end if;
  if p_reason not in ('abuse', 'no_show', 'unsafe', 'spam', 'wrong_info', 'other') then
    return query select false, 'Choose a reason.';
    return;
  end if;
  if p_subject_kind = 'player' and p_subject_id = v_uid then
    return query select false, 'You cannot report yourself.';
    return;
  end if;

  insert into report (reporter_id, subject_kind, subject_id, reason, body)
  values (v_uid, p_subject_kind, p_subject_id, p_reason,
          nullif(btrim(coalesce(p_body, '')), ''))
  on conflict do nothing;

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

alter table conversation        enable row level security;
alter table conversation_member enable row level security;
alter table message             enable row level security;
alter table notification        enable row level security;
alter table report              enable row level security;

alter function public.notify_participant_change() set search_path = public, pg_temp;

revoke execute on function public.notify(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_participant_change()           from public, anon, authenticated;
revoke execute on function public.is_conversation_member(uuid)     from public, anon;
revoke execute on function public.lobby_conversation(uuid)         from public, anon;
revoke execute on function public.team_conversation(uuid)          from public, anon;
revoke execute on function public.direct_conversation(uuid)        from public, anon;
revoke execute on function public.send_message(uuid, text)         from public, anon;
revoke execute on function public.conversation_messages(uuid, integer, timestamptz) from public, anon;
revoke execute on function public.my_conversations(integer)        from public, anon;
revoke execute on function public.mark_conversation_read(uuid)     from public, anon;
revoke execute on function public.my_notifications(integer)        from public, anon;
revoke execute on function public.unread_notifications()           from public, anon;
revoke execute on function public.mark_notifications_read(uuid)    from public, anon;
revoke execute on function public.submit_report(text, uuid, text, text) from public, anon;

grant execute on function public.is_conversation_member(uuid)      to authenticated;
grant execute on function public.lobby_conversation(uuid)          to authenticated;
grant execute on function public.team_conversation(uuid)           to authenticated;
grant execute on function public.direct_conversation(uuid)         to authenticated;
grant execute on function public.send_message(uuid, text)          to authenticated;
grant execute on function public.conversation_messages(uuid, integer, timestamptz) to authenticated;
grant execute on function public.my_conversations(integer)         to authenticated;
grant execute on function public.mark_conversation_read(uuid)      to authenticated;
grant execute on function public.my_notifications(integer)         to authenticated;
grant execute on function public.unread_notifications()            to authenticated;
grant execute on function public.mark_notifications_read(uuid)     to authenticated;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;

comment on table public.conversation is
  'Chat rooms derived from a relationship that already exists — a squad, a team, or two people who have shared a pitch. There is no way to open a channel to a stranger.';
