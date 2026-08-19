-- X League — the player card, and the rules that produce it.
--
-- §5.1 is the whole of this migration. The card is an original football
-- identity, and the rule that keeps it honest is this: a self-assessment
-- creates a *provisional* starting card, not a verified claim. Completed-match
-- evidence gradually becomes the dominant input, and every displayed score
-- exposes its confidence and evidence count.
--
-- Nothing here can be reproduced later unless the rule version travels with the
-- snapshot (PRO-004), so it does.

-- ---------------------------------------------------------------------------
-- Versioned scoring rules
-- ---------------------------------------------------------------------------

-- ADM-005: rules are published with a version, and historical snapshots stay
-- reproducible against the version that produced them.
create table if not exists scoring_rule (
  version       text        not null,
  position      text        not null check (position in ('GK', 'DEF', 'MID', 'FWD')),
  -- Attribute key -> percentage weight. Must total 100.
  weights       jsonb       not null,
  effective_from date       not null default current_date,
  primary key (version, position)
);

-- The default outfield weights from §5.1: a central midfielder weights PAS 25%,
-- DRI 20%, PHY 15%, DEF 15%, SPD 15% and SHO 10%. The others follow the same
-- shape — position-relevant attributes carry the score.
insert into scoring_rule (version, position, weights) values
  ('v1', 'MID', '{"PAS":25,"DRI":20,"PHY":15,"DEF":15,"SPD":15,"SHO":10}'),
  ('v1', 'DEF', '{"DEF":30,"PHY":20,"SPD":15,"PAS":15,"DRI":10,"SHO":10}'),
  ('v1', 'FWD', '{"SHO":30,"DRI":20,"SPD":20,"PAS":15,"PHY":10,"DEF":5}'),
  ('v1', 'GK',  '{"DIV":25,"REF":25,"HAN":20,"POS":15,"KIC":10,"SPD":5}')
on conflict (version, position) do nothing;

-- ---------------------------------------------------------------------------
-- What the player said about themselves
-- ---------------------------------------------------------------------------

-- PRO-002: an anchored self-assessment, kept as the raw answers so a later rule
-- version can be replayed over it. PRO-011: changing position does not
-- overwrite history — a new assessment is a new row.
create table if not exists self_assessment (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid        not null references auth.users(id) on delete cascade,
  position    text        not null check (position in ('GK', 'DEF', 'MID', 'FWD')),
  -- Attribute key -> 1..99, from the anchored answers.
  answers     jsonb       not null,
  created_at  timestamptz not null default now()
);

create index if not exists self_assessment_player_idx on self_assessment (player_id, created_at desc);

-- ---------------------------------------------------------------------------
-- The card itself
-- ---------------------------------------------------------------------------

-- PRO-003 / PRO-004 / PRO-005. Snapshots are append-only: a card is never
-- edited in place, so the history of how someone's rating moved stays intact.
create table if not exists attribute_snapshot (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid        not null references auth.users(id) on delete cascade,
  position       text        not null,
  ovr            smallint    not null check (ovr between 1 and 99),
  -- Attribute key -> 1..99.
  attributes     jsonb       not null,
  -- PRO-005: Provisional, Emerging or Established.
  confidence     text        not null check (confidence in ('provisional', 'emerging', 'established')),
  -- How many completed, verified matches stand behind it.
  evidence_count integer     not null default 0,
  -- What share of the card still comes from the player's own assessment.
  self_weight    numeric(4,3) not null,
  rule_version   text        not null,
  created_at     timestamptz not null default now()
);

create index if not exists attribute_snapshot_player_idx on attribute_snapshot (player_id, created_at desc);

alter table scoring_rule       enable row level security;
alter table self_assessment    enable row level security;
alter table attribute_snapshot enable row level security;

-- A player may read their own assessments and snapshots. Nobody reads anyone
-- else's through the API; public card views will come through a function that
-- honours PRO-006 visibility when there is something public to show.
drop policy if exists self_assessment_own on self_assessment;
create policy self_assessment_own on self_assessment
  for select to authenticated using (player_id = auth.uid());

drop policy if exists attribute_snapshot_own on attribute_snapshot;
create policy attribute_snapshot_own on attribute_snapshot
  for select to authenticated using (player_id = auth.uid());

-- ---------------------------------------------------------------------------
-- The model
-- ---------------------------------------------------------------------------

-- §5.1's confidence ladder, in one place so the thresholds are not scattered.
create or replace function card_confidence(p_evidence integer)
returns text
language sql immutable
set search_path = public, pg_temp as $$
  select case
    when p_evidence >= 10 then 'established'
    when p_evidence >= 3  then 'emerging'
    else 'provisional'
  end;
$$;

-- How much of the card the player's own assessment is still allowed to supply.
--
-- §5.1: up to 70% until three verified matches; from three to nine, peer and
-- match evidence progressively replaces it; at ten or more, no more than 15%.
-- The middle band is the interpolation that "progressively" describes.
create or replace function self_assessment_weight(p_evidence integer)
returns numeric
language sql immutable
set search_path = public, pg_temp as $$
  select case
    when p_evidence >= 10 then 0.15
    when p_evidence < 3   then 0.70
    else round((0.70 - (0.70 - 0.15) * (p_evidence - 3) / 7.0)::numeric, 3)
  end;
$$;

-- The weighted summary of position-relevant attributes (§5.1).
create or replace function compute_ovr(p_attributes jsonb, p_position text, p_rule_version text default 'v1')
returns smallint
language plpgsql immutable
set search_path = public, pg_temp as $$
declare
  w      jsonb;
  total  numeric := 0;
  weight numeric := 0;
  k      text;
begin
  select weights into w from scoring_rule
   where version = p_rule_version and position = p_position;

  if w is null then
    -- No rule for that position: fall back to a plain mean rather than
    -- inventing a weighting that nobody published.
    select avg(value::numeric) into total
      from jsonb_each_text(p_attributes) as e(key, value);
    return greatest(1, least(99, round(coalesce(total, 50))))::smallint;
  end if;

  for k in select jsonb_object_keys(w) loop
    if p_attributes ? k then
      total  := total  + (p_attributes ->> k)::numeric * (w ->> k)::numeric;
      weight := weight + (w ->> k)::numeric;
    end if;
  end loop;

  if weight = 0 then return 50; end if;
  return greatest(1, least(99, round(total / weight)))::smallint;
end;
$$;

-- PRO-002 / PRO-003. Submitting an assessment produces a provisional card and
-- says so; it never silently becomes a verified claim.
create or replace function submit_self_assessment(p_position text, p_answers jsonb)
-- `position` is reserved in a RETURNS TABLE list, hence position_code.
returns table (
  ovr smallint, position_code text, attributes jsonb,
  confidence text, evidence_count integer, self_weight numeric, rule_version text
)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid      uuid := auth.uid();
  v_evidence integer;
  v_ovr      smallint;
  v_conf     text;
  v_weight   numeric;
begin
  if v_uid is null then
    raise exception 'Sign in to complete your assessment.' using errcode = 'insufficient_privilege';
  end if;
  if p_position not in ('GK', 'DEF', 'MID', 'FWD') then
    raise exception 'Unknown position %', p_position using errcode = 'check_violation';
  end if;

  insert into self_assessment (player_id, position, answers)
  values (v_uid, p_position, p_answers);

  -- Verified match evidence only. There is no match system yet, so this is
  -- zero for everyone — which is exactly why every new card reads Provisional.
  select count(*)::integer into v_evidence
    from booking b
   where b.captain_id = v_uid and b.state in ('checked_in', 'completed');

  v_ovr    := compute_ovr(p_answers, p_position, 'v1');
  v_conf   := card_confidence(v_evidence);
  v_weight := self_assessment_weight(v_evidence);

  insert into attribute_snapshot (player_id, position, ovr, attributes, confidence,
                                  evidence_count, self_weight, rule_version)
  values (v_uid, p_position, v_ovr, p_answers, v_conf, v_evidence, v_weight, 'v1');

  return query
  select v_ovr, p_position, p_answers, v_conf, v_evidence, v_weight, 'v1'::text;
end;
$$;

-- PRO-003 / PRO-007: the card, with its evidence exposed rather than implied.
create or replace function my_card()
returns table (
  display_name text, ovr smallint, position_code text, attributes jsonb,
  confidence text, evidence_count integer, self_weight numeric,
  rule_version text, snapshot_at timestamptz
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select pp.display_name, s.ovr, s.position, s.attributes, s.confidence,
         s.evidence_count, s.self_weight, s.rule_version, s.created_at
    from attribute_snapshot s
    join player_profile pp on pp.id = s.player_id
   where s.player_id = auth.uid()
   order by s.created_at desc
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Owner Today (O-01), from the same timeline as the calendar
-- ---------------------------------------------------------------------------

create or replace function owner_arrivals(p_venue_id uuid, p_date date, p_tz text default 'Africa/Cairo')
returns table (
  booking_id   uuid,
  pitch_label  text,
  starts_at    timestamptz,
  hour         smallint,
  state        booking_state,
  source       booking_source,
  code         text,
  captain_name text,
  deposit_egp  integer,
  checked_in   boolean
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_venue_staff(p_venue_id) then
    raise exception 'You do not have access to that venue.' using errcode = 'insufficient_privilege';
  end if;

  perform expire_stale_holds(null);

  return query
  select b.id, p.label, lower(b.during),
         extract(hour from lower(b.during) at time zone p_tz)::smallint,
         b.state, b.source, b.code, b.captain_name, b.deposit_egp,
         b.checked_in_at is not null
    from booking b
    join pitch p on p.id = b.pitch_id
   where p.venue_id = p_venue_id
     and (lower(b.during) at time zone p_tz)::date = p_date
     and b.state in ('confirmed', 'checked_in', 'completed')
   order by lower(b.during), p.label;
end;
$$;

-- O-01's tiles: occupancy, cash still to collect, and conflicts. Conflicts are
-- always zero while the exclusion constraint holds — the tile exists to show
-- that, not to hedge about it.
create or replace function owner_summary(p_venue_id uuid, p_date date, p_tz text default 'Africa/Cairo')
returns table (
  occupancy_pct integer,
  open_slots    integer,
  cash_due_egp  integer,
  cash_gates    integer,
  conflicts     integer
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_venue_staff(p_venue_id) then
    raise exception 'You do not have access to that venue.' using errcode = 'insufficient_privilege';
  end if;

  return query
  with cells as (
    select a.available
      from pitch p
      cross join lateral search_availability(p.id, p_date, p_tz) a
     where p.venue_id = p_venue_id
  ),
  due as (
    select coalesce(sum(b.deposit_egp), 0)::integer as amount, count(*)::integer as gates
      from booking b join pitch p on p.id = b.pitch_id
     where p.venue_id = p_venue_id
       and (lower(b.during) at time zone p_tz)::date = p_date
       and b.state = 'confirmed'
       and b.source = 'app'
  )
  select
    case when (select count(*) from cells) = 0 then 0
         else round(100.0 * (select count(*) from cells where not available)
                          / (select count(*) from cells))::integer end,
    (select count(*)::integer from cells where available),
    (select amount from due),
    (select gates from due),
    0;
end;
$$;

grant execute on function submit_self_assessment(text, jsonb) to authenticated;
grant execute on function my_card()                           to authenticated;
grant execute on function owner_arrivals(uuid, date, text)    to authenticated;
grant execute on function owner_summary(uuid, date, text)     to authenticated;
