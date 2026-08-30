-- A player has a face and a club has a crest.
--
-- Cards have been rendering a name on a coloured panel. That is fine for a
-- prototype and wrong for a product whose whole premise is that the card is
-- yours — a squad list of eight identical rectangles is not a team sheet, and a
-- league table of eight identical rows is not a league.
--
-- The image itself lives in Storage. This migration owns three things: the
-- column that says where it is, the buckets, and the rule about who may write
-- into them. The rule is the same one the rest of this schema uses — a person
-- writes only under their own id, and a crest only under a club they captain —
-- expressed as Storage policies because Storage is the only place that sees the
-- upload.

alter table player_profile add column if not exists photo_url text;

comment on column player_profile.photo_url is
  'Where the player''s photo is, not the photo. Null is a real answer and every surface renders initials for it.';

/**
 * The predicate the crest policy calls, taking the folder name as text.
 *
 * It exists rather than the policy calling `is_club_captain` directly for two
 * reasons. A Storage policy is evaluated as the caller, so the predicate has to
 * be reachable by `authenticated` — and `is_club_captain` is an internal that
 * every club write asks first, which the grants guard watches precisely so it
 * stays unreachable. And a folder name is text: casting it straight to uuid
 * makes an upload to a mistyped path fail with a cast error rather than a
 * refusal, so the shape is checked before the cast.
 *
 * It answers only about the caller, so it tells somebody nothing they did not
 * already know about themselves.
 */
create or replace function may_write_crest(p_folder text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select case
    when p_folder ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then exists (select 1 from club c where c.id = p_folder::uuid and c.captain_id = auth.uid())
    else false
  end;
$$;

revoke execute on function public.may_write_crest(text) from public, anon;
grant execute on function public.may_write_crest(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Buckets
-- ---------------------------------------------------------------------------

-- Guarded because the SQL suite runs against a bare Postgres with an auth shim
-- and no Storage. The buckets are a deployment concern; the column above and
-- the functions below are the part the suite can and does exercise.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then

    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('avatars', 'avatars', true, 3145728, array['image/jpeg','image/png','image/webp']),
      ('crests',  'crests',  true, 3145728, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do update
      set public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;

    -- Public to read: a card is shown to people who are not signed in, and a
    -- signed URL that expires would make a league table go blank overnight.

    execute $p$drop policy if exists avatars_are_public on storage.objects$p$;
    execute $p$create policy avatars_are_public on storage.objects
      for select to public using (bucket_id in ('avatars', 'crests'))$p$;

    -- Written only under your own id. `foldername[1]` is the first path
    -- segment, so `avatars/<uid>/face.jpg` is yours and nobody else's.
    execute $p$drop policy if exists avatars_are_mine on storage.objects$p$;
    execute $p$create policy avatars_are_mine on storage.objects
      for all to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;

    -- A crest belongs to whoever captains the club it is filed under.
    execute $p$drop policy if exists crests_belong_to_captains on storage.objects$p$;
    execute $p$create policy crests_belong_to_captains on storage.objects
      for all to authenticated
      using (bucket_id = 'crests' and public.may_write_crest((storage.foldername(name))[1]))
      with check (bucket_id = 'crests' and public.may_write_crest((storage.foldername(name))[1]))$p$;

  end if;
end $$;


-- ---------------------------------------------------------------------------
-- Saying where it is
-- ---------------------------------------------------------------------------

/** Point the card at an uploaded photo, or clear it. */
create or replace function set_my_photo(p_url text)
returns table (ok boolean, reason text)
language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_url text := nullif(trim(coalesce(p_url, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = 'insufficient_privilege';
  end if;

  -- A URL is accepted, not fetched. What stops somebody pointing the column at
  -- anything is the bucket policy above: the only place they can put an image
  -- is their own folder, and this is where they say they did.
  if v_url is not null and v_url !~ '^https?://' then
    return query select false, 'That is not a web address.';
    return;
  end if;

  update player_profile set photo_url = v_url where id = auth.uid();
  if not found then
    return query select false, 'You have no profile yet.';
    return;
  end if;

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Showing it
-- ---------------------------------------------------------------------------

drop function if exists my_profile();
create function my_profile()
returns table (
  player_id      uuid,
  display_name   text,
  phone          text,
  area           text,
  visibility     text,
  language       text,
  birth_year     smallint,
  photo_url      text,
  terms_version  text,
  suspended_until timestamptz,
  created_at     timestamptz
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select p.id, p.display_name, p.phone, p.preferred_area, p.visibility,
         p.language, p.birth_year, p.photo_url, p.terms_version,
         p.suspended_until, p.created_at
    from player_profile p
   where p.id = auth.uid();
$$;

drop function if exists my_card();
create function my_card()
returns table (
  display_name text, photo_url text, ovr smallint, position_code text, attributes jsonb,
  confidence text, evidence_count integer, self_weight numeric,
  rule_version text, snapshot_at timestamptz
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select pp.display_name, pp.photo_url, s.ovr, s.position, s.attributes, s.confidence,
         s.evidence_count, s.self_weight, s.rule_version, s.created_at
    from attribute_snapshot s
    join player_profile pp on pp.id = s.player_id
   where s.player_id = auth.uid()
   order by s.seq desc
   limit 1;
$$;

drop function if exists club_squad(uuid);
create function club_squad(p_club_id uuid)
returns table (
  player_id uuid, display_name text, photo_url text, role text, slot_kind text,
  state membership_state, is_captain boolean, ovr smallint
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select m.player_id,
         coalesce(p.display_name, 'Player'),
         p.photo_url,
         m.role, m.slot_kind, m.state,
         c.captain_id = m.player_id,
         (select s.ovr from attribute_snapshot s
           where s.player_id = m.player_id
           order by s.seq desc limit 1)
    from club_membership m
    join club c on c.id = m.club_id
    left join player_profile p on p.id = m.player_id
   where m.club_id = p_club_id
     and m.state in ('invited', 'active')
   order by
     case m.slot_kind when 'starter' then 0 when 'sub' then 1 else 2 end,
     c.captain_id = m.player_id desc,
     coalesce(p.display_name, '');
$$;

revoke execute on function public.set_my_photo(text) from public, anon;
grant execute on function public.set_my_photo(text) to authenticated;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;
revoke execute on function public.my_card() from public, anon;
grant execute on function public.my_card() to authenticated;
revoke execute on function public.club_squad(uuid) from public, anon;
grant execute on function public.club_squad(uuid) to authenticated;
