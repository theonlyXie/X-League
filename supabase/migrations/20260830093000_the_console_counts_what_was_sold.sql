-- The platform's own numbers, minus the hours nobody bought.
--
-- `a_block_is_not_a_sale` took maintenance blocks out of `owner_arrivals` and
-- `venue_payouts`, which is what a venue sees. It missed the two functions the
-- admin console reads, so the platform-wide view kept counting them:
--
--   * `admin_overview` — the booking count, the gross, and the denominator of
--     the no-show rate. Including blocks in that denominator does not merely
--     inflate volume, it reports a *better* no-show rate than the platform has,
--     by dividing real no-shows by a count padded with hours nobody attended.
--   * `admin_ledger` — every venue's bookings and gross, which is the table
--     staff would reconcile a payout against.
--
-- Found while walking the deployed console page by page: Money read
-- EGP 8,100 booked, the same figure that had just been corrected to 2,400 a day
-- on the venue's own screen. The same bug in a second place is what happens
-- when a defect is fixed at the readers rather than the source, and here there
-- is no single source to fix — `source` is a column on the booking, and every
-- reader has to say whether it is asking about trade or about occupancy.
--
-- Restated in full, with the parameter defaults reproduced: CREATE OR REPLACE
-- resets security, search_path and every attribute to what the statement says,
-- and Postgres refuses to drop a default in place.

create or replace function admin_overview(p_days integer default 30, p_tz text default 'Africa/Cairo')
returns table (
  venues_total integer, venues_verified integer, venues_pending integer,
  players integer, bookings integer, matches integer,
  gmv_egp integer, collected_egp integer, open_reports integer, no_show_rate numeric
)
language plpgsql volatile security definer
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
        and b.state in ('confirmed', 'checked_in', 'completed', 'no_show')
        and b.source <> 'block'),
    (select count(*)::integer from match m where m.played_at >= v_since),
    (select coalesce(sum(b.price_egp), 0)::integer from booking b
      where lower(b.during) >= v_since
        and b.state in ('confirmed', 'checked_in', 'completed')
        and b.source <> 'block'),
    (select coalesce(sum(pr.amount_egp), 0)::integer
       from payment_reference pr join booking b on b.id = pr.booking_id
      where pr.state = 'collected' and lower(b.during) >= v_since
        and b.source <> 'block'),
    (select count(*)::integer from report where state in ('open', 'reviewing')),
    (select case when count(*) = 0 then 0
                 else round(100.0 * count(*) filter (where b.state = 'no_show') / count(*), 1)
            end
       from booking b
      where lower(b.during) >= v_since
        and b.state in ('confirmed', 'checked_in', 'completed', 'no_show')
        and b.source <> 'block');
end;
$$;

revoke execute on function public.admin_overview(integer, text) from public, anon;
grant execute on function public.admin_overview(integer, text) to authenticated;

create or replace function admin_ledger(p_days integer default 30)
returns table (
  venue_id uuid, venue_name text, bookings integer, gross_egp integer,
  collected_egp integer, outstanding_egp integer, forfeited_egp integer
)
language plpgsql volatile security definer
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
       and b.source <> 'block'
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

revoke execute on function public.admin_ledger(integer) from public, anon;
grant execute on function public.admin_ledger(integer) to authenticated;
