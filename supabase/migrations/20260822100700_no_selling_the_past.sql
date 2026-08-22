-- X League — an hour that has already started is not for sale.
--
-- Found by reading live search output at 8 PM Cairo: Stadium One was still
-- offering its 6 PM slot. Nothing in the spine ever compared a slot to the
-- clock. `search_availability` only asked whether a booking or a closure
-- overlapped it, and `hold_slot` would happily take a hold on a pitch-hour that
-- finished two hours ago.
--
-- This is not a cosmetic bug. A player could pay a deposit for a match that
-- cannot happen, and the venue would find a booking on their calendar for an
-- hour they had already given away to a walk-in — the exact failure the
-- exclusion constraint exists to prevent, arriving through the front door.
--
-- Past slots stay *in* the grid rather than being filtered out, because P-04
-- draws the whole evening and a missing 6 PM cell reads as a bug. They are
-- simply not saleable.

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
    -- Saleable only if nothing occupies it, nothing closes it, and it has not
    -- already kicked off.
    b.id is null and x.id is null and s.starts_at > now(),
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

-- The same rule where the sale actually happens. Search deciding a slot is not
-- saleable is a hint to the client; this is the part that cannot be bypassed by
-- calling the RPC directly with a timestamp of one's own choosing.
--
-- Restated in full, because CREATE OR REPLACE resets security and search_path.
create or replace function hold_slot(
  p_pitch_id     uuid,
  p_starts_at    timestamptz,
  p_minutes      integer default 60,
  p_captain_name text default null,
  p_hold_seconds integer default 292
)
returns hold_outcome
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_during  tstzrange := tstzrange(p_starts_at, p_starts_at + make_interval(mins => p_minutes), '[)');
  v_hour    smallint  := extract(hour from p_starts_at at time zone 'Africa/Cairo')::smallint;
  v_date    date      := (p_starts_at at time zone 'Africa/Cairo')::date;
  v_uid     uuid      := auth.uid();
  v_price   integer;
  v_deposit integer;
  v_id      uuid;
  v_name    text;
  v_expires timestamptz := now() + make_interval(secs => p_hold_seconds);
  v_allowed boolean;
  v_out     hold_outcome;
begin
  -- AUTH-001: booking is for signed-in people. Browsing is not.
  if v_uid is null then
    v_out := (false, null, null, null, null, 'Sign in to hold a slot.')::hold_outcome;
    return v_out;
  end if;

  -- An hour that has already started cannot be sold.
  if p_starts_at <= now() then
    v_out := (false, null, null, null, null, 'That slot has already started.')::hold_outcome;
    return v_out;
  end if;

  -- BKG-010: the restriction P-05 states.
  select cash_allowed into v_allowed from player_standing(v_uid);
  if v_allowed is false then
    v_out := (false, null, null, null, null,
              'Cash-deposit booking is restricted after repeated no-shows. Speak to the venue.'
             )::hold_outcome;
    return v_out;
  end if;

  perform expire_stale_holds(p_pitch_id);

  select pr.price_egp, pr.deposit_egp into v_price, v_deposit
    from price_rule pr
   where pr.pitch_id = p_pitch_id
     and v_hour >= pr.start_hour and v_hour < pr.end_hour
     and pr.valid_from <= v_date
     and (pr.valid_to is null or pr.valid_to > v_date)
   limit 1;

  select coalesce(p_captain_name, pp.display_name) into v_name
    from player_profile pp where pp.id = v_uid;

  begin
    insert into booking (pitch_id, during, state, source, captain_id, captain_name,
                         price_egp, deposit_egp, expires_at)
    values (p_pitch_id, v_during, 'held', 'app', v_uid, coalesce(v_name, p_captain_name),
            coalesce(v_price, 0), coalesce(v_deposit, 0), v_expires)
    returning id into v_id;
  exception
    when exclusion_violation then
      v_out := (false, null, null, null, null,
                'That slot was taken while you were deciding.')::hold_outcome;
      return v_out;
  end;

  insert into booking_event (booking_id, event, actor, to_state, detail)
  values (v_id, 'Slot held', current_actor(), 'held',
          jsonb_build_object('hold_seconds', p_hold_seconds));

  v_out := (true, v_id, v_expires, coalesce(v_price, 0), coalesce(v_deposit, 0), null)::hold_outcome;
  return v_out;
end;
$$;

-- A venue entering a booking at the gate is describing something that already
-- happened, so `record_offline_booking` deliberately keeps no such check: staff
-- write down the 6 PM walk-in at 6:05.

revoke execute on function public.search_availability(uuid, date, text) from public, anon, authenticated;
grant  execute on function public.search_availability(uuid, date, text) to anon, authenticated;

revoke execute on function public.hold_slot(uuid, timestamptz, integer, text, integer) from public, anon, authenticated;
grant  execute on function public.hold_slot(uuid, timestamptz, integer, text, integer) to anon, authenticated;
