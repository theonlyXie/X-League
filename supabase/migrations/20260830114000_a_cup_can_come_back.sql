-- Three things this could not do, all found in one report.
--
-- 1. A cup's stage changed with nothing written down. `set_tournament_state`
--    updated a row and returned. Every cup on this platform is now cancelled
--    and the audit log cannot say by whom or when, because a state change was
--    the one console action that left no trace. It leaves one now.
--
-- 2. Cancelling was one click away from every ordinary step in the same row of
--    buttons, and it was final. The console offered no route out of
--    `cancelled`, so a misclick ended a competition for good. The route out is
--    the console's (see the dashboard), but the refusal below is the part that
--    belongs on the server: a cup that has been played cannot be quietly
--    reopened as though it had not.
--
-- 3. There was no way to add a venue anywhere. A venue could only come into
--    existence by somebody signing up as its owner in the app, which means a
--    ground the league arranges by phone — the normal case here — could not be
--    put on the platform at all. `admin_create_venue` is that missing door, and
--    it seeds the same working hours and price every other new venue gets, so
--    it can take a booking the moment it exists.
create or replace function set_tournament_state(p_tournament_id uuid, p_state tournament_state)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_was tournament_state;
  v_played integer;
begin
  if not can_run_tournament(p_tournament_id) then
    return query select false, 'You do not manage that tournament.';
    return;
  end if;

  select t.state into v_was from tournament t where t.id = p_tournament_id;
  if v_was is null then
    return query select false, 'That cup does not exist.';
    return;
  end if;

  -- Coming back from cancelled is allowed, because one wrong click should not
  -- end a competition. Coming back after matches have been played is not: the
  -- results, the points and the awards were all drawn from a cup that was
  -- running, and reopening entries behind them would make the table a lie.
  if v_was = 'cancelled' and p_state in ('draft', 'open') then
    select count(*) into v_played
      from fixture f where f.tournament_id = p_tournament_id and f.state = 'played';
    if v_played > 0 then
      return query select false,
        'That cup has matches already played. It cannot be reopened for entries.';
      return;
    end if;
  end if;

  update tournament set state = p_state where id = p_tournament_id;

  perform write_audit('tournament.state', 'tournament', p_tournament_id,
    jsonb_build_object('from', v_was::text, 'to', p_state::text));

  -- Opening registration is the moment worth telling people about.
  if p_state = 'open' and v_was <> 'open' then
    perform notify(m.player_id, 'tournament_open',
      format('%s is open for entries', t.name), null,
      jsonb_build_object('screen', 'tournament', 'tournament_id', p_tournament_id))
      from tournament t
      join team tm on tm.captain_id is not null
      join team_membership m on m.team_id = tm.id and m.role = 'captain' and m.state = 'active'
     where t.id = p_tournament_id;
  end if;

  return query select true, null::text;
end;
$$;

revoke execute on function public.set_tournament_state(uuid, tournament_state) from public, anon;
grant execute on function public.set_tournament_state(uuid, tournament_state) to authenticated;


create or replace function admin_create_venue(
  p_name  text,
  p_area  text,
  p_phone text default null
)
returns table (ok boolean, venue_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_venue uuid;
  v_pitch uuid;
  v_dow   integer;
begin
  if not is_platform('moderator') then
    return query select false, null::uuid, 'Not authorised.';
    return;
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2
     or length(btrim(coalesce(p_area, ''))) < 2 then
    return query select false, null::uuid, 'Give the venue a name and an area.';
    return;
  end if;

  -- Verified on the way in. A ground the league added itself has already been
  -- checked by the person adding it; leaving it pending would put it in a queue
  -- for the same person to approve.
  insert into venue (name, area, phone, verification)
  values (btrim(p_name), btrim(p_area), nullif(btrim(coalesce(p_phone, '')), ''), 'verified')
  returning id into v_venue;

  insert into pitch (venue_id, label, format)
  values (v_venue, 'Pitch 1', '5-a-side')
  returning id into v_pitch;

  for v_dow in 0 .. 6 loop
    insert into availability_rule (pitch_id, day_of_week, open_hour, close_hour)
    values (v_pitch, v_dow::smallint, 10::smallint, 24::smallint);
  end loop;

  insert into price_rule (pitch_id, valid_from, start_hour, end_hour, price_egp, deposit_egp)
  values (v_pitch, current_date, 0::smallint, 24::smallint, 300, 0);

  perform write_audit('venue.created', 'venue', v_venue,
    jsonb_build_object('name', btrim(p_name), 'area', btrim(p_area)));

  return query select true, v_venue, null::text;
end;
$$;

revoke execute on function public.admin_create_venue(text, text, text) from public, anon;
grant execute on function public.admin_create_venue(text, text, text) to authenticated;


-- A cancelled cup was still listed to players. `list_tournaments` hid drafts
-- and nothing else, so a competition that had been called off sat in the Cups
-- tab labelled — because the app's state names had no case for it — "Running".
-- Cancelled is now as invisible as draft, which is what the console's own
-- notice promises when somebody cancels one.
create or replace function list_tournaments(p_limit integer default 25, p_region text default null)
returns table (
  tournament_id uuid,
  name          text,
  venue_name    text,
  area          text,
  region        text,
  format        tournament_format,
  state         tournament_state,
  starts_on     date,
  ends_on       date,
  entry_fee_egp integer,
  max_teams     smallint,
  entered       integer
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select t.id, t.name, v.name, v.area, coalesce(t.region, v.area),
         t.format, t.state, t.starts_on, t.ends_on,
         t.entry_fee_egp, t.max_teams,
         (select count(*)::integer from tournament_registration r
           where r.tournament_id = t.id and r.state in ('pending', 'accepted'))
    from tournament t
    join venue v on v.id = t.venue_id
   where t.state not in ('draft', 'cancelled')
     and (p_region is null or coalesce(t.region, v.area) = p_region)
   order by (t.state = 'open') desc, t.starts_on nulls last, t.name
   limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.list_tournaments(integer, text) to anon, authenticated;

create or replace function tournament_regions()
returns table (region text, cups integer)
language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(t.region, v.area) as region, count(*)::integer
    from tournament t
    join venue v on v.id = t.venue_id
   where t.state not in ('draft', 'cancelled') and coalesce(t.region, v.area) is not null
   group by coalesce(t.region, v.area)
   order by count(*) desc, 1;
$$;

grant execute on function public.tournament_regions() to anon, authenticated;
