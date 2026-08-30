-- Rotating a console password without anybody learning one.
--
-- `admin_reset_password` already exists and is the wrong shape for this. It
-- takes a password the administrator types, which means the administrator then
-- knows the account's password, it has been typed into a form, and it lives
-- wherever it was communicated. That is the right tool for helping a player who
-- is locked out and the wrong one for the case this exists for: a password that
-- has leaked, where the whole point is that nobody ends up holding the new one.
--
-- So this sets a password that is generated here and never returned. It is
-- unguessable and nobody — not the caller, not the account's owner, not this
-- transcript — ever sees it. Access comes back through the recovery code, which
-- the console's `Su` flow takes and which is single-use.
--
-- The rule that makes it safe is the one about who may be rotated. The recovery
-- flow resolves a username through `staff_user_id`, which joins an *active*
-- `platform_role` — so an account without one has no way back, and rotating it
-- would lock somebody out permanently with no route to a new password. This
-- refuses that rather than doing it.

/** Whether an account can be rotated: it has a way back only if it is staff. */
create or replace function admin_rotate_console_password(p_user_id uuid)
returns table (ok boolean, reason text, recovery_code text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  -- 32 random bytes, base64. Never selected, never returned, never logged.
  v_unguessable text := encode(extensions.gen_random_bytes(32), 'base64');
begin
  -- Same authority as the reset it sits beside: taking an account away from
  -- whoever is using it is not a support action.
  if not is_platform('admin') then
    return query select false, 'You do not have permission to do that.', null::text;
    return;
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    return query select false, 'No such account.', null::text;
    return;
  end if;

  if not exists (select 1 from platform_role r where r.user_id = p_user_id and r.active) then
    return query select false,
      'That is not a console account, so there would be no way back into it.', null::text;
    return;
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(v_unguessable, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;

  -- Not the password and not the code — only that it happened, to whom, and by
  -- whom. `issue_recovery_code` replaces any code already outstanding, so an
  -- older one that was written down somewhere stops working here.
  perform write_audit('account.password_rotated', 'user', p_user_id, '{}'::jsonb);

  return query select true, null::text, issue_recovery_code(p_user_id);
end;
$$;

revoke execute on function public.admin_rotate_console_password(uuid) from public, anon;
grant execute on function public.admin_rotate_console_password(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Say which accounts those are
-- ---------------------------------------------------------------------------

-- Without this the console cannot tell a console account from a player, so it
-- would have to offer the button on every row and let most of them be refused.
-- A control that is usually refused teaches people to ignore refusals.
drop function if exists admin_find_users(text, integer);

create function admin_find_users(p_query text default null, p_limit integer default 50)
returns table (
  player_id    uuid,
  display_name text,
  area         text,
  visibility   text,
  suspended_until timestamptz,
  bookings     integer,
  no_shows     integer,
  joined       timestamptz,
  /** The platform role this account holds, or null for an ordinary player. */
  console_role text
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform('support') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select pp.id, pp.display_name, pp.preferred_area, pp.visibility,
         pp.suspended_until,
         (select count(*)::integer from booking b where b.captain_id = pp.id),
         (select count(*)::integer from booking b
           where b.captain_id = pp.id and b.state = 'no_show'),
         pp.created_at,
         (select r.role::text from platform_role r where r.user_id = pp.id and r.active)
    from player_profile pp
   where p_query is null or btrim(p_query) = ''
      or pp.display_name ilike '%' || btrim(p_query) || '%'
   order by pp.created_at desc
   limit greatest(1, least(p_limit, 200));
end;
$$;

revoke execute on function public.admin_find_users(text, integer) from public, anon;
grant execute on function public.admin_find_users(text, integer) to authenticated;
