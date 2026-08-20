-- X League — admin console and venue owner signup (live backend).
--
-- ADM-012: privileged mutations are server-authoritative and audited.
-- Venue owners submit listings; platform admins approve them into inventory.

-- ---------------------------------------------------------------------------
-- Platform operators
-- ---------------------------------------------------------------------------

create table if not exists platform_admin (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text        not null default 'ops',
  created_at timestamptz not null default now()
);

alter table platform_admin enable row level security;

drop policy if exists platform_admin_self_read on platform_admin;
create policy platform_admin_self_read on platform_admin
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Owner venue submissions
-- ---------------------------------------------------------------------------

do $$ begin
  create type venue_submission_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

create table if not exists venue_submission (
  id               uuid primary key default gen_random_uuid(),
  submitter_id     uuid                    not null references auth.users(id) on delete cascade,
  name             text                    not null,
  area             text                    not null,
  status           venue_submission_status not null default 'pending',
  submitted_at     timestamptz             not null default now(),
  reviewed_at      timestamptz,
  reviewed_by      uuid                    references auth.users(id),
  rejection_reason text,
  created_venue_id uuid                    references venue(id) on delete set null
);

create index if not exists venue_submission_status_idx on venue_submission (status, submitted_at desc);
create unique index if not exists venue_submission_one_pending_per_user
  on venue_submission (submitter_id) where status = 'pending';

alter table venue_submission enable row level security;

drop policy if exists venue_submission_self_read on venue_submission;
create policy venue_submission_self_read on venue_submission
  for select to authenticated using (submitter_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function is_platform_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from platform_admin pa where pa.user_id = auth.uid()
  );
$$;

create or replace function assert_platform_admin()
returns void
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform_admin() then
    raise exception 'You do not have access to the admin console.'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner signup
-- ---------------------------------------------------------------------------

create or replace function submit_venue(p_name text, p_area text)
returns table (
  id uuid,
  name text,
  area text,
  status venue_submission_status,
  submitted_at timestamptz
)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to register a venue.' using errcode = 'insufficient_privilege';
  end if;

  if exists (
    select 1 from venue_submission vs
     where vs.submitter_id = v_uid and vs.status = 'pending'
  ) then
    raise exception 'You already have a venue submission awaiting review.'
      using errcode = 'check_violation';
  end if;

  insert into venue_submission (submitter_id, name, area)
  values (v_uid, trim(p_name), trim(p_area))
  returning venue_submission.id into v_id;

  return query
  select vs.id, vs.name, vs.area, vs.status, vs.submitted_at
    from venue_submission vs where vs.id = v_id;
end;
$$;

create or replace function my_venue_submission()
returns table (
  id uuid,
  name text,
  area text,
  status venue_submission_status,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  rejection_reason text
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select vs.id, vs.name, vs.area, vs.status, vs.submitted_at, vs.reviewed_at, vs.rejection_reason
    from venue_submission vs
   where vs.submitter_id = auth.uid()
   order by vs.submitted_at desc
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Admin — venue queue
-- ---------------------------------------------------------------------------

create or replace function admin_pending_submissions()
returns table (
  id uuid,
  name text,
  area text,
  owner_name text,
  submitted_at timestamptz
)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  perform assert_platform_admin();
  return query
  select vs.id, vs.name, vs.area, coalesce(pp.display_name, 'Owner'), vs.submitted_at
    from venue_submission vs
    left join player_profile pp on pp.id = vs.submitter_id
   where vs.status = 'pending'
   order by vs.submitted_at;
end;
$$;

create or replace function admin_approve_venue(p_submission_id uuid)
returns table (ok boolean, venue_id uuid, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_sub   venue_submission%rowtype;
  v_vid   uuid;
  v_pid   uuid;
begin
  perform assert_platform_admin();

  select * into v_sub from venue_submission where id = p_submission_id for update;
  if v_sub.id is null then
    return query select false, null::uuid, 'That submission no longer exists.';
    return;
  end if;
  if v_sub.status <> 'pending' then
    return query select false, null::uuid, 'That submission was already reviewed.';
    return;
  end if;

  insert into venue (name, area, verification, entry_note)
  values (v_sub.name, v_sub.area, 'pending', 'New listing · admin approved')
  returning id into v_vid;

  insert into pitch (venue_id, label, format, surface)
  values (v_vid, 'Pitch A', '5-a-side', 'Artificial turf')
  returning id into v_pid;

  insert into availability_rule (pitch_id, day_of_week, open_hour, close_hour)
  select v_pid, d, 18, 24 from generate_series(0, 6) as d;

  insert into price_rule (pitch_id, valid_from, start_hour, end_hour, price_egp, deposit_egp)
  values (v_pid, current_date, 18, 24, 280, 100);

  insert into venue_staff (user_id, venue_id, role)
  values (v_sub.submitter_id, v_vid, 'owner'::venue_role)
  on conflict (user_id, venue_id) do update set active = true, role = 'owner';

  update venue_submission
     set status = 'approved',
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         created_venue_id = v_vid
   where id = p_submission_id;

  return query select true, v_vid, null::text;
end;
$$;

create or replace function admin_reject_venue(p_submission_id uuid, p_reason text default null)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_rows integer;
begin
  perform assert_platform_admin();

  update venue_submission
     set status = 'rejected',
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         rejection_reason = coalesce(nullif(trim(p_reason), ''), 'Does not meet listing requirements')
   where id = p_submission_id and status = 'pending';
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return query select false, 'That submission is not pending.';
    return;
  end if;

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin — overview surfaces
-- ---------------------------------------------------------------------------

create or replace function admin_overview(p_tz text default 'Africa/Cairo')
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_today      date := (now() at time zone p_tz)::date;
  v_bookings   integer;
  v_confirmed  integer;
  v_checked_in integer;
  v_cash_due   integer;
  v_failed     integer;
  v_pending    integer;
  v_verified   integer;
  v_total      integer;
begin
  perform assert_platform_admin();

  select count(*) into v_bookings
    from booking b
   where (b.created_at at time zone p_tz)::date = v_today
     and b.state not in ('expired');

  select count(*) into v_confirmed
    from booking b
   where (b.created_at at time zone p_tz)::date = v_today
     and b.state in ('confirmed', 'checked_in', 'completed');

  select count(*) into v_checked_in
    from booking b
   where (b.created_at at time zone p_tz)::date = v_today
     and b.state in ('checked_in', 'completed');

  select coalesce(sum(b.deposit_egp), 0) into v_cash_due
    from booking b
   where (lower(b.during) at time zone p_tz)::date = v_today
     and b.state = 'confirmed';

  select count(*) into v_failed
    from booking b
   where (b.created_at at time zone p_tz)::date = v_today
     and b.state in ('cancelled', 'no_show', 'expired');

  select count(*) into v_pending from venue_submission where status = 'pending';

  v_total := greatest(v_confirmed, 1);
  v_verified := round(100.0 * v_checked_in / v_total)::integer;

  return jsonb_build_object(
    'kpis', jsonb_build_array(
      jsonb_build_object('label', 'BOOKINGS TODAY', 'value', to_char(v_bookings, 'FM999,999'), 'sub', 'Live from inventory', 'tone', 'neutral'),
      jsonb_build_object('label', 'CONFLICT RATE', 'value', case when v_bookings > 0 then to_char(100.0 * v_failed / v_bookings, 'FM990.0') || '%' else '0%' end, 'sub', case when v_failed > 0 then v_failed || ' failed today' else 'No conflicts today', 'tone', 'neutral'),
      jsonb_build_object('label', 'CASH AT GATE', 'value', to_char(v_cash_due / 1000.0, 'FM999') || 'k', 'sub', 'EGP due tonight', 'tone', 'gold'),
      jsonb_build_object('label', 'DISPUTES OPEN', 'value', '0', 'sub', 'none flagged', 'tone', 'neutral'),
      jsonb_build_object('label', 'VERIFIED PLAY', 'value', v_verified || '%', 'sub', 'checked-in matches', 'tone', 'neutral')
    ),
    'attention', case
      when v_pending > 0 then jsonb_build_array(
        jsonb_build_object(
          'title', 'Venue signups pending · ' || v_pending,
          'detail', 'Owner registrations waiting for admin approval before they appear in Play search.',
          'severe', true
        )
      )
      else '[]'::jsonb
    end,
    'pending_venues', v_pending,
    'bookings_today', v_bookings,
    'as_of', to_char(now() at time zone p_tz, 'Dy DD Mon YYYY · HH24:MI TMD')
  );
end;
$$;

create or replace function admin_ledger(
  p_limit  integer default 20,
  p_filter text    default 'all',
  p_tz     text    default 'Africa/Cairo'
)
returns table (
  code text,
  venue text,
  captain text,
  source text,
  deposit text,
  status text,
  kind text
)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_today date := (now() at time zone p_tz)::date;
begin
  perform assert_platform_admin();

  return query
  select
    coalesce(b.code, '—'),
    v.name || ' · ' || p.label,
    coalesce(b.captain_name, '—'),
    initcap(replace(b.source::text, '_', ' ')),
    case
      when b.state in ('checked_in', 'completed') then 'Cash · collected'
      when b.state = 'confirmed' and b.deposit_egp > 0 then 'Cash · due'
      when b.state = 'held' then 'Cash · unpaid'
      when b.state in ('cancelled', 'expired') then 'Cash · refunded'
      else '—'
    end,
    upper(replace(b.state::text, '_', ' ')),
    case
      when b.state in ('cancelled', 'no_show', 'expired') then 'fail'
      when b.created_at > now() - interval '5 minutes' then 'new'
      else 'normal'
    end
  from booking b
  join pitch p on p.id = b.pitch_id
  join venue v on v.id = p.venue_id
  where (b.created_at at time zone p_tz)::date = v_today
    and (
      p_filter = 'all'
      or (p_filter = 'app' and b.source = 'app')
      or (p_filter = 'failed' and b.state in ('cancelled', 'no_show', 'expired'))
    )
  order by b.created_at desc
  limit p_limit;
end;
$$;

create or replace function admin_audit_trail(p_limit integer default 12)
returns table (
  at text,
  event text,
  actor text,
  booking_code text
)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  perform assert_platform_admin();

  return query
  select
    to_char(e.at at time zone 'Africa/Cairo', 'HH24:MI'),
    e.event,
    e.actor,
    coalesce(b.code, '—')
  from booking_event e
  join booking b on b.id = e.booking_id
  order by e.at desc
  limit p_limit;
end;
$$;

create or replace function admin_venues(p_tz text default 'Africa/Cairo')
returns table (
  name text,
  area text,
  pitches integer,
  occupancy text,
  drift text,
  status text
)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_today date := (now() at time zone p_tz)::date;
begin
  perform assert_platform_admin();

  return query
  with pitch_stats as (
    select
      v.id as venue_id,
      v.name,
      v.area,
      v.verification,
      count(distinct p.id) as pitch_count,
      count(a.*) filter (where not a.available) as taken,
      count(a.*) as total
    from venue v
    join pitch p on p.venue_id = v.id and p.operational
    cross join lateral search_availability(p.id, v_today, p_tz) a
    group by v.id, v.name, v.area, v.verification
  )
  select
    ps.name,
    ps.area,
    ps.pitch_count::integer,
    case when ps.total > 0 then round(100.0 * ps.taken / ps.total)::text || '%' else '—' end,
    'none',
    case
      when ps.verification = 'verified' then 'Live'
      when ps.verification = 'pending' then 'Watch'
      else 'Draft'
    end
  from pitch_stats ps
  order by ps.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant execute on function is_platform_admin()                                              to authenticated;
grant execute on function submit_venue(text, text)                                         to authenticated;
grant execute on function my_venue_submission()                                            to authenticated;
grant execute on function admin_pending_submissions()                                      to authenticated;
grant execute on function admin_approve_venue(uuid)                                        to authenticated;
grant execute on function admin_reject_venue(uuid, text)                                     to authenticated;
grant execute on function admin_overview(text)                                             to authenticated;
grant execute on function admin_ledger(integer, text, text)                                to authenticated;
grant execute on function admin_audit_trail(integer)                                       to authenticated;
grant execute on function admin_venues(text)                                               to authenticated;

-- Seed Salma Rashad as platform admin when identities exist.
insert into platform_admin (user_id, role)
values ('22222222-2222-2222-2222-222222222222'::uuid, 'super')
on conflict (user_id) do nothing;
