-- A player decides, later, that they have a pitch.
--
-- Sign-up asks player or venue owner, and until now that answer was final: the
-- only code that created a venue lived inside `sign_up`, so somebody who joined
-- to play and then took over a ground had no way to say so. Their options were
-- a second account on a second number — which AUTH-005 forbids, one person is
-- one account — or an email to somebody with the console open.
--
-- This is the same block of work `sign_up` does for a venue owner, addressed to
-- a caller who already exists. It is deliberately not a role flag: nothing in
-- this schema asks whether a person "is an owner". Owner Mode appears because
-- `my_venues` returns something, so opening a venue *is* the promotion, and
-- there is no second state to keep in step with it.
--
-- The venue lands unverified, exactly as it does at sign-up. Verification is
-- the console's to give, and this function does not touch it.
create or replace function register_my_venue(
  p_name text,
  p_area text
)
returns table (ok boolean, venue_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_me    uuid := auth.uid();
  v_venue uuid;
  v_pitch uuid;
  v_dow   integer;
begin
  if v_me is null then
    return query select false, null::uuid, 'Sign in first.';
    return;
  end if;

  if length(btrim(coalesce(p_name, ''))) < 2
     or length(btrim(coalesce(p_area, ''))) < 2 then
    return query select false, null::uuid, 'Give the venue a name and an area.';
    return;
  end if;

  -- One at a time. Nothing stops a real operator running several grounds —
  -- they can add the next one once the first is verified — but an account that
  -- can mint unlimited pending venues is an account that can bury the
  -- verification queue.
  if exists (
    select 1
      from venue_staff vs
      join venue v on v.id = vs.venue_id
     where vs.user_id = v_me
       and vs.active
       and v.verification = 'pending'
  ) then
    return query select false, null::uuid,
      'You already have a venue waiting to be verified.';
    return;
  end if;

  insert into venue (name, area, verification)
  values (btrim(p_name), btrim(p_area), 'pending')
  returning id into v_venue;

  insert into venue_staff (venue_id, user_id, role, active)
  values (v_venue, v_me, 'owner', true);

  insert into pitch (venue_id, label, format)
  values (v_venue, 'Pitch 1', '5-a-side')
  returning id into v_pitch;

  -- The same working defaults a venue gets at sign-up: every day, 10:00 to
  -- midnight, at 300. An owner who changes nothing still has a venue that can
  -- take a booking tonight.
  for v_dow in 0 .. 6 loop
    insert into availability_rule (pitch_id, day_of_week, open_hour, close_hour)
    values (v_pitch, v_dow::smallint, 10::smallint, 24::smallint);
  end loop;

  insert into price_rule (pitch_id, valid_from, start_hour, end_hour, price_egp, deposit_egp)
  values (v_pitch, current_date, 0::smallint, 24::smallint, 300, 0);

  return query select true, v_venue, null::text;
end;
$$;

revoke execute on function public.register_my_venue(text, text) from public, anon;
grant execute on function public.register_my_venue(text, text) to authenticated;
