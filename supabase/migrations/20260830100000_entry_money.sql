-- What it costs to enter, and where the money goes.
--
-- Cups and leagues are paid to X League rather than to the venue, so three
-- things have to exist that did not: somewhere to tell a captain where to send
-- it, a way to discount it, and a record of what was actually owed once the
-- discounts were applied.
--
-- The fee is per club and the captain pays it. That is what `entry_fee_egp` on
-- the tournament and one registration per team already implied, and it means
-- one transfer to reconcile against one registration rather than N.
--
-- Nothing here moves money. There is no payment processor and no card: the
-- captain transfers to an account or a wallet out of band and says so, and a
-- human admits the club. `paid` is somebody's judgement recorded, not a
-- gateway's answer, and the schema is honest about that.

-- ---------------------------------------------------------------------------
-- Where to send it
-- ---------------------------------------------------------------------------

create type payment_channel_kind as enum ('instapay', 'bank', 'wallet', 'contact');

/**
 * A destination for entry money.
 *
 * `tournament_id` null means a platform default, shown for any cup that has
 * named none of its own. That way the usual accounts are entered once and a
 * particular cup can still override them — a charity cup collecting somewhere
 * else does not force every other cup to repeat itself.
 *
 * `contact` is a channel like the rest because it is one: some captains will
 * want to agree an arrangement with a person before sending anything, and a
 * number to call is a legitimate answer to "how do I pay".
 */
create table payment_channel (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournament(id) on delete cascade,
  kind          payment_channel_kind not null,
  label         text not null,
  value         text not null,
  instructions  text,
  active        boolean not null default true,
  sort          smallint not null default 0,
  created_at    timestamptz not null default now()
);

create index payment_channel_by_tournament on payment_channel (tournament_id, sort) where active;

alter table payment_channel enable row level security;
revoke all on table payment_channel from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Promo codes
-- ---------------------------------------------------------------------------

create type promo_kind as enum ('amount', 'percent', 'free');

/**
 * A code an administrator generates and gives to a captain, who types it at
 * checkout.
 *
 * All three shapes exist because the business reason differs: a flat amount off
 * a known fee, a percentage that travels across cups priced differently, and a
 * free entry for an invited or sponsored club. `free` is its own kind rather
 * than a hundred percent so it reads as what it is wherever it is shown.
 *
 * `tournament_id` null means the code works on any cup. `max_uses` null means
 * unlimited, which is a real thing an administrator may want for a public
 * launch code and a dangerous thing to make the default, so it is not.
 */
create table promo_code (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  kind          promo_kind not null,
  amount_egp    integer,
  percent       smallint,
  tournament_id uuid references tournament(id) on delete cascade,
  max_uses      integer not null default 1,
  used_count    integer not null default 0,
  expires_at    timestamptz,
  active        boolean not null default true,
  note          text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),

  -- Each kind carries exactly the field it needs and not the others, so a
  -- percent code cannot quietly also hold an amount that something later reads.
  constraint promo_shape check (
    (kind = 'amount'  and amount_egp is not null and amount_egp > 0 and percent is null) or
    (kind = 'percent' and percent is not null and percent between 1 and 100 and amount_egp is null) or
    (kind = 'free'    and amount_egp is null and percent is null)
  )
);

alter table promo_code enable row level security;
revoke all on table promo_code from public, anon, authenticated;

/** One row per use, so a code can be traced to the entries it discounted. */
create table promo_redemption (
  id              uuid primary key default gen_random_uuid(),
  promo_code_id   uuid not null references promo_code(id) on delete cascade,
  registration_id uuid not null references tournament_registration(id) on delete cascade,
  redeemed_by     uuid references auth.users(id),
  amount_off_egp  integer not null,
  created_at      timestamptz not null default now(),
  unique (registration_id)
);

alter table promo_redemption enable row level security;
revoke all on table promo_redemption from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Spending SuPoints without spending the record of having played
-- ---------------------------------------------------------------------------

/**
 * Points spent against an entry fee.
 *
 * Deliberately a second ledger rather than a negative row in `point_ledger`.
 *
 * §5.3 says XP is activity and never ability, and the card's level is computed
 * from it — so a player who paid for a cup with points would watch their level
 * fall, and the ledger that is supposed to say what they did would instead say
 * what they bought. Earned stays earned. The spendable balance is earned minus
 * spent, and only this table moves when somebody redeems.
 */
create table point_spend (
  id              bigserial primary key,
  player_id       uuid not null references auth.users(id) on delete cascade,
  registration_id uuid references tournament_registration(id) on delete set null,
  points          integer not null check (points > 0),
  egp_off         integer not null check (egp_off >= 0),
  created_at      timestamptz not null default now()
);

create index point_spend_by_player on point_spend (player_id, created_at desc);

alter table point_spend enable row level security;
revoke all on table point_spend from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What a registration actually owed
-- ---------------------------------------------------------------------------

alter table tournament_registration
  add column if not exists fee_egp        integer not null default 0,
  add column if not exists promo_off_egp  integer not null default 0,
  add column if not exists points_spent   integer not null default 0,
  add column if not exists points_off_egp integer not null default 0,
  add column if not exists amount_due_egp integer not null default 0,
  add column if not exists paid_at        timestamptz,
  add column if not exists payment_note   text;

comment on column tournament_registration.payment_note is
  'What the captain says they sent and how — a reference, a wallet number, a time. Their claim, not a receipt.';

-- The rate, in the table that already holds this kind of number so it can be
-- changed from the console rather than by a deployment.
insert into policy_setting (key, value, description) values
  ('points_per_egp', 100,
   'SuPoints that buy one EGP off an entry fee.'),
  ('points_fee_share_pct', 50,
   'The most of an entry fee, as a percentage, that SuPoints may cover.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Reading it
-- ---------------------------------------------------------------------------

/**
 * Points this player could spend: earned, less already spent.
 *
 * Never the same question as their level, which reads the earning ledger alone.
 */
create or replace function my_points_balance()
returns integer
language sql stable security definer
set search_path = public, pg_temp as $$
  select greatest(0,
    coalesce((select sum(points) from point_ledger where player_id = auth.uid()), 0)
    - coalesce((select sum(points) from point_spend where player_id = auth.uid()), 0)
  )::integer;
$$;

/** Where to send the money for this cup: its own channels, or the platform's. */
create or replace function tournament_payment_channels(p_tournament_id uuid)
returns table (kind payment_channel_kind, label text, value text, instructions text)
language sql stable security definer
set search_path = public, pg_temp as $$
  select c.kind, c.label, c.value, c.instructions
    from payment_channel c
   where c.active
     and c.tournament_id = p_tournament_id
   union all
  select c.kind, c.label, c.value, c.instructions
    from payment_channel c
   where c.active
     and c.tournament_id is null
     and not exists (
       select 1 from payment_channel o
        where o.tournament_id = p_tournament_id and o.active
     )
   order by 1, 2;
$$;

/**
 * What entering would cost, before anybody commits to it.
 *
 * Writes nothing: a captain trying a code, or moving the points slider, is
 * asking a question rather than making a decision. `reason` is null when the
 * code was accepted and says why when it was not, because "invalid" tells
 * somebody holding a code from a person they trust nothing they can act on.
 */
create or replace function registration_quote(
  p_tournament_id uuid,
  p_promo_code    text default null,
  p_points        integer default 0
)
returns table (
  fee_egp        integer,
  promo_off_egp  integer,
  points_spent   integer,
  points_off_egp integer,
  amount_due_egp integer,
  points_balance integer,
  promo_ok       boolean,
  reason         text
)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_fee        integer;
  v_promo      promo_code%rowtype;
  v_promo_off  integer := 0;
  v_ok         boolean := true;
  v_reason     text;
  v_balance    integer := my_points_balance();
  v_per_egp    integer := greatest(1, policy_value('points_per_egp'));
  v_share      integer := greatest(0, least(100, policy_value('points_fee_share_pct')));
  v_cap        integer;
  v_points_off integer := 0;
  v_spend      integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = 'insufficient_privilege';
  end if;

  select t.entry_fee_egp into v_fee from tournament t where t.id = p_tournament_id;
  if v_fee is null then
    raise exception 'No such cup.' using errcode = 'no_data_found';
  end if;

  if nullif(trim(coalesce(p_promo_code, '')), '') is not null then
    select * into v_promo from promo_code
     where code = upper(trim(p_promo_code));

    if v_promo.id is null then
      v_ok := false; v_reason := 'That code is not recognised.';
    elsif not v_promo.active then
      v_ok := false; v_reason := 'That code is no longer active.';
    elsif v_promo.expires_at is not null and v_promo.expires_at <= now() then
      v_ok := false; v_reason := 'That code has expired.';
    elsif v_promo.max_uses is not null and v_promo.used_count >= v_promo.max_uses then
      v_ok := false; v_reason := 'That code has been used already.';
    elsif v_promo.tournament_id is not null and v_promo.tournament_id <> p_tournament_id then
      v_ok := false; v_reason := 'That code is for a different cup.';
    else
      v_promo_off := case v_promo.kind
                       when 'free'    then v_fee
                       when 'amount'  then least(v_promo.amount_egp, v_fee)
                       when 'percent' then round(v_fee * v_promo.percent / 100.0)::integer
                     end;
    end if;
  end if;

  -- Points buy down what is left after the code, but never more than their
  -- share of the original fee — so a discount and points cannot combine into
  -- somebody entering a paid cup having paid nothing.
  v_cap := floor(v_fee * v_share / 100.0)::integer;
  v_points_off := least(
    greatest(0, v_fee - v_promo_off),
    v_cap,
    floor(least(greatest(coalesce(p_points, 0), 0), v_balance) / v_per_egp)::integer
  );
  v_spend := v_points_off * v_per_egp;

  return query select
    v_fee,
    v_promo_off,
    v_spend,
    v_points_off,
    greatest(0, v_fee - v_promo_off - v_points_off),
    v_balance,
    v_ok,
    v_reason;
end;
$$;

revoke execute on function public.my_points_balance() from public, anon;
grant execute on function public.my_points_balance() to authenticated;

revoke execute on function public.tournament_payment_channels(uuid) from public, anon;
grant execute on function public.tournament_payment_channels(uuid) to authenticated;

revoke execute on function public.registration_quote(uuid, text, integer) from public, anon;
grant execute on function public.registration_quote(uuid, text, integer) to authenticated;
