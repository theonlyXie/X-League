-- Two things went live without anybody agreeing to them.
--
-- A venue registered from the app is written `pending`, exactly as intended —
-- and then `search_venues` listed it anyway, because it filtered on having a
-- pitch and never on the verification it was so careful to record. A ground
-- nobody has checked was bookable within a minute of somebody typing its name.
-- The state was right; the one query that decides who sees a venue never read
-- it.
--
-- Clubs had no such state at all. Anybody could found one and it counted from
-- that moment. A league whose sides admit themselves is not a league.
--
-- Both are now the same shape: created pending, invisible or unusable until an
-- admin says otherwise, and refused at the point of use rather than only hidden
-- from the list — hiding a row from search is not access control when the id is
-- guessable and the booking function never asked.

-- ---------------------------------------------------------------------------
-- Venues
-- ---------------------------------------------------------------------------

create or replace function search_venues(
  p_date      date default current_date,
  p_tz        text default 'Africa/Cairo',
  p_lat       numeric default null,
  p_lon       numeric default null,
  p_from_hour smallint default 0,
  p_to_hour   smallint default 24,
  p_format    text default null,
  p_limit     integer default 25
)
returns table (
  venue_id uuid, name text, area text, verification text, lat numeric, lon numeric,
  distance_km numeric, rating_avg numeric, rating_count integer, open_slots integer,
  min_price_egp integer, next_slot timestamptz, cover_url text, amenities text[]
)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_date date     := coalesce(p_date, current_date);
  v_tz   text     := coalesce(p_tz, 'Africa/Cairo');
  v_from smallint := coalesce(p_from_hour, 0);
  v_to   smallint := coalesce(p_to_hour, 24);
  v_lim  integer  := coalesce(p_limit, 25);
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
       -- The line this function was missing. It has always *sorted* verified
       -- venues first, which reads as caution and is not: an unverified ground
       -- still came back, still had open hours, and could still be booked. A
       -- venue is somewhere players are sent and cash is handed over. Until
       -- somebody has checked it, it is not one.
       and v.verification = 'verified'
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
  -- Everything here is verified now, so the old "verified first" sort has
  -- nothing left to separate. Nearest, then whatever has something free.
  order by
    distance_km(p_lat, p_lon, c.lat, c.lon) asc nulls last,
    coalesce(r.open_slots, 0) desc,
    c.name
  limit greatest(1, least(v_lim, 100));
end;
$$;

grant execute on function public.search_venues(date, text, numeric, numeric, smallint, smallint, text, integer)
  to anon, authenticated;

-- Hiding a row from a list is not access control: the venue id is in every
-- booking link, and `hold_slot` never asked. A booking at a ground nobody has
-- checked cannot exist at all, whichever function tries to write it.
create or replace function refuse_unverified_venue()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_state text;
begin
  select v.verification into v_state
    from pitch p join venue v on v.id = p.venue_id
   where p.id = new.pitch_id;

  if v_state is distinct from 'verified' then
    raise exception 'That venue is waiting to be verified.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists booking_needs_a_verified_venue on booking;
create trigger booking_needs_a_verified_venue
  before insert on booking
  for each row execute function refuse_unverified_venue();

-- ---------------------------------------------------------------------------
-- Clubs
-- ---------------------------------------------------------------------------

alter table club add column if not exists verification text not null default 'pending'
  check (verification in ('pending', 'verified', 'rejected'));

-- The clubs that already exist were founded before there was a queue to join,
-- and quietly suspending them would be a worse surprise than admitting them.
update club set verification = 'verified' where created_at < now();

comment on column club.verification is
  'CLB-010: a club is admitted by the platform, not by founding itself. Pending
   until an admin says otherwise; a rejected club keeps its rows so the decision
   is reversible and the name stays taken.';

create index if not exists club_by_verification on club (verification, created_at desc);

-- Eligibility now answers the whole question a captain is asking: can this club
-- enter something. Being short of players and not being admitted are different
-- answers and both belong here, because `register_club_for_tournament` reads
-- this and the app draws its sentence from it.
create or replace function club_eligibility(p_club_id uuid)
returns table (starters integer, subs integer, playing integer, eligible boolean, reason text)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_starters integer;
  v_subs     integer;
  v_state    text;
  v_min_st   integer := policy_value('club_min_starters');
  v_min_sub  integer := policy_value('club_min_subs');
  v_short    boolean;
  v_words    text;
begin
  select c.verification into v_state from club c where c.id = p_club_id;

  select count(*) filter (where m.slot_kind = 'starter'),
         count(*) filter (where m.slot_kind = 'sub')
    into v_starters, v_subs
    from club_membership m
   where m.club_id = p_club_id and m.state = 'active' and m.slot_kind is not null;

  v_short := not (v_starters >= v_min_st and v_subs >= v_min_sub);

  v_words := case
    when not v_short then null
    when v_starters < v_min_st and v_subs < v_min_sub then
      format('Needs %s more starters and %s more substitutes.', v_min_st - v_starters, v_min_sub - v_subs)
    when v_starters < v_min_st then
      format('Needs %s more %s.', v_min_st - v_starters,
             case when v_min_st - v_starters = 1 then 'starter' else 'starters' end)
    else
      format('Needs %s more %s.', v_min_sub - v_subs,
             case when v_min_sub - v_subs = 1 then 'substitute' else 'substitutes' end)
  end;

  return query select
    v_starters,
    v_subs,
    v_starters + v_subs,
    (not v_short) and v_state = 'verified',
    case
      when v_state = 'rejected' then 'This club was not admitted to X League.'
      when v_state <> 'verified' then 'This club is waiting to be admitted by X League.'
      else v_words
    end;
end;
$$;

-- The state itself, for the club's own page, so the app can say which of the
-- two reasons it is rather than only that the club cannot enter.
create or replace function club_detail(p_club_id uuid)
returns table (
  club_id uuid, name text, crest_url text, home_area text,
  captain_id uuid, captain_name text, captain_plays boolean,
  trophies integer, starters integer, subs integer, playing integer,
  eligible boolean, reason text, verification text
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select c.id, c.name, c.crest_url, c.home_area,
         c.captain_id,
         coalesce(p.display_name, 'Captain'),
         exists (select 1 from club_membership m
                  where m.club_id = c.id and m.player_id = c.captain_id
                    and m.state = 'active' and m.slot_kind is not null),
         (select count(*)::integer from club_honour h where h.club_id = c.id),
         e.starters, e.subs, e.playing, e.eligible, e.reason, c.verification
    from club c
    left join player_profile p on p.id = c.captain_id
    cross join lateral club_eligibility(c.id) e
   where c.id = p_club_id;
$$;

revoke execute on function public.club_detail(uuid) from public, anon;
grant execute on function public.club_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The queue the admin works from
-- ---------------------------------------------------------------------------

create or replace function admin_club_queue(p_state text default 'pending', p_limit integer default 50)
returns table (
  club_id uuid, name text, home_area text, verification text,
  captain_name text, captain_phone text, members integer, created_at timestamptz
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select c.id, c.name, c.home_area, c.verification,
         coalesce(p.display_name, 'Captain'), p.phone,
         (select count(*)::integer from club_membership m
           where m.club_id = c.id and m.state = 'active'),
         c.created_at
    from club c
    left join player_profile p on p.id = c.captain_id
   where is_platform('moderator')
     and (p_state is null or c.verification = p_state)
   order by c.created_at desc
   limit greatest(1, least(p_limit, 200));
$$;

revoke execute on function public.admin_club_queue(text, integer) from public, anon;
grant execute on function public.admin_club_queue(text, integer) to authenticated;

create or replace function admin_set_club_verification(p_club_id uuid, p_verification text)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_was text;
  v_name text;
begin
  if not is_platform('moderator') then
    return query select false, 'Not authorised.';
    return;
  end if;
  if p_verification not in ('pending', 'verified', 'rejected') then
    return query select false, 'That is not a verification state.';
    return;
  end if;

  select c.verification, c.name into v_was, v_name from club c where c.id = p_club_id;
  if v_was is null then
    return query select false, 'That club does not exist.';
    return;
  end if;

  update club set verification = p_verification where id = p_club_id;

  perform write_audit('club.verification', 'club', p_club_id,
    jsonb_build_object('from', v_was, 'to', p_verification, 'name', v_name));

  -- The captain hears the decision either way. A club that sits in a queue
  -- with nobody told is indistinguishable from a club that was refused.
  if p_verification <> v_was then
    perform notify(c.captain_id, 'club_verification',
      case p_verification
        when 'verified' then format('%s is admitted to X League', v_name)
        when 'rejected' then format('%s was not admitted', v_name)
        else format('%s is being reviewed again', v_name)
      end,
      null,
      jsonb_build_object('screen', 'club', 'club_id', p_club_id))
      from club c where c.id = p_club_id;
  end if;

  return query select true, null::text;
end;
$$;

revoke execute on function public.admin_set_club_verification(uuid, text) from public, anon;
grant execute on function public.admin_set_club_verification(uuid, text) to authenticated;
