-- A share of the cup, named in the invitation.
--
-- Clubs in Egypt are assembled cup by cup, and the way a captain gets a good
-- player to sign is to promise them a cut of what the side wins. That promise
-- is made over the phone today and remembered differently by each side after
-- the final, which is the argument the product can actually prevent: not by
-- holding the money, but by writing the number down at the moment it is
-- offered, in front of the person being asked.
--
-- So an invitation to a club can carry a percentage. The player sees it before
-- they answer — the figure, and what it is worth against the pot of the cup
-- their club is entered in — and accepting is what records that they were told.
--
-- Two things this deliberately is not:
--
--   * It is not money this app moves. X League never touches a prize pot;
--     entry fees are paid by InstaPay between a captain and a venue and the
--     app records references, not balances. A bounty is the agreed term, and
--     the captain pays it. Anything else is a payments product, and a
--     regulated one.
--
--   * It is not on ordinary matches. A Thursday booking has no prize, so a
--     squad invitation stays what it was — accept or decline — and there is
--     no percentage field anywhere near it. Only a club, which is the thing
--     that enters a cup, can offer a share of one.

-- ---------------------------------------------------------------------------
-- What a cup is worth
-- ---------------------------------------------------------------------------
--
-- Separate from `entry_fee_egp`, which is what an entrant pays in. What the
-- winner takes out has never been recorded anywhere, and a percentage of an
-- unknown number is not something anybody can weigh — "12%" means nothing
-- until it means "EGP 1,200".

alter table tournament
  add column if not exists prize_pool_egp integer not null default 0;

do $$ begin
  alter table tournament add constraint tournament_prize_pool_not_negative
    check (prize_pool_egp >= 0);
exception when duplicate_object then null;
end $$;

/**
 * Set what the winner takes.
 *
 * The organiser of the cup, or a platform admin. Deliberately its own function
 * rather than an argument on `create_tournament`: the pot is usually settled
 * after the cup is drafted and often changed as entries come in, and widening
 * the create signature would have broken every caller for a field nobody knows
 * on day one.
 */
create or replace function set_tournament_prize_pool(
  p_tournament_id  uuid,
  p_prize_pool_egp integer
)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
begin
  if not can_run_tournament(p_tournament_id) then
    return query select false, 'You do not run that tournament.';
    return;
  end if;
  if p_prize_pool_egp is null or p_prize_pool_egp < 0 then
    return query select false, 'A prize pool cannot be less than nothing.';
    return;
  end if;

  update tournament set prize_pool_egp = p_prize_pool_egp where id = p_tournament_id;

  perform write_audit('tournament.prize_pool', 'tournament', p_tournament_id,
                      jsonb_build_object('prize_pool_egp', p_prize_pool_egp));

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- What a player was promised
-- ---------------------------------------------------------------------------

/**
 * The share of a cup win this member was offered when they were asked.
 *
 * On the membership rather than on a cup, because that is the shape of the
 * promise people actually make: "join us and you take 10% of whatever we win"
 * is said once, at the invitation, and holds for as long as the player is in
 * the side. Per-cup would mean re-negotiating with eleven people every time a
 * club entered something, which is not what anybody does.
 *
 * Null means no bounty was offered, which is the ordinary case and different
 * from a bounty of zero.
 */
alter table club_membership
  add column if not exists bounty_pct numeric(5,2);

do $$ begin
  alter table club_membership add constraint club_membership_bounty_is_a_share
    check (bounty_pct is null or (bounty_pct > 0 and bounty_pct <= 100));
exception when duplicate_object then null;
end $$;

/**
 * What a club has already promised away, counting everybody but this player.
 *
 * Internal, and the reason a captain cannot promise 40% to four people: the
 * whole point of writing the number down is that it is a number somebody can
 * be held to, and four fortieths of a pot that does not exist is the argument
 * this feature is meant to prevent rather than formalise.
 */
create or replace function club_bounty_committed(p_club_id uuid, p_except uuid default null)
returns numeric
language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(sum(m.bounty_pct), 0)
    from club_membership m
   where m.club_id = p_club_id
     and m.state in ('invited', 'active')
     and m.bounty_pct is not null
     and (p_except is null or m.player_id <> p_except);
$$;

-- ---------------------------------------------------------------------------
-- Asking somebody, with the offer attached
-- ---------------------------------------------------------------------------
--
-- The three-argument version is dropped rather than left beside this one.
-- PostgREST resolves an RPC by matching the request body's keys against
-- parameter names, and two overloads that differ only by a defaulted trailing
-- argument make that a coin toss — which is exactly the bug that put two
-- `search_venues` in this database.

drop function if exists invite_to_club(uuid, uuid, text);

create or replace function invite_to_club(
  p_club_id    uuid,
  p_player_id  uuid,
  p_slot_kind  text    default 'starter',
  p_bounty_pct numeric default null
)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_club_name text;
  v_bounty    numeric := p_bounty_pct;
begin
  if not is_club_captain(p_club_id) then
    return query select false, 'Only the captain can invite players.';
    return;
  end if;

  if p_slot_kind is not null and p_slot_kind not in ('starter', 'sub') then
    return query select false, 'A player is a starter or a substitute.';
    return;
  end if;

  -- Offering nothing and offering zero are the same thing said two ways, and
  -- storing the second would put "0% of the cup" on somebody's invitation.
  if v_bounty is not null and v_bounty <= 0 then
    v_bounty := null;
  end if;

  if v_bounty is not null and v_bounty > 100 then
    return query select false, 'A share of the prize cannot be more than all of it.';
    return;
  end if;

  if v_bounty is not null
     and club_bounty_committed(p_club_id, p_player_id) + v_bounty > 100 then
    return query select false, 'You have already promised away the rest of the prize.';
    return;
  end if;

  if exists (select 1 from club_membership m
              where m.club_id = p_club_id and m.player_id = p_player_id
                and m.state in ('invited', 'active')) then
    return query select false, 'They are already in this club, or have been asked.';
    return;
  end if;

  insert into club_membership (club_id, player_id, role, slot_kind, state, invited_by, bounty_pct)
  values (p_club_id, p_player_id, 'player', p_slot_kind, 'invited', auth.uid(), v_bounty)
  on conflict (club_id, player_id) do update
    set state = 'invited', slot_kind = excluded.slot_kind,
        invited_by = auth.uid(), bounty_pct = excluded.bounty_pct;

  select c.name into v_club_name from club c where c.id = p_club_id;

  -- The offer belongs in the notification, not only on the screen behind it.
  -- Somebody deciding whether to open the app at all should be able to see
  -- what they are being offered from the lock screen.
  perform notify(p_player_id, 'club_invite',
    format('You are invited to join %s', v_club_name),
    case when v_bounty is null then null
         else format('%s%% of the prize if the club wins a cup.',
                     trim(trailing '.' from trim(trailing '0' from to_char(v_bounty, 'FM990.99'))))
    end,
    jsonb_build_object('screen', 'club', 'club_id', p_club_id));

  return query select true, null::text;
end;
$$;

/**
 * Change what a member was promised, or withdraw it.
 *
 * A captain who typed 5 and meant 15 has no other way back, and a share
 * renegotiated after somebody joined is ordinary. Passing null clears it.
 */
create or replace function set_club_bounty(
  p_club_id    uuid,
  p_player_id  uuid,
  p_bounty_pct numeric
)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_bounty numeric := p_bounty_pct;
  v_rows   integer;
begin
  if not is_club_captain(p_club_id) then
    return query select false, 'Only the captain can set a share of the prize.';
    return;
  end if;

  if v_bounty is not null and v_bounty <= 0 then
    v_bounty := null;
  end if;

  if v_bounty is not null and v_bounty > 100 then
    return query select false, 'A share of the prize cannot be more than all of it.';
    return;
  end if;

  if v_bounty is not null
     and club_bounty_committed(p_club_id, p_player_id) + v_bounty > 100 then
    return query select false, 'You have already promised away the rest of the prize.';
    return;
  end if;

  update club_membership
     set bounty_pct = v_bounty
   where club_id = p_club_id
     and player_id = p_player_id
     and state in ('invited', 'active');
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return query select false, 'They are not in this club.';
    return;
  end if;

  -- Told, not quietly changed. A number somebody accepted on is not the
  -- captain's to move without saying so.
  perform notify(p_player_id, 'club_bounty',
    format('Your share at %s changed', (select c.name from club c where c.id = p_club_id)),
    case when v_bounty is null then 'There is no share of the prize on your place now.'
         else format('%s%% of the prize if the club wins a cup.',
                     trim(trailing '.' from trim(trailing '0' from to_char(v_bounty, 'FM990.99'))))
    end,
    jsonb_build_object('screen', 'club', 'club_id', p_club_id));

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seeing it
-- ---------------------------------------------------------------------------

-- The club list carries the offer, because that is the screen an invitation
-- lands on and the answer is given from.
--
-- Each of the four readers below gains a column, and a function's result is not
-- something CREATE OR REPLACE can widen, so each is dropped first.
drop function if exists my_clubs();

create or replace function my_clubs()
returns table (
  club_id    uuid,
  name       text,
  crest_url  text,
  home_area  text,
  role       text,
  slot_kind  text,
  state      membership_state,
  is_captain boolean,
  trophies   integer,
  playing    integer,
  eligible   boolean,
  bounty_pct numeric
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select c.id, c.name, c.crest_url, c.home_area,
         m.role, m.slot_kind, m.state,
         c.captain_id = auth.uid(),
         (select count(*)::integer from club_honour h where h.club_id = c.id),
         e.playing, e.eligible,
         m.bounty_pct
    from club_membership m
    join club c on c.id = m.club_id
    cross join lateral club_eligibility(c.id) e
   where m.player_id = auth.uid()
     and m.state in ('invited', 'active')
   order by c.name;
$$;

-- And the squad, so the captain can see what they have committed and to whom.
drop function if exists club_squad(uuid);

create or replace function club_squad(p_club_id uuid)
returns table (
  player_id    uuid,
  display_name text,
  photo_url    text,
  role         text,
  slot_kind    text,
  state        membership_state,
  is_captain   boolean,
  ovr          smallint,
  bounty_pct   numeric
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select m.player_id,
         coalesce(p.display_name, 'Player'),
         p.photo_url,
         m.role, m.slot_kind, m.state,
         c.captain_id = m.player_id,
         (select s.ovr from attribute_snapshot s
           where s.player_id = m.player_id
           order by s.seq desc limit 1),
         m.bounty_pct
    from club_membership m
    join club c on c.id = m.club_id
    left join player_profile p on p.id = m.player_id
   where m.club_id = p_club_id
     and m.state in ('invited', 'active')
   order by
     case m.slot_kind when 'starter' then 0 when 'sub' then 1 else 2 end,
     c.captain_id = m.player_id desc,
     coalesce(p.display_name, '');
$$;

/**
 * What this player stands to take, cup by cup.
 *
 * A percentage on its own is not an answer to "what am I playing for". This
 * joins the share to the pot of every live cup the club is actually entered
 * in, so the figure the player reads is in pounds.
 *
 * Invitations are included, not only memberships. The whole point of putting
 * the offer in the invitation is that somebody can weigh it *before* they
 * answer — and "10%" cannot be weighed until it says EGP 1,200 next to the
 * name of the cup it would be won in. `membership_state` is returned so the
 * screen can tell an offer from a thing already agreed.
 *
 * `share_egp` is rounded down. The pot is whole pounds and so is a share of
 * it; rounding up would print a number the captain never promised.
 */
create or replace function my_bounties()
returns table (
  tournament_id   uuid,
  tournament_name text,
  club_id         uuid,
  club_name       text,
  membership_state membership_state,
  state           tournament_state,
  starts_on       date,
  prize_pool_egp  integer,
  bounty_pct      numeric,
  share_egp       integer
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select t.id, t.name, c.id, c.name, m.state, t.state, t.starts_on,
         t.prize_pool_egp, m.bounty_pct,
         floor(t.prize_pool_egp * m.bounty_pct / 100)::integer
    from club_membership m
    join club c on c.id = m.club_id
    join tournament_registration r on r.club_id = c.id and r.state in ('pending', 'accepted')
    join tournament t on t.id = r.tournament_id
   where m.player_id = auth.uid()
     and m.state in ('invited', 'active')
     and m.bounty_pct is not null
     and t.state not in ('draft', 'cancelled')
   order by m.state, t.starts_on nulls last, t.name;
$$;

-- The pot, on the two screens a cup is read from.
drop function if exists list_tournaments(integer, text);

create or replace function list_tournaments(p_limit integer default 25, p_region text default null)
returns table (
  tournament_id  uuid,
  name           text,
  venue_name     text,
  area           text,
  region         text,
  format         tournament_format,
  state          tournament_state,
  starts_on      date,
  ends_on        date,
  entry_fee_egp  integer,
  max_teams      smallint,
  entered        integer,
  prize_pool_egp integer
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select t.id, t.name, v.name, v.area, coalesce(t.region, v.area),
         t.format, t.state, t.starts_on, t.ends_on,
         t.entry_fee_egp, t.max_teams,
         (select count(*)::integer from tournament_registration r
           where r.tournament_id = t.id and r.state in ('pending', 'accepted')),
         t.prize_pool_egp
    from tournament t
    join venue v on v.id = t.venue_id
   where t.state not in ('draft', 'cancelled')
     and (p_region is null or coalesce(t.region, v.area) = p_region)
   order by (t.state = 'open') desc, t.starts_on nulls last, t.name
   limit greatest(1, least(p_limit, 100));
$$;

drop function if exists tournament_detail(uuid);

-- Rebuilt from the version in `who_actually_scored`, which is the one that was
-- running, plus the pot. Worth naming why: the first attempt at this was copied
-- from `clubs_enter_cups`, an older definition of the same function, and
-- silently dropped `venues` and four fixture fields that three later migrations
-- had added. A function rebuilt from the wrong ancestor loses everything the
-- ancestors after it added, and nothing about the statement says so.
create function tournament_detail(p_tournament_id uuid)
returns table (
  tournament_id  uuid,
  name           text,
  venue_name     text,
  area           text,
  format         tournament_format,
  state          tournament_state,
  starts_on      date,
  ends_on        date,
  entry_fee_egp  integer,
  max_teams      smallint,
  description    text,
  teams          jsonb,
  fixtures       jsonb,
  standings      jsonb,
  venues         jsonb,
  prize_pool_egp integer
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
               'venue_name', fv.name, 'pitch_label', fp.label,
               'booked', f.booking_id is not null,
               'match_id', f.match_id)
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
    ), '[]'::jsonb),
    t.prize_pool_egp
  from tournament t
  join venue v on v.id = t.venue_id
  where t.id = p_tournament_id
    and (t.state <> 'draft' or can_run_tournament(t.id));
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

revoke execute on function public.club_bounty_committed(uuid, uuid)
  from public, anon, authenticated;

revoke execute on function public.invite_to_club(uuid, uuid, text, numeric) from public, anon;
grant  execute on function public.invite_to_club(uuid, uuid, text, numeric) to authenticated;

revoke execute on function public.set_club_bounty(uuid, uuid, numeric) from public, anon;
grant  execute on function public.set_club_bounty(uuid, uuid, numeric) to authenticated;

revoke execute on function public.set_tournament_prize_pool(uuid, integer) from public, anon;
grant  execute on function public.set_tournament_prize_pool(uuid, integer) to authenticated;

revoke execute on function public.my_bounties() from public, anon;
grant  execute on function public.my_bounties() to authenticated;

revoke execute on function public.my_clubs() from public, anon;
grant  execute on function public.my_clubs() to authenticated;

revoke execute on function public.club_squad(uuid) from public, anon;
grant  execute on function public.club_squad(uuid) to authenticated;

revoke execute on function public.list_tournaments(integer, text) from public;
grant  execute on function public.list_tournaments(integer, text) to anon, authenticated;

revoke execute on function public.tournament_detail(uuid) from public;
grant  execute on function public.tournament_detail(uuid) to anon, authenticated;

comment on column public.club_membership.bounty_pct is
  'The share of a cup win the captain promised this member when they were asked. A recorded term, not money this app moves.';
comment on column public.tournament.prize_pool_egp is
  'What the winner of this cup takes, in EGP. Recorded so a promised percentage can be shown as a figure.';
