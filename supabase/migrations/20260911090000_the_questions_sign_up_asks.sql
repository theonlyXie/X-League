-- The schema half of "Sign-up asks how old you are, who you are, and where you
-- play" (aa3f729), which was never written.
--
-- That change rewrote both clients and shipped no migration. The result is not
-- a degraded feature, it is a broken product: PostgREST resolves an RPC by
-- matching the body's keys against a function's parameter names, so
--
--   * `sign_up` is called with `p_birth_year`, `p_gender` and `p_governorate`
--     against a function that has none of them — nobody can create an account;
--   * `search_venues` is called with `p_governorate` against a function that
--     has no such parameter — venue discovery answers nothing;
--   * `set_my_details` does not exist at all.
--
-- All three fail with PGRST202 before a single row is read. The SQL suites did
-- not catch it because they test the schema against itself and never make the
-- call the app makes; `scripts/check-rpc.mjs` now closes exactly that gap and
-- runs in CI beside them.
--
-- What follows is that commit's stated design, implemented:
--
--   * **Year of birth**, not a date. A year is all a cup's minimum age needs
--     and it is markedly less to hold about somebody who may be a child. The
--     column has existed since the first migration with nothing written to it.
--   * **A cup's minimum age is the cup's**, so it is a column on `tournament`
--     with a default of 15 rather than a constant inside a function — a youth
--     cup is a different number on a different row. A squad with anybody under
--     it cannot enter, and the refusal names who, because a count would make a
--     captain guess which of eight people it is. A player with no year yet is
--     not blocked: this is being asked of everybody for the first time, and
--     locking existing players out of cups they have already entered would be
--     the worse answer.
--   * **Gender**, man or woman, asked once.
--   * **Where you play**, as one of the twenty-seven governorate codes. The
--     code is what is stored, because a player who signs up in English and a
--     venue registered in Arabic have to land in the same bucket, and free text
--     never does — this database already holds `Nasr City`, `awsim` and `Awsim`
--     as three different places.

-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------

-- Two values, not a free-text field, and nullable: every account created before
-- this asks has neither, and an app that will not work until somebody states
-- their gender is worse than one that asks nicely.
alter table player_profile
  add column if not exists gender text
    check (gender is null or gender in ('man', 'woman'));

-- The governorate code, as `src/data/egypt.ts` writes it. Not a foreign key to
-- a lookup table: twenty-seven rows that never change are a list in one place
-- in each client, and a table here would be a second place for them to disagree.
alter table player_profile add column if not exists governorate text;
alter table venue          add column if not exists governorate text;

-- Fifteen unless the cup says otherwise, which is what the terms now promise.
alter table tournament
  add column if not exists min_age smallint not null default 15
    check (min_age between 0 and 100);

comment on column venue.governorate is
  'Governorate code. Null means "not stated", and a venue that has not stated '
  'one is shown to everybody — hiding every existing ground until somebody '
  'fills in a new column would empty the app.';

-- ---------------------------------------------------------------------------
-- Signing up
-- ---------------------------------------------------------------------------

-- The six-argument version is dropped rather than left beside this one. Two
-- overloads differing only by trailing defaults are ambiguous to Postgres for
-- any six-key call and a guess for PostgREST, which is how the product ended up
-- with a function nobody could name confidently in the first place.
drop function if exists sign_up(text, text, text, text, text, text);

create function sign_up(
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
  v_gender text := nullif(btrim(lower(coalesce(p_gender, ''))), '');
  v_gov    text := nullif(btrim(lower(coalesce(p_governorate, ''))), '');
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

  -- A year rather than an age, so it does not go stale, and bounded at both
  -- ends because a typo here follows somebody into every cup they enter. The
  -- upper bound is this year: a person born next year has not been born.
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
    -- The venue inherits the governorate its owner just gave, because they are
    -- describing the same place. It is still editable, and still optional.
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
-- The same three questions, for everybody who signed up before they were asked
-- ---------------------------------------------------------------------------

/**
 * All four fields optional, and a null leaves what is already there alone.
 *
 * That distinction matters: the account screen sends only the field somebody
 * edited, and treating an absent field as "clear it" would have one answer
 * erase the other two.
 */
create or replace function set_my_details(
  p_birth_year  integer default null,
  p_gender      text    default null,
  p_governorate text    default null,
  p_area        text    default null
)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_gender text := nullif(btrim(lower(coalesce(p_gender, ''))), '');
  v_gov    text := nullif(btrim(lower(coalesce(p_governorate, ''))), '');
  v_area   text := nullif(btrim(coalesce(p_area, '')), '');
begin
  if auth.uid() is null then
    return query select false, 'Sign in first.';
    return;
  end if;

  if p_birth_year is not null
     and (p_birth_year < 1920 or p_birth_year > extract(year from now())::integer) then
    return query select false, 'Enter the year you were born.';
    return;
  end if;

  if v_gender is not null and v_gender not in ('man', 'woman') then
    return query select false, 'Choose one.';
    return;
  end if;

  update player_profile
     set birth_year    = coalesce(p_birth_year::smallint, birth_year),
         gender        = coalesce(v_gender, gender),
         governorate   = coalesce(v_gov, governorate),
         preferred_area = coalesce(v_area, preferred_area)
   where id = auth.uid();

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- What a player reads back about themselves
-- ---------------------------------------------------------------------------

-- Dropped and recreated rather than replaced: the return type changes, and
-- `create or replace` refuses that.
drop function if exists my_profile();
create function my_profile()
returns table (
  player_id        uuid,
  display_name     text,
  phone            text,
  area             text,
  visibility       text,
  language         text,
  birth_year       smallint,
  gender           text,
  governorate      text,
  photo_url        text,
  terms_version    text,
  suspended_until  timestamptz,
  created_at       timestamptz
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select p.id, p.display_name, p.phone, p.preferred_area, p.visibility,
         p.language, p.birth_year, p.gender, p.governorate, p.photo_url,
         p.terms_version, p.suspended_until, p.created_at
    from player_profile p
   where p.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Discovery, narrowed by governorate
-- ---------------------------------------------------------------------------

-- Dropped first so there is one `search_venues` rather than two overloads:
-- PostgREST would resolve between them by the keys a caller happened to send,
-- which is a coin toss dressed as an API.
drop function if exists search_venues(date, text, numeric, numeric, smallint, smallint, text, integer);

create function search_venues(
  p_date        date default current_date,
  p_tz          text default 'Africa/Cairo',
  p_lat         numeric default null,
  p_lon         numeric default null,
  p_from_hour   smallint default 0,
  p_to_hour     smallint default 24,
  p_format      text default null,
  p_limit       integer default 25,
  p_governorate text default null
)
returns table (
  venue_id uuid, name text, area text, verification text,
  lat numeric, lon numeric, distance_km numeric,
  rating_avg numeric, rating_count integer,
  open_slots integer, min_price_egp integer,
  next_slot timestamptz, cover_url text, amenities text[]
)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_date date     := coalesce(p_date, current_date);
  v_tz   text     := coalesce(p_tz, 'Africa/Cairo');
  v_from smallint := coalesce(p_from_hour, 0);
  v_to   smallint := coalesce(p_to_hour, 24);
  v_lim  integer  := coalesce(p_limit, 25);
  v_gov  text     := nullif(btrim(lower(coalesce(p_governorate, ''))), '');
begin
  perform expire_stale_holds(null);

  return query
  with candidate as (
    select v.*
      from venue v
     where exists (
       select 1 from pitch p
        where p.venue_id = v.id
          and p.operational
          and (p_format is null or p.format = p_format)
     )
       -- An unverified ground still came back, still had open hours, and could
       -- still be booked. A venue is somewhere players are sent and cash is
       -- handed over. Until somebody has checked it, it is not one.
       and v.verification = 'verified'
       -- The governorate narrows; it never hides the country. A venue that has
       -- not said where it is stays visible to everybody, because the column is
       -- new and every venue in the database predates it.
       and (v_gov is null or v.governorate is null or v.governorate = v_gov)
  ),
  cell as (
    select c.id as venue_id, a.starts_at, a.price_egp, a.available
    from candidate c
    join pitch p on p.venue_id = c.id and p.operational
                and (p_format is null or p.format = p_format)
    cross join lateral search_availability(p.id, v_date, v_tz) a
    where a.hour >= v_from and a.hour < v_to
  ),
  rollup as (
    select
      cell.venue_id,
      count(*) filter (where cell.available)::integer as open_slots,
      min(cell.price_egp) filter (where cell.available)  as min_price,
      min(cell.starts_at) filter (where cell.available)  as next_slot
    from cell
    group by cell.venue_id
  )
  select
    c.id, c.name, c.area, c.verification, c.lat, c.lon,
    distance_km(p_lat, p_lon, c.lat, c.lon),
    c.rating_avg, c.rating_count,
    coalesce(r.open_slots, 0),
    coalesce(r.min_price, 0)::integer,
    r.next_slot,
    c.cover_url,
    c.amenities
  from candidate c
  left join rollup r on r.venue_id = c.id
  -- Somebody's own governorate first, then nearest, then whatever has something
  -- free. The first key does nothing until a player has stated one, which is
  -- the state most accounts are in today.
  order by
    (v_gov is not null and c.governorate = v_gov) desc,
    distance_km(p_lat, p_lon, c.lat, c.lon) asc nulls last,
    coalesce(r.open_slots, 0) desc,
    c.name
  limit greatest(1, least(v_lim, 100));
end;
$$;

-- ---------------------------------------------------------------------------
-- A cup's minimum age
-- ---------------------------------------------------------------------------

/**
 * Who in a club's squad is under a cup's minimum age.
 *
 * Names rather than counts, and only the people actually in a slot — somebody
 * on the books who is not selected is not entering anything. A player with no
 * birth year is not named: the question is new, most accounts have not answered
 * it, and refusing a club because half its squad predates the field would make
 * the rule read as a bug.
 */
create or replace function underage_in_club(p_club_id uuid, p_min_age integer)
returns text[]
language sql stable security definer
set search_path = public, pg_temp as $$
  select array_agg(pp.display_name order by pp.display_name)
    from club_membership m
    join player_profile pp on pp.id = m.player_id
   where m.club_id = p_club_id
     and m.state = 'active'
     and m.slot_kind is not null
     and pp.birth_year is not null
     and (extract(year from now())::integer - pp.birth_year) < p_min_age;
$$;

-- The whole function again, with the age rule as its only addition. Restated
-- rather than patched because a `create or replace` of a body this long is the
-- only way Postgres offers, and because the first attempt at this rule dropped
-- the promo code and the SuPoints spend on the way past.
create or replace function register_club_for_tournament(
  p_tournament_id uuid,
  p_club_id uuid,
  p_promo_code text default null,
  p_points integer default 0,
  p_payment_note text default null
)
returns table (ok boolean, registration_id uuid, amount_due_egp integer, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_state    tournament_state;
  v_max      smallint;
  v_closes   timestamptz;
  v_min_age  smallint;
  v_young    text[];
  v_taken    integer;
  v_club     record;
  v_elig     record;
  v_q        record;
  v_claimed  uuid;
  v_balance  integer;
  v_reg      uuid;
begin
  if not is_club_captain(p_club_id) then
    return query select false, null::uuid, null::integer, 'Only the club captain can enter a cup.';
    return;
  end if;

  select c.name into v_club from club c where c.id = p_club_id;
  if v_club.name is null then
    return query select false, null::uuid, null::integer, 'That club no longer exists.';
    return;
  end if;

  select t.state, t.max_teams, t.registration_closes_at, t.min_age
    into v_state, v_max, v_closes, v_min_age
    from tournament t where t.id = p_tournament_id;

  if v_state is null then
    return query select false, null::uuid, null::integer, 'That cup no longer exists.';
    return;
  end if;

  if v_state <> 'open' then
    return query select false, null::uuid, null::integer,
      case when v_state = 'draft' then 'That cup is not open yet.'
           when v_state = 'full'  then 'That cup is full.'
           else 'Entries have closed.' end;
    return;
  end if;

  if v_closes is not null and now() > v_closes then
    return query select false, null::uuid, null::integer, 'Entries have closed.';
    return;
  end if;

  -- The squad rule, from the one place that states it.
  select * into v_elig from club_eligibility(p_club_id);
  if not v_elig.eligible then
    return query select false, null::uuid, null::integer,
      format('Your club cannot enter yet. %s', v_elig.reason);
    return;
  end if;

  -- The age rule. Named, so the captain can either leave somebody out or
  -- correct a year that was typed wrong, rather than guessing.
  v_young := underage_in_club(p_club_id, coalesce(v_min_age, 15)::integer);
  if v_young is not null and array_length(v_young, 1) > 0 then
    return query select false, null::uuid, null::integer,
      format('This cup is for players aged %s and over. Too young: %s.',
             coalesce(v_min_age, 15), array_to_string(v_young, ', '));
    return;
  end if;

  if exists (select 1 from tournament_registration r
              where r.tournament_id = p_tournament_id and r.club_id = p_club_id
                and r.state in ('pending', 'accepted')) then
    return query select false, null::uuid, null::integer, 'Your club has already entered this cup.';
    return;
  end if;

  select count(*)::integer into v_taken
    from tournament_registration r
   where r.tournament_id = p_tournament_id and r.state in ('pending', 'accepted');

  if v_taken >= v_max then
    update tournament set state = 'full' where id = p_tournament_id;
    return query select false, null::uuid, null::integer, 'That cup is full.';
    return;
  end if;

  -- What it costs, recomputed now rather than trusted from the screen.
  select * into v_q from registration_quote(p_tournament_id, p_promo_code, p_points);

  if not v_q.promo_ok then
    return query select false, null::uuid, null::integer, v_q.reason;
    return;
  end if;

  insert into tournament_registration
    (tournament_id, club_id, team_name, registered_by, state,
     fee_egp, promo_off_egp, points_spent, points_off_egp, amount_due_egp,
     payment_note, payment_claimed_at)
  values
    (p_tournament_id, p_club_id, v_club.name, auth.uid(), 'pending',
     v_q.fee_egp, v_q.promo_off_egp, v_q.points_spent, v_q.points_off_egp, v_q.amount_due_egp,
     nullif(trim(coalesce(p_payment_note, '')), ''),
     case when nullif(trim(coalesce(p_payment_note, '')), '') is null then null else now() end)
  returning id into v_reg;

  -- Claim the code. The condition is in the UPDATE so two captains cannot both
  -- read a count of nine against a limit of ten.
  if v_q.promo_off_egp > 0 and nullif(trim(coalesce(p_promo_code, '')), '') is not null then
    update promo_code
       set used_count = used_count + 1
     where code = upper(trim(p_promo_code))
       and active
       and (expires_at is null or expires_at > now())
       and used_count < max_uses
    returning id into v_claimed;

    if v_claimed is null then
      raise exception 'That code was used up while you were entering.'
        using errcode = 'check_violation';
    end if;

    insert into promo_redemption (promo_code_id, registration_id, redeemed_by, amount_off_egp)
    values (v_claimed, v_reg, auth.uid(), v_q.promo_off_egp);
  end if;

  -- Spend the points. Earned stays earned; only this ledger moves.
  if v_q.points_spent > 0 then
    v_balance := my_points_balance();
    if v_balance < v_q.points_spent then
      raise exception 'You no longer have that many points.' using errcode = 'check_violation';
    end if;
    insert into point_spend (player_id, registration_id, points, egp_off)
    values (auth.uid(), v_reg, v_q.points_spent, v_q.points_off_egp);
  end if;

  if v_taken + 1 >= v_max then
    update tournament set state = 'full' where id = p_tournament_id;
  end if;

  return query select true, v_reg, v_q.amount_due_egp, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
--
-- `create or replace` resets a function's grants along with its body, and a
-- dropped one takes them with it, so every signature touched above is restated
-- here. `access_probe` fails if this list and the schema disagree.

revoke execute on function public.underage_in_club(uuid, integer) from public, anon, authenticated;

revoke execute on function public.sign_up(text, text, text, text, text, text, integer, text, text)
  from public;
grant execute on function public.sign_up(text, text, text, text, text, text, integer, text, text)
  to anon, authenticated;

revoke execute on function public.set_my_details(integer, text, text, text) from public, anon;
grant  execute on function public.set_my_details(integer, text, text, text) to authenticated;

revoke execute on function public.my_profile() from public, anon;
grant  execute on function public.my_profile() to authenticated;

revoke execute on function
  public.search_venues(date, text, numeric, numeric, smallint, smallint, text, integer, text)
  from public;
grant execute on function
  public.search_venues(date, text, numeric, numeric, smallint, smallint, text, integer, text)
  to anon, authenticated;

revoke execute on function
  public.register_club_for_tournament(uuid, uuid, text, integer, text)
  from public, anon;
grant execute on function
  public.register_club_for_tournament(uuid, uuid, text, integer, text)
  to authenticated;
