-- The evening the design draws: Tuesday 18 August 2026 at Stadium One.
-- Seeding the same data the artboards use keeps the screens honest while the
-- app is wired from fixtures to the database.

truncate booking_event, booking, availability_rule, price_rule, pitch, venue restart identity cascade;

with v as (
  insert into venue (name, area, verification, lat, lon, entry_note) values
    ('Stadium One',      'Nasr City', 'verified',   30.060100, 31.330200, 'Gate 2 · ask for Pitch A'),
    ('The Box',          'Nasr City', 'pending',    30.052900, 31.348800, 'Reception, first floor'),
    ('Nasr Sports Club', 'Nasr City', 'pending',    30.041500, 31.361000, null)
  returning id, name
),
p as (
  insert into pitch (venue_id, label, format, surface, indoor)
  select v.id, x.label, '5-a-side', x.surface, x.indoor
    from v
    join (values
      ('Stadium One',      'Pitch A',  'Artificial turf', false),
      ('Stadium One',      'Pitch B',  'Artificial turf', false),
      ('Stadium One',      'Pitch C',  'Artificial turf', false),
      ('The Box',          'Indoor 1', 'Indoor',          true),
      ('The Box',          'Indoor 2', 'Indoor',          true),
      ('Nasr Sports Club', 'Pitch 2',  'Artificial turf', false)
    ) as x(venue, label, surface, indoor) on x.venue = v.name
  returning id, venue_id, label
)
-- Every pitch is open 18:00–24:00 daily, in hour slots.
insert into availability_rule (pitch_id, day_of_week, open_hour, close_hour, slot_minutes)
select p.id, d, 18, 24, 60 from p, generate_series(0, 6) as d;

-- OWN-007: EGP 300 through the evening, EGP 260 for the late hour.
insert into price_rule (pitch_id, valid_from, start_hour, end_hour, price_egp, deposit_egp)
select id, date '2026-01-01', 18, 23, 300, 100 from pitch
union all
select id, date '2026-01-01', 23, 24, 260, 100 from pitch;

-- The occupancy the owner calendar shows, entered through the channel it
-- really came from. Nothing here is an app booking yet — that is the one the
-- player is about to make.
with slot as (
  select
    p.id as pitch_id,
    v.name as venue,
    p.label,
    ((date '2026-08-18' + make_interval(hours => h)) at time zone 'Africa/Cairo') as starts_at,
    h
  from pitch p
  join venue v on v.id = p.venue_id
  cross join generate_series(18, 23) as h
)
insert into booking (pitch_id, during, state, source, captain_name, code, price_egp, deposit_egp)
select
  s.pitch_id,
  tstzrange(s.starts_at, s.starts_at + interval '1 hour', '[)'),
  'confirmed',
  x.source::booking_source,
  x.captain,
  generate_booking_code(),
  case when s.h = 23 then 260 else 300 end,
  100
from slot s
join (values
  ('Pitch A', 18, 'walk_in', 'Walk-in'),
  ('Pitch A', 20, 'phone',   'Amr Sabry'),
  ('Pitch A', 22, 'phone',   'Hesham Fouad'),
  ('Pitch B', 21, 'walk_in', 'Walk-in'),
  ('Pitch B', 22, 'walk_in', 'Walk-in'),
  ('Pitch C', 18, 'phone',   'Sameh Adel'),
  ('Pitch C', 19, 'phone',   'Sameh Adel'),
  ('Pitch C', 20, 'block',   'Blocked · watering'),
  ('Pitch C', 21, 'phone',   'Ziad Magdy'),
  ('Indoor 1', 20, 'phone',  'Hesham Fouad')
) as x(label, hour, source, captain)
  on x.label = s.label and x.hour = s.h
where s.venue in ('Stadium One', 'The Box');
