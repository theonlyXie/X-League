-- Somebody has to be able to let a locked-out person back in.
--
-- `change_password` needs the current password, which is right — but it leaves
-- a hole with no bottom. There is no SMS provider and no mailbox behind the
-- derived addresses, so the two ordinary recovery routes (a code to your phone,
-- a link to your email) do not exist. A person who forgets their password today
-- is locked out of their card, their bookings and their team permanently, with
-- no path back at all.
--
-- Self-service recovery needs a channel to send something down, and that is a
-- provider decision rather than code. Until then this is the honest fallback:
-- a platform admin resets it, having identified the person however support
-- normally does. Every reset is audited, because an admin who can set anybody's
-- password can become anybody, and that is exactly the kind of reach ADM-012
-- exists to record.

create or replace function admin_reset_password(p_user_id uuid, p_new_password text)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  -- RBAC-003. Deliberately 'admin' rather than 'support': reading a report is
  -- not the same authority as taking over an account.
  if not is_platform('admin') then
    return query select false, 'You do not have permission to do that.';
    return;
  end if;
  if p_new_password is null or length(p_new_password) < 8 then
    return query select false, 'Use a password of at least 8 characters.';
    return;
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    return query select false, 'No such account.';
    return;
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;

  -- Not the password, obviously — only that it happened, to whom, and by whom.
  perform write_audit('account.password_reset', 'user', p_user_id, '{}'::jsonb);

  return query select true, null::text;
end;
$$;

-- Closed here and handed back to `authenticated` by access_control, exactly as
-- every other admin_* function is: signed in at the grant level, then gated
-- inside on is_platform('admin'). Keeping it out of the client entirely would
-- mean support could only unlock somebody by opening a SQL editor, which is not
-- a support process anybody should have to run.
revoke execute on function public.admin_reset_password(uuid, text)
  from public, anon, authenticated;
