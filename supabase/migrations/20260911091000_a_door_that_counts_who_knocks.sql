-- The three findings docs/SECURITY.md left open, closed.
--
-- F1 · Anyone could ask whether a phone number has an account, as often as they
--      liked. `auth_email_for_sign_in` is anon-callable by necessity — the
--      sign-in screen needs the answer before there is a session — and it
--      answered truthfully with no limit, so walking the Egyptian mobile
--      prefixes produced a list of X League users' numbers.
--
-- F2 · A staff account with no password yet could be claimed by whoever got
--      there first, and `staff_auth_status` told an anonymous caller which
--      usernames existed and which were unclaimed.
--
-- F3 · `sign_up` writes auth.users directly, so none of GoTrue's rate limiting
--      applies to it and accounts could be created in a loop.
--
-- Two of the three are the same shape — an unauthenticated call that is cheap
-- to repeat — so they share one mechanism. The third is closed by removing a
-- function rather than guarding it.

-- ---------------------------------------------------------------------------
-- Who is knocking
-- ---------------------------------------------------------------------------

/**
 * The caller's address, as the API gateway saw it, or null.
 *
 * PostgREST publishes the request's headers as a GUC; Supabase sits behind a
 * proxy that sets `x-forwarded-for`, whose first entry is the client. Older
 * PostgREST spells each header as its own setting, so both are read.
 *
 * **Null means there is no request context at all** — a `psql` session, a
 * migration, the test suites. Those are already privileged: somebody holding a
 * direct connection to this database does not need to enumerate anything. So
 * null is not rate limited rather than being lumped into one shared bucket,
 * which would otherwise make every suite in `supabase/tests/` share a counter
 * and fail in a different place each run.
 */
create or replace function request_ip()
returns text
language plpgsql stable
set search_path = public, pg_temp as $$
declare
  v_headers text := current_setting('request.headers', true);
  v_fwd     text;
begin
  if v_headers is not null and v_headers <> '' then
    begin
      v_fwd := v_headers::json ->> 'x-forwarded-for';
    exception when others then
      v_fwd := null;
    end;
  end if;

  if v_fwd is null then
    v_fwd := nullif(current_setting('request.header.x-forwarded-for', true), '');
  end if;

  if v_fwd is null then
    return null;
  end if;

  -- `a, b, c` is client, then each proxy it passed through.
  return nullif(btrim(split_part(v_fwd, ',', 1)), '');
end;
$$;

-- ---------------------------------------------------------------------------
-- Counting the knocks
-- ---------------------------------------------------------------------------

create table if not exists auth_rate (
  bucket       text        not null,
  key          text        not null,
  window_start timestamptz not null default now(),
  count        integer     not null default 0,
  primary key (bucket, key)
);

alter table auth_rate enable row level security;
revoke all on table auth_rate from public, anon, authenticated;

/**
 * Take one from a fixed window, and say whether it was there to take.
 *
 * A fixed window rather than a sliding one: a sliding window needs a row per
 * event, and this table is written on every unauthenticated call the product
 * has. The seam at the window boundary lets through at most one extra window's
 * worth, which against a limit measured in tens does not change what the limit
 * is for.
 *
 * The count is incremented inside the UPSERT rather than read and then written,
 * so two callers arriving together cannot both read the same number and both
 * decide they are under the limit.
 */
create or replace function auth_rate_take(
  p_bucket text,
  p_key    text,
  p_limit  integer,
  p_window interval
)
returns boolean
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  -- No request context: a direct connection, which is already inside.
  if p_key is null then
    return true;
  end if;

  insert into auth_rate as r (bucket, key, window_start, count)
  values (p_bucket, p_key, now(), 1)
  on conflict (bucket, key) do update
     set count        = case when r.window_start < now() - p_window then 1 else r.count + 1 end,
         window_start = case when r.window_start < now() - p_window then now() else r.window_start end
  returning r.count into v_count;

  -- Housekeeping, occasionally and cheaply, so this table does not grow without
  -- bound between deploys. A day is far longer than any window here.
  if random() < 0.01 then
    delete from auth_rate where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- F1 · The lookup answers, but not forever
-- ---------------------------------------------------------------------------

/**
 * The address GoTrue knows a number by, and — while the caller is within their
 * allowance — whether that account exists.
 *
 * The address itself is not withheld: it is a pure transform of the number the
 * caller typed, and refusing to derive it would break sign-in without hiding
 * anything. `exists_already` is the part worth protecting, and beyond the
 * allowance it comes back **null** rather than false. Null means "not saying",
 * which the client reads as "ask GoTrue and report whatever it says" — so a
 * throttled person can still sign in, they just stop being told in advance
 * whether the number is registered. Answering false there would be worse than
 * saying nothing: it would be a lie that sends somebody to create an account
 * they already have.
 *
 * Forty an hour from one address. A person signing in makes one or two, and a
 * household or a café behind one address makes tens; an enumeration makes
 * millions. The limit is set where honest use is not degraded and the attack
 * stops being cheap, and degrading rather than refusing is what keeps a shared
 * address from locking anybody out.
 */
create or replace function auth_email_for_sign_in(p_phone text)
returns table (auth_email text, exists_already boolean)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_email   text := auth_email_for_phone(p_phone);
  v_allowed boolean := auth_rate_take('lookup', request_ip(), 40, interval '1 hour');
begin
  return query
  select v_email,
         case when v_allowed
              then exists (select 1 from auth.users u where u.email = v_email)
              else null::boolean
         end;
end;
$$;

-- ---------------------------------------------------------------------------
-- F3 · Sign-up cannot be run in a loop
-- ---------------------------------------------------------------------------

/**
 * Two limits, because they protect against different things.
 *
 * `sign_up_call` counts every call, including the ones that fail validation —
 * that is what stops the function being used as a free oracle for "does this
 * number have an account", which its own refusal message would otherwise be.
 *
 * `sign_up_made` counts only accounts actually created, and is the one that
 * stops a flood of junk identities.
 *
 * Both are deliberately loose. Egypt is heavily carrier-NAT'd, so one address
 * is routinely a whole neighbourhood: a team signing up together at a pitch
 * must not lock each other out, and being refused at sign-up is a wall rather
 * than a degraded experience. Thirty new accounts an hour from one address is
 * far past any real group and far short of what an abuse run wants.
 */
create or replace function sign_up(
  p_phone        text,
  p_password     text,
  p_display_name text,
  p_role         text default 'player',
  p_venue_name   text default null,
  p_venue_area   text default null,
  p_birth_year   integer default null,
  p_gender       text default null,
  p_governorate  text default null
)
returns table (ok boolean, auth_email text, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_digits text := normalise_phone(p_phone);
  v_email  text;
  v_id     uuid := gen_random_uuid();
  v_venue  uuid;
  v_pitch  uuid;
  v_dow    integer;
  v_year   smallint;
  v_ip     text := request_ip();
  v_gender text := nullif(btrim(lower(coalesce(p_gender, ''))), '');
  v_gov    text := nullif(btrim(lower(coalesce(p_governorate, ''))), '');
begin
  if not auth_rate_take('sign_up_call', v_ip, 120, interval '1 hour') then
    return query select false, null::text, 'Too many attempts. Try again later.';
    return;
  end if;

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

  if p_birth_year is not null then
    if p_birth_year < 1920 or p_birth_year > extract(year from now())::integer then
      return query select false, null::text, 'Enter the year you were born.';
      return;
    end if;
    v_year := p_birth_year::smallint;
  end if;

  if v_gender is not null and v_gender not in ('man', 'woman') then
    return query select false, null::text, 'Choose one.';
    return;
  end if;

  v_email := auth_email_for_phone(v_digits);

  if exists (select 1 from auth.users u where u.email = v_email) then
    return query select false, null::text, 'That number already has an account. Sign in instead.';
    return;
  end if;

  -- Taken here rather than at the top: an account is about to exist, and this
  -- is the limit that says how many may.
  if not auth_rate_take('sign_up_made', v_ip, 30, interval '1 hour') then
    return query select false, null::text, 'Too many attempts. Try again later.';
    return;
  end if;

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

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', v_email, now(), now(), now()
  );

  insert into player_profile (id, display_name, phone, birth_year, gender, governorate)
  values (v_id, btrim(p_display_name), '+' || v_digits, v_year, v_gender, v_gov);

  if p_role = 'venue_owner' then
    insert into venue (name, area, verification, governorate)
    values (btrim(p_venue_name), btrim(p_venue_area), 'pending', v_gov)
    returning id into v_venue;

    insert into venue_staff (venue_id, user_id, role, active)
    values (v_venue, v_id, 'owner', true);

    insert into pitch (venue_id, label, format)
    values (v_venue, 'Pitch 1', '5-a-side')
    returning id into v_pitch;

    for v_dow in 0 .. 6 loop
      insert into availability_rule (pitch_id, day_of_week, open_hour, close_hour)
      values (v_pitch, v_dow::smallint, 10::smallint, 24::smallint);
    end loop;

    insert into price_rule (pitch_id, valid_from, start_hour, end_hour, price_egp, deposit_egp)
    values (v_pitch, current_date, 0::smallint, 24::smallint, 300, 0);
  end if;

  return query select true, v_email, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- F2 · A console account is never unclaimed
-- ---------------------------------------------------------------------------
--
-- The old answer was a function that set the first password on any account that
-- did not have one, callable by anybody. It was narrow — staff only, and it
-- refused an account that already had a password — but the window it left open
-- was real: every staff account created sat claimable by the first person to
-- guess the username, and `staff_auth_status` would tell them which usernames
-- those were.
--
-- Hardening it would mean asking for a code. But if the account must hold a code
-- before it can be claimed, it may as well hold a password too, and then there
-- is nothing for `staff_set_first_password` to act on: the way in is
-- `staff_reset_password`, which has always required a hashed code and always
-- locked after five wrong ones. So the function is removed rather than guarded,
-- and the anon surface gets smaller instead of more complicated.

-- Any console account without a password gets one nobody knows. The only such
-- accounts today are test rows with no username, which nothing can sign into
-- anyway; this makes "there is no unclaimed console account" true by
-- construction rather than by inspection. No recovery code is issued, because
-- issuing one nobody reads helps nobody — if one of these turns out to be a
-- real person's, an administrator hands them a fresh one with
-- `admin_rotate_console_password`.
update auth.users u
   set encrypted_password = extensions.crypt(
         encode(extensions.gen_random_bytes(32), 'base64'), extensions.gen_salt('bf')),
       updated_at = now()
 where (u.encrypted_password is null or u.encrypted_password = '')
   and exists (select 1 from platform_role r where r.user_id = u.id and r.active);

drop function if exists staff_set_first_password(text, text);

/**
 * Create a console account, with a password nobody knows and a code to claim it.
 *
 * This is what replaces "add the row in SQL and let them set the password".
 * There is no moment when the account is claimable, because it is created with
 * a password already set; the recovery code is the one thing handed over, and
 * `staff_reset_password` is the one door it opens.
 *
 * Admin rather than moderator: creating a colleague is not a support action.
 */
create or replace function admin_create_console_account(
  p_username     text,
  p_display_name text,
  p_role         platform_role_kind default 'support'
)
returns table (ok boolean, reason text, recovery_code text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_user  text := nullif(btrim(lower(coalesce(p_username, ''))), '');
  v_email text;
  v_id    uuid := gen_random_uuid();
  v_unguessable text := encode(extensions.gen_random_bytes(32), 'base64');
begin
  if not is_platform('admin') then
    return query select false, 'You do not have permission to do that.', null::text;
    return;
  end if;

  if v_user is null or length(v_user) < 2 or v_user ~ '[^a-z0-9._-]' then
    return query select false, 'Use a username of at least two letters, digits, dot, dash or underscore.', null::text;
    return;
  end if;

  if length(btrim(coalesce(p_display_name, ''))) < 2 then
    return query select false, 'Give them a name.', null::text;
    return;
  end if;

  v_email := staff_email(v_user);

  if exists (select 1 from auth.users u where u.email = v_email) then
    return query select false, 'That username is taken.', null::text;
    return;
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, extensions.crypt(v_unguessable, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', btrim(p_display_name), 'username', v_user),
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', v_email, now(), now(), now()
  );

  insert into platform_role (user_id, role, granted_by, active)
  values (v_id, p_role, auth.uid(), true);

  perform write_audit('account.console_created', 'user', v_id,
                      jsonb_build_object('username', v_user, 'role', p_role));

  return query select true, null::text, issue_recovery_code(v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

revoke execute on function public.request_ip() from public, anon, authenticated;
revoke execute on function public.auth_rate_take(text, text, integer, interval)
  from public, anon, authenticated;

revoke execute on function public.sign_up(text, text, text, text, text, text, integer, text, text)
  from public;
grant execute on function public.sign_up(text, text, text, text, text, text, integer, text, text)
  to anon, authenticated;

revoke execute on function public.auth_email_for_sign_in(text) from public;
grant  execute on function public.auth_email_for_sign_in(text) to anon, authenticated;

-- Closed to everybody. It existed so the console's sign-in screen could decide
-- whether to offer "set your first password"; there is no such screen now, and
-- what it answered — which staff usernames exist, and which are unclaimed — is
-- exactly what an attacker wanted to know.
revoke execute on function public.staff_auth_status(text) from public, anon, authenticated;

revoke execute on function public.admin_create_console_account(text, text, platform_role_kind)
  from public, anon;
grant execute on function public.admin_create_console_account(text, text, platform_role_kind)
  to authenticated;
