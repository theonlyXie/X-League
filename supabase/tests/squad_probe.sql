-- Squad and invitation acceptance probe (P-07 / P-13 / BKG-013 / PRO-006).
--
-- Each case sets the JWT claim the way PostgREST does before calling the real
-- function, so `auth.uid()` sees exactly what it would in production. Create
-- it, run it, drop it — test scaffolding does not live in a production schema.
--
--   psql -f supabase/tests/squad_probe.sql
--
-- Expects the three identities from supabase/seed_identities.sql.

create or replace function squad_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  BASEL uuid := '11111111-1111-1111-1111-111111111111';
  SALMA uuid := '22222222-2222-2222-2222-222222222222';
  KARIM uuid := '33333333-3333-3333-3333-333333333333';
  -- Prefixed, because an unprefixed `pitch_id` or `team_id` is ambiguous
  -- against the columns of every table these functions touch.
  v_pitch uuid;
  v_slot  timestamptz;
  v_bk    uuid;
  v_inv   uuid;
  v_team  uuid;
  v_n     integer;
  h       hold_outcome;
  r       record;
begin
  select p.id into v_pitch
    from pitch p join venue v on v.id = p.venue_id
   where v.name = 'Stadium One' and p.label = 'Pitch B';

  -- A free hour on Pitch B: the seed occupies 21 and 22, so 19 is clear.
  v_slot := ((current_date + interval '19 hours') at time zone 'Africa/Cairo');
  delete from booking where pitch_id = v_pitch and during && tstzrange(v_slot, v_slot + interval '1 hour');

  -- Basel books the pitch.
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into h from hold_slot(v_pitch, v_slot, 60, 'Basel Elsayed');
  v_bk := h.booking_id;
  perform confirm_booking(v_bk);

  -- -------------------------------------------------------------------------
  -- The captain is in their own squad without being invited
  -- -------------------------------------------------------------------------
  select count(*)::integer into v_n from booking_participant where booking_id = v_bk;
  return query select 'confirming seeds the captain as a starter', v_n::text, v_n = 1;

  select count(*)::integer into v_n
    from booking_participant where booking_id = v_bk and state = 'accepted' and slot_kind = 'starter';
  return query select 'and their place is already accepted', v_n::text, v_n = 1;

  -- -------------------------------------------------------------------------
  -- Inviting
  -- -------------------------------------------------------------------------
  select * into r from invite_to_booking(v_bk, SALMA, null, 'starter', 'MID');
  return query select 'the captain can invite a player', coalesce(r.reason, 'invited'), r.ok;

  select * into r from invite_to_booking(v_bk, SALMA, null, 'starter', 'MID');
  return query select 'inviting the same player twice is refused',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from invite_to_booking(v_bk, null, 'Ahmed (guest)', 'starter', null);
  return query select 'a guest with no account can hold a place',
                      coalesce(r.reason, 'invited'), r.ok;

  -- -------------------------------------------------------------------------
  -- Only the invited person answers
  -- -------------------------------------------------------------------------
  select bp.id into v_inv from booking_participant bp
   where bp.booking_id = v_bk and bp.player_id = SALMA;

  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from respond_to_invitation(v_inv, true);
  return query select 'somebody else cannot accept your invitation',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select count(*)::integer into v_n from my_invitations() where booking_id = v_bk;
  return query select 'the invitation shows on the invitee''s Home', v_n::text, v_n = 1;

  select * into r from respond_to_invitation(v_inv, true);
  return query select 'the invitee can accept', coalesce(r.reason, 'accepted'), r.ok;

  select * into r from respond_to_invitation(v_inv, false);
  return query select 'and cannot answer twice',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select count(*)::integer into v_n from my_squad_matches() where booking_id = v_bk;
  return query select 'an accepted place shows as a match they are in', v_n::text, v_n = 1;

  -- -------------------------------------------------------------------------
  -- Capacity is a database fact, not a client guess
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  -- Captain + Salma + guest = 3 of 5 starters. Two more fill it.
  perform invite_to_booking(v_bk, null, 'Guest four', 'starter', null);
  perform invite_to_booking(v_bk, null, 'Guest five', 'starter', null);
  select * into r from invite_to_booking(v_bk, null, 'One too many', 'starter', null);
  return query select 'the sixth starter is refused',
                      coalesce(r.reason, '(allowed!)'), r.ok = false
                      and r.reason = 'The starting five is full.';

  select * into r from invite_to_booking(v_bk, null, 'Sub one', 'sub', null);
  return query select 'but a sub place is still open', coalesce(r.reason, 'invited'), r.ok;

  perform invite_to_booking(v_bk, null, 'Sub two', 'sub', null);
  select * into r from invite_to_booking(v_bk, null, 'Sub three', 'sub', null);
  return query select 'and the third sub is refused too',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'Both sub places are taken.';

  select accepted_starters, starter_capacity, accepted_subs, sub_capacity
    into r from squad_counts(v_bk);
  return query select 'the lobby header counts what is really there',
                      r.accepted_starters || ' of ' || r.starter_capacity
                      || ', ' || r.accepted_subs || ' subs',
                      r.accepted_starters = 5 and r.starter_capacity = 5
                      and r.accepted_subs = 2;

  -- -------------------------------------------------------------------------
  -- Leaving frees the shirt
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from leave_booking(v_bk);
  return query select 'a player can give up their place', coalesce(r.reason, 'left'), r.ok;

  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  select * into r from invite_to_booking(v_bk, KARIM, null, 'starter', null);
  return query select 'and the freed place can be offered to somebody else',
                      coalesce(r.reason, 'invited'), r.ok;

  select * into r from leave_booking(v_bk);
  return query select 'the captain cannot leave their own booking',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  -- -------------------------------------------------------------------------
  -- RBAC-006 — a squad is not public
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  perform booking_squad(v_bk);  -- Karim was just invited, so this must succeed
  return query select 'an invited player may read the squad', 'allowed', true;

  update booking_participant set state = 'removed' where booking_id = v_bk and player_id = KARIM;
  begin
    perform booking_squad(v_bk);
    return query select 'a stranger cannot read the squad', '(allowed!)', false;
  exception when insufficient_privilege then
    return query select 'a stranger cannot read the squad', 'refused', true;
  end;

  -- Venue staff hosting the match can, because they meet it at the gate.
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select count(*)::integer into v_n from booking_squad(v_bk);
  return query select 'staff at the hosting venue can', v_n || ' players', v_n > 0;

  -- -------------------------------------------------------------------------
  -- PRO-006 — visibility is honoured by player search
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);
  update player_profile set visibility = 'everyone' where id = KARIM;
  select count(*)::integer into v_n from find_players('Karim');
  return query select 'a player visible to everyone is findable', v_n::text, v_n = 1;

  update player_profile set visibility = 'nobody' where id = KARIM;
  select count(*)::integer into v_n from find_players('Karim');
  return query select 'a player who opted out is not', v_n::text, v_n = 0;

  update player_profile set visibility = 'connections' where id = KARIM;
  select count(*)::integer into v_n from find_players('Karim');
  return query select 'connections-only hides them from a stranger', v_n::text, v_n = 0;

  -- Give them a shared pitch, which is what "connection" means here.
  insert into booking_participant (booking_id, player_id, display_name, state)
  values (v_bk, KARIM, 'Karim Tarek', 'accepted')
  on conflict (booking_id, player_id) where player_id is not null
  do update set state = 'accepted';
  select count(*)::integer into v_n from find_players('Karim');
  return query select 'and shows them to someone they have played with', v_n::text, v_n = 1;

  select count(*)::integer into v_n from find_players('K');
  return query select 'a one-character search returns nothing', v_n::text, v_n = 0;

  -- -------------------------------------------------------------------------
  -- Teams
  -- -------------------------------------------------------------------------
  select * into r from create_team('Nasr City Nine', 'Nasr City', 210);
  v_team := r.team_id;
  return query select 'a player can start a team', coalesce(r.reason, 'created'), r.ok;

  select count(*)::integer into v_n from team_roster(v_team) where role = 'captain';
  return query select 'the founder is its captain', v_n::text, v_n = 1;

  select * into r from invite_to_team(v_team, SALMA);
  return query select 'the captain can invite', coalesce(r.reason, 'invited'), r.ok;

  perform set_config('request.jwt.claims', json_build_object('sub', KARIM)::text, true);
  select * into r from invite_to_team(v_team, BASEL);
  return query select 'a non-captain cannot',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  begin
    perform team_roster(v_team);
    return query select 'a non-member cannot read the roster', '(allowed!)', false;
  exception when insufficient_privilege then
    return query select 'a non-member cannot read the roster', 'refused', true;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from respond_to_team_invite(v_team, true);
  return query select 'the invitee joins', coalesce(r.reason, 'joined'), r.ok;

  select count(*)::integer into v_n from my_teams() t where t.team_id = v_team and t.state = 'active';
  return query select 'and the team shows on their list', v_n::text, v_n = 1;

  select * into r from respond_to_team_invite(v_team, true);
  return query select 'answering an invitation twice is refused',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from squad_probe();
rollback;

drop function squad_probe();
