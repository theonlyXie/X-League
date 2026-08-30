-- A cup's payment details change from cup to cup.
--
-- The channels were per-tournament from the start, and the console could add
-- one and switch it off. That is not what running these actually looks like:
-- the InstaPay handle collecting for the Giza cup is not the one collecting for
-- the next, a wallet number changes hands, and the person who typed it wants to
-- correct it rather than switch it off and type it again.
--
-- `admin_set_payment_channel` already updates when given an id, so editing
-- needed no new function — only a console that offers it. Deleting did.

/**
 * Remove a channel outright.
 *
 * Deliberately a delete rather than a flag. A channel is a number to send money
 * to; one that is wrong or finished with should stop being on the page, not sit
 * there switched off waiting for somebody to switch it back on by accident. The
 * audit row is what remains, and it carries what was removed.
 */
create or replace function admin_delete_payment_channel(p_id uuid)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_channel payment_channel%rowtype;
begin
  if not is_platform('admin') then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_channel from payment_channel where id = p_id;
  if v_channel.id is null then
    return query select false, 'No such payment channel.';
    return;
  end if;

  delete from payment_channel where id = p_id;

  perform write_audit('payment_channel.removed', 'payment_channel', p_id,
    jsonb_build_object('kind', v_channel.kind, 'label', v_channel.label,
                       'value', v_channel.value, 'tournament_id', v_channel.tournament_id));

  return query select true, null::text;
end;
$$;

revoke execute on function public.admin_delete_payment_channel(uuid) from public, anon;
grant execute on function public.admin_delete_payment_channel(uuid) to authenticated;
