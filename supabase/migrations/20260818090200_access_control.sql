-- X League — access control for the booking spine.
--
-- RBAC-001: role-based access is enforced on the server for every privileged
-- action; hidden UI alone is insufficient. §7.2: transitions are
-- server-authoritative — a client may request one but never perform one.
--
-- The shape that gets us both: RLS is on for every table and no policy grants
-- direct access, so the tables are unreachable through the API. The only way in
-- is a function, and each function is SECURITY DEFINER with a pinned
-- search_path so it can do its job without opening the tables themselves.
-- A client cannot INSERT a booking row and sidestep the exclusion constraint,
-- because a client cannot touch the table at all.

alter table venue             enable row level security;
alter table pitch             enable row level security;
alter table price_rule        enable row level security;
alter table availability_rule enable row level security;
alter table booking           enable row level security;
alter table booking_event     enable row level security;

-- Pin the search path on every function. Without this a SECURITY DEFINER
-- function can be hijacked by a caller-controlled search_path.
alter function public.touch_booking()                                      set search_path = public, pg_temp;
alter function public.expire_stale_holds(uuid)                             set search_path = public, pg_temp;
alter function public.generate_booking_code()                              set search_path = public, pg_temp;
alter function public.search_availability(uuid, date, text)                set search_path = public, pg_temp;
alter function public.nearest_alternatives(uuid, timestamptz, integer)     set search_path = public, pg_temp;
alter function public.hold_slot(uuid, timestamptz, integer, text, integer) set search_path = public, pg_temp;
alter function public.confirm_booking(uuid)                                set search_path = public, pg_temp;
alter function public.release_hold(uuid)                                   set search_path = public, pg_temp;
alter function public.check_in_booking(uuid, text)                         set search_path = public, pg_temp;
alter function public.record_offline_booking(uuid, timestamptz, integer, booking_source, text, text) set search_path = public, pg_temp;
alter function public.owner_day(uuid, date, text)                          set search_path = public, pg_temp;

-- The functions reach the tables; callers do not.
alter function public.expire_stale_holds(uuid)                             security definer;
alter function public.generate_booking_code()                              security definer;
alter function public.search_availability(uuid, date, text)                security definer;
alter function public.nearest_alternatives(uuid, timestamptz, integer)     security definer;
alter function public.hold_slot(uuid, timestamptz, integer, text, integer) security definer;
alter function public.confirm_booking(uuid)                                security definer;
alter function public.release_hold(uuid)                                   security definer;
alter function public.check_in_booking(uuid, text)                         security definer;
alter function public.record_offline_booking(uuid, timestamptz, integer, booking_source, text, text) security definer;
alter function public.owner_day(uuid, date, text)                          security definer;

-- Start from nothing, then hand back only what each audience needs.
revoke execute on all functions in schema public from public, anon, authenticated;

-- Internal helpers stay internal — expire_stale_holds, generate_booking_code
-- and touch_booking get no grant. The definer functions above call them as
-- their owner, so they need none.

-- The player spine. A guest may browse availability (§2, Guest). Holding and
-- confirming are open too while there is no sign-in, which is the next thing
-- authentication has to close.
grant execute on function public.search_availability(uuid, date, text)                to anon, authenticated;
grant execute on function public.nearest_alternatives(uuid, timestamptz, integer)     to anon, authenticated;
grant execute on function public.hold_slot(uuid, timestamptz, integer, text, integer) to anon, authenticated;
grant execute on function public.confirm_booking(uuid)                                to anon, authenticated;
grant execute on function public.release_hold(uuid)                                   to anon, authenticated;

-- Venue operations are NOT anon-callable. Checking a booking in, or writing a
-- reservation into a venue's calendar, is a privileged action; handing it to
-- the public anon key would contradict RBAC-001 outright. `authenticated` is
-- the floor, not the finished answer: RBAC-002 still requires each staff member
-- to be scoped to their own assigned venues, which needs auth and a
-- venue_staff table before these are safe to call in earnest.
grant execute on function public.check_in_booking(uuid, text)                          to authenticated;
grant execute on function public.record_offline_booking(uuid, timestamptz, integer, booking_source, text, text) to authenticated;
grant execute on function public.owner_day(uuid, date, text)                           to authenticated;

-- No table policies, deliberately: every table keeps RLS on with nothing
-- granted, so `from('booking').select()` returns nothing and
-- `from('booking').insert()` is refused, for anon and authenticated alike.
comment on table public.booking is
  'Occupancy. Not directly readable or writable through the API by design — every transition goes through a booking-spine function so the exclusion constraint cannot be sidestepped.';
