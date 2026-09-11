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
  -- The three questions sign-up asks (20260911090000)
  -- -------------------------------------------------------------------------
  --
  -- These exist because the clients were shipped calling for them and the
  -- schema never was: `sign_up` was called with three parameters it did not
  -- have, which PostgREST answers by refusing to find the function at all. Not
  -- a degraded feature — nobody could create an account.
  select * into r from sign_up('+201000000077', 'longenough1', 'Mariam Adel',
                               'player', null, null, 2100, 'woman', 'cairo');
  return query select 'a year of birth in the future is refused',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Enter the year you were born.';

  select * into r from sign_up('+201000000077', 'longenough1', 'Mariam Adel',
                               'player', null, null, 1998, 'neither', 'cairo');
  return query select 'and a gender that is not one of the two',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Choose one.';

  select * into r from sign_up('+201000000077', 'longenough1', 'Mariam Adel',
                               'player', null, null, 1998, 'woman', 'cairo');
  return query select 'a player signs up with all three',
                      coalesce(r.reason, r.auth_email), r.ok;

  select count(*)::integer into v_n
    from player_profile p
    join auth.users u on u.id = p.id
   where u.email = '201000000077@xleague.app'
     and p.birth_year = 1998 and p.gender = 'woman' and p.governorate = 'cairo';
  return query select 'and all three are on the profile', v_n::text, v_n = 1;

  -- All three stay optional. Every account made before the questions existed
  -- has none of them, and an app that will not work until somebody states their
  -- gender is worse than one that asks nicely.
  select * into r from sign_up('+201000000078', 'longenough1', 'Omar Fathy');
  return query select 'and all three stay optional',
                      coalesce(r.reason, r.auth_email), r.ok;

  -- -------------------------------------------------------------------------
  -- F1 — the lookup answers, and then stops answering (20260911091000)
  -- -------------------------------------------------------------------------
  --
  -- Rate limiting keys on the address the gateway saw. A direct connection has
  -- no request context and is never limited, which is why the cases above all
  -- pass however many times they run; these set one so the limit can be seen.
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.9, 10.0.0.1"}', true);

  return query select 'the caller is identified by the first forwarded address',
                      coalesce(request_ip(), '(none)'), request_ip() = '203.0.113.9';

  select exists_already into r from auth_email_for_sign_in('+201000000042');
  return query select 'and inside the allowance the answer is the truth',
                      r.exists_already::text, r.exists_already = true;

  -- Forty an hour. Walk past it and the truth stops being handed out.
  for v_n in 1 .. 45 loop
    perform auth_email_for_sign_in('+20100000' || lpad(v_n::text, 4, '0'));
  end loop;

  select auth_email, exists_already into r from auth_email_for_sign_in('+201000000042');
  return query select 'past the allowance it will not say whether an account exists',
                      coalesce(r.exists_already::text, 'null'), r.exists_already is null;

  -- Crucially not `false`. A lie there would send somebody who has an account
  -- to create a second one; null means "ask GoTrue", which still signs them in.
  return query select 'but it still hands back the address, so sign-in works',
                      r.auth_email, r.auth_email = '201000000042@xleague.app';

  -- A different address has its own allowance, so one abusive caller cannot
  -- lock out everybody else.
  perform set_config('request.headers', '{"x-forwarded-for":"198.51.100.4"}', true);
  select exists_already into r from auth_email_for_sign_in('+201000000042');
  return query select 'and another caller is unaffected',
                      r.exists_already::text, r.exists_already = true;

  perform set_config('request.headers', '', true);

  -- -------------------------------------------------------------------------
  -- F2 — there is no unclaimed console account to race for (20260911091000)
  -- -------------------------------------------------------------------------
  select count(*)::integer into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'staff_set_first_password';
  return query select 'nothing can set a first console password any more',
                      v_n::text, v_n = 0;

  return query select 'and nobody may ask which console usernames exist',
                      case when has_function_privilege('anon', 'staff_auth_status(text)', 'execute')
                            or has_function_privilege('authenticated', 'staff_auth_status(text)', 'execute')
                           then '(reachable!)' else 'closed' end,
                      not has_function_privilege('anon', 'staff_auth_status(text)', 'execute')
                  and not has_function_privilege('authenticated', 'staff_auth_status(text)', 'execute');

  -- The property is "nothing is claimable", and claiming goes through
  -- `staff_user_id`, which resolves a username to an account by its email. An
  -- account with no email — the seeded fixtures, and the ten test rows the
  -- security pass found in production — has no username to be claimed by and
  -- never had one. An account with an email and no password is the dangerous
  -- shape, and there must be none.
  select count(*)::integer into v_n
    from auth.users u
    join platform_role pr on pr.user_id = u.id and pr.active
   where u.email is not null and u.email <> ''
     and (u.encrypted_password is null or u.encrypted_password = '');
  return query select 'and no console account is sitting without a password',
                      v_n::text, v_n = 0;

  select count(*)::integer into v_n
    from auth.users u
   where (u.encrypted_password is null or u.encrypted_password = '')
     and staff_user_id(coalesce(u.email, '')) is not null;
  return query select 'nor is any of them reachable by a username',
                      v_n::text, v_n = 0;

  -- Creating one is an admin act, and it is refused without the role rather
  -- than quietly doing nothing.
  select * into r from admin_create_console_account('probe', 'Probe Person', 'support');
  return query select 'creating a console account needs the admin role',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'You do not have permission to do that.';

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
                             'anon', 'sign_up(text,text,text,text,text,text,integer,text,text)', 'execute')
                           then 'granted' else '(closed!)' end,
                      has_function_privilege(
                        'anon', 'sign_up(text,text,text,text,text,text,integer,text,text)', 'execute');

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
