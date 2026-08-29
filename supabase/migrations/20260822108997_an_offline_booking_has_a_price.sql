-- A booking taken at the desk is worth what the hour costs.
--
-- `record_offline_booking` inserted pitch, time, source, captain and code, and
-- no `price_egp` — so it defaulted to zero. `hold_slot` reads the price rule
-- for the hour; this never did. The consequence is not cosmetic: a booking at
-- zero raises no `payment_reference`, because `seed_deposit_obligation` only
-- raises one above zero. So a phone or walk-in booking
--
--   * showed the gate nothing to collect,
--   * counted as zero gross in the venue's payouts and in the platform ledger,
--   * and could never be marked paid, because there was nothing outstanding.
--
-- For a venue taking half its business by phone, half its money did not exist.
-- Found by recording one through the calendar and watching Money report
-- "2 bookings · 0 gross" for an evening that had just sold two hours.
--
-- Restated in full rather than patched, for the usual reason: CREATE OR
-- REPLACE resets security, search_path and every attribute to what this
-- statement says.

create or replace function record_offline_booking(
  p_pitch_id     uuid,
  p_starts_at    timestamptz,
  p_minutes      integer,
  p_source       booking_source,
  p_captain_name text
)
returns table (ok boolean, booking_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_id    uuid;
  v_hour  smallint := extract(hour from p_starts_at at time zone 'Africa/Cairo')::smallint;
  v_date  date     := (p_starts_at at time zone 'Africa/Cairo')::date;
  v_price integer;
begin
  if not is_venue_staff(venue_of_pitch(p_pitch_id)) then
    return query select false, null::uuid, 'You do not have access to that venue.';
    return;
  end if;

  perform expire_stale_holds(p_pitch_id);

  -- The same lookup hold_slot does, against the rule live on the match date.
  select pr.price_egp into v_price
    from price_rule pr
   where pr.pitch_id = p_pitch_id
     and v_hour >= pr.start_hour and v_hour < pr.end_hour
     and pr.valid_from <= v_date
     and (pr.valid_to is null or pr.valid_to > v_date)
   limit 1;

  begin
    insert into booking (pitch_id, during, state, source, captain_name, code, price_egp)
    values (p_pitch_id,
            tstzrange(p_starts_at, p_starts_at + make_interval(mins => p_minutes), '[)'),
            'confirmed', p_source, p_captain_name, generate_booking_code(),
            coalesce(v_price, 0))
    returning id into v_id;
  exception
    when exclusion_violation then
      return query select false, null::uuid, 'That slot is already taken on this pitch.';
      return;
  end;

  insert into booking_event (booking_id, event, actor, to_state, detail)
  values (v_id, 'Booking entered at the venue', current_actor(), 'confirmed',
          jsonb_build_object('source', p_source, 'price_egp', coalesce(v_price, 0)));

  return query select true, v_id, null::text;
end;
$$;

revoke execute on function public.record_offline_booking(uuid, timestamptz, integer, booking_source, text)
  from public, anon, authenticated;
