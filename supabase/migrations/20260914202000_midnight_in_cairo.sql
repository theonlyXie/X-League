-- "Available until the end of today" was being worked out in the wrong country.
--
-- `set_availability` wrote:
--
--   v_until := ((current_date + 1) + time '00:00') at time zone 'Africa/Cairo';
--
-- The `at time zone` is right. `current_date` is not: it resolves in the
-- *server's* timezone, which is UTC both here and on the hosted project. So
-- between midnight and 3am Cairo — when UTC is still on the previous date —
-- "tomorrow" evaluates to a Cairo midnight that has already gone past.
--
-- At 00:12 Cairo on 15 September, `current_date` is still the 14th, so the
-- function hands back 15 September 00:00 Cairo: twelve minutes *before* the
-- player tapped the button. They are written into the database as available
-- until a moment in the past, `my_availability` reads them as unavailable
-- immediately, no call for players ever reaches them, and nothing anywhere
-- tells them why. It corrects itself at 3am when UTC catches up.
--
-- That window is 00:00 to 03:00 in Cairo, every night, which in Egypt is the
-- end of five-a-side rather than the middle of the night: the hour when
-- somebody whose match just finished says they are up for another one.
--
-- Found by the probe suite failing at 21:12 UTC. It had passed every previous
-- run because every previous run happened during the Cairo daytime — the test
-- was correct and the code was wrong, and only the clock decided which of them
-- got to prove it.

create or replace function set_availability(p_on boolean)
returns table (available_until timestamptz)
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_until timestamptz;
begin
  if v_uid is null then
    raise exception 'Sign in to say you are available.' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(p_on, false) then
    -- Today's date *in Cairo*, then the midnight that ends it. `now() at time
    -- zone 'Africa/Cairo'` is the local wall clock, and its `::date` is the day
    -- the player is actually living in — which is the whole point.
    v_until := (((now() at time zone 'Africa/Cairo')::date + 1) + time '00:00')
                 at time zone 'Africa/Cairo';
  else
    v_until := null;
  end if;

  update player_profile pp set available_until = v_until where pp.id = v_uid;
  return query select v_until;
end;
$$;

-- `create or replace` resets the grants to the Postgres default of EXECUTE to
-- PUBLIC, so they are restated rather than assumed.
revoke all on function set_availability(boolean) from public, anon, authenticated;
grant execute on function set_availability(boolean) to authenticated;
