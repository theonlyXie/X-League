-- A venue registered through the product can actually open for business.
--
-- Four findings from reviewing the operations surfaces, all of the same shape:
-- a thing the product needs to do that no function anywhere could do.
--
--   1. Opening hours. `search_availability` builds every sellable slot from
--      `availability_rule`. Across every migration that table is read in five
--      places and written in none — only seed.sql inserts any, for the demo
--      venues. `sign_up` creates a venue and a pitch and no rule, so a venue
--      registered through the product returns zero slots for ever, cannot be
--      booked, and its owner has nowhere to fix that. The sign-up screen
--      meanwhile promises "you can set your pitches, hours and prices straight
--      away". Two of those three were not true.
--
--   2. Pitches. Nothing writes `pitch` except sign_up and the seed, so every
--      venue is permanently a one-pitch venue called "Pitch 1". Both the
--      pricing and closures screens have a pitch picker gated on having more
--      than one — a condition no real venue could ever reach.
--
--   3. Rejecting a venue. `venue.verification` is constrained to
--      ('verified','pending','unverified'); `admin_set_verification` validates
--      against ('pending','verified','rejected','suspended'). The intersection
--      is two states, so "reject" fails in both consoles — politely in one,
--      silently in the other. One vocabulary, chosen here: the constraint's,
--      because it is the one players are shown.
--
--   4. Hours have to exist the moment a venue does, or the owner's first
--      screen is an empty grid with no explanation. sign_up now seeds a
--      sensible week, which the owner can then change.

-- ---------------------------------------------------------------------------
-- Opening hours
-- ---------------------------------------------------------------------------

-- The week as it stands, so a screen can render it without inferring anything.
create or replace function venue_hours(p_venue_id uuid)
returns table (
  pitch_id    uuid,
  pitch_label text,
  day_of_week smallint,
  open_hour   smallint,
  close_hour  smallint
)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if not is_venue_staff(p_venue_id) then
    raise exception 'You do not have access to that venue.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select p.id, p.label, r.day_of_week, r.open_hour, r.close_hour
    from pitch p
    left join availability_rule r on r.pitch_id = p.id
   where p.venue_id = p_venue_id
   order by p.label, r.day_of_week;
end;
$$;

-- One pitch, one day, one window. Replacing rather than appending, because two
-- overlapping rules for the same day would generate the same hour twice and
-- the booking grid would show it twice.
--
-- p_close_hour = p_open_hour closes the day entirely, which is how a venue
-- says "we don't open Fridays" without needing a second verb.
create or replace function set_venue_hours(
  p_pitch_id   uuid,
  p_day_of_week integer,
  p_open_hour  integer,
  p_close_hour integer
)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_venue uuid := venue_of_pitch(p_pitch_id);
begin
  if v_venue is null then
    return query select false, 'That pitch no longer exists.';
    return;
  end if;
  if not is_venue_staff(v_venue, 'manager') then
    return query select false, 'You do not manage that venue.';
    return;
  end if;
  if p_day_of_week < 0 or p_day_of_week > 6 then
    return query select false, 'That is not a day of the week.';
    return;
  end if;
  if p_open_hour < 0 or p_close_hour > 24 then
    return query select false, 'Hours run from 0 to 24.';
    return;
  end if;
  if p_close_hour < p_open_hour then
    return query select false, 'Closing time cannot be before opening time.';
    return;
  end if;

  delete from availability_rule
   where pitch_id = p_pitch_id and day_of_week = p_day_of_week::smallint;

  -- Equal hours means closed that day: the delete above is the whole change.
  if p_close_hour > p_open_hour then
    insert into availability_rule (pitch_id, day_of_week, open_hour, close_hour)
    values (p_pitch_id, p_day_of_week::smallint,
            p_open_hour::smallint, p_close_hour::smallint);
  end if;

  perform write_audit('venue.hours', 'pitch', p_pitch_id,
    jsonb_build_object('day', p_day_of_week, 'open', p_open_hour, 'close', p_close_hour));

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pitches
-- ---------------------------------------------------------------------------

create or replace function add_pitch(
  p_venue_id uuid,
  p_label    text,
  p_format   text default '5-a-side'
)
returns table (ok boolean, pitch_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if not is_venue_staff(p_venue_id, 'manager') then
    return query select false, null::uuid, 'You do not manage that venue.';
    return;
  end if;
  if length(btrim(coalesce(p_label, ''))) < 1 then
    return query select false, null::uuid, 'Give the pitch a name.';
    return;
  end if;
  if exists (select 1 from pitch where venue_id = p_venue_id and label = btrim(p_label)) then
    return query select false, null::uuid, 'There is already a pitch with that name.';
    return;
  end if;

  insert into pitch (venue_id, label, format)
  values (p_venue_id, btrim(p_label), coalesce(p_format, '5-a-side'))
  returning id into v_id;

  -- A pitch with no hours is a pitch that cannot be sold, which is the trap
  -- this whole migration exists to close. New pitches inherit the venue's
  -- existing week so they are bookable the moment they are created.
  insert into availability_rule (pitch_id, day_of_week, open_hour, close_hour, slot_minutes)
  select v_id, r.day_of_week, r.open_hour, r.close_hour, r.slot_minutes
    from availability_rule r
    join pitch p on p.id = r.pitch_id
   where p.venue_id = p_venue_id and p.id <> v_id
   group by r.day_of_week, r.open_hour, r.close_hour, r.slot_minutes;

  perform write_audit('venue.pitch_added', 'venue', p_venue_id,
                      jsonb_build_object('pitch_id', v_id, 'label', btrim(p_label)));

  return query select true, v_id, null::text;
end;
$$;

-- Renaming and taking a pitch out of service. OWN-002 already says a pitch can
-- be retired independently of its venue; nothing could do it.
create or replace function update_pitch(
  p_pitch_id    uuid,
  p_label       text default null,
  p_format      text default null,
  p_operational boolean default null
)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_venue uuid := venue_of_pitch(p_pitch_id);
begin
  if v_venue is null then
    return query select false, 'That pitch no longer exists.';
    return;
  end if;
  if not is_venue_staff(v_venue, 'manager') then
    return query select false, 'You do not manage that venue.';
    return;
  end if;
  if p_label is not null and length(btrim(p_label)) < 1 then
    return query select false, 'Give the pitch a name.';
    return;
  end if;
  if p_label is not null and exists (
       select 1 from pitch
        where venue_id = v_venue and label = btrim(p_label) and id <> p_pitch_id) then
    return query select false, 'There is already a pitch with that name.';
    return;
  end if;

  update pitch
     set label       = coalesce(btrim(p_label), label),
         format      = coalesce(p_format, format),
         operational = coalesce(p_operational, operational)
   where id = p_pitch_id;

  perform write_audit('venue.pitch_updated', 'pitch', p_pitch_id,
    jsonb_build_object('label', p_label, 'operational', p_operational));

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- One vocabulary for verification
-- ---------------------------------------------------------------------------

-- The function accepted two words the table forbids, so "reject" could never
-- succeed. The table's vocabulary wins: it is the one `search_venues` sorts on
-- and the one players are shown.
create or replace function admin_set_verification(
  p_venue_id uuid, p_verification text, p_note text default null
)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform('moderator') then
    return query select false, 'Not authorised.';
    return;
  end if;
  if p_verification not in ('pending', 'verified', 'unverified') then
    return query select false, 'That is not a verification state.';
    return;
  end if;
  if not exists (select 1 from venue where id = p_venue_id) then
    return query select false, 'That venue no longer exists.';
    return;
  end if;

  update venue set verification = p_verification where id = p_venue_id;

  perform write_audit('venue.verification', 'venue', p_venue_id,
    jsonb_build_object('verification', p_verification, 'note', p_note));

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- A venue is bookable the moment it is registered
-- ---------------------------------------------------------------------------

-- sign_up restated with one addition: the pitch it creates gets a week of
-- opening hours. Without it the owner's first screen is an empty grid and
-- nothing in the product explains why.
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
  end if;

  return query select true, v_email, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- Closed here, handed back by access_control, which runs after this one.
revoke execute on function public.venue_hours(uuid) from public, anon, authenticated;
revoke execute on function public.set_venue_hours(uuid, integer, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.add_pitch(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.update_pitch(uuid, text, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.admin_set_verification(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.sign_up(text, text, text, text, text, text)
  from public, anon, authenticated;
