-- Three identities for exercising RBAC-002: a plain player, staff at Stadium
-- One, and staff at The Box.
--
-- These are created directly because no SMS provider is configured yet. The
-- real path that creates them is phone OTP (AUTH-001) — see the README. Do not
-- run this against a deployment with real users.

insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
   'authenticated', 'authenticated', '+201000000001', now(), now(), now(), '{}', '{}'),
  ('22222222-2222-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
   'authenticated', 'authenticated', '+201000000002', now(), now(), now(), '{}', '{}'),
  ('33333333-3333-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
   'authenticated', 'authenticated', '+201000000003', now(), now(), now(), '{}', '{}')
on conflict (id) do nothing;

insert into player_profile (id, display_name, phone, birth_year, preferred_area, terms_version, terms_accepted_at)
values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Basel Elsayed', '+201000000001', 1998, 'Nasr City', 'v1.1', now()),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'Salma Rashad',  '+201000000002', 1994, 'Nasr City', 'v1.1', now()),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'Karim Tarek',   '+201000000003', 1991, 'Nasr City', 'v1.1', now())
on conflict (id) do nothing;

insert into venue_staff (user_id, venue_id, role)
select '22222222-2222-2222-2222-222222222222'::uuid, id, 'manager'::venue_role from venue where name = 'Stadium One'
union all
select '33333333-3333-3333-3333-333333333333'::uuid, id, 'staff'::venue_role   from venue where name = 'The Box'
on conflict (user_id, venue_id) do nothing;
