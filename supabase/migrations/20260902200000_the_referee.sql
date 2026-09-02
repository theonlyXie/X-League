-- The referee.
--
-- Cups only. A Thursday kickabout has no referee and never will: the two
-- captains agree its result between them, and that agreement is what makes it
-- count. A cup match is different — somebody is paid to stand on the pitch and
-- decide, and what they write down is the record.
--
-- Three things follow from that, and they are the whole design.
--
--   A referee is made, not born. There is no sign-up for it: X League creates
--   the account from the console with a number and a password, hands them over,
--   and the referee signs into the ordinary app with them. Nothing else in the
--   product can turn somebody into a referee.
--
--   A referee's record is final. Where two captains have to agree, one referee
--   does not: the score they write is the score, the points are awarded there
--   and then rather than waiting for an agreement that is not coming, and a
--   captain reporting afterwards is told the referee has already recorded it
--   rather than being allowed to overwrite them.
--
--   Fouls sit where goals sit. A card is a fact about a player in a match, the
--   same shape as a goal, so it lives on the same row rather than in a table of
--   its own that would have to be joined every time somebody asks what a player
--   did.

-- ---------------------------------------------------------------------------
-- Who a referee is
-- ---------------------------------------------------------------------------

create table if not exists referee (
  id         uuid primary key references auth.users(id) on delete cascade,
  active     boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table referee enable row level security;

create or replace function is_referee()
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from referee r where r.id = auth.uid() and r.active
  );
$$;

-- What a referee wrote down, on the row that already holds what the player did.
alter table match_participant
  add column if not exists fouls   smallint not null default 0,
  add column if not exists yellows smallint not null default 0,
  add column if not exists reds    smallint not null default 0;

-- Who refereed it, and when. Both null for every match played before there were
-- referees, which is the honest answer for those.
alter table match
  add column if not exists refereed_by uuid references auth.users(id),
  add column if not exists refereed_at timestamptz;

-- ---------------------------------------------------------------------------
-- The console makes the account
-- ---------------------------------------------------------------------------

create or replace function admin_create_referee(
  p_phone text,
  p_password text,
  p_display_name text
)
returns table (ok boolean, referee_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_digits text := normalise_phone(p_phone);
  v_email  text;
  v_id     uuid := gen_random_uuid();
  v_existing uuid;
begin
  if not is_platform('admin') then
    return query select false, null::uuid, 'Not authorised.';
    return;
  end if;
  if v_digits is null or length(v_digits) < 8 or length(v_digits) > 15 then
    return query select false, null::uuid, 'Enter a valid phone number.';
    return;
  end if;
  if p_password is null or length(p_password) < 8 then
    return query select false, null::uuid, 'Use a password of at least 8 characters.';
    return;
  end if;
  if length(btrim(coalesce(p_display_name, ''))) < 2 then
    return query select false, null::uuid, 'Give the referee a name.';
    return;
  end if;

  v_email := auth_email_for_phone(v_digits);

  -- A number that already has an account is a person who already exists. Making
  -- them a referee is a promotion, not a second account — the alternative is two
  -- accounts on one number, and neither of them able to sign in reliably.
  select u.id into v_existing from auth.users u where u.email = v_email;

  if v_existing is not null then
    if exists (select 1 from referee r where r.id = v_existing) then
      update referee set active = true where id = v_existing;
      return query select true, v_existing, null::text;
      return;
    end if;

    insert into referee (id, created_by) values (v_existing, auth.uid());
    perform write_audit('referee.promoted', 'player', v_existing,
      jsonb_build_object('phone', '+' || v_digits));
    return query select true, v_existing, null::text;
    return;
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', btrim(p_display_name), 'phone', v_digits),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', v_email, now(), now(), now()
  );

  -- A referee signs in through the same door as everybody else, so they need
  -- the same profile behind it.
  insert into player_profile (id, display_name, phone)
  values (v_id, btrim(p_display_name), '+' || v_digits);

  insert into referee (id, created_by) values (v_id, auth.uid());

  perform write_audit('referee.created', 'player', v_id,
    jsonb_build_object('name', btrim(p_display_name), 'phone', '+' || v_digits));

  return query select true, v_id, null::text;
end;
$$;

create or replace function admin_referees()
returns table (
  referee_id uuid,
  display_name text,
  phone text,
  active boolean,
  matches integer,
  created_at timestamptz
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select r.id,
         coalesce(pp.display_name, '—'),
         pp.phone,
         r.active,
         (select count(*)::integer from match m where m.refereed_by = r.id),
         r.created_at
    from referee r
    left join player_profile pp on pp.id = r.id
   where is_platform('moderator')
   order by r.active desc, pp.display_name;
$$;

create or replace function admin_set_referee_active(p_referee_id uuid, p_active boolean)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform('admin') then
    return query select false, 'Not authorised.';
    return;
  end if;
  if not exists (select 1 from referee where id = p_referee_id) then
    return query select false, 'That referee does not exist.';
    return;
  end if;

  update referee set active = coalesce(p_active, false) where id = p_referee_id;

  perform write_audit('referee.active', 'player', p_referee_id,
    jsonb_build_object('active', coalesce(p_active, false)));
  return query select true, null::text;
end;
$$;

create or replace function admin_set_referee_password(p_referee_id uuid, p_password text)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform('admin') then
    return query select false, 'Not authorised.';
    return;
  end if;
  if p_password is null or length(p_password) < 8 then
    return query select false, 'Use a password of at least 8 characters.';
    return;
  end if;
  if not exists (select 1 from referee where id = p_referee_id) then
    return query select false, 'That referee does not exist.';
    return;
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_referee_id;

  -- The password itself is never written down, here or anywhere else.
  perform write_audit('referee.password', 'player', p_referee_id, '{}'::jsonb);
  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- What a referee sees
-- ---------------------------------------------------------------------------

/**
 * The matches a referee can record.
 *
 * Every fixture in a live cup, not a list somebody assigned: X League appoints
 * its referees by making the account at all, and a referee who turns up to a
 * match should not find it missing because nobody remembered to tick a box.
 *
 * A bye is not a match and is not here. A fixture with no ground and no hour is,
 * greyed, because "not placed yet" is a real state a referee standing on a pitch
 * needs to be able to see rather than a gap in the list.
 */
create or replace function referee_fixtures(p_limit integer default 60)
returns table (
  fixture_id uuid,
  tournament_id uuid,
  tournament_name text,
  round smallint,
  home_name text,
  away_name text,
  venue_name text,
  pitch_label text,
  kicks_off_at timestamptz,
  state fixture_state,
  score_home smallint,
  score_away smallint,
  recorded boolean
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select f.id, t.id, t.name, f.round,
         coalesce(hc.name, hr.team_name, 'TBC'),
         coalesce(ac.name, ar.team_name, 'TBC'),
         v.name, p.label, f.kicks_off_at, f.state, f.score_home, f.score_away,
         m.refereed_at is not null
    from fixture f
    join tournament t on t.id = f.tournament_id
    left join tournament_registration hr on hr.id = f.home_entrant_id
    left join club hc on hc.id = hr.club_id
    left join tournament_registration ar on ar.id = f.away_entrant_id
    left join club ac on ac.id = ar.club_id
    left join pitch p on p.id = f.pitch_id
    left join venue v on v.id = p.venue_id
    left join match m on m.id = f.match_id
   where is_referee()
     and t.state in ('open', 'full', 'running', 'complete')
     and f.home_entrant_id is not null
     and f.away_entrant_id is not null
     and f.state <> 'cancelled'
   order by coalesce(f.kicks_off_at, 'infinity'::timestamptz) desc
   limit greatest(1, least(p_limit, 200));
$$;

/**
 * The two team sheets for one fixture.
 *
 * Before anybody has recorded anything the match does not exist yet, so the
 * sheet is read from the two entrants' squads — the same union the result
 * function uses to build it. After that it is read from the match, so a referee
 * coming back to correct something sees what they wrote rather than a blank
 * form that would silently zero it.
 */
create or replace function referee_sheet(p_fixture_id uuid)
returns table (
  player_id uuid,
  display_name text,
  side text,
  goals smallint,
  assists smallint,
  fouls smallint,
  yellows smallint,
  reds smallint
)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_match uuid;
  v_home  uuid;
  v_away  uuid;
begin
  if not is_referee() then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  select f.match_id, f.home_entrant_id, f.away_entrant_id
    into v_match, v_home, v_away
    from fixture f where f.id = p_fixture_id;

  if v_home is null or v_away is null then
    return;
  end if;

  if v_match is not null then
    return query
      select mp.player_id, mp.display_name, mp.side,
             mp.goals, mp.assists, mp.fouls, mp.yellows, mp.reds
        from match_participant mp
       where mp.match_id = v_match
       order by mp.side, mp.display_name;
    return;
  end if;

  return query
    select s.player_id, coalesce(pp.display_name, '—'), s.side,
           0::smallint, 0::smallint, 0::smallint, 0::smallint, 0::smallint
      from (
        select cm.player_id, 'home' as side
          from tournament_registration r
          join club_membership cm on cm.club_id = r.club_id
         where r.id = v_home and cm.state = 'active' and cm.slot_kind is not null
        union
        select tm.player_id, 'home'
          from tournament_registration r
          join team_membership tm on tm.team_id = r.team_id
         where r.id = v_home and r.club_id is null and tm.state = 'active'
        union
        select cm.player_id, 'away'
          from tournament_registration r
          join club_membership cm on cm.club_id = r.club_id
         where r.id = v_away and cm.state = 'active' and cm.slot_kind is not null
        union
        select tm.player_id, 'away'
          from tournament_registration r
          join team_membership tm on tm.team_id = r.team_id
         where r.id = v_away and r.club_id is null and tm.state = 'active'
      ) s
      left join player_profile pp on pp.id = s.player_id
     order by s.side, coalesce(pp.display_name, '—');
end;
$$;

/**
 * What the referee saw, in one submission.
 *
 * The score and the sheet arrive together because they are one act — a score
 * with nobody attached to it, saved separately and then abandoned halfway, is
 * how a cup ends up with a table nobody can explain.
 *
 * `p_lines` is a list of {player_id, goals, assists, fouls, yellows, reds}.
 * Anybody left out of it is recorded as having done none of those things, which
 * is what a blank line on a team sheet means.
 */
create or replace function referee_record(
  p_fixture_id uuid,
  p_score_home integer,
  p_score_away integer,
  p_lines jsonb default '[]'::jsonb
)
returns table (ok boolean, match_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_tournament uuid;
  v_booking    uuid;
  v_match      uuid;
  v_kicks      timestamptz;
  v_home_reg   uuid;
  v_away_reg   uuid;
  v_line       jsonb;
  v_pid        uuid;
  v_side       text;
  v_goals      integer;
  v_home_sum   integer := 0;
  v_away_sum   integer := 0;
begin
  if not is_referee() then
    return query select false, null::uuid, 'Not authorised.';
    return;
  end if;

  select f.tournament_id, f.booking_id, f.match_id, f.kicks_off_at,
         f.home_entrant_id, f.away_entrant_id
    into v_tournament, v_booking, v_match, v_kicks, v_home_reg, v_away_reg
    from fixture f where f.id = p_fixture_id;

  if v_tournament is null then
    return query select false, null::uuid, 'That fixture no longer exists.';
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
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    return query select false, null::uuid, 'Send the sheet as a list.';
    return;
  end if;

  -- The match, and the two squads on it. Both sides are written from the
  -- registrations rather than from whoever turned up, because the sheet a
  -- referee marks has to be the sheet the cup entered.
  if v_match is null then
    insert into match (booking_id, played_at, state, score_home, score_away, reported_by)
    values (v_booking, v_kicks, 'played',
            p_score_home::smallint, p_score_away::smallint, auth.uid())
    returning id into v_match;

    insert into match_participant (match_id, player_id, display_name, side, position)
    select v_match, s.player_id, coalesce(pp.display_name, '—'), s.side,
           (select sa.position from self_assessment sa
             where sa.player_id = s.player_id
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
      ) s
      left join player_profile pp on pp.id = s.player_id
    on conflict do nothing;
  end if;

  -- Every line has to be somebody who was on the sheet, and a side's scorers
  -- may add up to less than its score — an own goal belongs to nobody — but
  -- never to more.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    begin
      v_pid := (v_line ->> 'player_id')::uuid;
    exception when others then
      return query select false, null::uuid, 'That is not a player.';
      return;
    end;

    v_goals := coalesce((v_line ->> 'goals')::integer, 0);

    if v_goals < 0
       or coalesce((v_line ->> 'assists')::integer, 0) < 0
       or coalesce((v_line ->> 'fouls')::integer, 0) < 0
       or coalesce((v_line ->> 'yellows')::integer, 0) < 0
       or coalesce((v_line ->> 'reds')::integer, 0) < 0 then
      return query select false, null::uuid, 'Nothing on the sheet can be negative.';
      return;
    end if;

    select mp.side into v_side
      from match_participant mp
     where mp.match_id = v_match and mp.player_id = v_pid;

    if v_side is null then
      return query select false, null::uuid, 'Somebody on that sheet did not play in the match.';
      return;
    end if;

    if v_side = 'home' then v_home_sum := v_home_sum + v_goals;
                       else v_away_sum := v_away_sum + v_goals; end if;
  end loop;

  if v_home_sum > p_score_home or v_away_sum > p_score_away then
    return query select false, null::uuid, 'More goals on the sheet than in the score.';
    return;
  end if;

  update match
     set score_home = p_score_home::smallint,
         score_away = p_score_away::smallint,
         state = case when state = 'disputed' then 'played' else state end,
         reported_by = auth.uid(),
         refereed_by = auth.uid(),
         refereed_at = now()
   where id = v_match;

  update fixture
     set match_id = v_match,
         score_home = p_score_home::smallint,
         score_away = p_score_away::smallint,
         state = 'played'
   where id = p_fixture_id;

  -- Aliased because this function returns a column called `match_id`, and an
  -- unqualified one here means the OUT parameter, not the table.
  update match_participant mp
     set goals = 0, assists = 0, fouls = 0, yellows = 0, reds = 0
   where mp.match_id = v_match;

  update match_participant mp
     set goals   = coalesce((l ->> 'goals')::integer, 0)::smallint,
         assists = coalesce((l ->> 'assists')::integer, 0)::smallint,
         fouls   = coalesce((l ->> 'fouls')::integer, 0)::smallint,
         yellows = coalesce((l ->> 'yellows')::integer, 0)::smallint,
         reds    = coalesce((l ->> 'reds')::integer, 0)::smallint
    from jsonb_array_elements(p_lines) l
   where mp.match_id = v_match
     and mp.player_id = (l ->> 'player_id')::uuid;

  -- A refereed match does not wait for two captains to agree. Nobody is coming
  -- to agree with the referee.
  perform award_match_points(v_match);
  perform rebuild_standings(v_tournament);

  return query select true, v_match, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- And the captains stand down
-- ---------------------------------------------------------------------------

/**
 * Restated whole, with one refusal added at the top.
 *
 * Without it a captain reporting after the final whistle would file a claim,
 * the other captain would file a matching one, and `settle_result_if_agreed`
 * would quietly overwrite the referee's score with theirs. Two captains
 * agreeing with each other is not evidence against the person who was on the
 * pitch to decide.
 */
create or replace function report_side_result(p_match_id uuid, p_score_home integer, p_score_away integer)
returns table (ok boolean, state text, reason text)
language plpgsql security definer
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

  if exists (select 1 from match m where m.id = p_match_id and m.refereed_at is not null) then
    return query select false, null::text, 'The referee has recorded this match.';
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

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

revoke execute on function public.admin_create_referee(text, text, text) from public, anon;
revoke execute on function public.admin_referees() from public, anon;
revoke execute on function public.admin_set_referee_active(uuid, boolean) from public, anon;
revoke execute on function public.admin_set_referee_password(uuid, text) from public, anon;
revoke execute on function public.is_referee() from public, anon;
revoke execute on function public.referee_fixtures(integer) from public, anon;
revoke execute on function public.referee_sheet(uuid) from public, anon;
revoke execute on function public.referee_record(uuid, integer, integer, jsonb) from public, anon;

grant execute on function public.admin_create_referee(text, text, text) to authenticated;
grant execute on function public.admin_referees() to authenticated;
grant execute on function public.admin_set_referee_active(uuid, boolean) to authenticated;
grant execute on function public.admin_set_referee_password(uuid, text) to authenticated;
grant execute on function public.is_referee() to authenticated;
grant execute on function public.referee_fixtures(integer) to authenticated;
grant execute on function public.referee_sheet(uuid) to authenticated;
grant execute on function public.referee_record(uuid, integer, integer, jsonb) to authenticated;
