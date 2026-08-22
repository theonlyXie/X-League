-- X League — matches, peer ratings and progression.
--
-- §5.1 promises a card whose self-assessment is *provisional* and whose
-- completed-match evidence "gradually becomes the dominant input". Half of that
-- was already true: `self_assessment_weight` computes how much the player's own
-- answers are still allowed to supply, and it has been returning 0.70 for
-- everybody, forever, because `evidence_count` counted bookings and no booking
-- ever became a match.
--
-- This migration supplies the other half. A played booking becomes a Match with
-- MatchParticipants; the people who were on the pitch rate each other; the card
-- is rebuilt from both sources at the weight the ladder prescribes; and playing
-- writes to a PointLedger, which is where XP and levels come from.
--
-- The anti-gaming rules are here rather than in a client because every one of
-- them is a claim about who was actually present, and only the server knows.

-- ---------------------------------------------------------------------------
-- Matches (§7.1 Match, MatchParticipant)
-- ---------------------------------------------------------------------------

do $$ begin
  create type match_state as enum ('played', 'verified', 'disputed', 'void');
exception when duplicate_object then null;
end $$;

create table if not exists match (
  id          uuid primary key default gen_random_uuid(),
  -- One match per booking. The booking is the evidence that it happened at a
  -- real pitch at a real hour, which is the whole basis for calling the
  -- resulting rating "verified" rather than "claimed".
  booking_id  uuid not null unique references booking(id) on delete cascade,
  played_at   timestamptz not null,
  state       match_state not null default 'played',
  score_home  smallint check (score_home >= 0),
  score_away  smallint check (score_away >= 0),
  -- Who reported the result, for ADM-012.
  reported_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists match_played_idx on match (played_at desc);

create table if not exists match_participant (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references match(id) on delete cascade,
  player_id  uuid references auth.users(id) on delete cascade,
  display_name text not null,
  side       text not null default 'home' check (side in ('home', 'away')),
  position   text check (position in ('GK', 'DEF', 'MID', 'FWD')),
  goals      smallint not null default 0 check (goals >= 0),
  assists    smallint not null default 0 check (assists >= 0),
  created_at timestamptz not null default now()
);

create unique index if not exists match_participant_unique_player
  on match_participant (match_id, player_id) where player_id is not null;
create index if not exists match_participant_player_idx on match_participant (player_id);

-- ---------------------------------------------------------------------------
-- Peer ratings (§7.1 PeerRating)
-- ---------------------------------------------------------------------------

-- PRO-008: players who shared a pitch rate each other afterwards, and those
-- ratings are the evidence that displaces the self-assessment.
create table if not exists peer_rating (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references match(id) on delete cascade,
  rater_id   uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references auth.users(id) on delete cascade,
  -- Attribute key -> 1..99, on the same keys the card uses.
  attributes jsonb not null,
  created_at timestamptz not null default now(),
  -- PRO-009: one rating per person per match. Rating somebody repeatedly to
  -- move their card is the obvious attack, and this is the answer to it.
  unique (match_id, rater_id, subject_id),
  -- Nobody rates themselves.
  constraint no_self_rating check (rater_id <> subject_id)
);

create index if not exists peer_rating_subject_idx on peer_rating (subject_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Progression (§7.1 PointLedger)
-- ---------------------------------------------------------------------------

-- PTS-001: XP is an append-only ledger rather than a counter, so a total can
-- always be explained line by line — which is what P-08's progression strip
-- claims to be doing.
create table if not exists point_ledger (
  id         bigserial primary key,
  player_id  uuid not null references auth.users(id) on delete cascade,
  match_id   uuid references match(id) on delete cascade,
  kind       text not null check (kind in
               ('match_played', 'match_won', 'match_drawn', 'rating_given',
                'match_verified', 'no_show', 'adjustment')),
  points     integer not null,
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists point_ledger_player_idx on point_ledger (player_id, created_at desc);
-- One award of a kind per player per match. The ledger is the guard against
-- double-crediting, not the code that writes to it.
create unique index if not exists point_ledger_once
  on point_ledger (player_id, match_id, kind) where match_id is not null;

-- The XP each thing is worth, in one place so the economy can be read at a
-- glance rather than reconstructed from call sites.
create or replace function points_for(p_kind text)
returns integer
language sql immutable
set search_path = public, pg_temp as $$
  select case p_kind
    when 'match_played'   then 50
    when 'match_won'      then 25
    when 'match_drawn'    then 10
    -- Rating teammates is what makes everybody else's card real, so it pays.
    when 'rating_given'   then 5
    -- Awarded once a match has enough independent ratings to count as evidence.
    when 'match_verified' then 20
    when 'no_show'        then -75
    else 0
  end;
$$;

-- The level curve: level L begins at 50·L·(L−1) XP. Level 2 at 100, level 3 at
-- 300, level 4 at 600, level 5 at 1000 — the shape P-08 draws, where early
-- levels come quickly and later ones do not.
create or replace function level_for_xp(p_xp integer)
returns table (level integer, into_level integer, next_at integer, to_next integer)
language sql immutable
set search_path = public, pg_temp as $$
  with l as (
    select greatest(1, floor((1 + sqrt(1 + 4 * greatest(p_xp, 0) / 50.0)) / 2)::integer) as lv
  ),
  b as (
    select lv, (50 * lv * (lv - 1))::integer as base, (50 * (lv + 1) * lv)::integer as nxt
      from l
  )
  select lv, greatest(p_xp, 0) - base, nxt, nxt - greatest(p_xp, 0) from b;
$$;

-- ---------------------------------------------------------------------------
-- Turning a booking into a match
-- ---------------------------------------------------------------------------

-- Credit for playing, and for the result if one was reported. Written so it can
-- be called twice without paying twice — the unique index on
-- (player_id, match_id, kind) is the guarantee, and ON CONFLICT is how this
-- cooperates with it rather than duplicating the check in code.
create or replace function award_match_points(p_match_id uuid)
returns integer
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_home smallint;
  v_away smallint;
  v_rows integer := 0;
begin
  select score_home, score_away into v_home, v_away from match where id = p_match_id;

  insert into point_ledger (player_id, match_id, kind, points)
  select mp.player_id, p_match_id, 'match_played', points_for('match_played')
    from match_participant mp
   where mp.match_id = p_match_id and mp.player_id is not null
  on conflict do nothing;

  if v_home is not null and v_away is not null then
    insert into point_ledger (player_id, match_id, kind, points)
    select mp.player_id, p_match_id,
           case when v_home = v_away then 'match_drawn' else 'match_won' end,
           case when v_home = v_away then points_for('match_drawn') else points_for('match_won') end
      from match_participant mp
     where mp.match_id = p_match_id
       and mp.player_id is not null
       -- A loss is worth nothing rather than a penalty, so no row is written
       -- for it; a ledger the player reads should not be full of zeroes.
       and (v_home = v_away or (mp.side = 'home') = (v_home > v_away))
    on conflict do nothing;
  end if;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- BKG-014 / MCH-001. The people on the team sheet are the accepted squad, and
-- guests come along with names but no card — they played, they just cannot be
-- rated or credited, which is the honest treatment of somebody with no account.
--
-- Either the captain or venue staff may report it: the venue knows the match
-- happened (they checked it in), the captain knows the score.
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
  -- the venue's testimony that they did, and without it a "completed match"
  -- would be a self-report — precisely what the card is designed not to trust.
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

    -- The team sheet. Sides are split by the order places were taken, because
    -- five-a-side picks teams on the night and the product does not pretend to
    -- know better; the captain can correct it afterwards.
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

    -- PTS-001: everyone who played is credited once, here.
    perform award_match_points(v_match);
  else
    -- A later call corrects the score rather than creating a second match.
    if p_score_home is not null or p_score_away is not null then
      update match
         set score_home = coalesce(p_score_home::smallint, score_home),
             score_away = coalesce(p_score_away::smallint, score_away),
             reported_by = auth.uid()
       where id = v_match;
      perform award_match_points(v_match);
    end if;
  end if;

  return query select true, v_match, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rating each other
-- ---------------------------------------------------------------------------

-- The attribute keys the card understands. A rating naming anything else is
-- refused rather than quietly stored and later averaged into nonsense.
create or replace function known_attribute(p_key text)
returns boolean
language sql immutable
set search_path = public, pg_temp as $$
  select p_key in ('SPD', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY',   -- outfield
                   'DIV', 'REF', 'HAN', 'POS', 'KIC');          -- goalkeeper
$$;

-- PRO-008 / PRO-009. Every condition here is about who was actually on the
-- pitch, which is why none of them can be left to the client.
create or replace function submit_peer_rating(
  p_match_id   uuid,
  p_subject_id uuid,
  p_attributes jsonb
)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_played timestamptz;
  k        text;
  v        numeric;
begin
  if v_uid is null then
    return query select false, 'Sign in to rate your teammates.';
    return;
  end if;

  select m.played_at into v_played from match m where m.id = p_match_id;
  if v_played is null then
    return query select false, 'That match no longer exists.';
    return;
  end if;

  if v_uid = p_subject_id then
    return query select false, 'You cannot rate yourself.';
    return;
  end if;

  if not exists (select 1 from match_participant mp
                  where mp.match_id = p_match_id and mp.player_id = v_uid) then
    return query select false, 'You can only rate a match you played in.';
    return;
  end if;

  if not exists (select 1 from match_participant mp
                  where mp.match_id = p_match_id and mp.player_id = p_subject_id) then
    return query select false, 'They did not play in that match.';
    return;
  end if;

  -- PRO-010: ratings close a week after the match. Memory of a game fades, and
  -- an indefinitely open window is an indefinitely open attack surface.
  if v_played < now() - interval '7 days' then
    return query select false, 'Ratings for that match have closed.';
    return;
  end if;

  if p_attributes is null or jsonb_typeof(p_attributes) <> 'object'
     or p_attributes = '{}'::jsonb then
    return query select false, 'Rate at least one attribute.';
    return;
  end if;

  for k, v in select key, value::numeric from jsonb_each_text(p_attributes) loop
    if not known_attribute(k) then
      return query select false, format('%s is not an attribute on the card.', k);
      return;
    end if;
    if v < 1 or v > 99 then
      return query select false, 'Every rating runs from 1 to 99.';
      return;
    end if;
  end loop;

  insert into peer_rating (match_id, rater_id, subject_id, attributes)
  values (p_match_id, v_uid, p_subject_id, p_attributes)
  on conflict (match_id, rater_id, subject_id)
  do update set attributes = excluded.attributes;

  insert into point_ledger (player_id, match_id, kind, points)
  values (v_uid, p_match_id, 'rating_given', points_for('rating_given'))
  on conflict do nothing;

  -- The subject's card moves the moment new evidence lands, so the next read
  -- of P-08 shows it rather than waiting for a nightly job.
  perform rebuild_card(p_subject_id);
  perform verify_match_if_ready(p_match_id);

  return query select true, null::text;
end;
$$;

-- MCH-003: a match counts as verified evidence once enough independent people
-- have rated in it. One friend vouching is not evidence; three people who were
-- there is the threshold §5.1's ladder is built around.
create or replace function verify_match_if_ready(p_match_id uuid)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_raters integer;
begin
  select count(distinct rater_id)::integer into v_raters
    from peer_rating where match_id = p_match_id;

  if v_raters < 3 then
    return false;
  end if;

  update match set state = 'verified', verified_at = coalesce(verified_at, now())
   where id = p_match_id and state = 'played';

  insert into point_ledger (player_id, match_id, kind, points)
  select mp.player_id, p_match_id, 'match_verified', points_for('match_verified')
    from match_participant mp
   where mp.match_id = p_match_id and mp.player_id is not null
  on conflict do nothing;

  return true;
end;
$$;

-- Who this player still owes a rating to (P-09's prompt).
create or replace function rate_targets(p_match_id uuid)
returns table (
  player_id    uuid,
  display_name text,
  position_code text,
  rated        boolean
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from match_participant mp
                  where mp.match_id = p_match_id and mp.player_id = auth.uid()) then
    raise exception 'You did not play in that match.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select mp.player_id, mp.display_name, mp.position,
         exists (select 1 from peer_rating pr
                  where pr.match_id = p_match_id
                    and pr.rater_id = auth.uid()
                    and pr.subject_id = mp.player_id)
    from match_participant mp
   where mp.match_id = p_match_id
     and mp.player_id is not null
     and mp.player_id <> auth.uid()
   order by mp.display_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- The card, rebuilt from both sources
-- ---------------------------------------------------------------------------

create index if not exists self_assessment_latest_idx on self_assessment (player_id, seq desc);

-- §5.1, finally whole. The player's own answers supply `self_weight` of each
-- attribute and the mean of their peers supplies the rest; the ladder decides
-- the split from how many verified matches stand behind them.
--
-- An attribute nobody has rated stays at the self-assessed value rather than
-- decaying toward a number no one asserted — partial evidence should move the
-- attributes it is evidence about and leave the others alone.
create or replace function rebuild_card(p_player_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_self     jsonb;
  v_position text;
  v_evidence integer;
  v_weight   numeric;
  v_blend    jsonb;
  v_ovr      smallint;
  v_conf     text;
  v_id       uuid;
  k          text;
  v_peer     numeric;
begin
  -- Ordered by `seq`, not `created_at`: now() is transaction start time, so two
  -- assessments written in one transaction tie on the clock and "the latest
  -- answers" becomes whichever row the planner returned first. The snapshot
  -- table already learned this; the same trap is here.
  select sa.answers, sa.position into v_self, v_position
    from self_assessment sa
   where sa.player_id = p_player_id
   order by sa.seq desc
   limit 1;

  -- No self-assessment means no card to rebuild. Peer ratings alone would give
  -- a card to somebody who never asked for one.
  if v_self is null then
    return null;
  end if;

  -- Evidence is *verified* matches the player took part in — not bookings, and
  -- not matches that nobody corroborated.
  select count(distinct m.id)::integer into v_evidence
    from match m
    join match_participant mp on mp.match_id = m.id
   where mp.player_id = p_player_id
     and m.state = 'verified';

  v_weight := self_assessment_weight(v_evidence);
  v_blend  := v_self;

  for k in select jsonb_object_keys(v_self) loop
    select avg((pr.attributes ->> k)::numeric) into v_peer
      from peer_rating pr
      join match m on m.id = pr.match_id
     where pr.subject_id = p_player_id
       and m.state = 'verified'
       and pr.attributes ? k;

    if v_peer is not null then
      v_blend := jsonb_set(
        v_blend, array[k],
        to_jsonb(greatest(1, least(99,
          round(v_weight * (v_self ->> k)::numeric + (1 - v_weight) * v_peer)
        ))::integer)
      );
    end if;
  end loop;

  v_ovr  := compute_ovr(v_blend, v_position, 'v1');
  v_conf := card_confidence(v_evidence);

  insert into attribute_snapshot (player_id, position, ovr, attributes, confidence,
                                  evidence_count, self_weight, rule_version)
  values (p_player_id, v_position, v_ovr, v_blend, v_conf, v_evidence, v_weight, 'v1')
  returning id into v_id;

  return v_id;
end;
$$;

-- PRO-002 / PRO-003, re-pointed at the blend.
--
-- The original wrote a snapshot straight from the raw answers, which was right
-- while peer ratings did not exist and is wrong now: re-taking the assessment
-- would overwrite a card built on match evidence with a fresh set of
-- self-reported numbers. There is one way to produce a card, and this is it —
-- record the answers, then rebuild through the ladder.
create or replace function submit_self_assessment(p_position text, p_answers jsonb)
returns table (
  ovr smallint, position_code text, attributes jsonb,
  confidence text, evidence_count integer, self_weight numeric, rule_version text
)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  k     text;
  v     numeric;
begin
  if v_uid is null then
    raise exception 'Sign in to complete your assessment.' using errcode = 'insufficient_privilege';
  end if;
  if p_position not in ('GK', 'DEF', 'MID', 'FWD') then
    raise exception 'Unknown position %', p_position using errcode = 'check_violation';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or p_answers = '{}'::jsonb then
    raise exception 'Answer at least one question.' using errcode = 'check_violation';
  end if;

  for k, v in select key, value::numeric from jsonb_each_text(p_answers) loop
    if not known_attribute(k) then
      raise exception '% is not an attribute on the card.', k using errcode = 'check_violation';
    end if;
    if v < 1 or v > 99 then
      raise exception 'Every answer runs from 1 to 99.' using errcode = 'check_violation';
    end if;
  end loop;

  insert into self_assessment (player_id, position, answers)
  values (v_uid, p_position, p_answers);

  v_id := rebuild_card(v_uid);

  return query
  select s.ovr, s.position, s.attributes, s.confidence,
         s.evidence_count, s.self_weight, s.rule_version
    from attribute_snapshot s where s.id = v_id;
end;
$$;

-- P-08's tiles: form, verified matches, raters — the three that read empty for
-- a real account because nothing produced them.
create or replace function my_card_evidence()
returns table (
  verified_matches integer,
  played_matches   integer,
  rater_count      integer,
  ratings_given    integer,
  xp               integer,
  level            integer,
  into_level       integer,
  to_next          integer,
  form             text[]
)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_xp  integer;
begin
  if v_uid is null then
    raise exception 'Sign in to see your card.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum(points), 0)::integer into v_xp
    from point_ledger where player_id = v_uid;

  return query
  select
    (select count(distinct m.id)::integer from match m
       join match_participant mp on mp.match_id = m.id
      where mp.player_id = v_uid and m.state = 'verified'),
    (select count(distinct m.id)::integer from match m
       join match_participant mp on mp.match_id = m.id
      where mp.player_id = v_uid),
    (select count(distinct pr.rater_id)::integer from peer_rating pr
      where pr.subject_id = v_uid),
    (select count(*)::integer from peer_rating pr where pr.rater_id = v_uid),
    v_xp,
    l.level, l.into_level, l.to_next,
    -- The last five results, most recent first: W, D, L, or `-` when no score
    -- was ever reported. The strip has to be able to say "we don't know".
    coalesce((
      select array_agg(res order by played_at desc)
        from (
          select m.played_at,
                 case
                   when m.score_home is null or m.score_away is null then '-'
                   when m.score_home = m.score_away then 'D'
                   when (mp.side = 'home') = (m.score_home > m.score_away) then 'W'
                   else 'L'
                 end as res
            from match m
            join match_participant mp on mp.match_id = m.id
           where mp.player_id = v_uid
           order by m.played_at desc
           limit 5
        ) recent
    ), array[]::text[])
  from level_for_xp(v_xp) l;
end;
$$;

-- PRO-007: the card exposes its evidence rather than implying it. This is the
-- list behind "Match evidence" on P-09.
create or replace function my_match_evidence(p_limit integer default 20)
returns table (
  match_id     uuid,
  played_at    timestamptz,
  venue_name   text,
  state        match_state,
  score_home   smallint,
  score_away   smallint,
  side         text,
  raters       integer,
  i_rated      integer,
  can_rate     boolean
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select m.id, m.played_at, v.name, m.state, m.score_home, m.score_away, mp.side,
         (select count(distinct pr.rater_id)::integer from peer_rating pr where pr.match_id = m.id),
         (select count(*)::integer from peer_rating pr
           where pr.match_id = m.id and pr.rater_id = auth.uid()),
         m.played_at >= now() - interval '7 days'
    from match m
    join match_participant mp on mp.match_id = m.id and mp.player_id = auth.uid()
    join booking b on b.id = m.booking_id
    join pitch p on p.id = b.pitch_id
    join venue v on v.id = p.venue_id
   order by m.played_at desc
   limit greatest(1, least(p_limit, 100));
$$;

-- The ledger, readable line by line (PTS-002).
create or replace function my_points(p_limit integer default 50)
returns table (
  at     timestamptz,
  kind   text,
  points integer,
  venue_name text
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select pl.created_at, pl.kind, pl.points, v.name
    from point_ledger pl
    left join match m on m.id = pl.match_id
    left join booking b on b.id = m.booking_id
    left join pitch p on p.id = b.pitch_id
    left join venue v on v.id = p.venue_id
   where pl.player_id = auth.uid()
   order by pl.created_at desc
   limit greatest(1, least(p_limit, 200));
$$;

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

alter table match             enable row level security;
alter table match_participant enable row level security;
alter table peer_rating       enable row level security;
alter table point_ledger      enable row level security;

-- Everything this migration created starts closed. rebuild_card,
-- award_match_points and verify_match_if_ready are SECURITY DEFINER and take a
-- caller-supplied id, so leaving them on the PUBLIC default would let anyone
-- rebuild anyone's card or force a match to count as verified. They get no
-- grant at all — the functions above call them as their owner.
revoke execute on function public.rebuild_card(uuid)             from public, anon, authenticated;
revoke execute on function public.award_match_points(uuid)       from public, anon, authenticated;
revoke execute on function public.verify_match_if_ready(uuid)    from public, anon, authenticated;
revoke execute on function public.points_for(text)               from public;
revoke execute on function public.level_for_xp(integer)          from public;
revoke execute on function public.known_attribute(text)          from public;
revoke execute on function public.complete_match(uuid, integer, integer) from public, anon;
revoke execute on function public.submit_peer_rating(uuid, uuid, jsonb)  from public, anon;
revoke execute on function public.rate_targets(uuid)             from public, anon;
revoke execute on function public.my_card_evidence()             from public, anon;
revoke execute on function public.my_match_evidence(integer)     from public, anon;
revoke execute on function public.my_points(integer)             from public, anon;

grant execute on function public.points_for(text)     to anon, authenticated;
grant execute on function public.level_for_xp(integer) to anon, authenticated;
grant execute on function public.known_attribute(text) to anon, authenticated;

grant execute on function public.complete_match(uuid, integer, integer)   to authenticated;
grant execute on function public.submit_peer_rating(uuid, uuid, jsonb)    to authenticated;
grant execute on function public.rate_targets(uuid)                       to authenticated;
grant execute on function public.my_card_evidence()                       to authenticated;
-- Restated: the replacement above resets the grant along with everything else.
revoke execute on function public.submit_self_assessment(text, jsonb) from public, anon;
grant  execute on function public.submit_self_assessment(text, jsonb) to authenticated;
grant execute on function public.my_match_evidence(integer)               to authenticated;
grant execute on function public.my_points(integer)                       to authenticated;

-- Internal: called by the functions above as their owner, never by a client.
-- `rebuild_card` in particular must not be callable with someone else's id.

comment on table public.peer_rating is
  'Evidence. One rating per rater per subject per match, closed after seven days, and only from people the match sheet says were there.';
comment on table public.point_ledger is
  'XP, append-only. A total is always explainable line by line; the unique index is what stops a match paying twice.';
