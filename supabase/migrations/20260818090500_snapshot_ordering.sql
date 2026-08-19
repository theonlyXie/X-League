-- `created_at` defaults to now(), which in Postgres is transaction start time.
-- Two snapshots written in one transaction therefore carry the same timestamp,
-- and "the player's latest card" becomes whichever row the planner happened to
-- return. A card must never be ambiguous about which snapshot is current, so
-- ordering gets a monotonic tiebreaker rather than relying on the clock.
--
-- Found by card_probe: submitting two assessments in one transaction returned
-- the older one as current.
alter table attribute_snapshot add column if not exists seq bigserial;
alter table self_assessment    add column if not exists seq bigserial;

create index if not exists attribute_snapshot_latest_idx on attribute_snapshot (player_id, seq desc);

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
   order by s.seq desc
   limit 1;
$$;
