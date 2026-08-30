-- The console side of entry money.
--
-- Everything here is a moderator's or an administrator's, and every one of them
-- writes an audit row, because these are the decisions that move money: where a
-- cup's fees are sent, and who gets in for less than the asking price.

/** Where a cup's money goes. `p_tournament_id` null sets a platform default. */
create or replace function admin_set_payment_channel(
  p_id            uuid,
  p_tournament_id uuid,
  p_kind          payment_channel_kind,
  p_label         text,
  p_value         text,
  p_instructions  text default null,
  p_active        boolean default true,
  p_sort          smallint default 0
)
returns table (ok boolean, channel_id uuid, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if not is_platform('admin') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  if length(coalesce(trim(p_label), '')) < 2 or length(coalesce(trim(p_value), '')) < 2 then
    return query select false, null::uuid, 'A channel needs a label and a value.';
    return;
  end if;

  if p_id is null then
    insert into payment_channel (tournament_id, kind, label, value, instructions, active, sort)
    values (p_tournament_id, p_kind, trim(p_label), trim(p_value), nullif(trim(coalesce(p_instructions,'')), ''),
            coalesce(p_active, true), coalesce(p_sort, 0))
    returning id into v_id;
  else
    update payment_channel
       set tournament_id = p_tournament_id,
           kind = p_kind,
           label = trim(p_label),
           value = trim(p_value),
           instructions = nullif(trim(coalesce(p_instructions,'')), ''),
           active = coalesce(p_active, true),
           sort = coalesce(p_sort, 0)
     where id = p_id
    returning id into v_id;

    if v_id is null then
      return query select false, null::uuid, 'No such payment channel.';
      return;
    end if;
  end if;

  perform write_audit('payment_channel.set', 'payment_channel', v_id,
    jsonb_build_object('kind', p_kind, 'label', p_label, 'tournament_id', p_tournament_id));

  return query select true, v_id, null::text;
end;
$$;

/** Every channel, cup-specific and default, for the console's list. */
create or replace function admin_payment_channels()
returns table (
  id uuid, tournament_id uuid, tournament_name text,
  kind payment_channel_kind, label text, value text,
  instructions text, active boolean, sort smallint
)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform('support') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select c.id, c.tournament_id, t.name, c.kind, c.label, c.value, c.instructions, c.active, c.sort
    from payment_channel c
    left join tournament t on t.id = c.tournament_id
   order by c.tournament_id nulls first, c.sort, c.label;
end;
$$;

/**
 * Mint a code for a captain to type at checkout.
 *
 * The code is normalised to upper case on the way in and matched that way on
 * the way out, so a captain typing what they were sent in lower case is not
 * told their code does not exist.
 *
 * `p_code` null generates one. Administrators asked for the freedom to shape
 * these to the business, so all three kinds are here and the choice of which is
 * theirs; what is not theirs is a code that means two things at once, which the
 * table's own constraint refuses.
 */
create or replace function admin_create_promo_code(
  p_kind          promo_kind,
  p_amount_egp    integer default null,
  p_percent       smallint default null,
  p_tournament_id uuid default null,
  p_max_uses      integer default 1,
  p_expires_at    timestamptz default null,
  p_note          text default null,
  p_code          text default null
)
returns table (ok boolean, code text, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_id   uuid;
  i integer;
begin
  if not is_platform('admin') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  v_code := upper(nullif(trim(coalesce(p_code, '')), ''));
  if v_code is null then
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
  end if;

  -- Aliased, because this function's OUT parameter is also called `code` and
  -- Postgres resolves the bare name to the variable, not the column.
  if exists (select 1 from promo_code pc where pc.code = v_code) then
    return query select false, null::text, 'That code already exists.';
    return;
  end if;

  begin
    insert into promo_code (code, kind, amount_egp, percent, tournament_id, max_uses, expires_at, note, created_by)
    values (v_code, p_kind, p_amount_egp, p_percent, p_tournament_id,
            greatest(1, coalesce(p_max_uses, 1)), p_expires_at,
            nullif(trim(coalesce(p_note, '')), ''), auth.uid())
    returning id into v_id;
  exception
    when check_violation then
      -- The table refuses a code that carries the wrong field for its kind. Say
      -- which, rather than passing a constraint name to somebody in a browser.
      return query select false, null::text,
        case p_kind
          when 'amount'  then 'An amount code needs an amount in EGP, and no percentage.'
          when 'percent' then 'A percentage code needs a percentage between 1 and 100, and no amount.'
          else 'A free code carries neither an amount nor a percentage.'
        end;
      return;
  end;

  perform write_audit('promo.created', 'promo_code', v_id,
    jsonb_build_object('code', v_code, 'kind', p_kind, 'amount_egp', p_amount_egp,
                       'percent', p_percent, 'tournament_id', p_tournament_id,
                       'max_uses', p_max_uses));

  return query select true, v_code, null::text;
end;
$$;

/** Every code, with how much of it is left. */
create or replace function admin_promo_codes(p_limit integer default 200)
returns table (
  id uuid, code text, kind promo_kind, amount_egp integer, percent smallint,
  tournament_id uuid, tournament_name text, max_uses integer, used_count integer,
  expires_at timestamptz, active boolean, note text, created_at timestamptz
)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform('support') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select p.id, p.code, p.kind, p.amount_egp, p.percent, p.tournament_id, t.name,
         p.max_uses, p.used_count, p.expires_at, p.active, p.note, p.created_at
    from promo_code p
    left join tournament t on t.id = p.tournament_id
   order by p.created_at desc
   limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;

/** Turn one off, or back on. Codes are never deleted — the redemptions refer to them. */
create or replace function admin_set_promo_active(p_id uuid, p_active boolean)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_code text;
begin
  if not is_platform('admin') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  update promo_code set active = coalesce(p_active, true) where id = p_id returning code into v_code;
  if v_code is null then
    return query select false, 'No such code.';
    return;
  end if;

  perform write_audit(case when p_active then 'promo.enabled' else 'promo.disabled' end,
                      'promo_code', p_id, jsonb_build_object('code', v_code));
  return query select true, null::text;
end;
$$;

revoke execute on function public.admin_set_payment_channel(uuid, uuid, payment_channel_kind, text, text, text, boolean, smallint) from public, anon;
grant execute on function public.admin_set_payment_channel(uuid, uuid, payment_channel_kind, text, text, text, boolean, smallint) to authenticated;

revoke execute on function public.admin_payment_channels() from public, anon;
grant execute on function public.admin_payment_channels() to authenticated;

revoke execute on function public.admin_create_promo_code(promo_kind, integer, smallint, uuid, integer, timestamptz, text, text) from public, anon;
grant execute on function public.admin_create_promo_code(promo_kind, integer, smallint, uuid, integer, timestamptz, text, text) to authenticated;

revoke execute on function public.admin_promo_codes(integer) from public, anon;
grant execute on function public.admin_promo_codes(integer) to authenticated;

revoke execute on function public.admin_set_promo_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_promo_active(uuid, boolean) to authenticated;
