-- Sign-up and password probe (AUTH-001 as it stands without SMS).
--
-- `sign_up` is the only function in the schema that a signed-out person can
-- call that writes anything, and it writes into `auth`. That makes it the one
-- place where a mistake is not a bug but a way in, so the cases below are
-- mostly about what it must refuse: a self-granted platform role, a second
-- account on one number, a password anybody could guess.
--
--   psql -f supabase/tests/auth_probe.sql

create or replace function auth_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  v_id    uuid;
  v_email text;
  v_hash  text;
  v_n     integer;
  v_venue uuid;
  r       record;
begin
  -- -------------------------------------------------------------------------
  -- One number, one person
  -- -------------------------------------------------------------------------
  return query select 'a number normalises to its digits',
                      normalise_phone('+20 100 000 0042'),
                      normalise_phone('+20 100 000 0042') = '201000000042';

  -- The three ways one person writes their own number. Left alone these are
  -- three accounts, three passwords and three cards.
  return query select 'dialled with 00 rather than +',
                      normalise_phone('0020-100-000-0042'),
                      normalise_phone('0020 100 000 0042') = '201000000042';

  return query select 'or as the local number they give a taxi driver',
                      normalise_phone('01000000042'),
                      normalise_phone('01000000042') = '201000000042';

  -- -------------------------------------------------------------------------
  -- What sign-up refuses
  -- -------------------------------------------------------------------------
  select * into r from sign_up('123', 'longenough1', 'Nour');
  return query select 'a number too short to be one is refused',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Enter a valid phone number.';

  select * into r from sign_up('+201000000042', 'short', 'Nour');
  return query select 'so is a password anybody could guess',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason like 'Use a password%';

  select * into r from sign_up('+201000000042', 'longenough1', '');
  return query select 'and an account with no name',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Tell us your name.';

  -- RBAC-003. The role argument is a product choice, not a permission: there is
  -- no value of it that produces platform access.
  select * into r from sign_up('+201000000042', 'longenough1', 'Nour', 'admin');
  return query select 'and any role but player or venue owner',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Choose player or venue owner.';

  -- -------------------------------------------------------------------------
  -- A player
  -- -------------------------------------------------------------------------
  select * into r from sign_up('+20 100 000 0042', 'longenough1', 'Nour Hassan');
  v_email := r.auth_email;
  return query select 'a player can sign up', coalesce(r.reason, r.auth_email), r.ok;

  return query select 'and is looked up by an address derived from the number',
                      v_email, v_email = '201000000042@xleague.app';

  select count(*)::integer into v_n from auth.users where email = v_email;
  return query select 'the account exists', v_n::text, v_n = 1;

  select id, encrypted_password into v_id, v_hash from auth.users where email = v_email;

  -- The whole point of the exercise: GoTrue verifies a bcrypt hash, so if this
  -- does not match, sign-in cannot work however right everything else looks.
  return query select 'the password verifies as bcrypt, the way GoTrue checks it',
                      case when v_hash = extensions.crypt('longenough1', v_hash)
                           then 'verified' else '(mismatch!)' end,
                      v_hash = extensions.crypt('longenough1', v_hash);

  return query select 'and is not stored in the clear',
                      case when v_hash like '$2%' then 'bcrypt' else v_hash end,
                      v_hash <> 'longenough1' and v_hash like '$2%';

  select count(*)::integer into v_n from auth.identities where user_id = v_id;
  return query select 'GoTrue has an identity row to read', v_n::text, v_n = 1;

  select count(*)::integer into v_n
    from player_profile where id = v_id and phone = '+201000000042';
  return query select 'the real number is on the profile, not in discovery',
                      v_n::text, v_n = 1;

  -- RBAC-003 again, from the other side: after a successful sign-up there is
  -- still no platform role anywhere near this account.
  select count(*)::integer into v_n from platform_role where user_id = v_id;
  return query select 'signing up grants no platform role', v_n::text, v_n = 0;

  select count(*)::integer into v_n from venue_staff where user_id = v_id;
  return query select 'nor any venue', v_n::text, v_n = 0;

  -- -------------------------------------------------------------------------
  -- One account per number
  -- -------------------------------------------------------------------------
  select * into r from sign_up('+201000000042', 'differentpw1', 'Someone Else');
  return query select 'the same number cannot sign up twice',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason like 'That number already has%';

  -- Even written differently, because the number was normalised on the way in.
  select * into r from sign_up('0020 100 000 0042', 'differentpw1', 'Someone Else');
  return query select 'however differently it is typed',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from sign_up('01000000042', 'differentpw1', 'Someone Else');
  return query select 'including as a local number',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select auth_email, exists_already into r from auth_email_for_sign_in('+201000000042');
  return query select 'sign-in can find the address for a known number',
                      r.auth_email, r.exists_already and r.auth_email = v_email;

  select exists_already into r from auth_email_for_sign_in('+201999999999');
  return query select 'and says plainly when there is no account',
                      r.exists_already::text, r.exists_already = false;

  -- -------------------------------------------------------------------------
  -- A venue owner
  -- -------------------------------------------------------------------------
  select * into r from sign_up('+201000000043', 'longenough1', 'Omar Fathy', 'venue_owner');
  return query select 'a venue owner needs a venue',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason like 'Give the venue%';

  select * into r from sign_up('+201000000043', 'longenough1', 'Omar Fathy',
                               'venue_owner', 'Fathy Arena', 'Maadi');
  return query select 'and with one, can sign up', coalesce(r.reason, 'created'), r.ok;

  select id into v_id from auth.users where email = r.auth_email;
  select venue_id into v_venue from venue_staff where user_id = v_id;

  return query select 'they own the venue they registered',
                      (select role::text from venue_staff where user_id = v_id),
                      (select role from venue_staff where user_id = v_id) = 'owner';

  return query select 'is_venue_staff agrees, at manager level',
                      'checked',
                      (select is_venue_staff(v_venue, 'manager')
                         from (select set_config('request.jwt.claims',
                               json_build_object('sub', v_id)::text, true)) _);

  -- VEN-006 / ADM-008: registering a venue does not verify it. It goes in the
  -- queue like any other, which is the whole reason the queue exists.
  return query select 'but the venue is pending, not verified',
                      (select verification from venue where id = v_venue),
                      (select verification from venue where id = v_venue) = 'pending';

  select count(*)::integer into v_n from pitch where venue_id = v_venue;
  return query select 'and it has a pitch, so it can be booked at all',
                      v_n::text, v_n = 1;

  select count(*)::integer into v_n from platform_role where user_id = v_id;
  return query select 'registering a venue grants no platform role either',
                      v_n::text, v_n = 0;

  -- -------------------------------------------------------------------------
  -- Changing a password
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_id)::text, true);

  select * into r from change_password('wrongpassword', 'newpassword1');
  return query select 'a password cannot be changed without the old one',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'That is not your current password.';

  select * into r from change_password('longenough1', 'short');
  return query select 'nor changed to one anybody could guess',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from change_password('longenough1', 'newpassword1');
  return query select 'but can be, with it', coalesce(r.reason, 'changed'), r.ok;

  select encrypted_password into v_hash from auth.users where id = v_id;
  return query select 'and the new one is what verifies afterwards',
                      case when v_hash = extensions.crypt('newpassword1', v_hash)
                           then 'verified' else '(mismatch!)' end,
                      v_hash = extensions.crypt('newpassword1', v_hash)
                      and v_hash <> extensions.crypt('longenough1', v_hash);

  perform set_config('request.jwt.claims', '', true);
  select * into r from change_password('newpassword1', 'anotherpassword1');
  return query select 'and nobody signed out can change anybody''s',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Sign in first.';

  -- -------------------------------------------------------------------------
  -- Letting a locked-out person back in
  -- -------------------------------------------------------------------------
  -- There is no SMS and no mailbox behind these addresses, so a forgotten
  -- password has no self-service route back. An admin reset is the fallback,
  -- and it has to be an admin.
  perform set_config('request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
  select * into r from admin_reset_password(v_id, 'resetbyadmin1');
  return query select 'a player cannot reset somebody else''s password',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'You do not have permission to do that.';

  insert into platform_role (user_id, role)
  values ('11111111-1111-1111-1111-111111111111', 'admin')
  on conflict (user_id) do update set role = 'admin', active = true;

  select * into r from admin_reset_password(v_id, 'short');
  return query select 'nor can an admin set one anybody could guess',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from admin_reset_password(
    '00000000-0000-0000-0000-0000000000ff'::uuid, 'resetbyadmin1');
  return query select 'and an account that does not exist says so',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'No such account.';

  select * into r from admin_reset_password(v_id, 'resetbyadmin1');
  return query select 'but an admin can reset a real one',
                      coalesce(r.reason, 'reset'), r.ok;

  select encrypted_password into v_hash from auth.users where id = v_id;
  return query select 'and the new password is what verifies afterwards',
                      case when v_hash = extensions.crypt('resetbyadmin1', v_hash)
                           then 'verified' else '(mismatch!)' end,
                      v_hash = extensions.crypt('resetbyadmin1', v_hash);

  -- ADM-012: an admin who can set anybody's password can become anybody.
  select count(*)::integer into v_n
    from audit_log where action = 'account.password_reset' and subject_id = v_id;
  return query select 'every reset is on the record', v_n::text, v_n = 1;

  -- Reachable by a signed-in client and gated inside, like every other admin_*
  -- function — but never by a signed-out one, which is the line that matters.
  return query select 'the reset needs a session, and is never anonymous',
    case when has_function_privilege('anon', 'admin_reset_password(uuid,text)', 'execute')
         then '(anon can reach it!)' else 'closed to anon' end,
    has_function_privilege('authenticated', 'admin_reset_password(uuid,text)', 'execute')
    and not has_function_privilege('anon', 'admin_reset_password(uuid,text)', 'execute');

  -- -------------------------------------------------------------------------
  -- What a signed-out client may reach
  -- -------------------------------------------------------------------------
  return query select 'sign_up is callable before there is a session',
                      case when has_function_privilege(
                             'anon', 'sign_up(text,text,text,text,text,text)', 'execute')
                           then 'granted' else '(closed!)' end,
                      has_function_privilege(
                        'anon', 'sign_up(text,text,text,text,text,text)', 'execute');

  -- The mapping itself is not an API: exposing it would let anyone enumerate
  -- the address for a number without telling us they had.
  return query select 'but the address mapping is not',
                      case when has_function_privilege(
                             'anon', 'auth_email_for_phone(text)', 'execute')
                           then '(reachable!)' else 'closed' end,
                      not has_function_privilege('anon', 'auth_email_for_phone(text)', 'execute')
                  and not has_function_privilege('authenticated', 'auth_email_for_phone(text)', 'execute');

  return query select 'and change_password needs a session',
                      case when has_function_privilege('anon', 'change_password(text,text)', 'execute')
                           then '(reachable!)' else 'closed' end,
                      not has_function_privilege('anon', 'change_password(text,text)', 'execute')
                  and has_function_privilege('authenticated', 'change_password(text,text)', 'execute');
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from auth_probe();
rollback;

drop function auth_probe();
