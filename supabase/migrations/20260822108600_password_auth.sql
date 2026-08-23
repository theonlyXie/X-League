-- Signing up with a phone number and a password, without SMS.
--
-- AUTH-001 asks for phone-and-OTP, and that is still where this is going. But
-- there is no SMS provider yet, and Supabase refuses phone signups without one
-- ("Phone signups are disabled"), so nobody can create an account at all. The
-- product cannot be tested, let alone shipped, in that state.
--
-- So: the person still identifies by phone number and now also chooses a
-- password. GoTrue authenticates on an email address, so each account carries a
-- derived one — `201000000001@xleague.app` — which exists only to give GoTrue a
-- key to look the account up by. It is never shown, never sent to, and never
-- asked for. `auth_email_for_phone` is the single place that mapping lives, so
-- moving to real phone auth later means deleting one function rather than
-- unpicking a convention scattered across two clients.
--
-- Why this creates the account itself rather than calling GoTrue's signup:
-- GoTrue's email signup sends a confirmation mail, is rate-limited to a couple
-- an hour on the built-in SMTP, and rejects domains without an MX record. All
-- three are wrong for an account whose email is a lookup key nobody will ever
-- read. Writing the row directly avoids all three, and sign-in through
-- `/auth/v1/token?grant_type=password` then works normally — GoTrue reads
-- `encrypted_password` and verifies the bcrypt hash, which is exactly what this
-- writes.
--
-- The security boundary is unchanged. This function creates ordinary players
-- and venue owners and nothing else: `platform_role` is never written here, so
-- no amount of calling it can produce an admin.

-- ---------------------------------------------------------------------------
-- The phone <-> lookup-address mapping
-- ---------------------------------------------------------------------------

-- Digits only, in international form without the plus, so that every way one
-- person writes their own number reaches the same account.
--
-- Stripping punctuation is not enough on its own: `+201000000042`,
-- `00201000000042` and `01000000042` are the same Egyptian mobile written three
-- ways people actually write it, and left alone they would become three
-- accounts with three passwords and three cards. The last of those rules is
-- Egypt-specific — a leading `0` on an 11-digit number is the local trunk
-- prefix — which is correct while the product is Egypt-only (Cairo, EGP,
-- Africa/Cairo throughout) and is the line to revisit when it is not.
create or replace function normalise_phone(p_phone text)
returns text
language sql immutable
set search_path = public, pg_temp as $$
  with digits as (
    select nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '') as d
  )
  select case
           -- International prefix dialled as 00 rather than +.
           when d like '00%'                    then substr(d, 3)
           -- Local Egyptian mobile: 01X XXXX XXXX.
           when d like '0%' and length(d) = 11  then '20' || substr(d, 2)
           else d
         end
    from digits;
$$;

create or replace function auth_email_for_phone(p_phone text)
returns text
language sql immutable
set search_path = public, pg_temp as $$
  select normalise_phone(p_phone) || '@xleague.app';
$$;

-- ---------------------------------------------------------------------------
-- Creating an account
-- ---------------------------------------------------------------------------

-- Returns the address the client should then sign in with, so the caller never
-- has to know how the mapping works.
create or replace function sign_up(
  p_phone        text,
  p_password     text,
  p_display_name text,
  p_role         text default 'player',
  -- Only read when p_role is 'venue_owner'.
  p_venue_name   text default null,
  p_venue_area   text default null
)
returns table (ok boolean, auth_email text, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_digits text := normalise_phone(p_phone);
  v_email  text;
  v_id     uuid := gen_random_uuid();
  v_venue  uuid;
begin
  -- Egyptian mobile numbers are 10 digits after the country code; being
  -- generous rather than clever, because a wrong rule here locks people out.
  if v_digits is null or length(v_digits) < 8 or length(v_digits) > 15 then
    return query select false, null::text, 'Enter a valid phone number.';
    return;
  end if;

  if p_password is null or length(p_password) < 8 then
    return query select false, null::text, 'Use a password of at least 8 characters.';
    return;
  end if;

  if length(btrim(coalesce(p_display_name, ''))) < 2 then
    return query select false, null::text, 'Tell us your name.';
    return;
  end if;

  if p_role not in ('player', 'venue_owner') then
    return query select false, null::text, 'Choose player or venue owner.';
    return;
  end if;

  if p_role = 'venue_owner'
     and (length(btrim(coalesce(p_venue_name, ''))) < 2
       or length(btrim(coalesce(p_venue_area, ''))) < 2) then
    return query select false, null::text, 'Give the venue a name and an area.';
    return;
  end if;

  v_email := auth_email_for_phone(v_digits);

  if exists (select 1 from auth.users u where u.email = v_email) then
    return query select false, null::text, 'That number already has an account. Sign in instead.';
    return;
  end if;

  -- The account. `email_confirmed_at` is set because there is no email to
  -- confirm — the address is a lookup key, and leaving it null would lock the
  -- person out of the account they just made.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', btrim(p_display_name), 'phone', v_digits),
    '', '', '', ''
  );

  -- GoTrue looks for an identity row alongside the user; without one, sign-in
  -- succeeds but the account looks half-made to everything that reads it.
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', v_email, now(), now(), now()
  );

  -- NFR-PRIV-003: the real number lives here, not in discovery.
  insert into player_profile (id, display_name, phone)
  values (v_id, btrim(p_display_name), '+' || v_digits);

  if p_role = 'venue_owner' then
    -- VEN-006 / ADM-008: a venue somebody registered for themselves is pending
    -- until the platform verifies it. It is listed, and marked as unverified,
    -- which is exactly what the verification queue is for.
    insert into venue (name, area, verification)
    values (btrim(p_venue_name), btrim(p_venue_area), 'pending')
    returning id into v_venue;

    insert into venue_staff (venue_id, user_id, role, active)
    values (v_venue, v_id, 'owner', true);

    -- A venue with no pitch cannot be booked, and an owner who has to find the
    -- "add a pitch" screen before anything works will conclude it is broken.
    insert into pitch (venue_id, label, format)
    values (v_venue, 'Pitch 1', '5-a-side');
  end if;

  return query select true, v_email, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Signing in
-- ---------------------------------------------------------------------------

-- The client needs the lookup address before it can call GoTrue, and it must
-- not have to guess whether the account exists. Anon-callable by necessity —
-- it is used before there is a session — and it reveals only whether a number
-- is registered, which the sign-up path reveals anyway.
create or replace function auth_email_for_sign_in(p_phone text)
returns table (auth_email text, exists_already boolean)
language sql stable security definer
set search_path = public, pg_temp as $$
  select auth_email_for_phone(p_phone),
         exists (select 1 from auth.users u where u.email = auth_email_for_phone(p_phone));
$$;

-- Changing a password from inside a session, which GoTrue's own updateUser
-- also does — kept here so the whole password story lives in one place and a
-- client never needs a second mechanism.
create or replace function change_password(p_current text, p_new text)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_hash text;
begin
  if auth.uid() is null then
    return query select false, 'Sign in first.';
    return;
  end if;
  if p_new is null or length(p_new) < 8 then
    return query select false, 'Use a password of at least 8 characters.';
    return;
  end if;

  select encrypted_password into v_hash from auth.users where id = auth.uid();
  if v_hash is null or v_hash <> extensions.crypt(p_current, v_hash) then
    return query select false, 'That is not your current password.';
    return;
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_new, extensions.gen_salt('bf')),
         updated_at = now()
   where id = auth.uid();

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- Closed here, handed back in 20260822109000_access_control.sql, which runs
-- after this one and is the single authoritative statement of who may call
-- what. A grant written next to its function is a grant that drifts.
--
-- The mapping functions stay shut to everyone: exposing them would let anybody
-- turn a phone number into the address that account is keyed by, without ever
-- having to tell us they tried.
revoke execute on function public.normalise_phone(text) from public, anon, authenticated;
revoke execute on function public.auth_email_for_phone(text) from public, anon, authenticated;
revoke execute on function public.sign_up(text, text, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.auth_email_for_sign_in(text) from public, anon, authenticated;
revoke execute on function public.change_password(text, text) from public, anon, authenticated;
