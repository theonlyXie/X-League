-- The evening the design draws — Stadium One, Nasr City — anchored to *today*
-- rather than to a fixed date.
--
-- It used to say `date '2026-08-18'`, the Tuesday on the artboards. That made
-- the whole demo expire: run the app the following week and every screen is
-- empty, because the only inventory the database knows about is in the past.
-- The occupancy pattern below is still the one the artboards draw; only the day
-- it lands on moves.

truncate booking_event, booking, availability_rule, price_rule, pitch, venue restart identity cascade;

with v as (
  insert into venue (name, area, verification, lat, lon, entry_note, phone, amenities, house_rules, map_url) values
    ('Stadium One', 'Nasr City', 'verified', 30.060100, 31.330200,
     'Gate 2 · ask for Pitch A', '+20 100 000 0010',
     array['Floodlights', 'Changing rooms', 'Parking', 'Showers', 'Café', 'Ball provided'],
     'Studs allowed on turf. No metal blades. Two guests per player. Please clear the pitch on the hour — the next match starts immediately.',
     'https://maps.google.com/?q=30.0601,31.3302'),
    ('The Box', 'Nasr City', 'pending', 30.052900, 31.348800,
     'Reception, first floor', '+20 100 000 0020',
     array['Indoor', 'Air conditioning', 'Changing rooms', 'Parking'],
     'Indoor shoes only — no studs. Bibs provided at reception.',
     'https://maps.google.com/?q=30.0529,31.3488'),
    ('Nasr Sports Club', 'Nasr City', 'pending', 30.041500, 31.361000,
     null, '+20 100 000 0030',
     array['Floodlights', 'Parking', 'Seating'],
     'Members and their guests. Bring ID to the gate.',
     null)
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

-- OWN-007: EGP 300 through the evening, EGP 260 for the late hour. Valid from
-- well before today so a quote can be reproduced against it whenever this runs.
insert into price_rule (pitch_id, valid_from, start_hour, end_hour, price_egp, deposit_egp)
select id, current_date - 365, 18, 23, 300, 100 from pitch
union all
select id, current_date - 365, 23, 24, 260, 100 from pitch;

-- VEN-007: the media set P-04 shows. Placeholders, named as such — the pitch
-- page marks the photo frame as a placeholder rather than faking a photograph.
insert into venue_photo (venue_id, url, caption, sort_order)
select v.id, 'placeholder://pitch-' || n, x.caption, n
  from venue v
  cross join (values (0, 'Pitch A at night'), (1, 'Changing rooms'), (2, 'Gate 2')) as x(n, caption)
 where v.name = 'Stadium One';

-- The occupancy the owner calendar shows, entered through the channel it
-- really came from. Nothing here is an app booking yet — that is the one the
-- player is about to make.
--
-- Seeded for today and the next two evenings, so "Tonight" and "Tomorrow" on
-- P-03 both have something to show.
with day as (
  select current_date + d as on_date from generate_series(0, 2) as d
),
slot as (
  select
    p.id as pitch_id,
    v.name as venue,
    p.label,
    d.on_date,
    ((d.on_date + make_interval(hours => h)) at time zone 'Africa/Cairo') as starts_at,
    h
  from pitch p
  join venue v on v.id = p.venue_id
  cross join day d
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
