-- X League — venue discovery.
--
-- Until now the app booked exactly one pitch: the id in `.env`. Search returned
-- a real timeline wrapped in fixture venues, which meant VEN-001 ("state date,
-- area and format, then see only slots saleable at query time") was true of the
-- slots and a fiction about the venues around them.
--
-- This migration makes discovery real: venues carry the media, amenities and
-- ratings VEN-005 requires, closures suppress inventory the way a booking does,
-- and one call answers "what can I play tonight, near me" across every venue
-- rather than one.

-- ---------------------------------------------------------------------------
-- What a venue actually shows a player
-- ---------------------------------------------------------------------------

-- VEN-005: the pitch page has to build confidence before purchase, so the
-- venue record has to carry what that page shows rather than the client
-- inventing it.
alter table venue add column if not exists phone        text;
alter table venue add column if not exists amenities    text[] not null default '{}';
alter table venue add column if not exists house_rules  text;
alter table venue add column if not exists cover_url    text;
-- VEN-009: the deep-link target, distinct from the pin, because the gate a
-- player walks to is often not the coordinate a map drops them at.
alter table venue add column if not exists map_url      text;

-- Denormalised so a search across every venue does not fan out into a rating
-- aggregate per row. Maintained by trigger below — never written by hand.
alter table venue add column if not exists rating_avg   numeric(3,2);
alter table venue add column if not exists rating_count integer not null default 0;

create index if not exists venue_verified_idx on venue (verification) where verification = 'verified';

-- VEN-007: a photo set, ordered, with the cover called out.
create table if not exists venue_photo (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid    not null references venue(id) on delete cascade,
  url        text    not null,
  caption    text,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists venue_photo_venue_idx on venue_photo (venue_id, sort_order);

-- ---------------------------------------------------------------------------
-- Reviews (§7.1 PitchReview)
-- ---------------------------------------------------------------------------

-- VEN-008: only someone who actually turned up may review, which is why this
-- hangs off a booking rather than off a user and a venue. One review per
-- booking, so a review cannot be repeated to move an average.
create table if not exists pitch_review (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid    not null unique references booking(id) on delete cascade,
  pitch_id    uuid    not null references pitch(id) on delete cascade,
  venue_id    uuid    not null references venue(id) on delete cascade,
  author_id   uuid    not null references auth.users(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  body        text,
  -- ADM-009: a review can be hidden by moderation without being destroyed.
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists pitch_review_venue_idx on pitch_review (venue_id, created_at desc) where not hidden;

-- Keep the cached aggregate honest on every path — insert, edit, hide, delete.
create or replace function refresh_venue_rating() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
declare
  v_venue uuid := coalesce(new.venue_id, old.venue_id);
begin
  update venue v
     set rating_avg = sub.avg_rating,
         rating_count = sub.n
    from (
      select round(avg(rating)::numeric, 2) as avg_rating, count(*)::integer as n
        from pitch_review
       where venue_id = v_venue and not hidden
    ) sub
   where v.id = v_venue;
  return null;
end;
$$;

drop trigger if exists pitch_review_rating on pitch_review;
create trigger pitch_review_rating
  after insert or update or delete on pitch_review
  for each row execute function refresh_venue_rating();

-- ---------------------------------------------------------------------------
-- Closures (§7.1 AvailabilityException)
-- ---------------------------------------------------------------------------

-- OWN-004: a venue takes time off sale — maintenance, a private hire, a public
-- holiday — without inventing a fake booking to do it. A closure suppresses
-- inventory exactly like occupancy does, but it is venue configuration and
-- reads as such in the calendar rather than as a phantom customer.
create table if not exists availability_exception (
  id         uuid primary key default gen_random_uuid(),
  pitch_id   uuid    not null references pitch(id) on delete cascade,
  during     tstzrange not null,
  kind       text    not null default 'closure'
               check (kind in ('closure', 'maintenance', 'private', 'holiday')),
  note       text,
  created_by uuid    references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint exception_is_bounded check (
    not isempty(during) and lower(during) is not null and upper(during) is not null
  )
);

create index if not exists availability_exception_pitch_idx
  on availability_exception using gist (pitch_id, during);

-- ---------------------------------------------------------------------------
-- Distance
-- ---------------------------------------------------------------------------

-- VEN-003 sorts by distance. Haversine in SQL rather than PostGIS: the product
-- needs "how far is this, roughly", not geodesy, and adding an extension to a
-- hosted project is a cost that has to earn itself.
create or replace function distance_km(
  a_lat numeric, a_lon numeric, b_lat numeric, b_lon numeric
)
returns numeric
language sql immutable
set search_path = public, pg_temp as $$
  select case
    when a_lat is null or a_lon is null or b_lat is null or b_lon is null then null
    else round(
      (6371 * 2 * asin(least(1, sqrt(
        power(sin(radians(b_lat - a_lat) / 2), 2)
        + cos(radians(a_lat)) * cos(radians(b_lat))
        * power(sin(radians(b_lon - a_lon) / 2), 2)
      ))))::numeric, 1)
  end;
$$;

-- ---------------------------------------------------------------------------
-- Availability, now aware of closures
-- ---------------------------------------------------------------------------

-- Replaced rather than extended, because CREATE OR REPLACE resets the security
-- and search_path attributes to whatever this statement says. Leaving them off
-- would silently downgrade the function to SECURITY INVOKER and break every
-- caller, so they are restated here in full.
create or replace function search_availability(
  p_pitch_id uuid,
  p_date     date,
  p_tz       text default 'Africa/Cairo'
)
returns table (
  starts_at timestamptz,
  ends_at   timestamptz,
  hour      smallint,
  price_egp integer,
  deposit_egp integer,
  available boolean,
  taken_by  booking_source
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  perform expire_stale_holds(p_pitch_id);

  return query
  with rule as (
    select ar.open_hour, ar.close_hour, ar.slot_minutes
      from availability_rule ar
     where ar.pitch_id = p_pitch_id
       and ar.day_of_week = extract(dow from p_date)::smallint
     limit 1
  ),
  slot as (
    select
      h::smallint as hour,
      ((p_date + make_interval(hours => h)) at time zone p_tz) as starts_at,
      ((p_date + make_interval(hours => h) + make_interval(mins => r.slot_minutes)) at time zone p_tz) as ends_at
    from rule r,
         generate_series(r.open_hour, r.close_hour - 1) as h
  )
  select
    s.starts_at,
    s.ends_at,
    s.hour,
    coalesce(pr.price_egp, 0),
    coalesce(pr.deposit_egp, 0),
    -- A slot is saleable only if nothing occupies it and nothing closes it.
    b.id is null and x.id is null,
    b.source
  from slot s
  left join price_rule pr
    on pr.pitch_id = p_pitch_id
   and s.hour >= pr.start_hour and s.hour < pr.end_hour
   and pr.valid_from <= p_date
   and (pr.valid_to is null or pr.valid_to > p_date)
  left join booking b
    on b.pitch_id = p_pitch_id
   and b.during && tstzrange(s.starts_at, s.ends_at, '[)')
   and b.state in ('held', 'pending_payment', 'confirmed', 'checked_in', 'completed')
  left join lateral (
    select ae.id from availability_exception ae
     where ae.pitch_id = p_pitch_id
       and ae.during && tstzrange(s.starts_at, s.ends_at, '[)')
     limit 1
  ) x on true
  order by s.starts_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Search across every venue (VEN-001 / VEN-003)
-- ---------------------------------------------------------------------------

-- P-03's list, in one call. The client used to assemble this from a fixture
-- array and one live pitch; now the live-slot count, the cheapest hour and the
-- next free time all come from the same timeline the booking spine defends,
-- which is what makes "12 live slots" a fact rather than a decoration.
create or replace function search_venues(
  p_date      date    default current_date,
  p_tz        text    default 'Africa/Cairo',
  p_lat       numeric default null,
  p_lon       numeric default null,
  p_from_hour smallint default 0,
  p_to_hour   smallint default 24,
  p_format    text    default null,
  p_limit     integer default 25
)
returns table (
  venue_id      uuid,
  name          text,
  area          text,
  verification  text,
  lat           numeric,
  lon           numeric,
  distance_km   numeric,
  rating_avg    numeric,
  rating_count  integer,
  open_slots    integer,
  min_price_egp integer,
  next_slot     timestamptz,
  cover_url     text,
  amenities     text[]
)
language plpgsql security definer
set search_path = public, pg_temp as $$
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
  ),
  cell as (
    select
      c.id as venue_id,
      a.starts_at,
      a.price_egp,
      a.available
    from candidate c
    join pitch p on p.venue_id = c.id and p.operational
                and (p_format is null or p.format = p_format)
    cross join lateral search_availability(p.id, p_date, p_tz) a
    where a.hour >= p_from_hour and a.hour < p_to_hour
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
    c.id,
    c.name,
    c.area,
    c.verification,
    c.lat,
    c.lon,
    distance_km(p_lat, p_lon, c.lat, c.lon),
    c.rating_avg,
    c.rating_count,
    coalesce(r.open_slots, 0),
    coalesce(r.min_price, 0)::integer,
    r.next_slot,
    c.cover_url,
    c.amenities
  from candidate c
  left join rollup r on r.venue_id = c.id
  -- Verified venues first (VEN-006), then nearest, then the ones with
  -- something actually free tonight. A venue with no slots left still appears —
  -- P-03 draws "fully booked tonight · notify me" and cannot do that for a
  -- venue the query dropped.
  order by
    (c.verification = 'verified') desc,
    distance_km(p_lat, p_lon, c.lat, c.lon) asc nulls last,
    coalesce(r.open_slots, 0) desc,
    c.name
  limit greatest(1, least(p_limit, 100));
end;
$$;

-- P-04's header, in one call: the venue, its media, its rules and its rating.
create or replace function venue_detail(p_venue_id uuid)
returns table (
  venue_id     uuid,
  name         text,
  area         text,
  verification text,
  lat          numeric,
  lon          numeric,
  phone        text,
  amenities    text[],
  house_rules  text,
  entry_note   text,
  map_url      text,
  rating_avg   numeric,
  rating_count integer,
  photos       jsonb,
  pitches      jsonb
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select
    v.id, v.name, v.area, v.verification, v.lat, v.lon, v.phone,
    v.amenities, v.house_rules, v.entry_note, v.map_url,
    v.rating_avg, v.rating_count,
    coalesce((
      select jsonb_agg(jsonb_build_object('url', vp.url, 'caption', vp.caption)
                       order by vp.sort_order)
        from venue_photo vp where vp.venue_id = v.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'label', p.label, 'format', p.format,
               'surface', p.surface, 'indoor', p.indoor) order by p.label)
        from pitch p where p.venue_id = v.id and p.operational
    ), '[]'::jsonb)
  from venue v
  where v.id = p_venue_id;
$$;

-- VEN-008: the reviews P-04 shows under the rating.
create or replace function venue_reviews(p_venue_id uuid, p_limit integer default 20)
returns table (
  rating     smallint,
  body       text,
  author     text,
  created_at timestamptz
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select r.rating, r.body, coalesce(pp.display_name, 'Player'), r.created_at
    from pitch_review r
    left join player_profile pp on pp.id = r.author_id
   where r.venue_id = p_venue_id and not r.hidden
   order by r.created_at desc
   limit greatest(1, least(p_limit, 100));
$$;

-- Only someone who turned up may review, and only once (VEN-008).
--
-- `p_rating` is an integer rather than a smallint on purpose: a JSON number
-- arrives as int4, and Postgres will not implicitly narrow it during function
-- resolution, so a smallint parameter makes the call fail to resolve at all
-- from any JSON client. The column stays smallint; the cast happens here.
create or replace function submit_review(p_booking_id uuid, p_rating integer, p_body text default null)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_pitch uuid;
  v_venue uuid;
  v_state booking_state;
  v_capt  uuid;
begin
  select b.pitch_id, venue_of_pitch(b.pitch_id), b.state, b.captain_id
    into v_pitch, v_venue, v_state, v_capt
    from booking b where b.id = p_booking_id;

  if v_pitch is null then
    return query select false, 'That booking no longer exists.';
    return;
  end if;

  if v_capt is distinct from auth.uid() then
    return query select false, 'You can only review a booking you made.';
    return;
  end if;

  if v_state not in ('checked_in', 'completed') then
    return query select false, 'You can review a match once you have played it.';
    return;
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return query select false, 'A rating runs from 1 to 5.';
    return;
  end if;

  insert into pitch_review (booking_id, pitch_id, venue_id, author_id, rating, body)
  values (p_booking_id, v_pitch, v_venue, auth.uid(), p_rating::smallint,
          nullif(btrim(coalesce(p_body, '')), ''))
  on conflict (booking_id) do update
    set rating = excluded.rating, body = excluded.body;

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Home (P-02)
-- ---------------------------------------------------------------------------

-- The screen every player opens on. It read fixtures because there was nothing
-- to ask: no call returned "the next thing you are doing". This is that call.
create or replace function my_next_booking(p_tz text default 'Africa/Cairo')
returns table (
  booking_id   uuid,
  code         text,
  state        booking_state,
  starts_at    timestamptz,
  ends_at      timestamptz,
  venue_id     uuid,
  venue_name   text,
  area         text,
  pitch_label  text,
  entry_note   text,
  map_url      text,
  lat          numeric,
  lon          numeric,
  price_egp    integer,
  deposit_egp  integer
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  perform expire_stale_holds(null);

  return query
  select b.id, b.code, b.state, lower(b.during), upper(b.during),
         v.id, v.name, v.area, p.label, v.entry_note, v.map_url, v.lat, v.lon,
         b.price_egp, b.deposit_egp
    from booking b
    join pitch p on p.id = b.pitch_id
    join venue v on v.id = p.venue_id
   where b.captain_id = auth.uid()
     and b.state in ('held', 'confirmed', 'checked_in')
     and upper(b.during) > now()
   order by lower(b.during)
   limit 1;
end;
$$;

-- The player's own history — P-02's progression strip and the "review this"
-- prompt both need to know what has already been played.
create or replace function my_bookings(p_limit integer default 20)
returns table (
  booking_id  uuid,
  code        text,
  state       booking_state,
  starts_at   timestamptz,
  venue_name  text,
  area        text,
  pitch_label text,
  price_egp   integer,
  reviewed    boolean
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select b.id, b.code, b.state, lower(b.during), v.name, v.area, p.label, b.price_egp,
         exists (select 1 from pitch_review r where r.booking_id = b.id)
    from booking b
    join pitch p on p.id = b.pitch_id
    join venue v on v.id = p.venue_id
   where b.captain_id = auth.uid()
   order by lower(b.during) desc
   limit greatest(1, least(p_limit, 100));
$$;

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

alter table venue_photo            enable row level security;
alter table pitch_review           enable row level security;
alter table availability_exception enable row level security;

-- No policies: the tables stay unreachable and the functions are the only door,
-- exactly as the booking spine does it.

alter function public.refresh_venue_rating() set search_path = public, pg_temp;

grant execute on function public.distance_km(numeric, numeric, numeric, numeric) to anon, authenticated;
grant execute on function public.search_venues(date, text, numeric, numeric, smallint, smallint, text, integer) to anon, authenticated;
grant execute on function public.venue_detail(uuid)          to anon, authenticated;
grant execute on function public.venue_reviews(uuid, integer) to anon, authenticated;

-- Writing a review, and asking what *you* are doing tonight, both need a session.
grant execute on function public.submit_review(uuid, integer, text) to authenticated;
grant execute on function public.my_next_booking(text)               to authenticated;
grant execute on function public.my_bookings(integer)                to authenticated;

comment on table public.availability_exception is
  'Venue closures. Suppresses inventory the same way occupancy does, but reads as configuration rather than as a phantom booking.';
