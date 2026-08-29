-- A venue that registers itself has a price, not a zero.
--
-- 20260822108960 gave a new venue a week of opening hours, which made it
-- bookable. It did not give it a price rule, and `search_availability` reports
-- an hour with no rule as `price_egp = 0`. So a venue that registered and
-- looked at its own calendar saw fourteen hours reading "EGP 0" — and, worse,
-- those hours were on sale at zero: a player could have held and confirmed one
-- for nothing, and the venue's own ledger would have recorded the sale at its
-- full stated value of nothing.
--
-- The number is a starting point, not a claim about this venue: 300 EGP is
-- what the seeded Cairo venues charge for an evening five-a-side hour, and the
-- pricing screen exists precisely so an owner can change it. What matters is
-- that the state a venue is created in is a coherent one — the same reason it
-- is created with hours rather than none.

create or replace function sign_up(
  p_phone        text,
  p_password     text,
  p_display_name text,
  p_role         text default 'player',
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
  v_pitch  uuid;
  v_dow    integer;
begin
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

  insert into player_profile (id, display_name, phone)
  values (v_id, btrim(p_display_name), '+' || v_digits);

  if p_role = 'venue_owner' then
    insert into venue (name, area, verification)
    values (btrim(p_venue_name), btrim(p_venue_area), 'pending')
    returning id into v_venue;

    insert into venue_staff (venue_id, user_id, role, active)
    values (v_venue, v_id, 'owner', true);

    insert into pitch (venue_id, label, format)
    values (v_venue, 'Pitch 1', '5-a-side')
    returning id into v_pitch;

    -- Every day, 10:00 to midnight — the hours a five-a-side pitch in Cairo
    -- actually sells. An owner who changes nothing still has a venue that
    -- works; an owner who wants different hours has a screen for it.
    for v_dow in 0 .. 6 loop
      insert into availability_rule (pitch_id, day_of_week, open_hour, close_hour)
      values (v_pitch, v_dow::smallint, 10::smallint, 24::smallint);
    end loop;

    -- And a price across all of them, for the same reason.
    insert into price_rule (pitch_id, valid_from, start_hour, end_hour, price_egp, deposit_egp)
    values (v_pitch, current_date, 0::smallint, 24::smallint, 300, 0);
  end if;

  return query select true, v_email, null::text;
end;
$$;

revoke execute on function public.sign_up(text, text, text, text, text, text)
  from public, anon, authenticated;
