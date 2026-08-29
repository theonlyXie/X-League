-- Gross is what was sold, not what was deposited.
--
-- Both money screens computed their first column as
--
--   sum(b.price_egp) filter (where pr.kind = 'cash_deposit')
--
-- which was already an odd way to say "gross" — a booking's whole price,
-- counted only if a deposit row happened to exist for it. After
-- 20260822108900_no_deposit.sql there are no `cash_deposit` rows at all: the
-- existing ones were waived and the trigger now raises a `balance`. The filter
-- matches nothing, so every gross figure in both consoles is zero.
--
-- It shows up as a venue that collected 4,500 EGP against a gross of 0 in
-- Owner Mode's Money tab, and — worse — as `admin_ledger` ending in
-- `order by 4 desc`, which ranks venues by that always-zero column, so the
-- platform's ledger lists its venues in an arbitrary order.
--
-- Chasing the filter to `kind = 'balance'` would fix today's zero and leave
-- the shape wrong: gross is a property of the bookings, and joining it to the
-- payment rows means a booking with two of them (a balance and, one day, a
-- deposit again) is counted twice. So the join is split. Bookings are
-- aggregated as bookings, payments as payments, and the two are put side by
-- side afterwards.

create or replace function venue_payouts(
  p_venue_id uuid,
  p_from     date default null,
  p_to       date default null,
  p_tz       text default 'Africa/Cairo'
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
  with bk as (
    select b.id,
           b.price_egp,
           (lower(b.during) at time zone p_tz)::date as on_day
      from booking b
      join pitch p on p.id = b.pitch_id
     where p.venue_id = p_venue_id
       and (lower(b.during) at time zone p_tz)::date between v_from and v_to
       and b.state in ('confirmed', 'checked_in', 'completed', 'no_show')
  ),
  sold as (
    select bk.on_day,
           count(*)::integer as n,
           sum(bk.price_egp)::integer as gross
      from bk group by bk.on_day
  ),
  paid as (
    select bk.on_day,
           coalesce(sum(pr.amount_egp) filter (where pr.state = 'collected'), 0)::integer as collected,
           coalesce(sum(pr.amount_egp) filter (where pr.state = 'due'), 0)::integer as due,
           coalesce(sum(pr.amount_egp) filter (where pr.state = 'forfeited'), 0)::integer as forfeited
      from bk
      join payment_reference pr on pr.booking_id = bk.id
     group by bk.on_day
  )
  select sold.on_day, sold.n, sold.gross,
         coalesce(paid.collected, 0),
         coalesce(paid.due, 0),
         coalesce(paid.forfeited, 0)
    from sold
    left join paid on paid.on_day = sold.on_day
   order by 1 desc;
end;
$$;

revoke execute on function public.venue_payouts(uuid, date, date, text)
  from public, anon, authenticated;

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
  with bk as (
    select v.id as vid, v.name as vname, b.id as bid, b.price_egp
      from venue v
      join pitch p on p.venue_id = v.id
      join booking b on b.pitch_id = p.id
     where lower(b.during) >= v_since
       and b.state in ('confirmed', 'checked_in', 'completed', 'no_show')
  ),
  sold as (
    select bk.vid, bk.vname, count(*)::integer as n, sum(bk.price_egp)::integer as gross
      from bk group by bk.vid, bk.vname
  ),
  paid as (
    select bk.vid,
           coalesce(sum(pr.amount_egp) filter (where pr.state = 'collected'), 0)::integer as collected,
           coalesce(sum(pr.amount_egp) filter (where pr.state = 'due'), 0)::integer as due,
           coalesce(sum(pr.amount_egp) filter (where pr.state = 'forfeited'), 0)::integer as forfeited
      from bk
      join payment_reference pr on pr.booking_id = bk.bid
     group by bk.vid
  )
  select sold.vid, sold.vname, sold.n, sold.gross,
         coalesce(paid.collected, 0),
         coalesce(paid.due, 0),
         coalesce(paid.forfeited, 0)
    from sold
    left join paid on paid.vid = sold.vid
   order by sold.gross desc, sold.vname;
end;
$$;

revoke execute on function public.admin_ledger(integer) from public, anon, authenticated;
