-- A cup is entered by an entrant, and an entrant is a club or a team.
--
-- The tournament spine was written when the only thing that could enter was a
-- team, so a fixture pointed at `team(id)` and the standings grouped by it.
-- Clubs are what enter leagues now, and the choice was between bolting a second
-- pair of columns onto every fixture or naming the thing that was already
-- implied: the entry itself. A fixture is between two entries in this cup, and
-- `tournament_registration` is that row. It carries the name the table shows,
-- so a club renamed in March does not rewrite a table from January, and it is
-- the only place that has to know whether a club or a team is behind it.
--
-- Teams keep their path. A venue running a friendly six-a-side on a Thursday
-- has no reason to make anybody found a club first.

-- ---------------------------------------------------------------------------
-- The entry
-- ---------------------------------------------------------------------------

alter table tournament_registration
  add column if not exists club_id uuid references club(id) on delete cascade,
  add column if not exists payment_claimed_at timestamptz;

alter table tournament_registration alter column team_id drop not null;

comment on column tournament_registration.payment_claimed_at is
  'When the captain said they had sent the money. Their claim; `paid` is somebody at X League agreeing.';

do $$ begin
  alter table tournament_registration add constraint registration_one_entrant check (
    (team_id is not null and club_id is null) or (club_id is not null and team_id is null)
  );
exception when duplicate_object then null; end $$;

-- Nulls are distinct in a unique index, so the existing (tournament_id, team_id)
-- constraint stops caring once team_id is null and this one takes over.
create unique index if not exists tournament_registration_club_unique
  on tournament_registration (tournament_id, club_id) where club_id is not null;

create index if not exists tournament_registration_club_idx
  on tournament_registration (club_id);

-- ---------------------------------------------------------------------------
-- The fixture points at the entry
-- ---------------------------------------------------------------------------

alter table fixture
  add column if not exists home_entrant_id uuid references tournament_registration(id) on delete set null,
  add column if not exists away_entrant_id uuid references tournament_registration(id) on delete set null;

update fixture f
   set home_entrant_id = r.id
  from tournament_registration r
 where r.tournament_id = f.tournament_id
   and r.team_id = f.home_team_id
   and f.home_team_id is not null
   and f.home_entrant_id is null;

update fixture f
   set away_entrant_id = r.id
  from tournament_registration r
 where r.tournament_id = f.tournament_id
   and r.team_id = f.away_team_id
   and f.away_team_id is not null
   and f.away_entrant_id is null;

-- Dropping these takes the old check constraint and indexes with them.
alter table fixture drop column if exists home_team_id;
alter table fixture drop column if exists away_team_id;

do $$ begin
  alter table fixture add constraint fixture_distinct_entrants check (
    home_entrant_id is null or away_entrant_id is null or home_entrant_id <> away_entrant_id
  );
exception when duplicate_object then null; end $$;

create index if not exists fixture_home_entrant_idx on fixture (home_entrant_id);
create index if not exists fixture_away_entrant_idx on fixture (away_entrant_id);

-- ---------------------------------------------------------------------------
-- Entering, as a club
-- ---------------------------------------------------------------------------

/**
 * A club enters a cup, and the money owed is settled at the same moment.
 *
 * The quote and the entry are one call deliberately. A captain who is shown
 * "EGP 300, code applied" and then registers separately can be charged
 * something else in between — the code used up, the points spent elsewhere, the
 * fee changed. So the discount is recomputed here and written onto the entry,
 * and the code is claimed with a conditional update rather than a read followed
 * by a write, which is the only version of `max_uses` that survives two
 * captains typing the same code at once.
 *
 * Nothing here takes money. The captain transfers out of band to one of the
 * channels the cup names, says so, and a human at X League agrees.
 */
create or replace function register_club_for_tournament(
  p_tournament_id uuid,
  p_club_id       uuid,
  p_promo_code    text default null,
  p_points        integer default 0,
  p_payment_note  text default null
)
returns table (ok boolean, registration_id uuid, amount_due_egp integer, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_state    tournament_state;
  v_max      smallint;
  v_closes   timestamptz;
  v_taken    integer;
  v_club     record;
  v_elig     record;
  v_q        record;
  v_claimed  uuid;
  v_balance  integer;
  v_reg      uuid;
begin
  if not is_club_captain(p_club_id) then
    return query select false, null::uuid, null::integer, 'Only the club captain can enter a cup.';
    return;
  end if;

  select c.name into v_club from club c where c.id = p_club_id;
  if v_club.name is null then
    return query select false, null::uuid, null::integer, 'That club no longer exists.';
    return;
  end if;

  select t.state, t.max_teams, t.registration_closes_at
    into v_state, v_max, v_closes
    from tournament t where t.id = p_tournament_id;

  if v_state is null then
    return query select false, null::uuid, null::integer, 'That cup no longer exists.';
    return;
  end if;

  if v_state <> 'open' then
    return query select false, null::uuid, null::integer,
      case when v_state = 'draft' then 'That cup is not open yet.'
           when v_state = 'full'  then 'That cup is full.'
           else 'Entries have closed.' end;
    return;
  end if;

  if v_closes is not null and now() > v_closes then
    return query select false, null::uuid, null::integer, 'Entries have closed.';
    return;
  end if;

  -- The squad rule, from the one place that states it.
  select * into v_elig from club_eligibility(p_club_id);
  if not v_elig.eligible then
    return query select false, null::uuid, null::integer,
      format('Your club cannot enter yet. %s', v_elig.reason);
    return;
  end if;

  if exists (select 1 from tournament_registration r
              where r.tournament_id = p_tournament_id and r.club_id = p_club_id
                and r.state in ('pending', 'accepted')) then
    return query select false, null::uuid, null::integer, 'Your club has already entered this cup.';
    return;
  end if;

  select count(*)::integer into v_taken
    from tournament_registration r
   where r.tournament_id = p_tournament_id and r.state in ('pending', 'accepted');

  if v_taken >= v_max then
    update tournament set state = 'full' where id = p_tournament_id;
    return query select false, null::uuid, null::integer, 'That cup is full.';
    return;
  end if;

  -- What it costs, recomputed now rather than trusted from the screen.
  select * into v_q from registration_quote(p_tournament_id, p_promo_code, p_points);

  if not v_q.promo_ok then
    return query select false, null::uuid, null::integer, v_q.reason;
    return;
  end if;

  insert into tournament_registration
    (tournament_id, club_id, team_name, registered_by, state,
     fee_egp, promo_off_egp, points_spent, points_off_egp, amount_due_egp,
     payment_note, payment_claimed_at)
  values
    (p_tournament_id, p_club_id, v_club.name, auth.uid(), 'pending',
     v_q.fee_egp, v_q.promo_off_egp, v_q.points_spent, v_q.points_off_egp, v_q.amount_due_egp,
     nullif(trim(coalesce(p_payment_note, '')), ''),
     case when nullif(trim(coalesce(p_payment_note, '')), '') is null then null else now() end)
  returning id into v_reg;

  -- Claim the code. The condition is in the UPDATE so two captains cannot both
  -- read a count of nine against a limit of ten.
  if v_q.promo_off_egp > 0 and nullif(trim(coalesce(p_promo_code, '')), '') is not null then
    update promo_code
       set used_count = used_count + 1
     where code = upper(trim(p_promo_code))
       and active
       and (expires_at is null or expires_at > now())
       and used_count < max_uses
    returning id into v_claimed;

    if v_claimed is null then
      -- Somebody took the last use between the quote and here.
      raise exception 'That code was used up while you were entering.'
        using errcode = 'check_violation';
    end if;

    insert into promo_redemption (promo_code_id, registration_id, redeemed_by, amount_off_egp)
    values (v_claimed, v_reg, auth.uid(), v_q.promo_off_egp);
  end if;

  -- Spend the points. Earned stays earned; only this ledger moves.
  if v_q.points_spent > 0 then
    v_balance := my_points_balance();
    if v_balance < v_q.points_spent then
      raise exception 'You no longer have that many points.' using errcode = 'check_violation';
    end if;
    insert into point_spend (player_id, registration_id, points, egp_off)
    values (auth.uid(), v_reg, v_q.points_spent, v_q.points_off_egp);
  end if;

  if v_taken + 1 >= v_max then
    update tournament set state = 'full' where id = p_tournament_id;
  end if;

  return query select true, v_reg, v_q.amount_due_egp, null::text;
end;
$$;

/** The captain says the money is on its way, and how. */
create or replace function claim_registration_payment(p_registration_id uuid, p_note text)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_club uuid;
  v_by   uuid;
begin
  select r.club_id, r.registered_by into v_club, v_by
    from tournament_registration r where r.id = p_registration_id;

  if v_by is null and v_club is null then
    return query select false, 'That entry no longer exists.';
    return;
  end if;

  if not (v_by = auth.uid() or (v_club is not null and is_club_captain(v_club))) then
    return query select false, 'Only the captain who entered can confirm the payment.';
    return;
  end if;

  if length(coalesce(trim(p_note), '')) < 3 then
    return query select false, 'Say what you sent and how, so it can be matched.';
    return;
  end if;

  update tournament_registration
     set payment_note = trim(p_note), payment_claimed_at = now()
   where id = p_registration_id;

  return query select true, null::text;
end;
$$;

/** X League agrees the money arrived. A judgement, recorded as one. */
create or replace function set_registration_paid(p_registration_id uuid, p_paid boolean)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_tournament uuid;
begin
  select r.tournament_id into v_tournament
    from tournament_registration r where r.id = p_registration_id;

  if v_tournament is null then
    return query select false, 'That entry no longer exists.';
    return;
  end if;
  if not (can_run_tournament(v_tournament) or is_platform('support')) then
    return query select false, 'You do not manage that cup.';
    return;
  end if;

  update tournament_registration
     set paid = coalesce(p_paid, false),
         paid_at = case when p_paid then now() else null end
   where id = p_registration_id;

  perform write_audit(case when p_paid then 'registration.paid' else 'registration.unpaid' end,
                      'tournament_registration', p_registration_id,
                      jsonb_build_object('tournament_id', v_tournament));

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deciding, drawing and tallying, in terms of entrants
-- ---------------------------------------------------------------------------

/**
 * Admit or refuse an entry.
 *
 * Rewritten because the old version inner-joined `team`, which meant a club's
 * entry could not be admitted at all — it simply returned no row and told the
 * organiser the entry no longer existed.
 */
create or replace function decide_registration(p_registration_id uuid, p_accept boolean)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_tournament uuid;
  v_captain    uuid;
  v_name       text;
begin
  select r.tournament_id,
         coalesce(c.captain_id, tm.captain_id, r.registered_by),
         tn.name
    into v_tournament, v_captain, v_name
    from tournament_registration r
    join tournament tn on tn.id = r.tournament_id
    left join club c  on c.id = r.club_id
    left join team tm on tm.id = r.team_id
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

  select array_agg(r.id order by r.created_at) into v_ents
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
    -- Circle method, as an explicit rotation. Hold position 1 fixed; rotate
    -- 2..n one step each round; pair position i against position n+1-i.
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
    select r.id as entrant_id, r.team_name as entrant_name, r.club_id, r.team_id
      from tournament_registration r
     where r.tournament_id = p_tournament_id and r.state = 'accepted'
  ),
  side as (
    select f.home_entrant_id as entrant_id, f.score_home as gf, f.score_away as ga
      from fixture f
     where f.tournament_id = p_tournament_id and f.state = 'played'
       and f.home_entrant_id is not null
    union all
    select f.away_entrant_id, f.score_away, f.score_home
      from fixture f
     where f.tournament_id = p_tournament_id and f.state = 'played'
       and f.away_entrant_id is not null
  ),
  tallied as (
    select
      e.entrant_id, e.entrant_name, e.club_id, e.team_id,
      count(s.entrant_id)::integer                                     as played,
      count(*) filter (where s.gf > s.ga)::integer                     as won,
      count(*) filter (where s.gf = s.ga)::integer                     as drawn,
      count(*) filter (where s.gf < s.ga)::integer                     as lost,
      coalesce(sum(s.gf), 0)::integer                                  as gf,
      coalesce(sum(s.ga), 0)::integer                                  as ga
    from entrant e
    left join side s on s.entrant_id = e.entrant_id
    group by e.entrant_id, e.entrant_name, e.club_id, e.team_id
  ),
  scored as (
    select t.*,
           (t.gf - t.ga) as gd,
           (t.won * v_win + t.drawn * v_draw + t.lost * v_loss)::integer as points
      from tallied t
  )
  select jsonb_agg(
           jsonb_build_object(
             'entrant_id', entrant_id, 'entrant_name', entrant_name,
             'club_id', club_id, 'team_id', team_id,
             'played', played, 'won', won, 'drawn', drawn, 'lost', lost,
             'gf', gf, 'ga', ga, 'gd', gd, 'points', points
           )
           order by points desc, gd desc, gf desc, entrant_name
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
               'state', f.state, 'kicks_off_at', f.kicks_off_at)
             order by f.round, f.sequence)
        from fixture f
        left join tournament_registration hr on hr.id = f.home_entrant_id
        left join tournament_registration ar on ar.id = f.away_entrant_id
       where f.tournament_id = t.id
    ), '[]'::jsonb),
    coalesce((
      select s.table_json from standing_snapshot s
       where s.tournament_id = t.id order by s.seq desc limit 1
    ), '[]'::jsonb)
  from tournament t
  join venue v on v.id = t.venue_id
  where t.id = p_tournament_id
    and (t.state <> 'draft' or can_run_tournament(t.id));
$$;

/**
 * The cups this person is in, whichever way they got there.
 *
 * A club's players are in the cup their club entered, exactly as a team's
 * players are in the cup their team entered — and a non-playing captain is in
 * it too, because they are the one who has to answer for the entry.
 */
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
  -- EXISTS rather than a join, so a club of eleven does not put the same cup
  -- on the captain's list eleven times.
  select t.id, t.name, v.name, r.team_name, t.state, r.state, t.starts_on
    from tournament_registration r
    join tournament t on t.id = r.tournament_id
    join venue v on v.id = t.venue_id
   where r.state in ('pending', 'accepted')
     and (
       exists (select 1 from team_membership m
                where m.team_id = r.team_id and m.player_id = auth.uid() and m.state = 'active')
       or exists (select 1 from club_membership cm
                   where cm.club_id = r.club_id and cm.player_id = auth.uid() and cm.state = 'active')
     )
   order by t.starts_on nulls last, t.name;
$$;

/** Every entry in a cup, with what it owes and what it has claimed. */
create or replace function tournament_entries(p_tournament_id uuid)
returns table (
  registration_id uuid, entrant_name text, club_id uuid, team_id uuid,
  crest_url text, state registration_state,
  fee_egp integer, promo_off_egp integer, points_off_egp integer, amount_due_egp integer,
  paid boolean, paid_at timestamptz, payment_note text, payment_claimed_at timestamptz,
  created_at timestamptz
)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if not (can_run_tournament(p_tournament_id) or is_platform('support')) then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select r.id, r.team_name, r.club_id, r.team_id, c.crest_url, r.state,
         r.fee_egp, r.promo_off_egp, r.points_off_egp, r.amount_due_egp,
         r.paid, r.paid_at, r.payment_note, r.payment_claimed_at, r.created_at
    from tournament_registration r
    left join club c on c.id = r.club_id
   where r.tournament_id = p_tournament_id
   order by r.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- CREATE OR REPLACE resets grants, so every function touched above is restated
-- here rather than left with whatever the replace happened to leave.
revoke execute on function public.rebuild_standings(uuid) from public, anon, authenticated;

revoke execute on function public.decide_registration(uuid, boolean) from public, anon;
grant execute on function public.decide_registration(uuid, boolean) to authenticated;
revoke execute on function public.generate_fixtures(uuid) from public, anon;
grant execute on function public.generate_fixtures(uuid) to authenticated;
revoke execute on function public.my_tournaments() from public, anon;
grant execute on function public.my_tournaments() to authenticated;
revoke execute on function public.tournament_detail(uuid) from public;
grant execute on function public.tournament_detail(uuid) to anon, authenticated;

revoke execute on function public.register_club_for_tournament(uuid, uuid, text, integer, text) from public, anon;
grant execute on function public.register_club_for_tournament(uuid, uuid, text, integer, text) to authenticated;
revoke execute on function public.claim_registration_payment(uuid, text) from public, anon;
grant execute on function public.claim_registration_payment(uuid, text) to authenticated;
revoke execute on function public.set_registration_paid(uuid, boolean) from public, anon;
grant execute on function public.set_registration_paid(uuid, boolean) to authenticated;
revoke execute on function public.tournament_entries(uuid) from public, anon;
grant execute on function public.tournament_entries(uuid) to authenticated;
