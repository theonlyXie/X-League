-- A venue can see its own verification state.
--
-- A venue owner signs up, lands in Owner Mode, and is told nothing about where
-- their venue stands. The state existed the whole time — `venue.verification`
-- defaults to 'pending' and the admin console has a queue for it — but the only
-- place it surfaced was four taps into Setup, rendered as `Verification:
-- pending. Set by the platform, not here.`: an enum value and a sentence of
-- developer-speak, in English regardless of language.
--
-- `my_venues` is the natural home for it. Owner Mode already reads that once
-- per session for the venue's name and the caller's role, so this adds a column
-- rather than a round trip, and every owner screen can say where the venue
-- stands without asking again.
--
-- Worth being exact about what the answer means, because the copy this feeds
-- has to be true: verification does NOT gate discovery. `search_venues`
-- returns unverified venues and orders `(verification = 'verified') desc`, so a
-- pending venue is listed and bookable and simply ranks below verified ones.
-- Nothing else in the schema reads the column except the admin console. Telling
-- a new venue that players cannot find it would be false and would be the kind
-- of false that makes somebody give up on the product in week one.
--
-- The return type gains a column, so this is a DROP rather than a REPLACE:
-- Postgres refuses to change an existing function's OUT parameters in place.

drop function if exists public.my_venues();

create function my_venues()
returns table (venue_id uuid, name text, role venue_role, verification text)
language sql stable security definer
set search_path = public, pg_temp as $$
  select v.id, v.name, s.role, v.verification
    from venue_staff s
    join venue v on v.id = s.venue_id
   where s.user_id = auth.uid()
     and s.active
   order by v.name;
$$;

-- Stated here rather than left to `access_control`, which runs earlier in the
-- ordering and cannot know about a function created after it. A dropped
-- function takes its grants with it, so these are not optional.
revoke execute on function public.my_venues() from public, anon;
grant execute on function public.my_venues() to authenticated;
