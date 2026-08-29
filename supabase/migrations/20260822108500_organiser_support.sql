-- What running a cup from the dashboard needs, and the schema did not offer.
--
-- Two gaps, both a consequence of tournaments having been built for venue
-- managers:
--
--   * `my_venues` lists venues you are staff at, so a platform admin — staff
--     nowhere — sees an empty list and cannot pick a venue to create a cup at.
--
--   * `schedule_fixture` takes a booking id, and nothing returns one. The
--     venue's own day sheet (`owner_day`) deliberately does not: it is a wall
--     display, and a booking id is not something a wall display should carry.
--
-- Rather than widen `owner_day` — which would hand the whole venue operations
-- surface to anyone who can run a cup — this adds one function shaped for the
-- job, gated by `can_run_tournament`, which already admits both the venue's
-- manager and a platform admin.

-- ---------------------------------------------------------------------------
-- Somewhere to hold it
-- ---------------------------------------------------------------------------

-- Read-only, and support-level: seeing the list of venues is not acting on
-- one. Creating a cup still requires 'admin'.
create or replace function admin_venues()
returns table (
  venue_id     uuid,
  name         text,
  area         text,
  verification text,
  pitches      integer
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select v.id, v.name, v.area, v.verification,
         (select count(*)::integer from pitch p where p.venue_id = v.id)
    from venue v
   where is_platform('support')
   order by v.name;
$$;

-- ---------------------------------------------------------------------------
-- Something to schedule it against
-- ---------------------------------------------------------------------------

-- A fixture is played at a real booked hour, so scheduling one means picking a
-- booking. This returns the tournament venue's bookings on a date, with the id
-- `schedule_fixture` wants and enough context to pick the right one.
--
-- `reported` is what makes the row useful twice: `record_fixture_result` reads
-- the score off the booking's match, so a fixture can only be settled once
-- somebody has reported that match. Showing it here is how the organiser knows
-- which fixtures are ready to record and which are still waiting on a captain.
create or replace function tournament_bookings(
  p_tournament_id uuid,
  p_date          date default null,
  p_tz            text default 'Africa/Cairo'
)
returns table (
  booking_id   uuid,
  pitch_label  text,
  starts_at    timestamptz,
  state        booking_state,
  code         text,
  captain_name text,
  reported     boolean,
  fixture_id   uuid
)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_venue uuid;
  v_day   date;
begin
  if not can_run_tournament(p_tournament_id) then
    raise exception 'You do not manage that tournament.'
      using errcode = 'insufficient_privilege';
  end if;

  select t.venue_id into v_venue from tournament t where t.id = p_tournament_id;
  -- The date is resolved in the venue's own zone, because "today" at a pitch in
  -- Cairo is not "today" wherever the organiser's browser happens to be.
  v_day := coalesce(p_date, (now() at time zone p_tz)::date);

  return query
  select b.id, p.label, lower(b.during), b.state, b.code, b.captain_name,
         exists (select 1 from match m where m.booking_id = b.id),
         -- Already used by a fixture in this cup, so the organiser can see at a
         -- glance which hours are spoken for.
         (select f.id from fixture f
           where f.booking_id = b.id and f.tournament_id = p_tournament_id
           limit 1)
    from booking b
    join pitch p on p.id = b.pitch_id
   where p.venue_id = v_venue
     and (lower(b.during) at time zone p_tz)::date = v_day
     and b.state in ('confirmed', 'checked_in', 'completed')
     -- A maintenance block occupies the hour in the same table as a booking,
     -- because that is how the exclusion constraint keeps anyone from selling
     -- it. It is not somewhere a fixture can be played, so it is not offered.
     and b.source is distinct from 'block'
   order by lower(b.during), p.label;
end;
$$;

-- New functions are granted EXECUTE to PUBLIC by default, so each is closed
-- here. The grant back to `authenticated` is not written here: this migration
-- is numbered to run before 20260822109000_access_control.sql, which revokes
-- everything and re-grants from one authoritative list, and a grant written
-- next to its function is exactly the thing that drifts out of step with it.
revoke execute on function public.admin_venues() from public, anon, authenticated;
revoke execute on function public.tournament_bookings(uuid, date, text)
  from public, anon, authenticated;
