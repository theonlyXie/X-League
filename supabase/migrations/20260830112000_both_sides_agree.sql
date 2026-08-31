-- A result counts when both sides say the same thing.
--
-- Until now one captain reported a score and the product believed it: points
-- were awarded on that single word, and the other club found out by seeing the
-- table move. In a league where the card and the leaderboard are built on cup
-- results, that is one person's account of a match deciding what everybody
-- else's standing is worth.
--
-- So a two-sided match — a cup tie, where each entrant has a captain — is now
-- claimed by each side. The moment one claims, the other's captain is told the
-- score from their own side of it. Points are paid when the two claims agree.
-- If they disagree the match is disputed and nothing is paid; if only one side
-- ever bothers, nothing is paid either. That last one is the point: a result
-- nobody on the other side confirmed is not a result.
--
-- A casual booking is untouched. It has one captain, one booking, and a venue
-- check-in behind it — there is no second team to accept, and inventing one
-- would mean a Tuesday kickabout could never award anything.

-- ---------------------------------------------------------------------------
-- What each side says happened
-- ---------------------------------------------------------------------------

create table if not exists match_result_claim (
  match_id   uuid not null references match(id) on delete cascade,
  side       text not null check (side in ('home', 'away')),
  claimed_by uuid not null references auth.users(id) on delete cascade,
  score_home smallint not null check (score_home >= 0),
  score_away smallint not null check (score_away >= 0),
  created_at timestamptz not null default now(),
  primary key (match_id, side)
);

create index if not exists match_result_claim_by_match on match_result_claim (match_id);

alter table match_result_claim enable row level security;
revoke all on table match_result_claim from public, anon, authenticated;

comment on table match_result_claim is
  'One row per side per match: what that side''s captain says the score was. Agreement between the two is what makes a result final and pays the points.';

/**
 * The captain who speaks for one side of a match.
 *
 * A cup fixture has two entrants and each is a club or a team with a captain.
 * A plain booking has one captain and no opposing club at all, which is why
 * this returns null for its away side and why two-sidedness is a property of
 * the match rather than an assumption about every match.
 */
create or replace function side_captain(p_match_id uuid, p_side text)
returns uuid
language sql stable security definer
set search_path = public, pg_temp as $$
  with entrant as (
    select case when p_side = 'home' then f.home_entrant_id else f.away_entrant_id end as reg_id
      from fixture f
     where f.match_id = p_match_id
     order by f.round, f.sequence
     limit 1
  )
  select coalesce(
    (select cm.player_id
       from entrant e
       join tournament_registration r on r.id = e.reg_id
       join club_membership cm on cm.club_id = r.club_id
      where cm.role = 'captain' and cm.state = 'active'
      limit 1),
    (select tm.player_id
       from entrant e
       join tournament_registration r on r.id = e.reg_id
       join team_membership tm on tm.team_id = r.team_id
      where tm.role = 'captain' and tm.state = 'active'
      limit 1),
    -- No cup behind it: the booking's captain speaks for the home side and
    -- nobody speaks for the away one.
    (select b.captain_id
       from match m join booking b on b.id = m.booking_id
      where m.id = p_match_id and p_side = 'home')
  );
$$;

/** True when both sides have somebody who can speak for them. */
create or replace function match_is_two_sided(p_match_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select side_captain(p_match_id, 'home') is not null
     and side_captain(p_match_id, 'away') is not null;
$$;

-- ---------------------------------------------------------------------------
-- Settling
-- ---------------------------------------------------------------------------

/**
 * Internal. Look at what both sides have said and act on it.
 *
 * Agreement writes the score onto the match, pays everybody, and asks whether
 * the match is ready to be verified. Disagreement marks it disputed and pays
 * nothing — the organiser or the venue settles it, and until they do the result
 * is a question rather than a fact. One claim on its own does neither.
 */
create or replace function settle_result_if_agreed(p_match_id uuid)
returns text
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_home record;
  v_away record;
begin
  select * into v_home from match_result_claim where match_id = p_match_id and side = 'home';
  select * into v_away from match_result_claim where match_id = p_match_id and side = 'away';

  if v_home is null or v_away is null then
    return 'waiting';
  end if;

  if v_home.score_home = v_away.score_home and v_home.score_away = v_away.score_away then
    update match
       set score_home = v_home.score_home,
           score_away = v_home.score_away,
           state = case when state = 'disputed' then 'played' else state end
     where id = p_match_id;

    perform award_match_points(p_match_id);
    perform verify_match_if_ready(p_match_id);
    return 'agreed';
  end if;

  update match set state = 'disputed' where id = p_match_id and state = 'played';

  perform notify(side_captain(p_match_id, 'home'), 'result_disputed',
                 'The two sides disagree',
                 'You and your opponent reported different scores. The organiser will settle it.',
                 jsonb_build_object('screen', 'result', 'match_id', p_match_id));
  perform notify(side_captain(p_match_id, 'away'), 'result_disputed',
                 'The two sides disagree',
                 'You and your opponent reported different scores. The organiser will settle it.',
                 jsonb_build_object('screen', 'result', 'match_id', p_match_id));

  return 'disputed';
end;
$$;

/**
 * A captain says what happened.
 *
 * The score is given the way the match sheet reads it — home first — whichever
 * side is reporting, so there is one number pair in the system rather than two
 * that have to be flipped and compared.
 *
 * Claiming replaces this side's previous claim, which is what lets a captain
 * correct a typo without an argument, and re-opens a dispute for settling.
 */
create or replace function report_side_result(
  p_match_id   uuid,
  p_score_home integer,
  p_score_away integer
)
returns table (ok boolean, state text, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_side    text;
  v_other   uuid;
  v_uid     uuid := auth.uid();
  v_outcome text;
  v_mine    integer;
  v_theirs  integer;
begin
  if v_uid is null then
    return query select false, null::text, 'Sign in to report a result.';
    return;
  end if;
  if not exists (select 1 from match where id = p_match_id) then
    return query select false, null::text, 'That match no longer exists.';
    return;
  end if;
  if not match_is_two_sided(p_match_id) then
    return query select false, null::text,
      'That match has only one side to report it. The captain''s report stands.';
    return;
  end if;

  v_side := case
    when side_captain(p_match_id, 'home') = v_uid then 'home'
    when side_captain(p_match_id, 'away') = v_uid then 'away'
    else null end;

  if v_side is null then
    return query select false, null::text, 'Only the two captains report this match.';
    return;
  end if;

  if p_score_home is null or p_score_away is null
     or p_score_home < 0 or p_score_away < 0 then
    return query select false, null::text, 'Give both scores.';
    return;
  end if;

  insert into match_result_claim (match_id, side, claimed_by, score_home, score_away)
  values (p_match_id, v_side, v_uid, p_score_home::smallint, p_score_away::smallint)
  on conflict (match_id, side) do update
    set claimed_by = excluded.claimed_by,
        score_home = excluded.score_home,
        score_away = excluded.score_away,
        created_at = now();

  -- Tell the other captain, in their own terms. "3–1" means nothing until you
  -- know which end of it you are; "You lost 1–3" is the same fact, read from
  -- where they are standing.
  v_other := side_captain(p_match_id, case when v_side = 'home' then 'away' else 'home' end);
  if v_other is not null and not exists (
    select 1 from match_result_claim c
     where c.match_id = p_match_id
       and c.side = case when v_side = 'home' then 'away' else 'home' end) then
    if v_side = 'home' then
      v_mine := p_score_away; v_theirs := p_score_home;
    else
      v_mine := p_score_home; v_theirs := p_score_away;
    end if;

    perform notify(v_other, 'result_reported',
      case
        when v_mine > v_theirs then format('They say you won %s–%s', v_mine, v_theirs)
        when v_mine < v_theirs then format('They say you lost %s–%s', v_mine, v_theirs)
        else format('They say it ended %s–%s', v_mine, v_theirs)
      end,
      'Say what you saw. Nothing counts until you both agree.',
      jsonb_build_object('screen', 'result', 'match_id', p_match_id));
  end if;

  v_outcome := settle_result_if_agreed(p_match_id);
  return query select true, v_outcome, null::text;
end;
$$;

/**
 * Where a result stands: what each side said, and what that adds up to.
 *
 * `waiting` is a real answer and the screen says it plainly — a match nobody
 * has confirmed pays nothing, and a player is owed that reason rather than an
 * unexplained absence from their ledger.
 */
create or replace function match_agreement(p_match_id uuid)
returns table (
  two_sided     boolean,
  state         text,
  home_claimed  boolean,
  away_claimed  boolean,
  home_score_home smallint,
  home_score_away smallint,
  away_score_home smallint,
  away_score_away smallint,
  my_side       text
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select
    match_is_two_sided(p_match_id),
    case
      when not match_is_two_sided(p_match_id) then 'single'
      when (select count(*) from match_result_claim c where c.match_id = p_match_id) < 2
        then 'waiting'
      when (select count(distinct (c.score_home, c.score_away))
              from match_result_claim c where c.match_id = p_match_id) = 1
        then 'agreed'
      else 'disputed'
    end,
    exists (select 1 from match_result_claim c where c.match_id = p_match_id and c.side = 'home'),
    exists (select 1 from match_result_claim c where c.match_id = p_match_id and c.side = 'away'),
    (select c.score_home from match_result_claim c where c.match_id = p_match_id and c.side = 'home'),
    (select c.score_away from match_result_claim c where c.match_id = p_match_id and c.side = 'home'),
    (select c.score_home from match_result_claim c where c.match_id = p_match_id and c.side = 'away'),
    (select c.score_away from match_result_claim c where c.match_id = p_match_id and c.side = 'away'),
    case
      when side_captain(p_match_id, 'home') = auth.uid() then 'home'
      when side_captain(p_match_id, 'away') = auth.uid() then 'away'
      else null end
  where exists (
    select 1 from match_participant mp
     where mp.match_id = p_match_id and mp.player_id = auth.uid())
     or side_captain(p_match_id, 'home') = auth.uid()
     or side_captain(p_match_id, 'away') = auth.uid()
     or exists (select 1 from fixture f
                 where f.match_id = p_match_id and can_run_tournament(f.tournament_id));
$$;

revoke execute on function public.side_captain(uuid, text) from public, anon, authenticated;
revoke execute on function public.match_is_two_sided(uuid) from public, anon, authenticated;
revoke execute on function public.settle_result_if_agreed(uuid) from public, anon, authenticated;
revoke execute on function public.report_side_result(uuid, integer, integer) from public, anon;
grant execute on function public.report_side_result(uuid, integer, integer) to authenticated;
revoke execute on function public.match_agreement(uuid) from public, anon;
grant execute on function public.match_agreement(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Nothing is paid on one side's word
-- ---------------------------------------------------------------------------

/**
 * The captain's report, which no longer pays anybody by itself.
 *
 * The match, the team sheet and the score are all still written here — the
 * screen has to show something, and the organiser's table has to have a number
 * in it. What has moved is the money: `award_match_points` used to fire on this
 * call, so one captain's account of a cup tie paid both squads. On a two-sided
 * match it now waits for the other captain, and on a plain booking — where
 * there is no other captain and the venue's check-in is the corroboration — it
 * pays exactly as it always did.
 */
create or replace function complete_match(
  p_booking_id uuid,
  p_score_home integer default null,
  p_score_away integer default null
)
returns table (ok boolean, match_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_captain uuid;
  v_state   booking_state;
  v_ends    timestamptz;
  v_starts  timestamptz;
  v_venue   uuid;
  v_match   uuid;
begin
  select b.captain_id, b.state, lower(b.during), upper(b.during), venue_of_pitch(b.pitch_id)
    into v_captain, v_state, v_starts, v_ends, v_venue
    from booking b where b.id = p_booking_id;

  if v_state is null then
    return query select false, null::uuid, 'That booking no longer exists.';
    return;
  end if;

  if v_captain is distinct from auth.uid() and not is_venue_staff(v_venue) then
    return query select false, null::uuid, 'Only the captain or the venue can report a result.';
    return;
  end if;

  -- MCH-002: a match is evidence only if somebody turned up to it. Check-in is
  -- the venue's testimony that they did.
  if v_state not in ('checked_in', 'completed') then
    return query select false, null::uuid, 'Only a checked-in booking becomes a match.';
    return;
  end if;

  if v_ends > now() then
    return query select false, null::uuid, 'That match has not finished yet.';
    return;
  end if;

  select m.id into v_match from match m where m.booking_id = p_booking_id;

  if v_match is null then
    insert into match (booking_id, played_at, state, score_home, score_away, reported_by)
    values (p_booking_id, v_starts, 'played',
            p_score_home::smallint, p_score_away::smallint, auth.uid())
    returning id into v_match;

    insert into match_participant (match_id, player_id, display_name, side, position)
    select v_match, bp.player_id, bp.display_name,
           case when row_number() over (order by bp.created_at) % 2 = 1
                then 'home' else 'away' end,
           bp.position
      from booking_participant bp
     where bp.booking_id = p_booking_id
       and bp.state = 'accepted';

    update booking set state = 'completed' where id = p_booking_id and state = 'checked_in';

    insert into booking_event (booking_id, event, actor, from_state, to_state, detail)
    values (p_booking_id, 'Match played', current_actor(), 'checked_in', 'completed',
            jsonb_build_object('score_home', p_score_home, 'score_away', p_score_away));

    if not match_is_two_sided(v_match) then
      perform award_match_points(v_match);
    end if;
  else
    if p_score_home is not null or p_score_away is not null then
      update match
         set score_home = coalesce(p_score_home::smallint, score_home),
             score_away = coalesce(p_score_away::smallint, score_away),
             reported_by = auth.uid()
       where id = v_match;
      if not match_is_two_sided(v_match) then
        perform award_match_points(v_match);
      end if;
    end if;
  end if;

  return query select true, v_match, null::text;
end;
$$;

/** The organiser's score for a match with no booking, which also pays nobody
    on its own once both sides have captains to hear from. */
create or replace function report_fixture_result(
  p_fixture_id uuid,
  p_score_home integer,
  p_score_away integer
)
returns table (ok boolean, match_id uuid, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_tournament uuid;
  v_booking    uuid;
  v_match      uuid;
  v_kicks      timestamptz;
  v_home_reg   uuid;
  v_away_reg   uuid;
  v_match_id   uuid;
begin
  select f.tournament_id, f.booking_id, f.match_id, f.kicks_off_at,
         f.home_entrant_id, f.away_entrant_id
    into v_tournament, v_booking, v_match, v_kicks, v_home_reg, v_away_reg
    from fixture f where f.id = p_fixture_id;

  if v_tournament is null then
    return query select false, null::uuid, 'That fixture no longer exists.';
    return;
  end if;
  if not can_run_tournament(v_tournament) then
    return query select false, null::uuid, 'You do not manage that cup.';
    return;
  end if;
  if v_booking is not null then
    return query select false, null::uuid,
      'That match was booked through the app. The captain reports it.';
    return;
  end if;
  if v_home_reg is null or v_away_reg is null then
    return query select false, null::uuid, 'A bye has no result.';
    return;
  end if;
  if v_kicks is null then
    return query select false, null::uuid, 'Put the match on a ground and an hour first.';
    return;
  end if;
  if v_kicks > now() then
    return query select false, null::uuid, 'That match has not been played yet.';
    return;
  end if;
  if p_score_home is null or p_score_away is null
     or p_score_home < 0 or p_score_away < 0 then
    return query select false, null::uuid, 'Give both scores.';
    return;
  end if;

  if v_match is not null then
    update match
       set score_home = p_score_home::smallint,
           score_away = p_score_away::smallint,
           reported_by = auth.uid()
     where id = v_match;

    update fixture
       set score_home = p_score_home::smallint,
           score_away = p_score_away::smallint
     where id = p_fixture_id;

    if not match_is_two_sided(v_match) then
      perform award_match_points(v_match);
    end if;
    perform rebuild_standings(v_tournament);

    return query select true, v_match, null::text;
    return;
  end if;

  insert into match (booking_id, played_at, state, score_home, score_away, reported_by)
  values (null, v_kicks, 'played', p_score_home::smallint, p_score_away::smallint, auth.uid())
  returning id into v_match_id;

  insert into match_participant (match_id, player_id, display_name, side, position)
  select v_match_id, m.player_id, coalesce(pp.display_name, '—'), m.side,
         (select sa.position from self_assessment sa
           where sa.player_id = m.player_id
           order by sa.created_at desc limit 1)
    from (
      select cm.player_id, 'home' as side
        from tournament_registration r
        join club_membership cm on cm.club_id = r.club_id
       where r.id = v_home_reg and cm.state = 'active' and cm.slot_kind is not null
      union
      select tm.player_id, 'home'
        from tournament_registration r
        join team_membership tm on tm.team_id = r.team_id
       where r.id = v_home_reg and r.club_id is null and tm.state = 'active'
      union
      select cm.player_id, 'away'
        from tournament_registration r
        join club_membership cm on cm.club_id = r.club_id
       where r.id = v_away_reg and cm.state = 'active' and cm.slot_kind is not null
      union
      select tm.player_id, 'away'
        from tournament_registration r
        join team_membership tm on tm.team_id = r.team_id
       where r.id = v_away_reg and r.club_id is null and tm.state = 'active'
    ) m
    left join player_profile pp on pp.id = m.player_id
  on conflict do nothing;

  update fixture
     set match_id = v_match_id,
         score_home = p_score_home::smallint,
         score_away = p_score_away::smallint,
         state = 'played'
   where id = p_fixture_id;

  if not match_is_two_sided(v_match_id) then
    perform award_match_points(v_match_id);
  end if;
  perform rebuild_standings(v_tournament);

  return query select true, v_match_id, null::text;
end;
$$;

/**
 * The team sheet, written by whoever is entitled to write that part of it.
 *
 * A captain may credit their own side and nobody else's — two captains editing
 * one sheet would otherwise overwrite each other's half every time. The venue
 * and the cup's organiser see the whole match and may write all of it.
 */
create or replace function set_match_scorers(p_match_id uuid, p_lines jsonb)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_booking   uuid;
  v_captain   uuid;
  v_venue     uuid;
  v_home      smallint;
  v_away      smallint;
  v_whole     boolean := false;
  v_only      text;
  v_line      jsonb;
  v_pid       uuid;
  v_goals     integer;
  v_assists   integer;
  v_side      text;
  v_home_sum  integer := 0;
  v_away_sum  integer := 0;
begin
  select m.booking_id, m.score_home, m.score_away
    into v_booking, v_home, v_away
    from match m where m.id = p_match_id;

  if not found then
    return query select false, 'That match no longer exists.';
    return;
  end if;

  if v_booking is not null then
    select b.captain_id, venue_of_pitch(b.pitch_id) into v_captain, v_venue
      from booking b where b.id = v_booking;
    v_whole := v_captain = auth.uid() or is_venue_staff(v_venue);
  end if;

  if not v_whole then
    v_whole := exists (
      select 1 from fixture f
       where f.match_id = p_match_id and can_run_tournament(f.tournament_id));
  end if;

  if not v_whole then
    v_only := case
      when side_captain(p_match_id, 'home') = auth.uid() then 'home'
      when side_captain(p_match_id, 'away') = auth.uid() then 'away'
      else null end;
  end if;

  if not v_whole and v_only is null then
    return query select false, 'Only the captain, the venue or the organiser can record scorers.';
    return;
  end if;

  if v_home is null or v_away is null then
    return query select false, 'Report the score first.';
    return;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    return query select false, 'Send the sheet as a list.';
    return;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    begin
      v_pid := (v_line ->> 'player_id')::uuid;
    exception when others then
      return query select false, 'That is not a player.';
      return;
    end;

    v_goals   := coalesce((v_line ->> 'goals')::integer, 0);
    v_assists := coalesce((v_line ->> 'assists')::integer, 0);

    if v_goals < 0 or v_assists < 0 then
      return query select false, 'Goals and assists cannot be negative.';
      return;
    end if;

    select mp.side into v_side
      from match_participant mp
     where mp.match_id = p_match_id and mp.player_id = v_pid;

    if v_side is null then
      return query select false, 'Somebody on that sheet did not play in the match.';
      return;
    end if;

    if v_only is not null and v_side <> v_only then
      return query select false, 'A captain records their own side only.';
      return;
    end if;

    if v_side = 'home' then v_home_sum := v_home_sum + v_goals;
                       else v_away_sum := v_away_sum + v_goals; end if;
  end loop;

  -- A side's scorers may add up to less than its score — an own goal belongs to
  -- nobody here — but never to more.
  if v_home_sum > v_home or v_away_sum > v_away then
    return query select false, 'More goals on the sheet than in the score.';
    return;
  end if;

  -- Only the part of the sheet this person is entitled to rewrite is cleared,
  -- so a captain sending theirs does not wipe the other side's.
  update match_participant
     set goals = 0, assists = 0
   where match_id = p_match_id
     and (v_only is null or side = v_only);

  update match_participant mp
     set goals = coalesce((l ->> 'goals')::integer, 0),
         assists = coalesce((l ->> 'assists')::integer, 0)
    from jsonb_array_elements(p_lines) l
   where mp.match_id = p_match_id
     and mp.player_id = (l ->> 'player_id')::uuid;

  return query select true, null::text;
end;
$$;

revoke execute on function public.complete_match(uuid, integer, integer) from public, anon;
grant execute on function public.complete_match(uuid, integer, integer) to authenticated;
revoke execute on function public.report_fixture_result(uuid, integer, integer) from public, anon;
grant execute on function public.report_fixture_result(uuid, integer, integer) to authenticated;
revoke execute on function public.set_match_scorers(uuid, jsonb) from public, anon;
grant execute on function public.set_match_scorers(uuid, jsonb) to authenticated;
