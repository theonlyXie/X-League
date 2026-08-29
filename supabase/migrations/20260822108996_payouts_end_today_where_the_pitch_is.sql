-- The payout window ends today in Cairo, not today in UTC.
--
-- `venue_payouts` buckets each booking by its start date *in the venue's own
-- zone* — correctly, because a 10 PM Friday booking belongs to Friday's takings
-- wherever the server happens to be. But its default window was
-- `current_date - 29 .. current_date`, and `current_date` is the server's date,
-- which on this deployment is UTC.
--
-- Cairo is two or three hours ahead. So between midnight and 03:00 local, the
-- window ends *yesterday* by the venue's reckoning, and every booking taken so
-- far that day is outside it. The Money screen reads "Nothing booked in this
-- window yet" to a venue that has been selling hours all evening — found by
-- recording a booking at 00:23 Cairo and watching it vanish from the tab that
-- exists to show it.
--
-- The bucketing and the window now agree.

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
  v_today date := (now() at time zone p_tz)::date;
  v_from  date := coalesce(p_from, v_today - 29);
  v_to    date := coalesce(p_to, v_today);
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
