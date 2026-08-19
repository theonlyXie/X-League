-- X League — the booking spine.
--
-- §5.4 is what this schema exists to enforce: each pitch owns one canonical
-- inventory timeline, every channel writes into it, and only one hold or
-- confirmed booking may own a pitch-time interval. That last rule is a
-- database constraint rather than application code, because NFR-REL-002
-- ("no accepted checkout may create two confirmed bookings for the same
-- pitch-time interval") cannot be honoured by careful callers alone.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table venue (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  area          text        not null,
  -- VEN-006: verification status is part of what players are shown.
  verification  text        not null default 'pending'
                  check (verification in ('verified', 'pending', 'unverified')),
  -- The verified pin VEN-009 deep-links to.
  lat           numeric(9,6),
  lon           numeric(9,6),
  entry_note    text,
  created_at    timestamptz not null default now()
);

create table pitch (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid        not null references venue(id) on delete cascade,
  label         text        not null,
  format        text        not null default '5-a-side',
  surface       text        not null default 'Artificial turf',
  indoor        boolean     not null default false,
  -- OWN-002: a pitch can be taken out of service independently of its venue.
  operational   boolean     not null default true,
  created_at    timestamptz not null default now(),
  unique (venue_id, label)
);

-- OWN-007: base prices with effective dates, so a quote can always be
-- reproduced against the rule that was live when it was given.
create table price_rule (
  id            uuid primary key default gen_random_uuid(),
  pitch_id      uuid        not null references pitch(id) on delete cascade,
  -- Half-open [from, to); a null `valid_to` means "still in force".
  valid_from    date        not null,
  valid_to      date,
  -- Hour-of-day the rule covers, half-open [start_hour, end_hour).
  start_hour    smallint    not null check (start_hour between 0 and 23),
  end_hour      smallint    not null check (end_hour between 1 and 24),
  price_egp     integer     not null check (price_egp >= 0),
  deposit_egp   integer     not null default 0 check (deposit_egp >= 0),
  check (end_hour > start_hour)
);

-- §5.4: weekly opening rules, from which the saleable timeline is built.
create table availability_rule (
  id            uuid primary key default gen_random_uuid(),
  pitch_id      uuid        not null references pitch(id) on delete cascade,
  -- 0 = Sunday, matching extract(dow).
  day_of_week   smallint    not null check (day_of_week between 0 and 6),
  open_hour     smallint    not null check (open_hour between 0 and 23),
  close_hour    smallint    not null check (close_hour between 1 and 24),
  slot_minutes  smallint    not null default 60 check (slot_minutes > 0),
  check (close_hour > open_hour)
);

-- ---------------------------------------------------------------------------
-- Occupancy
-- ---------------------------------------------------------------------------

create type booking_state as enum (
  'held', 'pending_payment', 'confirmed', 'checked_in',
  'completed', 'expired', 'cancelled', 'no_show'
);

-- OWN-006 / AC-05: every occupancy item names the channel it came from, so a
-- phone booking is as real as an app booking and removes the slot from search.
create type booking_source as enum ('app', 'phone', 'whatsapp', 'walk_in', 'block');

create table booking (
  id            uuid primary key default gen_random_uuid(),
  -- The human reference on the confirmation card (BKG-006).
  code          text        unique,
  pitch_id      uuid        not null references pitch(id) on delete cascade,
  -- The interval itself. Half-open so 9–10 and 10–11 do not collide.
  during        tstzrange   not null,
  state         booking_state  not null,
  source        booking_source not null,

  captain_name  text,
  captain_phone text,

  -- §5.4: the quote is snapshotted at checkout and cannot silently change.
  price_egp     integer     not null default 0 check (price_egp >= 0),
  deposit_egp   integer     not null default 0 check (deposit_egp >= 0),

  -- BKG-002: a hold carries its own deadline, so expiry is a fact about the
  -- row rather than a timer running in some client.
  expires_at    timestamptz,

  checked_in_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A hold is the only state that has a deadline, and it must have one.
  constraint hold_has_deadline check (
    (state = 'held') = (expires_at is not null)
  ),
  constraint during_is_bounded check (
    not isempty(during)
    and lower_inc(during)
    and not upper_inc(during)
    and lower(during) is not null
    and upper(during) is not null
  )
);

-- The whole promise, in one constraint.
--
-- Only rows that actually occupy the pitch participate: an expired hold, a
-- cancellation or a no-show releases the interval the moment its state
-- changes, with no sweeper job in the loop. Two concurrent transactions
-- attempting the same interval cannot both commit — the loser gets
-- SQLSTATE 23P01 (exclusion_violation), which is AC-02.
alter table booking add constraint booking_no_overlap
  exclude using gist (
    pitch_id with =,
    during   with &&
  ) where (state in ('held', 'pending_payment', 'confirmed', 'checked_in', 'completed'));

create index booking_pitch_during_idx on booking using gist (pitch_id, during);
create index booking_state_expiry_idx on booking (state, expires_at)
  where state = 'held';

-- ADM-012 / BKG-012: every state transition is timestamped and auditable.
create table booking_event (
  id          bigserial primary key,
  booking_id  uuid        not null references booking(id) on delete cascade,
  at          timestamptz not null default now(),
  event       text        not null,
  actor       text        not null,
  from_state  booking_state,
  to_state    booking_state,
  detail      jsonb       not null default '{}'::jsonb
);

create index booking_event_booking_idx on booking_event (booking_id, at desc);

create or replace function touch_booking() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger booking_touch before update on booking
  for each row execute function touch_booking();
