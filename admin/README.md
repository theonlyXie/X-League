# X League — Admin

The dashboard X League staff run cups from. A separate deployment from the app,
in the same repository and against the same database.

It exists because the tournament organiser's half of the product had a backend,
a full test suite, and no caller: `create_tournament`, `set_tournament_state`,
`decide_registration`, `generate_fixtures`, `schedule_fixture` and
`record_fixture_result` were reachable in SQL and from nowhere else. Cups are a
platform concern rather than a venue one, so they are run from here rather than
from the phone.

## What it does

One page per cup, following the life of one:

1. **Create** it as a draft, at a venue, with a format, a size and an entry fee.
   A draft is invisible to players — `list_tournaments` hides it deliberately.
2. **Open** it, and captains can enter their teams from the app.
3. **Accept or decline** each entry. An entry is a request until somebody
   decides on it (TRN-004).
4. **Make the draw.** A league pairs every team with every other exactly once,
   and never twice in the same round.
5. **Schedule** each fixture onto a real booked pitch-hour. A fixture is played
   at a booking, not at a time typed into a form.
6. **Take the result** once the captain has reported that match in the app. The
   score is read off the match rather than entered here — a cup result that
   could disagree with the game actually played is the thing this avoids.

The table is computed from the fixtures. It is never submitted.

## Permissions

Nothing here is enforced in the browser. Every call goes to a `SECURITY
DEFINER` function that checks `auth.uid()` itself, and `can_run_tournament`
admits a venue's manager or a platform admin. Somebody who bypassed the
sign-in screen would get "You do not manage that tournament." from the
database rather than a cup.

Staff sign in with a **username and password** — they are not players, and the
account is not tied to a handset. The username maps to the same kind of lookup
address every account carries (`xie` becomes `xie@xleague.app`); typing the full
address works too. The dashboard then asks `my_platform_role` and says plainly
when the answer is nothing, rather than showing a wall of refusals.

A platform role is granted in the database, not from any screen:

```sql
insert into platform_role (user_id, role)
values ('<the user id from auth.users>', 'admin')
on conflict (user_id) do update set role = 'admin', active = true;
```

To create a staff account, or reset one's password:

```sql
-- Replace the two literals. Run once; it is idempotent.
select public.sign_up('<phone>', '<password>', '<display name>');
-- then grant the role with the insert above.
```

Staff accounts created by hand (rather than through `sign_up`) need an
`auth.identities` row alongside the `auth.users` one, or the account looks
half-made to everything that reads it.

## Deploying

Vercel, with **Root Directory** set to `admin`. Everything else is defaults —
Next.js is detected, `npm run build` is the build command.

Two environment variables, both of which are publishable by design and ship
inside any client build:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | the same project URL the app uses |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable key |

There is no service-role key here, or anywhere else in this repository. A
deployment missing both variables says so on the first screen instead of
failing at the first click.

## Locally

```
npm install
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run dev
```

`npm run check` typechecks it. It has its own `package.json` on purpose: the
Expo app at the repository root is built by `expo prebuild` and Gradle, and
nothing here should be able to affect that.
