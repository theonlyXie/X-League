-- What it costs a club to enter, and who is allowed to say it was paid.
--
-- The arithmetic is the easy half. The half worth a probe is that the quote a
-- captain is shown and the amount written on their entry are produced by the
-- same call, that a single-use code cannot be spent twice, and that spending
-- SuPoints does not touch the ledger the player's level is computed from —
-- §5.3 says XP is activity, so paying with points must not make somebody look
-- like they played less.
--
--   psql -f supabase/tests/club_entry_probe.sql

create or replace function club_entry_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  SALMA uuid := '22222222-2222-2222-2222-222222222222';  -- manager, Stadium One
  ADMIN uuid := '99999999-9999-9999-9999-999999999999';
  CAP   uuid := 'e0000000-0000-0000-0000-000000000001';
  v_venue uuid;
  v_trn   uuid;
  v_club  uuid;
  v_reserves uuid;
  v_reg   uuid;
  v_code  text;
  v_pid   uuid;
  v_i     integer;
  v_n     integer;
  v_lvl   integer;
  v_reg2  uuid;
  v_fix   uuid;
  v_match uuid;
  v_pitch uuid;
  v_txt   text;
  r       record;
  q       record;
begin
  select id into v_venue from venue where name = 'Stadium One';

  -- A captain who does not play, and seven who do.
  insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
  values (CAP, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now())
  on conflict do nothing;
  insert into player_profile (id, display_name) values (CAP, 'Entry Captain') on conflict do nothing;

  perform set_config('request.jwt.claims', json_build_object('sub', CAP)::text, true);
  select * into r from create_club('Entry Probe United', 'Giza', null);
  v_club := r.club_id;

  -- A club has to be admitted before any of the money below means anything.
  -- The admission gate is tested in club_probe; here it is simply satisfied,
  -- the way a real club satisfies it, so the entry cases are about entry.
  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  perform admin_set_club_verification(v_club, 'verified');
  perform set_config('request.jwt.claims', json_build_object('sub', CAP)::text, true);

  for v_i in 1 .. 7 loop
    v_pid := ('e1000000-0000-0000-0000-00000000000' || v_i)::uuid;
    insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
    values (v_pid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now())
    on conflict do nothing;
    insert into player_profile (id, display_name)
    values (v_pid, 'Entry Player ' || v_i) on conflict do nothing;

    perform set_config('request.jwt.claims', json_build_object('sub', CAP)::text, true);
    perform invite_to_club(v_club, v_pid, case when v_i <= 5 then 'starter' else 'sub' end);
    perform set_config('request.jwt.claims', json_build_object('sub', v_pid)::text, true);
    perform respond_to_club_invite(v_club, true);
  end loop;

  -- 50,000 points is EGP 500 at 100 to the pound — more than the whole fee, so
  -- the cap on how much of a fee points may cover is the thing under test.
  insert into point_ledger (player_id, kind, points, note)
  values (CAP, 'adjustment', 50000, 'probe');

  -- A cup at EGP 400.
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select * into r from create_tournament(v_venue, 'Entry Probe Cup', 'league', 8, null, null, 400);
  v_trn := r.tournament_id;

  -- -------------------------------------------------------------------------
  -- Where the money goes
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  select * into r from admin_set_payment_channel(null, null, 'instapay', 'X League', 'xleague@instapay');
  return query select 'a platform default channel can be set', coalesce(r.reason, 'set'), r.ok;

  perform set_config('request.jwt.claims', json_build_object('sub', CAP)::text, true);
  select count(*)::integer into v_n from tournament_payment_channels(v_trn);
  return query select 'a cup with none of its own shows the default', v_n::text, v_n = 1;

  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  perform admin_set_payment_channel(null, v_trn, 'wallet', 'Vodafone Cash', '01000000000');
  perform set_config('request.jwt.claims', json_build_object('sub', CAP)::text, true);
  select count(*)::integer into v_n from tournament_payment_channels(v_trn);
  return query select 'and stops showing it once the cup names its own', v_n::text, v_n = 1;
  select kind::text into v_code from tournament_payment_channels(v_trn) limit 1;
  return query select 'which is the cup''s own', v_code, v_code = 'wallet';

  -- The number on a cup's channel changes from cup to cup, so changing it is
  -- the ordinary case rather than the exception.
  declare
    v_ch uuid;
    v_seen text;
    v_raised boolean := false;
  begin
    select id into v_ch from payment_channel where tournament_id = v_trn limit 1;

    perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
    select * into r from admin_set_payment_channel(
      v_ch, v_trn, 'wallet'::payment_channel_kind, 'Vodafone Cash', '01011112222', 'Send before Friday');
    return query select 'an admin can change a cup''s wallet number',
                        coalesce(r.reason, 'changed'), r.ok;

    perform set_config('request.jwt.claims', json_build_object('sub', CAP)::text, true);
    select value into v_seen from tournament_payment_channels(v_trn) limit 1;
    return query select 'and the captain sees the new one', coalesce(v_seen, '(none)'),
                        v_seen = '01011112222';
    select instructions into v_seen from tournament_payment_channels(v_trn) limit 1;
    return query select 'along with whatever they were told to do',
                        coalesce(v_seen, '(silent)'), v_seen = 'Send before Friday';

    -- The console functions refuse by raising, not by answering false: they are
    -- only reachable from a console, and the console shows the error. Asserted
    -- the way it actually behaves rather than the way the player-facing
    -- functions do.
    begin
      perform admin_delete_payment_channel(v_ch);
    exception when insufficient_privilege then
      v_raised := true;
    end;
    return query select 'a captain cannot remove a channel',
                        case when v_raised then 'refused' else '(allowed!)' end, v_raised;

    perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
    select * into r from admin_delete_payment_channel(v_ch);
    return query select 'an admin can', coalesce(r.reason, 'removed'), r.ok;

    select count(*)::integer into v_n
      from audit_log where action = 'payment_channel.removed' and subject_id = v_ch;
    return query select 'and what was removed is audited', v_n::text, v_n = 1;

    perform set_config('request.jwt.claims', json_build_object('sub', CAP)::text, true);
    select kind::text into v_seen from tournament_payment_channels(v_trn) limit 1;
    return query select 'the cup falls back to the platform default again',
                        coalesce(v_seen, '(none)'), v_seen = 'instapay';

    -- Put it back, because the entry cases below are about a cup that names
    -- its own destination.
    perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
    perform admin_set_payment_channel(null, v_trn, 'wallet', 'Vodafone Cash', '01000000000');
    perform set_config('request.jwt.claims', json_build_object('sub', CAP)::text, true);
  end;

  -- -------------------------------------------------------------------------
  -- The quote
  -- -------------------------------------------------------------------------
  select * into q from registration_quote(v_trn, null, 0);
  return query select 'the fee is the cup''s fee', q.fee_egp::text, q.fee_egp = 400;
  return query select 'and the balance is what was earned', q.points_balance::text, q.points_balance = 50000;

  select * into q from registration_quote(v_trn, null, 5000);
  return query select 'points convert at a hundred to the pound',
                      q.points_off_egp::text, q.points_off_egp = 50;

  select * into q from registration_quote(v_trn, null, 50000);
  return query select 'but cannot pay more than half the fee',
                      q.points_off_egp::text, q.points_off_egp = 200;
  return query select 'and only the points the cap allowed are spent',
                      q.points_spent::text, q.points_spent = 20000;

  select * into q from registration_quote(v_trn, 'NOSUCHCODE', 0);
  return query select 'an unknown code says so rather than failing silently',
                      coalesce(q.reason, '(silence)'),
                      q.promo_ok = false and q.reason = 'That code is not recognised.';

  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  select * into r from admin_create_promo_code('percent', null, 25::smallint, v_trn, 1, null, 'probe');
  v_code := r.code;
  return query select 'an admin can mint a code', coalesce(r.reason, v_code), r.ok;

  select * into r from admin_create_promo_code('percent', 50, 25::smallint, null, 1, null, 'bad');
  return query select 'a code cannot carry two kinds of discount',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  perform set_config('request.jwt.claims', json_build_object('sub', CAP)::text, true);
  select * into q from registration_quote(v_trn, lower(v_code), 0);
  return query select 'a code typed in lower case still works',
                      q.promo_off_egp::text, q.promo_ok and q.promo_off_egp = 100;

  select * into q from registration_quote(v_trn, v_code, 50000);
  return query select 'a code and points come off the same fee',
                      q.amount_due_egp::text, q.amount_due_egp = 100;

  -- -------------------------------------------------------------------------
  -- Entering
  -- -------------------------------------------------------------------------
  select * into r from register_club_for_tournament(v_trn, v_club, v_code, 50000, null);
  return query select 'a closed cup takes no entries',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason = 'That cup is not open yet.';

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  perform set_tournament_state(v_trn, 'open');

  -- A club that cannot field a side.
  perform set_config('request.jwt.claims', json_build_object('sub', CAP)::text, true);
  select * into r from create_club('Entry Probe Reserves', 'Giza', null);
  v_reserves := r.club_id;
  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  perform admin_set_club_verification(v_reserves, 'verified');
  perform set_config('request.jwt.claims', json_build_object('sub', CAP)::text, true);
  select * into r from register_club_for_tournament(v_trn, v_reserves, null, 0, null);
  return query select 'a club short of a squad is refused, and told what by',
                      coalesce(r.reason, '(allowed!)'),
                      r.ok = false and r.reason like '%5 more starters and 2 more substitutes%';

  select * into r from register_club_for_tournament(v_trn, v_club, v_code, 50000, 'Instapay ref 99123');
  v_reg := r.registration_id;
  return query select 'the club enters', coalesce(r.reason, 'entered'), r.ok;
  return query select 'and owes what it was quoted', r.amount_due_egp::text, r.amount_due_egp = 100;

  select fee_egp, promo_off_egp, points_spent, points_off_egp, amount_due_egp, payment_claimed_at
    into r from tournament_registration where id = v_reg;
  return query select 'the entry records the fee it started from', r.fee_egp::text, r.fee_egp = 400;
  return query select 'what the code took off', r.promo_off_egp::text, r.promo_off_egp = 100;
  return query select 'and what the points took off', r.points_off_egp::text, r.points_off_egp = 200;
  return query select 'the payment note counts as a claim',
                      (r.payment_claimed_at is not null)::text, r.payment_claimed_at is not null;

  -- The point of the second ledger.
  select coalesce(sum(points), 0)::integer into v_lvl from point_ledger where player_id = CAP;
  return query select 'the earning ledger is untouched', v_lvl::text, v_lvl = 50000;
  select coalesce(sum(points), 0)::integer into v_n from point_spend where player_id = CAP;
  return query select 'and the spending is recorded separately', v_n::text, v_n = 20000;
  return query select 'so the spendable balance falls and the level does not',
                      my_points_balance()::text, my_points_balance() = 30000;

  select used_count into v_n from promo_code where code = v_code;
  return query select 'the code is used up', v_n::text, v_n = 1;
  select count(*)::integer into v_n from promo_redemption where registration_id = v_reg;
  return query select 'and the redemption points at the entry it discounted', v_n::text, v_n = 1;

  select * into r from register_club_for_tournament(v_trn, v_club, null, 0, null);
  return query select 'entering twice is refused',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  -- -------------------------------------------------------------------------
  -- The code is gone
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', CAP)::text, true);
  select * into r from create_club('Entry Probe Rivals', 'Giza', 'starter');
  v_club := r.club_id;
  perform set_config('request.jwt.claims', json_build_object('sub', ADMIN)::text, true);
  perform admin_set_club_verification(v_club, 'verified');
  perform set_config('request.jwt.claims', json_build_object('sub', CAP)::text, true);
  for v_i in 1 .. 7 loop
    v_pid := ('e2000000-0000-0000-0000-00000000000' || v_i)::uuid;
    insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
    values (v_pid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now())
    on conflict do nothing;
    insert into player_profile (id, display_name)
    values (v_pid, 'Rival Player ' || v_i) on conflict do nothing;
    perform set_config('request.jwt.claims', json_build_object('sub', CAP)::text, true);
    perform invite_to_club(v_club, v_pid, case when v_i <= 5 then 'starter' else 'sub' end);
    perform set_config('request.jwt.claims', json_build_object('sub', v_pid)::text, true);
    perform respond_to_club_invite(v_club, true);
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', CAP)::text, true);

  select * into q from registration_quote(v_trn, v_code, 0);
  return query select 'a used-up code is refused by name',
                      coalesce(q.reason, '(silence)'),
                      q.promo_ok = false and q.reason = 'That code has been used already.';

  select * into r from register_club_for_tournament(v_trn, v_club, v_code, 0, null);
  return query select 'and cannot be spent a second time',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from register_club_for_tournament(v_trn, v_club, null, 0, null);
  return query select 'the same club enters at full price', coalesce(r.reason, 'entered'), r.ok;
  return query select 'owing the whole fee', r.amount_due_egp::text, r.amount_due_egp = 400;

  -- -------------------------------------------------------------------------
  -- Who says it was paid
  -- -------------------------------------------------------------------------
  select * into r from set_registration_paid(v_reg, true);
  return query select 'a captain cannot mark their own entry paid',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from claim_registration_payment(v_reg, 'no');
  return query select 'nor claim payment without saying what they sent',
                      coalesce(r.reason, '(allowed!)'), r.ok = false;

  select * into r from claim_registration_payment(v_reg, 'Instapay 99123 at 14:20');
  return query select 'but they can say what they sent', coalesce(r.reason, 'claimed'), r.ok;

  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
  select count(*)::integer into v_n from tournament_entries(v_trn);
  return query select 'the organiser sees every entry', v_n::text, v_n = 2;

  select * into r from set_registration_paid(v_reg, true);
  return query select 'and can agree the money arrived', coalesce(r.reason, 'paid'), r.ok;

  select paid, paid_at into r from tournament_registration where id = v_reg;
  return query select 'which is recorded with a time', r.paid::text, r.paid and r.paid_at is not null;

  select count(*)::integer into v_n
    from audit_log where action = 'registration.paid' and subject_id = v_reg;
  return query select 'and audited, because it moves money', v_n::text, v_n = 1;

  -- -------------------------------------------------------------------------
  -- Admitting, and the draw
  -- -------------------------------------------------------------------------
  select * into r from decide_registration(v_reg, true);
  return query select 'a club entry can be admitted', coalesce(r.reason, 'admitted'), r.ok;

  select count(*)::integer into v_n
    from tournament_registration where tournament_id = v_trn and state = 'accepted';
  return query select 'and shows as accepted', v_n::text, v_n = 1;

  perform set_config('request.jwt.claims', json_build_object('sub', CAP)::text, true);
  select count(*)::integer into v_n from my_tournaments() where tournament_id = v_trn;
  return query select 'the captain of both entered clubs sees two entries, not sixteen',
                      v_n::text, v_n = 2;

  perform set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-0000-0000-000000000001')::text, true);
  select count(*)::integer into v_n from my_tournaments() where tournament_id = v_trn;
  return query select 'and a player in one club sees it once', v_n::text, v_n = 1;

  -- -------------------------------------------------------------------------
  -- A cup match with no booking behind it
  -- -------------------------------------------------------------------------
  -- The organiser who agreed a ground by phone has no booking to point at, and
  -- under the new rule a cup is the only thing that makes a stat evidence — so
  -- if this path could not produce a match, the rule would be true of nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);

  select id into v_reg2 from tournament_registration
   where tournament_id = v_trn and id <> v_reg and state = 'pending' limit 1;
  perform set_registration_paid(v_reg2, true);
  perform decide_registration(v_reg2, true);

  select * into r from generate_fixtures(v_trn);
  return query select 'two admitted clubs make a draw', coalesce(r.reason, 'drawn'), r.ok;

  select id into v_fix from fixture where tournament_id = v_trn limit 1;
  select p.id into v_pitch from pitch p where p.venue_id = v_venue limit 1;
  perform place_fixture(v_fix, v_pitch, now() - interval '2 hours');

  select * into r from report_fixture_result(v_fix, 3, 1);
  return query select 'the organiser writes down a score with no booking behind it',
                      coalesce(r.reason, 'recorded'), r.ok;
  v_match := r.match_id;

  select count(*)::integer into v_n
    from match_participant where match_id = v_match and side = 'home';
  return query select 'the home team sheet comes from the squad that entered',
                      v_n::text, v_n >= 7;
  select count(*)::integer into v_n
    from match_participant where match_id = v_match and side = 'away';
  return query select 'and so does the away one', v_n::text, v_n >= 7;

  select state::text into v_txt from match where id = v_match;
  return query select 'the match is played and not yet evidence', v_txt, v_txt = 'played';

  select score_home, state into r from fixture where id = v_fix;
  return query select 'the fixture carries the score', r.score_home::text, r.score_home = 3;
  return query select 'and reads as played', r.state::text, r.state = 'played';

  -- A second write corrects the score rather than making a second match. It has
  -- to: a knockout tie level after ninety minutes is settled on penalties, and
  -- the score that sent somebody through is the only place this product can
  -- record that.
  select * into r from report_fixture_result(v_fix, 4, 1);
  return query select 'a later write corrects the score',
                      coalesce(r.reason, 'corrected'), r.ok;

  select count(*)::integer into v_n from match where id = v_match;
  return query select 'on the same match', v_n::text, v_n = 1;
  select score_home into r from match where id = v_match;
  return query select 'which now reads the corrected score', r.score_home::text, r.score_home = 4;
  select count(*)::integer into v_n
    from match m join fixture f on f.match_id = m.id where f.id = v_fix;
  return query select 'and no second match was made', v_n::text, v_n = 1;

  -- Three of the people on the pitch rate a fourth. Same threshold as before;
  -- what has changed is that it now lands on a match a cup stands behind.
  declare
    v_subject uuid;
    v_rater   uuid;
    v_k       integer := 0;
  begin
    select mp.player_id into v_subject
      from match_participant mp where mp.match_id = v_match and mp.side = 'home' limit 1;

    for v_rater in
      select mp.player_id from match_participant mp
       where mp.match_id = v_match and mp.player_id <> v_subject limit 3
    loop
      perform set_config('request.jwt.claims', json_build_object('sub', v_rater)::text, true);
      perform submit_peer_rating(v_match, v_subject, '{"PAS":70,"DRI":65}'::jsonb);
      v_k := v_k + 1;
    end loop;
    return query select 'three of the squad rate a fourth', v_k::text, v_k = 3;
  end;

  select state::text into v_txt from match where id = v_match;
  return query select 'and a cup match with three raters becomes evidence',
                      v_txt, v_txt = 'verified';

  -- The board has to count it. It used to inner-join `booking` to find the
  -- venue, so a cup match on a ground the organiser arranged was dropped from
  -- both leaderboards — silently, and precisely for the matches the board
  -- exists to rank.
  declare
    v_shooter uuid;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', SALMA)::text, true);
    select mp.player_id into v_shooter
      from match_participant mp where mp.match_id = v_match and mp.side = 'home' limit 1;
    perform set_match_scorers(v_match,
      jsonb_build_array(jsonb_build_object('player_id', v_shooter, 'goals', 2)));

    select count(*)::integer into v_n from leaderboard() where player_id = v_shooter;
    return query select 'a scorer in a cup match with no booking reaches the board',
                        v_n::text, v_n = 1;

    select goals, cup_goals into r from leaderboard() where player_id = v_shooter;
    return query select 'with the goals counted', coalesce(r.goals::text, '-'), r.goals = 2;
    return query select 'and counted as cup goals', coalesce(r.cup_goals::text, '-'),
                        r.cup_goals = 2;

    select count(*)::integer into v_n
      from leaderboard(v_venue) where player_id = v_shooter;
    return query select 'and on the board of the ground it was played at',
                        v_n::text, v_n = 1;
  end;
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from club_entry_probe();
rollback;

drop function club_entry_probe();
