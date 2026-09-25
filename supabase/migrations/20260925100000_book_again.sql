-- Book again.
--
-- The redesigned Home opens with the grounds a player has already booked, so
-- they can go straight back to one. `my_bookings` named the venue but never
-- said which venue it was, so there was nothing to link to — only a name,
-- and two venues can share a name.
--
-- Two columns, appended. Everything that already reads this function by
-- column name keeps reading the same columns. A return type change is a drop
-- and a create, so the grant is restated: `authenticated` only, as before.

drop function if exists public.my_bookings(integer);

create function public.my_bookings(p_limit integer default 20)
returns table (
  booking_id uuid,
  code text,
  state booking_state,
  starts_at timestamptz,
  venue_name text,
  area text,
  pitch_label text,
  price_egp integer,
  reviewed boolean,
  match_id uuid,
  awaiting_result boolean,
  venue_id uuid,
  cover_url text
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select b.id, b.code, b.state, lower(b.during), v.name, v.area, p.label, b.price_egp,
         exists (select 1 from pitch_review r where r.booking_id = b.id),
         m.id,
         m.id is null and b.state = 'checked_in' and upper(b.during) <= now(),
         v.id,
         v.cover_url
    from booking b
    join pitch p on p.id = b.pitch_id
    join venue v on v.id = p.venue_id
    left join match m on m.booking_id = b.id
   where b.captain_id = auth.uid()
   order by lower(b.during) desc
   limit greatest(1, least(p_limit, 100));
$function$;

revoke all on function public.my_bookings(integer) from public, anon;
grant execute on function public.my_bookings(integer) to authenticated, service_role;
