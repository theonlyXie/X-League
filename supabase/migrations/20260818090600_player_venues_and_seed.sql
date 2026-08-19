-- Player venue discovery + one-call demo seed for remote projects.

create or replace function list_player_venues()
returns table (
  venue_id uuid,
  venue_name text,
  area text,
  verification text,
  lat numeric,
  lon numeric,
  pitch_id uuid,
  pitch_label text,
  hourly_egp integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id,
    v.name,
    v.area,
    v.verification,
    v.lat,
    v.lon,
    p.id,
    p.label,
    coalesce(
      (select pr.price_egp from price_rule pr
        where pr.pitch_id = p.id
          and pr.valid_from <= current_date
          and (pr.valid_to is null or pr.valid_to > current_date)
        order by pr.start_hour
        limit 1),
      300
    )
  from venue v
  join pitch p on p.venue_id = v.id
  where v.verification in ('verified', 'pending')
  order by v.name, p.label;
$$;

grant execute on function list_player_venues() to anon, authenticated;

-- Idempotent demo seed — safe to call more than once on an empty project.
create or replace function seed_demo_evening()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_venues integer;
begin
  select count(*) into n_venues from venue;
  if n_venues > 0 then
    return jsonb_build_object('ok', true, 'skipped', true, 'venues', n_venues);
  end if;

  truncate booking_event, booking, availability_rule, price_rule, pitch, venue restart identity cascade;

  insert into venue (name, area, verification, lat, lon, entry_note) values
    ('Stadium One',      'Nasr City', 'verified',   30.060100, 31.330200, 'Gate 2 · ask for Pitch A'),
    ('The Box',          'Nasr City', 'pending',    30.052900, 31.348800, 'Reception, first floor'),
    ('Nasr Sports Club', 'Nasr City', 'pending',    30.041500, 31.361000, null);

  insert into pitch (venue_id, label, format, surface, indoor)
  select v.id, x.label, '5-a-side', x.surface, x.indoor
  from venue v
  join (values
    ('Stadium One',      'Pitch A',  'Artificial turf', false),
    ('Stadium One',      'Pitch B',  'Artificial turf', false),
    ('Stadium One',      'Pitch C',  'Artificial turf', false),
    ('The Box',          'Indoor 1', 'Indoor',          true),
    ('The Box',          'Indoor 2', 'Indoor',          true),
    ('Nasr Sports Club', 'Pitch 2',  'Artificial turf', false)
  ) as x(venue, label, surface, indoor) on x.venue = v.name;

  insert into availability_rule (pitch_id, day_of_week, open_hour, close_hour, slot_minutes)
  select p.id, d, 18, 24, 60 from pitch p, generate_series(0, 6) as d;

  insert into price_rule (pitch_id, valid_from, start_hour, end_hour, price_egp, deposit_egp)
  select id, date '2026-01-01', 18, 23, 300, 100 from pitch
  union all
  select id, date '2026-01-01', 23, 24, 260, 100 from pitch;

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

  return jsonb_build_object('ok', true, 'skipped', false, 'venues', (select count(*) from venue));
end;
$$;

grant execute on function seed_demo_evening() to anon, authenticated;
