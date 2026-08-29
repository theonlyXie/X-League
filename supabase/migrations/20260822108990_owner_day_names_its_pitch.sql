-- The calendar grid can act on what it draws.
--
-- `owner_day` returned a pitch *label* and no booking id, which is enough to
-- render a grid and not enough to do anything with one. Every control on the
-- calendar screen was consequently inert: "Add booking" had no pitch to book,
-- and tapping a cell had no booking to open. OWN-003 — every channel in one
-- calendar — had no input path at all, so a venue taking a booking by phone
-- had nowhere in the product to put it.
--
-- Two ids, and the screen's dead controls become live ones.

drop function if exists public.owner_day(uuid, date, text);

create or replace function owner_day(
  p_venue_id uuid,
  p_date     date,
  p_tz       text default 'Africa/Cairo'
)
returns table (
  pitch_id    uuid,
  pitch_label text,
  hour        smallint,
  starts_at   timestamptz,
  booking_id  uuid,
  state       booking_state,
  source      booking_source,
  code        text,
  captain_name text,
  price_egp   integer,
  deposit_egp integer
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_venue_staff(p_venue_id) then
    raise exception 'You do not have access to that venue.'
      using errcode = 'insufficient_privilege';
  end if;

  perform expire_stale_holds(null);

  return query
  select
    p.id,
    p.label,
    a.hour,
    a.starts_at,
    b.id,
    b.state,
    coalesce(b.source, 'app'::booking_source),
    b.code,
    b.captain_name,
    a.price_egp,
    a.deposit_egp
  from pitch p
  cross join lateral search_availability(p.id, p_date, p_tz) a
  left join booking b
    on b.pitch_id = p.id
   and b.during && tstzrange(a.starts_at, a.ends_at, '[)')
   and b.state in ('held', 'pending_payment', 'confirmed', 'checked_in', 'completed')
  where p.venue_id = p_venue_id
  order by a.hour, p.label;
end;
$$;

revoke execute on function public.owner_day(uuid, date, text) from public, anon, authenticated;
