-- Who plays here, and how often.
--
-- A venue could see tonight's arrivals and a day's grid, and had no way to ask
-- the question every pitch owner actually asks: who are my regulars, and who
-- keeps not turning up. The rows were all there and nothing read them across
-- more than a single day.
--
-- Grouped by account where there is one and by name where there is not, because
-- a venue taking half its business by phone would otherwise see its walk-in
-- trade as a list of unrelated strangers. `record_offline_booking` writes
-- `captain_name` for those, and every booking in the table has one.
--
-- Deliberately no phone column. `booking.captain_phone` exists and is populated
-- on nothing — 0 of 31 rows — because neither `hold_slot` nor
-- `record_offline_booking` ever sets it, so a phone column here would be null
-- for every customer forever: a field that looks like a feature and is not.
-- Reaching into `auth.users` for it instead would hand every member of every
-- venue's staff the phone number of every player who has ever booked with them,
-- which is a different product decision and not one to make silently inside a
-- convenience function.
--
-- Gross and collected are both returned, and named the way the money screen
-- already names them, because they answer different questions: what this
-- customer's hours sold for, and what the gate actually took from them.

create or replace function venue_customers(p_venue_id uuid, p_limit integer default 100)
returns table (
  customer_key text,
  display_name text,
  has_account  boolean,
  bookings     integer,
  no_shows     integer,
  last_visit   timestamptz,
  gross_egp    integer,
  collected_egp integer
)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if not is_venue_staff(p_venue_id) then
    raise exception 'You do not have access to that venue.' using errcode = 'insufficient_privilege';
  end if;

  return query
  with mine as (
    select b.id,
           b.captain_id,
           b.state,
           b.price_egp,
           lower(b.during) as starts_at,
           -- One customer, however they booked. Falls back to a folded name so
           -- "Ahmed Hassan" and "ahmed hassan" taken at the desk on different
           -- evenings are the same person rather than two.
           coalesce(b.captain_id::text, 'name:' || lower(trim(b.captain_name))) as key,
           coalesce(pp.display_name, b.captain_name) as label
      from booking b
      join pitch p on p.id = b.pitch_id
      left join player_profile pp on pp.id = b.captain_id
     where p.venue_id = p_venue_id
       -- Only bookings that meant something. A hold that expired before it
       -- confirmed is not a visit, and counting it would tell a venue somebody
       -- comes twice as often as they do.
       and b.state in ('confirmed', 'checked_in', 'completed', 'no_show')
       -- A block is the venue taking its own pitch off sale — for watering, or
       -- a private hire — and is not a customer in any dataset. Left in, the
       -- first run of this listed "Blocked · watering" as a regular with three
       -- visits and EGP 900 of revenue against a pitch nobody paid for.
       and b.source <> 'block'
       and coalesce(b.captain_id::text, nullif(trim(b.captain_name), '')) is not null
  )
  select
    m.key,
    -- The most recent spelling of the name wins, so a correction at the desk
    -- carries rather than being outvoted by every earlier misspelling.
    (array_agg(m.label order by m.starts_at desc))[1],
    bool_or(m.captain_id is not null),
    count(*)::integer,
    count(*) filter (where m.state = 'no_show')::integer,
    max(m.starts_at),
    coalesce(sum(m.price_egp) filter (where m.state <> 'no_show'), 0)::integer,
    coalesce((
      select sum(pr.amount_egp)
        from payment_reference pr
       where pr.booking_id in (select id from mine m2 where m2.key = m.key)
         and pr.state = 'collected'
    ), 0)::integer
  from mine m
  group by m.key
  order by max(m.starts_at) desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

-- Stated here rather than left to `access_control`, which runs earlier in the
-- ordering and cannot know about a function created after it. The venue check
-- above is what actually protects the rows; this only keeps the door shut to
-- callers with no account at all.
revoke execute on function public.venue_customers(uuid, integer) from public, anon;
grant execute on function public.venue_customers(uuid, integer) to authenticated;
