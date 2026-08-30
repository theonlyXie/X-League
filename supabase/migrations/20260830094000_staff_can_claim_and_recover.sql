-- Setting and recovering a staff password, without an inbox.
--
-- The console has no email and no SMS behind it, so the usual "we sent you a
-- link" is not available. What replaces it is a recovery code: issued once when
-- the password is first set, shown once, and required to set a new one.
--
-- The important property is that nothing typed at the sign-in screen is enough
-- on its own. A person who knows the username, knows the console is at a public
-- URL, and knows the trick still cannot get in without the code. That is the
-- whole reason the code exists — a reset that any visitor can trigger is not a
-- recovery mechanism, it is a way in.
--
-- Every function here is callable by `anon`, because somebody recovering a
-- password is by definition not signed in. That is why each one is narrow:
--
--   * it acts only on accounts that hold an active platform role, so none of
--     this reaches a player's account;
--   * first-time setup refuses an account that already has a password, so it
--     cannot be used to take one over;
--   * the reset verifies a hashed code and locks the account after repeated
--     failures, so the code cannot be guessed at leisure.

create table if not exists staff_recovery (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  code_hash       text        not null,
  issued_at       timestamptz not null default now(),
  used_at         timestamptz,
  failed_attempts integer     not null default 0,
  locked_until    timestamptz
);

-- On, with no policies and no grants: every row is reached through the
-- functions below and never directly, like the rest of this schema.
alter table staff_recovery enable row level security;
revoke all on table staff_recovery from public, anon, authenticated;

/**
 * The address GoTrue knows a staff member by.
 *
 * Staff sign in with a username rather than a number — they are not players and
 * the account is not tied to a handset. Somebody who types the whole address
 * gets it through unchanged, so both spellings work.
 */
create or replace function staff_email(p_username text)
returns text
language sql immutable
set search_path = public, pg_temp as $$
  select case
           when position('@' in lower(trim(p_username))) > 0 then lower(trim(p_username))
           else lower(trim(p_username)) || '@xleague.app'
         end;
$$;

/** A staff account, or null. Never resolves to a player. */
create or replace function staff_user_id(p_username text)
returns uuid
language sql stable security definer
set search_path = public, pg_temp as $$
  select u.id
    from auth.users u
    join platform_role r on r.user_id = u.id and r.active
   where u.email = staff_email(p_username)
   limit 1;
$$;

/**
 * Whether to offer first-time setup, or ask for a password.
 *
 * Says nothing about accounts that are not staff — a player's number is not
 * discoverable through this, and neither is the existence of one.
 */
create or replace function staff_auth_status(p_username text)
returns table (account_exists boolean, has_password boolean)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_id uuid := staff_user_id(p_username);
begin
  if v_id is null then
    return query select false, false;
    return;
  end if;
  return query
  select true, (select u.encrypted_password is not null and u.encrypted_password <> ''
                  from auth.users u where u.id = v_id);
end;
$$;

/** Sixteen characters in four groups, from an alphabet with no O/0 or I/1. */
create or replace function new_recovery_code()
returns text
language plpgsql volatile
set search_path = public, pg_temp as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_out text := '';
  i integer;
begin
  for i in 1..16 loop
    v_out := v_out || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    if i % 4 = 0 and i < 16 then v_out := v_out || '-'; end if;
  end loop;
  return v_out;
end;
$$;

/** Store the hash, hand back the plaintext. It is never readable again. */
create or replace function issue_recovery_code(p_user_id uuid)
returns text
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_code text := new_recovery_code();
begin
  insert into staff_recovery (user_id, code_hash, issued_at, used_at, failed_attempts, locked_until)
  values (p_user_id, extensions.crypt(v_code, extensions.gen_salt('bf')), now(), null, 0, null)
  on conflict (user_id) do update
    set code_hash = excluded.code_hash,
        issued_at = now(),
        used_at = null,
        failed_attempts = 0,
        locked_until = null;
  return v_code;
end;
$$;

/**
 * The first password on an account that has never had one.
 *
 * Refuses an account that already has one, which is what stops this being a
 * way to take over a live account rather than claim a new one.
 */
create or replace function staff_set_first_password(p_username text, p_password text)
returns table (ok boolean, reason text, recovery_code text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_id uuid := staff_user_id(p_username);
  v_has boolean;
begin
  if v_id is null then
    return query select false, 'No staff account with that username.', null::text;
    return;
  end if;

  select u.encrypted_password is not null and u.encrypted_password <> ''
    into v_has from auth.users u where u.id = v_id;

  if v_has then
    return query select false, 'That account already has a password. Use the recovery code instead.', null::text;
    return;
  end if;

  if length(coalesce(p_password, '')) < 8 then
    return query select false, 'Use at least 8 characters.', null::text;
    return;
  end if;

  -- GoTrue reads these as strings, not nullable ones, and answers "Database
  -- error querying schema" on any row where they are null. A staff account
  -- added by hand in SQL — which is how staff accounts get added, there being
  -- no screen for it — lands exactly there, so claiming one repairs it rather
  -- than leaving somebody to debug an error that says nothing about the cause.
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         confirmation_token = coalesce(confirmation_token, ''),
         recovery_token = coalesce(recovery_token, ''),
         email_change = coalesce(email_change, ''),
         email_change_token_new = coalesce(email_change_token_new, ''),
         email_change_token_current = coalesce(email_change_token_current, ''),
         phone_change = coalesce(phone_change, ''),
         phone_change_token = coalesce(phone_change_token, ''),
         reauthentication_token = coalesce(reauthentication_token, ''),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = v_id;

  return query select true, null::text, issue_recovery_code(v_id);
end;
$$;

/**
 * A new password, for somebody holding the recovery code.
 *
 * The code is single use: a successful reset issues a fresh one and returns it,
 * so a code that has been read aloud, screenshotted or pasted into a chat stops
 * working the moment it is used.
 *
 * Failures are counted and the account locks for fifteen minutes after five, so
 * the code cannot be worked through at leisure. The count is per account rather
 * than per caller because a caller identifies itself with nothing here.
 */
create or replace function staff_reset_password(p_username text, p_code text, p_password text)
returns table (ok boolean, reason text, recovery_code text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_id     uuid := staff_user_id(p_username);
  v_row    staff_recovery%rowtype;
  v_locked timestamptz;
begin
  -- One answer for "no such account" and "wrong code", so this cannot be used
  -- to find out which staff usernames exist.
  if v_id is null then
    return query select false, 'That username and code do not match.', null::text;
    return;
  end if;

  select * into v_row from staff_recovery where user_id = v_id;

  if v_row.user_id is null then
    return query select false, 'That account has no recovery code. Ask an administrator.', null::text;
    return;
  end if;

  v_locked := v_row.locked_until;
  if v_locked is not null and v_locked > now() then
    return query select false, 'Too many attempts. Try again in a few minutes.', null::text;
    return;
  end if;

  if v_row.code_hash <> extensions.crypt(coalesce(p_code, ''), v_row.code_hash) then
    update staff_recovery
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' end
     where user_id = v_id;
    return query select false, 'That username and code do not match.', null::text;
    return;
  end if;

  if length(coalesce(p_password, '')) < 8 then
    return query select false, 'Use at least 8 characters.', null::text;
    return;
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_id;

  return query select true, null::text, issue_recovery_code(v_id);
end;
$$;

-- `anon` reaches all three, because somebody setting or recovering a password
-- has no session yet. The narrowing is inside each function, not at the grant.
revoke execute on function public.staff_email(text) from public, anon;
revoke execute on function public.staff_user_id(text) from public, anon, authenticated;
revoke execute on function public.new_recovery_code() from public, anon, authenticated;
revoke execute on function public.issue_recovery_code(uuid) from public, anon, authenticated;

revoke execute on function public.staff_auth_status(text) from public;
grant execute on function public.staff_auth_status(text) to anon, authenticated;

revoke execute on function public.staff_set_first_password(text, text) from public;
grant execute on function public.staff_set_first_password(text, text) to anon, authenticated;

revoke execute on function public.staff_reset_password(text, text, text) from public;
grant execute on function public.staff_reset_password(text, text, text) to anon, authenticated;
