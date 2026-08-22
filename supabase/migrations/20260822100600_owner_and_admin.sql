-- X League — the rest of Owner Mode, and the admin console.
--
-- Owner Mode could show a venue its evening and take a booking at the gate. It
-- could not change a price, close a pitch for maintenance, add a member of
-- staff, or see what it was owed. The admin console could show a fixture
-- overview and nothing else — no verification queue, no disputes, no config.
--
-- Two authority models meet here and they are deliberately different shapes.
-- Venue authority is *per venue and by role*: RBAC-002 already answers "does
-- this person work here, and how senior are they". Platform authority is
-- global and rare, so it gets its own table rather than being a venue role
-- with an empty venue_id — conflating them is how an ordinary manager ends up
-- one bad join away from moderating the platform.

-- ---------------------------------------------------------------------------
-- Platform authority (RBAC-003)
-- ---------------------------------------------------------------------------

do $$ begin
  create type platform_role_kind as enum ('support', 'moderator', 'admin');
exception when duplicate_object then null;
end $$;

create table if not exists platform_role (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       platform_role_kind not null,
  granted_by uuid references auth.users(id) on delete set null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function is_platform(p_min_role platform_role_kind default 'support')
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from platform_role pr
     where pr.user_id = auth.uid() and pr.active and pr.role >= p_min_role
  );
$$;

-- ---------------------------------------------------------------------------
-- Audit (§7.1 AuditLog, beyond bookings)
-- ---------------------------------------------------------------------------

-- booking_event records a booking's life. This records everything else a
-- privileged person does: a price change, a verification, a suspension. ADM-012
-- asks for both, and one table cannot serve both without the booking timeline
-- filling up with things that are not about that booking.
create table if not exists audit_log (
  id          bigserial primary key,
  actor_id    uuid references auth.users(id) on delete set null,
  actor       text not null,
  action      text not null,
  subject_kind text not null,
  subject_id  uuid,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_subject_idx on audit_log (subject_kind, subject_id, created_at desc);
create index if not exists audit_log_recent_idx on audit_log (created_at desc);

create or replace function write_audit(
  p_action text, p_subject_kind text, p_subject_id uuid, p_detail jsonb default '{}'
)
returns void
language sql security definer
set search_path = public, pg_temp as $$
  insert into audit_log (actor_id, actor, action, subject_kind, subject_id, detail)
  values (auth.uid(), current_actor(), p_action, p_subject_kind, p_subject_id,
          coalesce(p_detail, '{}'::jsonb));
$$;

-- Account state, for ADM-010. Suspension is a date rather than a flag so it can
-- expire without anybody remembering to lift it.
alter table player_profile add column if not exists suspended_until timestamptz;
alter table player_profile add column if not exists suspension_reason text;

-- ===========================================================================
-- OWNER MODE
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- O-03 Pricing
-- ---------------------------------------------------------------------------

-- OWN-007. Prices are versioned by validity window rather than edited in place:
-- a booking taken last week was quoted against the rule that was live then, and
-- overwriting the row would make that quote unreproducible.
create or replace function set_price_rule(
  p_pitch_id   uuid,
  p_start_hour integer,
  p_end_hour   integer,
  p_price_egp  integer,
  p_deposit_egp integer,
  p_valid_from date default null
)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_venue uuid := venue_of_pitch(p_pitch_id);
  v_from  date := coalesce(p_valid_from, current_date);
  v_old   price_rule%rowtype;
begin
  if v_venue is null then
    return query select false, 'That pitch no longer exists.';
    return;
  end if;
  if not is_venue_staff(v_venue, 'manager') then
    return query select false, 'You do not manage that venue.';
    return;
  end if;
  if p_start_hour < 0 or p_end_hour > 24 or p_start_hour >= p_end_hour then
    return query select false, 'That is not a valid range of hours.';
    return;
  end if;
  if p_price_egp < 0 or p_deposit_egp < 0 then
    return query select false, 'A price cannot be negative.';
    return;
  end if;
  if p_deposit_egp > p_price_egp then
    return query select false, 'The deposit cannot be more than the price.';
    return;
  end if;

  -- Close any overlapping rule as of the new rule's start, rather than
  -- deleting it. History stays intact and the two never both apply.
  --
  -- Overlap is usually partial: a venue changing its 6-8 PM price still has a
  -- rule covering 8-11. Closing that rule wholesale would leave those hours
  -- with no price at all — which showed up as a pitch quoting EGP 0 for the
  -- rest of the evening. So each closed rule's uncovered remainder is carried
  -- forward as a continuation at the old price.
  for v_old in
    select * from price_rule pr
     where pr.pitch_id = p_pitch_id
       and (pr.valid_to is null or pr.valid_to > v_from)
       and pr.start_hour < p_end_hour and pr.end_hour > p_start_hour
  loop
    update price_rule set valid_to = v_from where id = v_old.id;

    if v_old.start_hour < p_start_hour then
      insert into price_rule (pitch_id, valid_from, start_hour, end_hour, price_egp, deposit_egp)
      values (p_pitch_id, v_from, v_old.start_hour, p_start_hour::smallint,
              v_old.price_egp, v_old.deposit_egp);
    end if;

    if v_old.end_hour > p_end_hour then
      insert into price_rule (pitch_id, valid_from, start_hour, end_hour, price_egp, deposit_egp)
      values (p_pitch_id, v_from, p_end_hour::smallint, v_old.end_hour,
              v_old.price_egp, v_old.deposit_egp);
    end if;
  end loop;

  insert into price_rule (pitch_id, valid_from, start_hour, end_hour, price_egp, deposit_egp)
  values (p_pitch_id, v_from, p_start_hour::smallint, p_end_hour::smallint,
          p_price_egp, p_deposit_egp);

  perform write_audit('price.set', 'pitch', p_pitch_id,
    jsonb_build_object('start_hour', p_start_hour, 'end_hour', p_end_hour,
                       'price_egp', p_price_egp, 'deposit_egp', p_deposit_egp,
                       'valid_from', v_from));

  return query select true, null::text;
end;
$$;

create or replace function venue_price_rules(p_venue_id uuid)
returns table (
  rule_id     uuid,
  pitch_id    uuid,
  pitch_label text,
  start_hour  smallint,
  end_hour    smallint,
  price_egp   integer,
  deposit_egp integer,
  valid_from  date,
  valid_to    date,
  live        boolean
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_venue_staff(p_venue_id) then
    raise exception 'You do not have access to that venue.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select pr.id, pr.pitch_id, p.label, pr.start_hour, pr.end_hour,
         pr.price_egp, pr.deposit_egp, pr.valid_from, pr.valid_to,
         pr.valid_from <= current_date and (pr.valid_to is null or pr.valid_to > current_date)
    from price_rule pr
    join pitch p on p.id = pr.pitch_id
   where p.venue_id = p_venue_id
   order by p.label, pr.start_hour, pr.valid_from desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- O-04 Closures
-- ---------------------------------------------------------------------------

-- OWN-004. Closing an hour somebody has already bought is refused: the venue
-- has to speak to them, and cancel_booking is the honest way to do it.
create or replace function close_slot(
  p_pitch_id uuid,
  p_starts_at timestamptz,
  p_minutes  integer default 60,
  p_kind     text default 'closure',
  p_note     text default null
)
returns table (ok boolean, exception_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_venue uuid := venue_of_pitch(p_pitch_id);
  v_range tstzrange := tstzrange(p_starts_at, p_starts_at + make_interval(mins => p_minutes), '[)');
  v_id    uuid;
  v_sold  integer;
begin
  if v_venue is null then
    return query select false, null::uuid, 'That pitch no longer exists.';
    return;
  end if;
  if not is_venue_staff(v_venue, 'manager') then
    return query select false, null::uuid, 'You do not manage that venue.';
    return;
  end if;

  select count(*)::integer into v_sold
    from booking b
   where b.pitch_id = p_pitch_id
     and b.during && v_range
     and b.state in ('held', 'pending_payment', 'confirmed', 'checked_in');
  if v_sold > 0 then
    return query select false, null::uuid,
      'Somebody has already booked that hour. Cancel the booking first.';
    return;
  end if;

  insert into availability_exception (pitch_id, during, kind, note, created_by)
  values (p_pitch_id, v_range, p_kind, p_note, auth.uid())
  returning id into v_id;

  perform write_audit('slot.closed', 'pitch', p_pitch_id,
    jsonb_build_object('from', lower(v_range), 'to', upper(v_range), 'kind', p_kind));

  return query select true, v_id, null::text;
end;
$$;

create or replace function reopen_slot(p_exception_id uuid)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_pitch uuid;
begin
  select ae.pitch_id into v_pitch from availability_exception ae where ae.id = p_exception_id;
  if v_pitch is null then
    return query select false, 'That closure no longer exists.';
    return;
  end if;
  if not is_venue_staff(venue_of_pitch(v_pitch), 'manager') then
    return query select false, 'You do not manage that venue.';
    return;
  end if;

  delete from availability_exception where id = p_exception_id;
  perform write_audit('slot.reopened', 'pitch', v_pitch, '{}'::jsonb);
  return query select true, null::text;
end;
$$;

create or replace function venue_closures(p_venue_id uuid, p_from date default null)
returns table (
  exception_id uuid,
  pitch_id     uuid,
  pitch_label  text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  kind         text,
  note         text
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_venue_staff(p_venue_id) then
    raise exception 'You do not have access to that venue.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select ae.id, ae.pitch_id, p.label, lower(ae.during), upper(ae.during), ae.kind, ae.note
    from availability_exception ae
    join pitch p on p.id = ae.pitch_id
   where p.venue_id = p_venue_id
     and (p_from is null or upper(ae.during) >= p_from)
   order by lower(ae.during), p.label;
end;
$$;

-- ---------------------------------------------------------------------------
-- O-05 Staff
-- ---------------------------------------------------------------------------

-- OWN-014 / RBAC-002. A manager may add staff but not another owner: authority
-- only ever moves sideways or down, never up, so nobody can promote themselves
-- past the person who hired them.
create or replace function set_venue_staff(
  p_venue_id uuid,
  p_user_id  uuid,
  p_role     venue_role default 'staff',
  p_active   boolean default true
)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_mine venue_role;
begin
  select vs.role into v_mine
    from venue_staff vs
   where vs.venue_id = p_venue_id and vs.user_id = auth.uid() and vs.active;

  if v_mine is null or v_mine < 'manager' then
    return query select false, 'You do not manage that venue.';
    return;
  end if;
  -- Checked before the role comparison: a manager setting their own role is
  -- refused for being their own, whichever direction it goes, which is the
  -- more informative answer than "above your own".
  if p_user_id = auth.uid() then
    return query select false, 'You cannot change your own role.';
    return;
  end if;
  if p_role > v_mine then
    return query select false, 'You cannot grant a role above your own.';
    return;
  end if;
  if not exists (select 1 from player_profile where id = p_user_id) then
    return query select false, 'That person does not have an X League account.';
    return;
  end if;

  insert into venue_staff (user_id, venue_id, role, active)
  values (p_user_id, p_venue_id, p_role, p_active)
  on conflict (user_id, venue_id) do update
    set role = excluded.role, active = excluded.active;

  perform write_audit('staff.set', 'venue', p_venue_id,
    jsonb_build_object('user_id', p_user_id, 'role', p_role, 'active', p_active));

  return query select true, null::text;
end;
$$;

create or replace function venue_staff_list(p_venue_id uuid)
returns table (
  user_id      uuid,
  display_name text,
  role         venue_role,
  active       boolean,
  since        timestamptz
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_venue_staff(p_venue_id, 'manager') then
    raise exception 'You do not manage that venue.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select vs.user_id, pp.display_name, vs.role, vs.active, vs.created_at
    from venue_staff vs
    join player_profile pp on pp.id = vs.user_id
   where vs.venue_id = p_venue_id
   order by vs.role desc, pp.display_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- O-06 What the venue is owed
-- ---------------------------------------------------------------------------

-- OWN-011. Deliberately built from payment_reference rather than from booking
-- states: the venue reconciles against obligations, and a booking's state does
-- not say whether the cash actually arrived.
create or replace function venue_payouts(
  p_venue_id uuid,
  p_from date default null,
  p_to   date default null,
  p_tz   text default 'Africa/Cairo'
)
returns table (
  on_date        date,
  bookings       integer,
  gross_egp      integer,
  collected_egp  integer,
  outstanding_egp integer,
  forfeited_egp  integer
)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_from date := coalesce(p_from, current_date - 29);
  v_to   date := coalesce(p_to, current_date);
begin
  if not is_venue_staff(p_venue_id, 'manager') then
    raise exception 'You do not manage that venue.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    (lower(b.during) at time zone p_tz)::date,
    count(distinct b.id)::integer,
    coalesce(sum(b.price_egp) filter (where pr.kind = 'cash_deposit'), 0)::integer,
    coalesce(sum(pr.amount_egp) filter (where pr.state = 'collected'), 0)::integer,
    coalesce(sum(pr.amount_egp) filter (where pr.state = 'due'), 0)::integer,
    coalesce(sum(pr.amount_egp) filter (where pr.state = 'forfeited'), 0)::integer
  from booking b
  join pitch p on p.id = b.pitch_id
  left join payment_reference pr on pr.booking_id = b.id
  where p.venue_id = p_venue_id
    and (lower(b.during) at time zone p_tz)::date between v_from and v_to
    and b.state in ('confirmed', 'checked_in', 'completed', 'no_show')
  group by 1
  order by 1 desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- O-07 Venue profile
-- ---------------------------------------------------------------------------

-- VEN-005. Verification is deliberately not in this list: a venue cannot mark
-- itself verified, which is the entire value of the badge.
create or replace function update_venue_profile(
  p_venue_id   uuid,
  p_name       text default null,
  p_area       text default null,
  p_phone      text default null,
  p_entry_note text default null,
  p_house_rules text default null,
  p_amenities  text[] default null,
  p_map_url    text default null,
  p_lat        numeric default null,
  p_lon        numeric default null
)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_venue_staff(p_venue_id, 'manager') then
    return query select false, 'You do not manage that venue.';
    return;
  end if;

  update venue
     set name        = coalesce(nullif(btrim(p_name), ''), name),
         area        = coalesce(nullif(btrim(p_area), ''), area),
         phone       = coalesce(p_phone, phone),
         entry_note  = coalesce(p_entry_note, entry_note),
         house_rules = coalesce(p_house_rules, house_rules),
         amenities   = coalesce(p_amenities, amenities),
         map_url     = coalesce(p_map_url, map_url),
         lat         = coalesce(p_lat, lat),
         lon         = coalesce(p_lon, lon)
   where id = p_venue_id;

  perform write_audit('venue.updated', 'venue', p_venue_id, '{}'::jsonb);
  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- O-08 Reviews the venue can see
-- ---------------------------------------------------------------------------

create or replace function venue_review_summary(p_venue_id uuid)
returns table (
  rating_avg   numeric,
  rating_count integer,
  five integer, four integer, three integer, two integer, one integer
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_venue_staff(p_venue_id) then
    raise exception 'You do not have access to that venue.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select v.rating_avg, v.rating_count,
         (select count(*)::integer from pitch_review r where r.venue_id = v.id and not r.hidden and r.rating = 5),
         (select count(*)::integer from pitch_review r where r.venue_id = v.id and not r.hidden and r.rating = 4),
         (select count(*)::integer from pitch_review r where r.venue_id = v.id and not r.hidden and r.rating = 3),
         (select count(*)::integer from pitch_review r where r.venue_id = v.id and not r.hidden and r.rating = 2),
         (select count(*)::integer from pitch_review r where r.venue_id = v.id and not r.hidden and r.rating = 1)
    from venue v where v.id = p_venue_id;
end;
$$;

-- ===========================================================================
-- ADMIN CONSOLE
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- A-02 Verification queue
-- ---------------------------------------------------------------------------

create or replace function admin_verification_queue()
returns table (
  venue_id     uuid,
  name         text,
  area         text,
  verification text,
  phone        text,
  pitches      integer,
  bookings     integer,
  created_at   timestamptz
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform('moderator') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select v.id, v.name, v.area, v.verification, v.phone,
         (select count(*)::integer from pitch p where p.venue_id = v.id),
         (select count(*)::integer from booking b join pitch p on p.id = b.pitch_id
           where p.venue_id = v.id),
         v.created_at
    from venue v
   where v.verification <> 'verified'
   order by v.created_at;
end;
$$;

-- ADM-002. The badge is the platform's word, so only the platform sets it, and
-- the decision is written to the audit log with whoever made it.
create or replace function admin_set_verification(
  p_venue_id uuid, p_verification text, p_note text default null
)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform('moderator') then
    return query select false, 'Not authorised.';
    return;
  end if;
  if p_verification not in ('pending', 'verified', 'rejected', 'suspended') then
    return query select false, 'That is not a verification state.';
    return;
  end if;

  update venue set verification = p_verification where id = p_venue_id;

  perform write_audit('venue.verification', 'venue', p_venue_id,
    jsonb_build_object('verification', p_verification, 'note', p_note));

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- A-03 Disputes and reports
-- ---------------------------------------------------------------------------

create or replace function admin_reports(p_state text default 'open', p_limit integer default 50)
returns table (
  report_id    uuid,
  reporter     text,
  subject_kind text,
  subject_id   uuid,
  subject_name text,
  reason       text,
  body         text,
  state        text,
  created_at   timestamptz
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform('moderator') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select r.id, coalesce(rp.display_name, 'Someone'), r.subject_kind, r.subject_id,
         case r.subject_kind
           when 'player' then (select pp.display_name from player_profile pp where pp.id = r.subject_id)
           when 'venue'  then (select v.name from venue v where v.id = r.subject_id)
           when 'message' then (select left(m.body, 80) from message m where m.id = r.subject_id)
           else null
         end,
         r.reason, r.body, r.state, r.created_at
    from report r
    left join player_profile rp on rp.id = r.reporter_id
   where (p_state is null or r.state = p_state)
   order by r.created_at
   limit greatest(1, least(p_limit, 200));
end;
$$;

-- ADM-008 / ADM-009. Hiding a reported message happens here, in the same
-- transaction as the decision, so a report cannot be actioned without the thing
-- it was about being dealt with.
create or replace function admin_resolve_report(
  p_report_id uuid, p_state text, p_resolution text default null
)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_kind text;
  v_subject uuid;
begin
  if not is_platform('moderator') then
    return query select false, 'Not authorised.';
    return;
  end if;
  if p_state not in ('reviewing', 'actioned', 'dismissed') then
    return query select false, 'That is not a resolution.';
    return;
  end if;

  select r.subject_kind, r.subject_id into v_kind, v_subject
    from report r where r.id = p_report_id;
  if v_kind is null then
    return query select false, 'That report no longer exists.';
    return;
  end if;

  update report
     set state = p_state,
         resolved_by = case when p_state = 'reviewing' then null else auth.uid() end,
         resolved_at = case when p_state = 'reviewing' then null else now() end,
         resolution = p_resolution
   where id = p_report_id;

  if p_state = 'actioned' and v_kind = 'message' then
    update message set hidden_at = now() where id = v_subject and hidden_at is null;
  end if;

  perform write_audit('report.resolved', 'report', p_report_id,
    jsonb_build_object('state', p_state, 'resolution', p_resolution));

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- A-04 Users
-- ---------------------------------------------------------------------------

create or replace function admin_find_users(p_query text default null, p_limit integer default 50)
returns table (
  player_id    uuid,
  display_name text,
  area         text,
  visibility   text,
  suspended_until timestamptz,
  bookings     integer,
  no_shows     integer,
  joined       timestamptz
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform('support') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select pp.id, pp.display_name, pp.preferred_area, pp.visibility,
         pp.suspended_until,
         (select count(*)::integer from booking b where b.captain_id = pp.id),
         (select count(*)::integer from booking b
           where b.captain_id = pp.id and b.state = 'no_show'),
         pp.created_at
    from player_profile pp
   where p_query is null or btrim(p_query) = ''
      or pp.display_name ilike '%' || btrim(p_query) || '%'
   order by pp.created_at desc
   limit greatest(1, least(p_limit, 200));
end;
$$;

-- ADM-010. Suspension is an expiry rather than a flag, so it lifts itself.
create or replace function admin_suspend_user(
  p_player_id uuid, p_days integer, p_reason text default null
)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform('moderator') then
    return query select false, 'Not authorised.';
    return;
  end if;
  if p_player_id = auth.uid() then
    return query select false, 'You cannot suspend yourself.';
    return;
  end if;

  update player_profile
     set suspended_until = case when p_days is null or p_days <= 0
                                then null else now() + make_interval(days => p_days) end,
         suspension_reason = case when p_days is null or p_days <= 0 then null else p_reason end
   where id = p_player_id;

  perform write_audit(
    case when p_days is null or p_days <= 0 then 'user.reinstated' else 'user.suspended' end,
    'player', p_player_id, jsonb_build_object('days', p_days, 'reason', p_reason));

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- A-05 / A-06 Ledger and overview
-- ---------------------------------------------------------------------------

create or replace function admin_overview(p_days integer default 30, p_tz text default 'Africa/Cairo')
returns table (
  venues_total    integer,
  venues_verified integer,
  venues_pending  integer,
  players         integer,
  bookings        integer,
  matches         integer,
  gmv_egp         integer,
  collected_egp   integer,
  open_reports    integer,
  no_show_rate    numeric
)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, p_days));
begin
  if not is_platform('support') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    (select count(*)::integer from venue),
    (select count(*)::integer from venue where verification = 'verified'),
    (select count(*)::integer from venue where verification = 'pending'),
    (select count(*)::integer from player_profile),
    (select count(*)::integer from booking b
      where lower(b.during) >= v_since
        and b.state in ('confirmed', 'checked_in', 'completed', 'no_show')),
    (select count(*)::integer from match m where m.played_at >= v_since),
    (select coalesce(sum(b.price_egp), 0)::integer from booking b
      where lower(b.during) >= v_since
        and b.state in ('confirmed', 'checked_in', 'completed')),
    (select coalesce(sum(pr.amount_egp), 0)::integer
       from payment_reference pr join booking b on b.id = pr.booking_id
      where pr.state = 'collected' and lower(b.during) >= v_since),
    (select count(*)::integer from report where state in ('open', 'reviewing')),
    (select case when count(*) = 0 then 0
                 else round(100.0 * count(*) filter (where b.state = 'no_show') / count(*), 1)
            end
       from booking b
      where lower(b.during) >= v_since
        and b.state in ('confirmed', 'checked_in', 'completed', 'no_show'));
end;
$$;

-- ADM-011: the money, by venue, so the platform can reconcile with each.
create or replace function admin_ledger(p_days integer default 30)
returns table (
  venue_id      uuid,
  venue_name    text,
  bookings      integer,
  gross_egp     integer,
  collected_egp integer,
  outstanding_egp integer,
  forfeited_egp integer
)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, p_days));
begin
  if not is_platform('admin') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select v.id, v.name,
         count(distinct b.id)::integer,
         coalesce(sum(b.price_egp) filter (where pr.kind = 'cash_deposit'), 0)::integer,
         coalesce(sum(pr.amount_egp) filter (where pr.state = 'collected'), 0)::integer,
         coalesce(sum(pr.amount_egp) filter (where pr.state = 'due'), 0)::integer,
         coalesce(sum(pr.amount_egp) filter (where pr.state = 'forfeited'), 0)::integer
    from venue v
    join pitch p on p.venue_id = v.id
    join booking b on b.pitch_id = p.id
    left join payment_reference pr on pr.booking_id = b.id
   where lower(b.during) >= v_since
     and b.state in ('confirmed', 'checked_in', 'completed', 'no_show')
   group by v.id, v.name
   order by 4 desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- A-07 Configuration
-- ---------------------------------------------------------------------------

create or replace function admin_settings()
returns table (key text, value integer, description text, updated_at timestamptz)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform('admin') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;
  return query
  select ps.key, ps.value, ps.description, ps.updated_at from policy_setting ps order by ps.key;
end;
$$;

create or replace function admin_set_setting(p_key text, p_value integer)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_old integer;
begin
  if not is_platform('admin') then
    return query select false, 'Not authorised.';
    return;
  end if;

  select value into v_old from policy_setting where key = p_key;
  if v_old is null then
    return query select false, 'There is no such setting.';
    return;
  end if;

  update policy_setting
     set value = p_value, updated_by = auth.uid(), updated_at = now()
   where key = p_key;

  perform write_audit('setting.changed', 'setting', null,
    jsonb_build_object('key', p_key, 'from', v_old, 'to', p_value));

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- A-08 Audit
-- ---------------------------------------------------------------------------

create or replace function admin_audit(p_limit integer default 100, p_subject_id uuid default null)
returns table (
  at           timestamptz,
  actor        text,
  action       text,
  subject_kind text,
  subject_id   uuid,
  detail       jsonb
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform('admin') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select a.created_at, a.actor, a.action, a.subject_kind, a.subject_id, a.detail
    from audit_log a
   where p_subject_id is null or a.subject_id = p_subject_id
   order by a.created_at desc
   limit greatest(1, least(p_limit, 500));
end;
$$;

-- Which console the signed-in person may open at all. Lets the client stop
-- offering a door that will not open, without the client deciding who may.
create or replace function my_platform_role()
returns platform_role_kind
language sql stable security definer
set search_path = public, pg_temp as $$
  select pr.role from platform_role pr where pr.user_id = auth.uid() and pr.active;
$$;

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

alter table platform_role enable row level security;
alter table audit_log     enable row level security;

revoke execute on function public.write_audit(text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.is_platform(platform_role_kind)      from public, anon;

do $$
declare fn text;
begin
  -- Everything this migration exposes, closed to PUBLIC and anon first and
  -- handed back to `authenticated` only. Each function checks authority for
  -- itself; the grant just gets a signed-in caller as far as that check.
  foreach fn in array array[
    'set_price_rule(uuid, integer, integer, integer, integer, date)',
    'venue_price_rules(uuid)',
    'close_slot(uuid, timestamptz, integer, text, text)',
    'reopen_slot(uuid)',
    'venue_closures(uuid, date)',
    'set_venue_staff(uuid, uuid, venue_role, boolean)',
    'venue_staff_list(uuid)',
    'venue_payouts(uuid, date, date, text)',
    'update_venue_profile(uuid, text, text, text, text, text, text[], text, numeric, numeric)',
    'venue_review_summary(uuid)',
    'admin_verification_queue()',
    'admin_set_verification(uuid, text, text)',
    'admin_reports(text, integer)',
    'admin_resolve_report(uuid, text, text)',
    'admin_find_users(text, integer)',
    'admin_suspend_user(uuid, integer, text)',
    'admin_overview(integer, text)',
    'admin_ledger(integer)',
    'admin_settings()',
    'admin_set_setting(text, integer)',
    'admin_audit(integer, uuid)',
    'my_platform_role()',
    'is_platform(platform_role_kind)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

comment on table public.platform_role is
  'Global authority, deliberately a separate table from venue_staff. Conflating the two would put an ordinary venue manager one bad join away from moderating the platform.';
comment on table public.audit_log is
  'What privileged people did, beyond bookings. booking_event records a booking''s life; this records price changes, verifications and suspensions, which do not belong on any one booking''s timeline.';
