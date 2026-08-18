-- §5.1 acceptance probe: the card model and the anchored assessment.
-- Create, run, drop — test scaffolding does not live in a production schema.
--   psql -f supabase/tests/card_probe.sql
-- Expects supabase/seed_identities.sql.

create or replace function card_probe()
returns table (case_name text, result text, passed boolean)
language plpgsql as $$
declare
  BASEL uuid := '11111111-1111-1111-1111-111111111111';
  r record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', BASEL)::text, true);

  return query select 'a new account has no card', coalesce((select ovr from my_card())::text, 'none'),
                      not exists (select 1 from my_card());

  select * into r from submit_self_assessment('MID',
    '{"SPD":72,"SHO":60,"PAS":85,"DRI":72,"DEF":60,"PHY":72}'::jsonb);

  return query select 'the assessment produces a card', r.ovr::text, r.ovr between 60 and 80;
  return query select 'and it is Provisional', r.confidence, r.confidence = 'provisional';
  return query select 'with no verified matches behind it', r.evidence_count::text, r.evidence_count = 0;
  return query select 'self-assessment supplies 70%', r.self_weight::text, r.self_weight = 0.70;
  return query select 'the rule version travels with it', r.rule_version, r.rule_version = 'v1';

  return query select 'my_card returns what was just built',
                      (select ovr::text from my_card()), (select ovr from my_card()) = r.ovr;
  return query select 'the card carries the player name',
                      (select display_name from my_card()),
                      (select display_name from my_card()) = 'Basel Elsayed';

  -- PRO-011: a new assessment is a new snapshot, not an edit.
  perform submit_self_assessment('FWD', '{"SPD":85,"SHO":85,"PAS":60,"DRI":72,"DEF":45,"PHY":72}'::jsonb);
  return query select 'changing position writes a new snapshot',
                      (select count(*)::text from attribute_snapshot where player_id = BASEL),
                      (select count(*) from attribute_snapshot where player_id = BASEL) = 2;
  return query select 'history is preserved, not overwritten',
                      (select count(*)::text from self_assessment where player_id = BASEL),
                      (select count(*) from self_assessment where player_id = BASEL) = 2;
  -- Two snapshots in one transaction share created_at, so ordering must not
  -- depend on the clock. This case is why attribute_snapshot carries `seq`.
  return query select 'my_card shows the latest', (select position_code from my_card()),
                      (select position_code from my_card()) = 'FWD';

  perform set_config('request.jwt.claims', null, true);
  begin
    perform submit_self_assessment('MID', '{"SPD":50}'::jsonb);
    return query select 'anon cannot submit an assessment', '(allowed!)', false;
  exception when insufficient_privilege then
    return query select 'anon cannot submit an assessment', 'refused', true;
  end;
end;
$$;

begin;
select case_name, result, case when passed then 'PASS' else 'FAIL' end as verdict from card_probe();
rollback;

drop function card_probe();
