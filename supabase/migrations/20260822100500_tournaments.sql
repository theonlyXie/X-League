-- X League — tournaments.
--
-- §7.1's Tournament, TournamentRegistration, Fixture and StandingSnapshot. The
-- Cups tab has been a label with nothing behind it.
--
-- The design decision that matters: a fixture is not a separate kind of match.
-- It points at the same `match` row the booking spine produces, so a
-- tournament game is played, checked in, rated and credited exactly like any
-- other — the tournament layer decides *who plays whom and when*, and the
-- existing spine remains the only thing that decides whether a pitch-hour is
-- sold twice. Building a parallel match system would have duplicated every
-- guarantee already proved.
--
-- Standings are snapshots rather than a live aggregate, because a table shown
-- to a player mid-tournament must be reproducible afterwards (ADM-005), and
-- because a points rule that changes should not silently rewrite history.

-- ---------------------------------------------------------------------------
-- The tournament (§7.1 Tournament)
-- ---------------------------------------------------------------------------

do $$ begin
  create type tournament_state as enum
    ('draft', 'open', 'full', 'running', 'complete', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type tournament_format as enum ('league', 'knockout', 'group_knockout');
exception when duplicate_object then null;
end $$;

create table if not exists tournament (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  venue_id      uuid not null references venue(id) on delete cascade,
  format        tournament_format not null default 'league',
  pitch_format  text not null default '5-a-side',
  state         tournament_state not null default 'draft',
  -- TRN-002: a cup has a shape before it has entrants.
  max_teams     smallint not null default 8 check (max_teams between 2 and 64),
  entry_fee_egp integer not null default 0 check (entry_fee_egp >= 0),
  starts_on     date,
  ends_on       date,
  registration_closes_at timestamptz,
  description   text,
  -- Points per result, so a venue can run a cup on its own rules and a
  -- standing computed last week can still be reproduced.
  points_win    smallint not null default 3,
  points_draw   smallint not null default 1,
  points_loss   smallint not null default 0,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint tournament_dates check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index if not exists tournament_open_idx on tournament (starts_on)
  where state in ('open', 'full', 'running');
create index if not exists tournament_venue_idx on tournament (venue_id);

-- ---------------------------------------------------------------------------
-- Entrants (§7.1 TournamentRegistration)
-- ---------------------------------------------------------------------------

do $$ begin
  create type registration_state as enum ('pending', 'accepted', 'rejected', 'withdrawn');
exception when duplicate_object then null;
end $$;

create table if not exists tournament_registration (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  team_id       uuid not null references team(id) on delete cascade,
  -- Denormalised so a standings table survives a team being renamed mid-cup.
  team_name     text not null,
  state         registration_state not null default 'pending',
  registered_by uuid references auth.users(id) on delete set null,
  paid          boolean not null default false,
  created_at    timestamptz not null default now(),
  -- TRN-004: one entry per team per tournament.
  unique (tournament_id, team_id)
);

create index if not exists tournament_registration_idx
  on tournament_registration (tournament_id, state);

-- ---------------------------------------------------------------------------
-- Fixtures (§7.1 Fixture)
-- ---------------------------------------------------------------------------

do $$ begin
  create type fixture_state as enum ('scheduled', 'played', 'walkover', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists fixture (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  round         smallint not null default 1,
  sequence      smallint not null default 1,
  home_team_id  uuid references team(id) on delete set null,
  away_team_id  uuid references team(id) on delete set null,
  -- The pitch-hour this is played on, if one has been booked. A fixture with no
  -- booking is a fixture nobody has scheduled yet, which is a real state.
  booking_id    uuid references booking(id) on delete set null,
  -- The result comes from the match the spine produced, not from a second
  -- score field that could disagree with it.
  match_id      uuid references match(id) on delete set null,
  state         fixture_state not null default 'scheduled',
  score_home    smallint check (score_home >= 0),
  score_away    smallint check (score_away >= 0),
  kicks_off_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint fixture_distinct_teams check (
    home_team_id is null or away_team_id is null or home_team_id <> away_team_id
  ),
  unique (tournament_id, round, sequence)
);

create index if not exists fixture_tournament_idx on fixture (tournament_id, round, sequence);
create index if not exists fixture_booking_idx on fixture (booking_id);

-- ---------------------------------------------------------------------------
-- Standings (§7.1 StandingSnapshot)
-- ---------------------------------------------------------------------------

-- ADM-005: recomputed and appended, never edited, so the table a player saw on
-- a given evening can be produced again.
create table if not exists standing_snapshot (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  computed_at   timestamptz not null default now(),
  seq           bigserial,
  -- [{team_id, team_name, played, won, drawn, lost, gf, ga, gd, points}]
  table_json    jsonb not null
);

create index if not exists standing_snapshot_latest_idx
  on standing_snapshot (tournament_id, seq desc);

-- ---------------------------------------------------------------------------
-- Who runs a tournament
-- ---------------------------------------------------------------------------

-- A cup belongs to the venue hosting it. RBAC-002 already knows who works
-- there, so this is that predicate applied to a tournament rather than a
-- second notion of authority.
create or replace function can_run_tournament(p_tournament_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from tournament t
     where t.id = p_tournament_id
       and is_venue_staff(t.venue_id, 'manager')
  );
$$;

-- ---------------------------------------------------------------------------
-- Running one
-- ---------------------------------------------------------------------------

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
  if not is_venue_staff(p_venue_id, 'manager') then
    return query select false, null::uuid, 'You do not manage that venue.';
    return;
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then
    return query select false, null::uuid, 'Give the tournament a name.';
    return;
  end if;

  insert into tournament (name, venue_id, format, max_teams, starts_on, ends_on,
                          entry_fee_egp, description, created_by, state)
  values (btrim(p_name), p_venue_id, p_format, p_max_teams::smallint, p_starts_on, p_ends_on,
          p_entry_fee_egp, p_description, auth.uid(), 'draft')
  returning id into v_id;

  return query select true, v_id, null::text;
end;
$$;

create or replace function set_tournament_state(p_tournament_id uuid, p_state tournament_state)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not can_run_tournament(p_tournament_id) then
    return query select false, 'You do not manage that tournament.';
    return;
  end if;

  update tournament set state = p_state where id = p_tournament_id;

  -- Opening registration is the moment worth telling people about.
  if p_state = 'open' then
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

-- TRN-003. A team enters, not a player, and only its captain may enter it —
-- otherwise anybody could commit somebody else's team to a fee.
create or replace function register_team(p_tournament_id uuid, p_team_id uuid)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_state    tournament_state;
  v_max      smallint;
  v_closes   timestamptz;
  v_taken    integer;
  v_captain  uuid;
  v_name     text;
  v_members  integer;
  v_format   text;
  v_min      integer;
begin
  select t.state, t.max_teams, t.registration_closes_at, t.pitch_format
    into v_state, v_max, v_closes, v_format
    from tournament t where t.id = p_tournament_id;

  if v_state is null then
    return query select false, 'That tournament no longer exists.';
    return;
  end if;

  select tm.captain_id, tm.name into v_captain, v_name from team tm where tm.id = p_team_id;
  if v_captain is null then
    return query select false, 'That team no longer exists.';
    return;
  end if;
  if v_captain is distinct from auth.uid() then
    return query select false, 'Only the team captain can enter a tournament.';
    return;
  end if;

  if v_state <> 'open' then
    return query select false,
      case when v_state = 'draft' then 'That tournament is not open yet.'
           when v_state = 'full' then 'That tournament is full.'
           else 'Entries have closed.' end;
    return;
  end if;

  if v_closes is not null and now() > v_closes then
    return query select false, 'Entries have closed.';
    return;
  end if;

  -- A team that cannot field a side is not an entrant. The squad size comes
  -- from the same place the lobby gets it, so the two can never disagree.
  select fc.starters into v_min from format_capacity(v_format) fc;
  select count(*)::integer into v_members
    from team_membership m where m.team_id = p_team_id and m.state = 'active';
  if v_members < v_min then
    return query select false,
      format('You need %s players in the team to enter.', v_min);
    return;
  end if;

  select count(*)::integer into v_taken
    from tournament_registration r
   where r.tournament_id = p_tournament_id and r.state in ('pending', 'accepted');

  if v_taken >= v_max then
    update tournament set state = 'full' where id = p_tournament_id;
    return query select false, 'That tournament is full.';
    return;
  end if;

  insert into tournament_registration (tournament_id, team_id, team_name, registered_by, state)
  values (p_tournament_id, p_team_id, v_name, auth.uid(), 'pending')
  on conflict (tournament_id, team_id) do update
    set state = 'pending', team_name = excluded.team_name;

  -- Filling the last place closes entries without anybody having to notice.
  if v_taken + 1 >= v_max then
    update tournament set state = 'full' where id = p_tournament_id;
  end if;

  return query select true, null::text;
end;
$$;

create or replace function decide_registration(p_registration_id uuid, p_accept boolean)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_tournament uuid;
  v_captain    uuid;
  v_name       text;
begin
  select r.tournament_id, t.captain_id, tn.name
    into v_tournament, v_captain, v_name
    from tournament_registration r
    join team t on t.id = r.team_id
    join tournament tn on tn.id = r.tournament_id
   where r.id = p_registration_id;

  if v_tournament is null then
    return query select false, 'That entry no longer exists.';
    return;
  end if;
  if not can_run_tournament(v_tournament) then
    return query select false, 'You do not manage that tournament.';
    return;
  end if;

  update tournament_registration
     set state = case when p_accept then 'accepted' else 'rejected' end::registration_state
   where id = p_registration_id;

  perform notify(v_captain,
    case when p_accept then 'tournament_accepted' else 'tournament_rejected' end,
    format('Your entry to %s was %s', v_name,
           case when p_accept then 'accepted' else 'declined' end),
    null, jsonb_build_object('screen', 'tournament', 'tournament_id', v_tournament));

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

-- TRN-005: a single round-robin over the accepted teams, using the circle
-- method so every team plays every other exactly once and no team plays twice
-- in a round. A bye is a fixture with one side null, which is how an odd number
-- of entrants is represented honestly rather than by dropping somebody.
create or replace function generate_fixtures(p_tournament_id uuid)
returns table (ok boolean, created integer, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_format tournament_format;
  v_teams  uuid[];
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

  select array_agg(r.team_id order by r.created_at) into v_teams
    from tournament_registration r
   where r.tournament_id = p_tournament_id and r.state = 'accepted';

  v_n := coalesce(array_length(v_teams, 1), 0);
  if v_n < 2 then
    return query select false, 0, 'You need at least two accepted teams.';
    return;
  end if;

  -- An odd count gets a null placeholder: whoever draws it has the bye that
  -- round. Padding here keeps the rotation below uniform.
  if v_n % 2 = 1 then
    v_teams := v_teams || array[null::uuid];
    v_n := v_n + 1;
  end if;

  if v_format = 'knockout' then
    -- Round one only; later rounds are drawn as results come in.
    v_seq := 0;
    for v_i in 1 .. v_n / 2 loop
      v_seq := v_seq + 1;
      insert into fixture (tournament_id, round, sequence, home_team_id, away_team_id, state)
      values (p_tournament_id, 1, v_seq, v_teams[v_i * 2 - 1], v_teams[v_i * 2],
              (case when v_teams[v_i * 2] is null then 'walkover' else 'scheduled' end)::fixture_state);
      v_made := v_made + 1;
    end loop;
  else
    -- Circle method, done as an explicit rotation rather than modular index
    -- arithmetic. The arithmetic version paired every team with every other
    -- exactly once and still put two fixtures for the same team in one round —
    -- right in aggregate, wrong per round, which is the kind of draw nobody
    -- notices until week three. Rotating a working array is provably correct
    -- and reads as what it is.
    --
    -- Hold position 1 fixed; rotate positions 2..n one step each round; pair
    -- position i against position n+1-i.
    v_arr := v_teams;
    v_rounds := v_n - 1;

    for v_round in 1 .. v_rounds loop
      v_seq := 0;
      for v_i in 1 .. v_n / 2 loop
        v_home := v_arr[v_i];
        v_away := v_arr[v_n + 1 - v_i];

        -- Alternate which side is nominally home, so the same team is not
        -- listed first in every round of the cup.
        if v_round % 2 = 0 then
          v_swap := v_home; v_home := v_away; v_away := v_swap;
        end if;

        v_seq := v_seq + 1;
        insert into fixture (tournament_id, round, sequence, home_team_id, away_team_id, state)
        values (p_tournament_id, v_round, v_seq, v_home, v_away,
                (case when v_home is null or v_away is null
                      then 'walkover' else 'scheduled' end)::fixture_state);
        v_made := v_made + 1;
      end loop;

      -- Rotate 2..n one place to the right; position 1 never moves.
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

-- Attaching a fixture to a real pitch-hour. The booking is made through the
-- ordinary spine first, so the exclusion constraint has already decided nobody
-- else has that hour; this only records which fixture it is for.
create or replace function schedule_fixture(p_fixture_id uuid, p_booking_id uuid)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_tournament uuid;
  v_starts     timestamptz;
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

  select lower(b.during) into v_starts from booking b where b.id = p_booking_id;
  if v_starts is null then
    return query select false, 'That booking no longer exists.';
    return;
  end if;

  update fixture set booking_id = p_booking_id, kicks_off_at = v_starts
   where id = p_fixture_id;

  return query select true, null::text;
end;
$$;

-- TRN-006. The result is taken from the match the spine produced rather than
-- typed in twice, so a fixture can never disagree with the game that was
-- actually played, checked in and rated.
create or replace function record_fixture_result(p_fixture_id uuid)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_tournament uuid;
  v_booking    uuid;
  v_match      uuid;
  v_home       smallint;
  v_away       smallint;
begin
  select f.tournament_id, f.booking_id into v_tournament, v_booking
    from fixture f where f.id = p_fixture_id;

  if v_tournament is null then
    return query select false, 'That fixture no longer exists.';
    return;
  end if;
  if not can_run_tournament(v_tournament) then
    return query select false, 'You do not manage that tournament.';
    return;
  end if;
  if v_booking is null then
    return query select false, 'That fixture has not been scheduled on a pitch.';
    return;
  end if;

  select m.id, m.score_home, m.score_away into v_match, v_home, v_away
    from match m where m.booking_id = v_booking;

  if v_match is null then
    return query select false, 'That match has not been played yet.';
    return;
  end if;
  if v_home is null or v_away is null then
    return query select false, 'No score has been reported for that match.';
    return;
  end if;

  update fixture
     set match_id = v_match, score_home = v_home, score_away = v_away, state = 'played'
   where id = p_fixture_id;

  perform rebuild_standings(v_tournament);

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Standings
-- ---------------------------------------------------------------------------

-- Internal: appended by the functions above. Never granted, so a client cannot
-- write a table of its own choosing into the tournament's history.
create or replace function rebuild_standings(p_tournament_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_win  smallint;
  v_draw smallint;
  v_loss smallint;
  v_json jsonb;
  v_id   uuid;
begin
  select points_win, points_draw, points_loss into v_win, v_draw, v_loss
    from tournament where id = p_tournament_id;

  with entrant as (
    select r.team_id, r.team_name
      from tournament_registration r
     where r.tournament_id = p_tournament_id and r.state = 'accepted'
  ),
  -- One row per team per side of a played fixture, which makes the aggregate
  -- below a plain group-by rather than two mirrored subqueries.
  side as (
    select f.home_team_id as team_id, f.score_home as gf, f.score_away as ga
      from fixture f
     where f.tournament_id = p_tournament_id and f.state = 'played'
       and f.home_team_id is not null
    union all
    select f.away_team_id, f.score_away, f.score_home
      from fixture f
     where f.tournament_id = p_tournament_id and f.state = 'played'
       and f.away_team_id is not null
  ),
  tallied as (
    select
      e.team_id,
      e.team_name,
      count(s.team_id)::integer                                        as played,
      count(*) filter (where s.gf > s.ga)::integer                     as won,
      count(*) filter (where s.gf = s.ga)::integer                     as drawn,
      count(*) filter (where s.gf < s.ga)::integer                     as lost,
      coalesce(sum(s.gf), 0)::integer                                  as gf,
      coalesce(sum(s.ga), 0)::integer                                  as ga
    from entrant e
    left join side s on s.team_id = e.team_id
    group by e.team_id, e.team_name
  ),
  scored as (
    select t.*,
           (t.gf - t.ga) as gd,
           (t.won * v_win + t.drawn * v_draw + t.lost * v_loss)::integer as points
      from tallied t
  )
  select jsonb_agg(
           jsonb_build_object(
             'team_id', team_id, 'team_name', team_name,
             'played', played, 'won', won, 'drawn', drawn, 'lost', lost,
             'gf', gf, 'ga', ga, 'gd', gd, 'points', points
           )
           order by points desc, gd desc, gf desc, team_name
         )
    into v_json
    from scored;

  insert into standing_snapshot (tournament_id, table_json)
  values (p_tournament_id, coalesce(v_json, '[]'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

-- P-15: what is on. Open to guests, because a cup nobody can see is a cup
-- nobody enters.
create or replace function list_tournaments(p_limit integer default 25)
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
  entered       integer
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select t.id, t.name, v.name, v.area, t.format, t.state, t.starts_on, t.ends_on,
         t.entry_fee_egp, t.max_teams,
         (select count(*)::integer from tournament_registration r
           where r.tournament_id = t.id and r.state in ('pending', 'accepted'))
    from tournament t
    join venue v on v.id = t.venue_id
   where t.state <> 'draft'
   order by (t.state = 'open') desc, t.starts_on nulls last, t.name
   limit greatest(1, least(p_limit, 100));
$$;

-- P-16 / P-17 / P-18: one call for the whole cup page.
create or replace function tournament_detail(p_tournament_id uuid)
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
  standings     jsonb
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select
    t.id, t.name, v.name, v.area, t.format, t.state, t.starts_on, t.ends_on,
    t.entry_fee_egp, t.max_teams, t.description,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'registration_id', r.id, 'team_id', r.team_id,
               'team_name', r.team_name, 'state', r.state) order by r.created_at)
        from tournament_registration r
       where r.tournament_id = t.id and r.state <> 'withdrawn'
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'fixture_id', f.id, 'round', f.round, 'sequence', f.sequence,
               'home', hm.name, 'away', aw.name,
               'home_team_id', f.home_team_id, 'away_team_id', f.away_team_id,
               'score_home', f.score_home, 'score_away', f.score_away,
               'state', f.state, 'kicks_off_at', f.kicks_off_at)
             order by f.round, f.sequence)
        from fixture f
        left join team hm on hm.id = f.home_team_id
        left join team aw on aw.id = f.away_team_id
       where f.tournament_id = t.id
    ), '[]'::jsonb),
    coalesce((
      select s.table_json from standing_snapshot s
       where s.tournament_id = t.id order by s.seq desc limit 1
    ), '[]'::jsonb)
  from tournament t
  join venue v on v.id = t.venue_id
  where t.id = p_tournament_id and t.state <> 'draft';
$$;

-- The cups a player is actually in, for the Cups tab.
create or replace function my_tournaments()
returns table (
  tournament_id uuid,
  name          text,
  venue_name    text,
  team_name     text,
  state         tournament_state,
  registration_state registration_state,
  starts_on     date
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select t.id, t.name, v.name, r.team_name, t.state, r.state, t.starts_on
    from tournament_registration r
    join tournament t on t.id = r.tournament_id
    join venue v on v.id = t.venue_id
    join team_membership m on m.team_id = r.team_id
   where m.player_id = auth.uid()
     and m.state = 'active'
     and r.state in ('pending', 'accepted')
   order by t.starts_on nulls last, t.name;
$$;

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

alter table tournament              enable row level security;
alter table tournament_registration enable row level security;
alter table fixture                 enable row level security;
alter table standing_snapshot       enable row level security;

revoke execute on function public.rebuild_standings(uuid)         from public, anon, authenticated;
revoke execute on function public.can_run_tournament(uuid)        from public, anon;
revoke execute on function public.create_tournament(uuid, text, tournament_format, integer, date, date, integer, text) from public, anon;
revoke execute on function public.set_tournament_state(uuid, tournament_state) from public, anon;
revoke execute on function public.register_team(uuid, uuid)       from public, anon;
revoke execute on function public.decide_registration(uuid, boolean) from public, anon;
revoke execute on function public.generate_fixtures(uuid)         from public, anon;
revoke execute on function public.schedule_fixture(uuid, uuid)    from public, anon;
revoke execute on function public.record_fixture_result(uuid)     from public, anon;
revoke execute on function public.my_tournaments()                from public, anon;
revoke execute on function public.list_tournaments(integer)       from public;
revoke execute on function public.tournament_detail(uuid)         from public;

-- §2, Guest: browsing what is on needs no account.
grant execute on function public.list_tournaments(integer)        to anon, authenticated;
grant execute on function public.tournament_detail(uuid)          to anon, authenticated;

grant execute on function public.can_run_tournament(uuid)         to authenticated;
grant execute on function public.create_tournament(uuid, text, tournament_format, integer, date, date, integer, text) to authenticated;
grant execute on function public.set_tournament_state(uuid, tournament_state) to authenticated;
grant execute on function public.register_team(uuid, uuid)        to authenticated;
grant execute on function public.decide_registration(uuid, boolean) to authenticated;
grant execute on function public.generate_fixtures(uuid)          to authenticated;
grant execute on function public.schedule_fixture(uuid, uuid)     to authenticated;
grant execute on function public.record_fixture_result(uuid)      to authenticated;
grant execute on function public.my_tournaments()                 to authenticated;

comment on table public.fixture is
  'A fixture points at the match the booking spine produced rather than carrying a second score of its own, so a tournament game cannot disagree with the game that was actually played.';
comment on table public.standing_snapshot is
  'Appended, never edited. A table shown to a player mid-tournament has to be reproducible afterwards, and a points rule that changes must not rewrite history.';
