-- Who runs a cup.
--
-- Tournaments were built on the assumption that a venue manager runs their own
-- competition, so both gates ask `is_venue_staff(venue, 'manager')`. The
-- product works the other way round: cups are a platform concern, created and
-- run from the admin dashboard, and a platform admin is not staff at any venue.
-- As it stood, the person whose job this is was the one person who could not
-- do it.
--
-- Venue managers keep the permission. A venue that wants to run its own
-- Thursday league still can, and nothing about the existing path changes —
-- this only adds a second way to qualify.
--
-- Only `can_run_tournament` and `create_tournament` name the check directly.
-- set_tournament_state, decide_registration, generate_fixtures,
-- schedule_fixture and record_fixture_result all route through
-- can_run_tournament, so they follow from the first of these two.
--
-- A cup still belongs to a venue: fixtures are played on pitches, and
-- `tournament.venue_id` is what connects a draw to somewhere to play it. An
-- admin picks the venue rather than being exempt from having one.

create or replace function can_run_tournament(p_tournament_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from tournament t
     where t.id = p_tournament_id
       and (is_venue_staff(t.venue_id, 'manager') or is_platform('admin'))
  );
$$;

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

-- CREATE OR REPLACE resets grants, SECURITY and search_path to whatever the
-- statement said, so both are re-closed and re-opened rather than assumed.
revoke execute on function public.can_run_tournament(uuid) from public, anon;
grant execute on function public.can_run_tournament(uuid) to authenticated;

revoke execute on function public.create_tournament(uuid, text, tournament_format, integer, date, date, integer, text)
  from public, anon;
grant execute on function public.create_tournament(uuid, text, tournament_format, integer, date, date, integer, text)
  to authenticated;
