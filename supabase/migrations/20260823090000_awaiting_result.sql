-- Which of my bookings still needs a result reported.
--
-- `complete_match` is the only path to `award_match_points`, and nothing in the
-- app called it: points, XP and levels were reachable in SQL and unreachable
-- from a phone. The screen that fixes that needs to know which bookings are
-- waiting, and the honest place to decide that is here rather than in the
-- client, because the answer is exactly `complete_match`'s own precondition —
-- checked in, and finished. Deriving it twice is how a button appears that the
-- server then refuses.
--
-- `match_id` comes back for the same reason in the other direction: once a
-- result exists, the row can link straight to rating it, without a second
-- round trip to discover the match's id.

-- Adding a column to a RETURNS TABLE changes the function's return type, which
-- CREATE OR REPLACE will not do — it has to be dropped and rebuilt.
drop function if exists public.my_bookings(integer);

create function my_bookings(p_limit integer default 20)
returns table (
  booking_id      uuid,
  code            text,
  state           booking_state,
  starts_at       timestamptz,
  venue_name      text,
  area            text,
  pitch_label     text,
  price_egp       integer,
  reviewed        boolean,
  match_id        uuid,
  awaiting_result boolean
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select b.id, b.code, b.state, lower(b.during), v.name, v.area, p.label, b.price_egp,
         exists (select 1 from pitch_review r where r.booking_id = b.id),
         m.id,
         -- MCH-002 again: only a checked-in booking becomes a match, and only
         -- once it has actually finished. Both halves matter — offering this
         -- during the match would invite a result before the final whistle.
         m.id is null and b.state = 'checked_in' and upper(b.during) <= now()
    from booking b
    join pitch p on p.id = b.pitch_id
    join venue v on v.id = p.venue_id
    left join match m on m.booking_id = b.id
   where b.captain_id = auth.uid()
   order by lower(b.during) desc
   limit greatest(1, least(p_limit, 100));
$$;

-- CREATE OR REPLACE resets grants along with everything else, so the function
-- is re-closed and re-opened rather than assumed to have kept them.
revoke execute on function public.my_bookings(integer) from public, anon;
grant execute on function public.my_bookings(integer) to authenticated;
