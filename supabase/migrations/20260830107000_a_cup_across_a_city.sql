-- A cup is in a place, not at a venue, and the draw is a draw.
--
-- Three things follow from a cup in Giza being played across several grounds:
--
--   * it needs more than one venue. `tournament.venue_id` stays as the host —
--     it is what says who may run the cup, and changing that would be a
--     different feature — and the venues a cup may be played at become their
--     own list, seeded with the host so no cup starts with nowhere to play.
--
--   * a fixture needs somewhere and a time before anybody has booked a pitch
--     for it. `schedule_fixture` takes a booking, which is right when the cup
--     is buying pitch-hours through the app and wrong when an organiser has
--     agreed four grounds for a Saturday by phone. So a fixture can now be
--     placed directly at a pitch and an hour, and the booking-backed route
--     stays for when there is a booking.
--
--   * the draw has to be a draw. It was the circle method over entrants in the
--     order they entered, which is reproducible and completely predictable —
--     the club that registered first always opened against the club that
--     registered last. Shuffling first keeps every property the round robin
--     had and stops the order of entry deciding the tournament.

-- ---------------------------------------------------------------------------
-- The grounds a cup is played on
-- ---------------------------------------------------------------------------

create table if not exists tournament_venue (
  tournament_id uuid not null references tournament(id) on delete cascade,
  venue_id      uuid not null references venue(id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (tournament_id, venue_id)
);

create index if not exists tournament_venue_by_venue on tournament_venue (venue_id);

alter table tournament_venue enable row level security;
revoke all on table tournament_venue from public, anon, authenticated;

-- Every cup that already exists is played at its host, which is what it meant
-- before this table existed.
insert into tournament_venue (tournament_id, venue_id)
select t.id, t.venue_id from tournament t
on conflict do nothing;

-- That backfill covers the cups that exist right now, and nothing else. A cup
-- created after this migration ran would have listed no grounds at all — the
-- host has to be written when the cup is written, not once at migration time.
create or replace function create_tournament(
  p_venue_id   uuid,
  p_name       text,
  p_format     tournament_format default 'league',
  p_max_teams  integer default 8,
  p_starts_on  date default null,
  p_ends_on    date default null,
  p_entry_fee_egp integer default 0,
  p_description text default null
)
returns table (ok boolean, tournament_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if not (is_venue_staff(p_venue_id, 'manager') or is_platform('admin')) then
    return query select false, null::uuid, 'You do not manage that venue.';
    return;
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then
    return query select false, null::uuid, 'Give the tournament a name.';
    return;
  end if;
  -- An admin picks a venue from a list; a typo in an id should say so rather
  -- than fail on the foreign key with something nobody can read.
  if not exists (select 1 from venue where id = p_venue_id) then
    return query select false, null::uuid, 'That venue does not exist.';
    return;
  end if;

  insert into tournament (name, venue_id, format, max_teams, starts_on, ends_on,
                          entry_fee_egp, description, created_by, state)
  values (btrim(p_name), p_venue_id, p_format, p_max_teams::smallint, p_starts_on, p_ends_on,
          p_entry_fee_egp, p_description, auth.uid(), 'draft')
  returning id into v_id;

  -- The host ground, from the first moment the cup exists.
  insert into tournament_venue (tournament_id, venue_id)
  values (v_id, p_venue_id)
  on conflict do nothing;

  -- ADM-012: a platform admin acting outside their own venue leaves a trace.
  -- A venue manager running their own cup does not need one — the tournament
  -- row already records who created it, and audit_log is for reach beyond
  -- what you own.
  if is_platform('admin') and not is_venue_staff(p_venue_id, 'manager') then
    perform write_audit('tournament.create', 'tournament', v_id,
                        jsonb_build_object('name', btrim(p_name), 'venue_id', p_venue_id));
  end if;

  return query select true, v_id, null::text;
end;
$$;

-- CREATE OR REPLACE resets grants, so they are re-stated.
revoke execute on function public.create_tournament(uuid, text, tournament_format, integer, date, date, integer, text)
  from public, anon;
grant execute on function public.create_tournament(uuid, text, tournament_format, integer, date, date, integer, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Where and when a fixture is
-- ---------------------------------------------------------------------------

alter table fixture add column if not exists pitch_id uuid references pitch(id) on delete set null;

create index if not exists fixture_pitch_idx on fixture (pitch_id, kicks_off_at);

comment on column fixture.pitch_id is
  'Where this match is played. Set directly when an organiser has agreed a ground, or derived from the booking when one was made through the app.';

-- ---------------------------------------------------------------------------
-- Running it
-- ---------------------------------------------------------------------------

/** Add a ground the cup may be played on. */
create or replace function add_tournament_venue(p_tournament_id uuid, p_venue_id uuid)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
begin
  if not can_run_tournament(p_tournament_id) then
    return query select false, 'You do not manage that cup.';
    return;
  end if;
  if not exists (select 1 from venue where id = p_venue_id) then
    return query select false, 'That venue does not exist.';
    return;
  end if;

  insert into tournament_venue (tournament_id, venue_id)
  values (p_tournament_id, p_venue_id)
  on conflict do nothing;

  return query select true, null::text;
end;
$$;

/**
 * Stop playing a cup at a ground.
 *
 * Refuses to remove the host, and refuses to remove a ground that fixtures are
 * already placed at — a cup with a match at a venue it is no longer played at
 * is a match nobody can find.
 */
create or replace function remove_tournament_venue(p_tournament_id uuid, p_venue_id uuid)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
begin
  if not can_run_tournament(p_tournament_id) then
    return query select false, 'You do not manage that cup.';
    return;
  end if;

  if exists (select 1 from tournament t
              where t.id = p_tournament_id and t.venue_id = p_venue_id) then
    return query select false, 'That is the cup''s home ground.';
    return;
  end if;

  if exists (select 1 from fixture f join pitch p on p.id = f.pitch_id
              where f.tournament_id = p_tournament_id and p.venue_id = p_venue_id) then
    return query select false, 'Matches are already placed there. Move them first.';
    return;
  end if;

  delete from tournament_venue
   where tournament_id = p_tournament_id and venue_id = p_venue_id;

  return query select true, null::text;
end;
$$;

/** The grounds this cup may be played on, host first. */
create or replace function tournament_venues(p_tournament_id uuid)
returns table (venue_id uuid, name text, area text, is_host boolean, pitches integer)
language sql stable security definer
set search_path = public, pg_temp as $$
  select v.id, v.name, v.area,
         v.id = t.venue_id,
         (select count(*)::integer from pitch p where p.venue_id = v.id)
    from tournament_venue tv
    join tournament t on t.id = tv.tournament_id
    join venue v on v.id = tv.venue_id
   where tv.tournament_id = p_tournament_id
   order by (v.id = t.venue_id) desc, v.name;
$$;

/**
 * Every pitch the cup may be played on, across all of its grounds.
 *
 * One call rather than one per ground: the organiser placing a match wants the
 * whole city in front of them, grouped by where it is, and asking per venue
 * would make the list arrive in pieces and in a different order each time.
 */
create or replace function tournament_pitches(p_tournament_id uuid)
returns table (pitch_id uuid, label text, venue_id uuid, venue_name text, area text, is_host boolean)
language sql stable security definer
set search_path = public, pg_temp as $$
  select p.id, p.label, v.id, v.name, v.area, v.id = t.venue_id
    from tournament_venue tv
    join tournament t on t.id = tv.tournament_id
    join venue v on v.id = tv.venue_id
    join pitch p on p.venue_id = v.id
   where tv.tournament_id = p_tournament_id
     and p.operational
   order by (v.id = t.venue_id) desc, v.name, p.label;
$$;

/**
 * Put a match at a ground and an hour.
 *
 * No booking required. An organiser who has agreed four pitches for a Saturday
 * is not buying them through the app, and making them create bookings first
 * would be asking them to lie about how the hour was arranged.
 *
 * The pitch has to belong to a ground the cup is played on, which is what stops
 * a fixture being placed somewhere the cup has nothing to do with.
 */
create or replace function place_fixture(
  p_fixture_id   uuid,
  p_pitch_id     uuid,
  p_kicks_off_at timestamptz
)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_tournament uuid;
begin
  select f.tournament_id into v_tournament from fixture f where f.id = p_fixture_id;
  if v_tournament is null then
    return query select false, 'That fixture no longer exists.';
    return;
  end if;
  if not can_run_tournament(v_tournament) then
    return query select false, 'You do not manage that cup.';
    return;
  end if;

  if p_pitch_id is not null and not exists (
    select 1 from pitch p
      join tournament_venue tv on tv.venue_id = p.venue_id
     where p.id = p_pitch_id and tv.tournament_id = v_tournament
  ) then
    return query select false, 'That pitch is not at a ground this cup is played on.';
    return;
  end if;

  update fixture
     set pitch_id = p_pitch_id,
         kicks_off_at = p_kicks_off_at
   where id = p_fixture_id;

  return query select true, null::text;
end;
$$;

/** The booking-backed route, which now also records where it is. */
create or replace function schedule_fixture(p_fixture_id uuid, p_booking_id uuid)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_tournament uuid;
  v_starts     timestamptz;
  v_pitch      uuid;
begin
  select f.tournament_id into v_tournament from fixture f where f.id = p_fixture_id;
  if v_tournament is null then
    return query select false, 'That fixture no longer exists.';
    return;
  end if;
  if not can_run_tournament(v_tournament) then
    return query select false, 'You do not manage that tournament.';
    return;
  end if;

  select lower(b.during), b.pitch_id into v_starts, v_pitch
    from booking b where b.id = p_booking_id;
  if v_starts is null then
    return query select false, 'That booking no longer exists.';
    return;
  end if;

  update fixture
     set booking_id = p_booking_id,
         kicks_off_at = v_starts,
         pitch_id = v_pitch
   where id = p_fixture_id;

  return query select true, null::text;
end;
$$;

revoke execute on function public.add_tournament_venue(uuid, uuid) from public, anon;
grant execute on function public.add_tournament_venue(uuid, uuid) to authenticated;
revoke execute on function public.remove_tournament_venue(uuid, uuid) from public, anon;
grant execute on function public.remove_tournament_venue(uuid, uuid) to authenticated;
revoke execute on function public.place_fixture(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.place_fixture(uuid, uuid, timestamptz) to authenticated;
revoke execute on function public.schedule_fixture(uuid, uuid) from public, anon;
grant execute on function public.schedule_fixture(uuid, uuid) to authenticated;
revoke execute on function public.tournament_pitches(uuid) from public, anon;
grant execute on function public.tournament_pitches(uuid) to authenticated;
revoke execute on function public.tournament_venues(uuid) from public;
grant execute on function public.tournament_venues(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The draw
-- ---------------------------------------------------------------------------

/**
 * Draw the fixtures, at random.
 *
 * The only change from the version this replaces is the order the entrants go
 * into the rotation: it was `order by created_at`, so the club that entered
 * first always opened against the club that entered last, every time, and the
 * draw was decided by who happened to register when. Shuffling first keeps
 * every property the round robin had — every club plays every other exactly
 * once, nobody plays twice in a round, an odd count gets a bye — and makes the
 * pairings a draw rather than a consequence of the registration queue.
 */
create or replace function generate_fixtures(p_tournament_id uuid)
returns table (ok boolean, created integer, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_format tournament_format;
  v_ents   uuid[];
  v_arr    uuid[];
  v_n      integer;
  v_rounds integer;
  v_round  integer;
  v_i      integer;
  v_home   uuid;
  v_away   uuid;
  v_swap   uuid;
  v_seq    integer;
  v_made   integer := 0;
begin
  if not can_run_tournament(p_tournament_id) then
    return query select false, 0, 'You do not manage that tournament.';
    return;
  end if;

  if exists (select 1 from fixture where tournament_id = p_tournament_id) then
    return query select false, 0, 'Fixtures have already been drawn.';
    return;
  end if;

  select t.format into v_format from tournament t where t.id = p_tournament_id;

  select array_agg(r.id order by random()) into v_ents
    from tournament_registration r
   where r.tournament_id = p_tournament_id and r.state = 'accepted';

  v_n := coalesce(array_length(v_ents, 1), 0);
  if v_n < 2 then
    return query select false, 0, 'You need at least two accepted entrants.';
    return;
  end if;

  if v_n % 2 = 1 then
    v_ents := v_ents || array[null::uuid];
    v_n := v_n + 1;
  end if;

  if v_format = 'knockout' then
    v_seq := 0;
    for v_i in 1 .. v_n / 2 loop
      v_seq := v_seq + 1;
      insert into fixture (tournament_id, round, sequence, home_entrant_id, away_entrant_id, state)
      values (p_tournament_id, 1, v_seq, v_ents[v_i * 2 - 1], v_ents[v_i * 2],
              (case when v_ents[v_i * 2] is null then 'walkover' else 'scheduled' end)::fixture_state);
      v_made := v_made + 1;
    end loop;
  else
    v_arr := v_ents;
    v_rounds := v_n - 1;

    for v_round in 1 .. v_rounds loop
      v_seq := 0;
      for v_i in 1 .. v_n / 2 loop
        v_home := v_arr[v_i];
        v_away := v_arr[v_n + 1 - v_i];

        if v_round % 2 = 0 then
          v_swap := v_home; v_home := v_away; v_away := v_swap;
        end if;

        v_seq := v_seq + 1;
        insert into fixture (tournament_id, round, sequence, home_entrant_id, away_entrant_id, state)
        values (p_tournament_id, v_round, v_seq, v_home, v_away,
                (case when v_home is null or v_away is null
                      then 'walkover' else 'scheduled' end)::fixture_state);
        v_made := v_made + 1;
      end loop;

      v_swap := v_arr[v_n];
      for v_i in reverse v_n .. 3 loop
        v_arr[v_i] := v_arr[v_i - 1];
      end loop;
      v_arr[2] := v_swap;
    end loop;
  end if;

  update tournament set state = 'running' where id = p_tournament_id;
  perform rebuild_standings(p_tournament_id);

  return query select true, v_made, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Where and when, for the person playing
-- ---------------------------------------------------------------------------

/**
 * This player's cup matches: who, where, and when.
 *
 * A fixture is theirs if the club or team that entered is one they are an
 * active member of. Ordered soonest first, with matches that have no time yet
 * last — a fixture nobody has placed is a real state, and it says so rather
 * than sorting to the top on a null.
 */
create or replace function my_cup_fixtures(p_limit integer default 20)
returns table (
  fixture_id    uuid,
  tournament_id uuid,
  cup_name      text,
  round         smallint,
  my_side       text,
  my_entrant    text,
  opponent      text,
  venue_name    text,
  area          text,
  pitch_label   text,
  kicks_off_at  timestamptz,
  state         fixture_state,
  score_home    smallint,
  score_away    smallint
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select f.id, t.id, t.name, f.round,
         case when mine.id = f.home_entrant_id then 'home' else 'away' end,
         mine.team_name,
         other.team_name,
         v.name, v.area, p.label,
         f.kicks_off_at, f.state, f.score_home, f.score_away
    from fixture f
    join tournament t on t.id = f.tournament_id
    join tournament_registration mine
      on mine.id in (f.home_entrant_id, f.away_entrant_id)
    left join tournament_registration other
      on other.id = case when mine.id = f.home_entrant_id
                         then f.away_entrant_id else f.home_entrant_id end
    left join pitch p on p.id = f.pitch_id
    left join venue v on v.id = p.venue_id
   where mine.state = 'accepted'
     and (
       exists (select 1 from club_membership cm
                where cm.club_id = mine.club_id
                  and cm.player_id = auth.uid() and cm.state = 'active')
       or exists (select 1 from team_membership tm
                   where tm.team_id = mine.team_id
                     and tm.player_id = auth.uid() and tm.state = 'active')
     )
   order by (f.kicks_off_at is null), f.kicks_off_at, f.round, f.sequence
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke execute on function public.my_cup_fixtures(integer) from public, anon;
grant execute on function public.my_cup_fixtures(integer) to authenticated;

/**
 * The cup page, with each match's ground and hour.
 *
 * A fixture carried a `kicks_off_at` and nothing about where, because until now
 * there was only one venue and it was the cup's. Across a city that is no
 * longer true, so each fixture says which ground and which pitch — and the
 * grounds themselves come back with the cup so the page can name them.
 */
drop function if exists tournament_detail(uuid);

create function tournament_detail(p_tournament_id uuid)
returns table (
  tournament_id uuid,
  name          text,
  venue_name    text,
  area          text,
  format        tournament_format,
  state         tournament_state,
  starts_on     date,
  ends_on       date,
  entry_fee_egp integer,
  max_teams     smallint,
  description   text,
  teams         jsonb,
  fixtures      jsonb,
  standings     jsonb,
  venues        jsonb
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select
    t.id, t.name, v.name, coalesce(t.region, v.area), t.format, t.state, t.starts_on, t.ends_on,
    t.entry_fee_egp, t.max_teams, t.description,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'registration_id', r.id,
               'entrant_name', r.team_name,
               'club_id', r.club_id, 'team_id', r.team_id,
               'crest_url', c.crest_url,
               'state', r.state,
               'paid', r.paid) order by r.created_at)
        from tournament_registration r
        left join club c on c.id = r.club_id
       where r.tournament_id = t.id and r.state <> 'withdrawn'
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'fixture_id', f.id, 'round', f.round, 'sequence', f.sequence,
               'home', hr.team_name, 'away', ar.team_name,
               'home_entrant_id', f.home_entrant_id, 'away_entrant_id', f.away_entrant_id,
               'score_home', f.score_home, 'score_away', f.score_away,
               'state', f.state, 'kicks_off_at', f.kicks_off_at,
               'venue_name', fv.name, 'pitch_label', fp.label)
             order by f.round, f.sequence)
        from fixture f
        left join tournament_registration hr on hr.id = f.home_entrant_id
        left join tournament_registration ar on ar.id = f.away_entrant_id
        left join pitch fp on fp.id = f.pitch_id
        left join venue fv on fv.id = fp.venue_id
       where f.tournament_id = t.id
    ), '[]'::jsonb),
    coalesce((
      select s.table_json from standing_snapshot s
       where s.tournament_id = t.id order by s.seq desc limit 1
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'venue_id', tvv.venue_id, 'name', tvv.name,
               'area', tvv.area, 'is_host', tvv.is_host))
        from tournament_venues(t.id) tvv
    ), '[]'::jsonb)
  from tournament t
  join venue v on v.id = t.venue_id
  where t.id = p_tournament_id
    and (t.state <> 'draft' or can_run_tournament(t.id));
$$;

revoke execute on function public.generate_fixtures(uuid) from public, anon;
grant execute on function public.generate_fixtures(uuid) to authenticated;
revoke execute on function public.tournament_detail(uuid) from public;
grant execute on function public.tournament_detail(uuid) to anon, authenticated;
