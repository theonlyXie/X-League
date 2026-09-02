# X League — the security pass

A review of the whole product from the outside in, and then an attempt to break
it from the inside. What follows is what was tried, what held, what did not, and
the four decisions that are yours rather than mine.

Re-run the whole thing at any time:

```
npm run security                      # the repository: secrets, code, dependencies
psql -f supabase/tests/security_probe.sql   # the schema: eight invariants
supabase/tests/run_all.sh             # everything, 635 cases
```

---

## What was tried, and what happened

Every attempt below was made against the live project, as the role named.

### As an ordinary signed-in player

| Attempt | Result |
|---|---|
| `select * from player_profile` | permission denied |
| `select * from booking` | permission denied |
| `select * from platform_role` | permission denied |
| Insert myself into `referee` | **allowed at the grant layer, refused by RLS** — fixed, see below |
| `admin_overview`, `admin_ledger`, `admin_audit` | Not authorised. |
| `admin_create_referee` — make myself a referee | refused |
| `admin_set_verification` — verify my own venue | refused |
| `tournament_entries` — read a cup's entry money | Not authorised. |
| `venue_customers` — another venue's names and phones | You do not have access to that venue. |
| `venue_payouts` — another venue's takings | You do not manage that venue. |
| `venue_staff_list` — another venue's staff | You do not manage that venue. |
| `booking_squad` — a stranger's match | You are not part of that match. |
| `referee_fixtures` as a non-referee | empty |
| `find_players` | respects each player's visibility |

### As a guest, with no account at all

| Attempt | Result |
|---|---|
| `select * from player_profile` | permission denied |
| `my_conversations`, `find_players` | permission denied for function |
| Hold a pitch | Sign in to hold a slot. |
| Claim a staff account | refused (none is claimable today — see F2) |
| Browse venues, cups, the boards | allowed, and meant to be |
| **Ask whether a phone number has an account** | **answered** — see F1 |

### The schema itself

- **47 tables, all with row-level security on, none granted to a client role.**
  Data is reached through functions or not at all.
- **202 `SECURITY DEFINER` functions, every one with a pinned `search_path`.**
  This is the classic way a Postgres application is taken over — a definer
  function that runs the caller's idea of what `player_profile` means — and it
  is closed everywhere.
- **21 functions reachable without an account**, all reads plus `sign_up` and
  the staff password paths. The list is asserted exactly by `access_probe`.
- **Storage**: two buckets, both capped at 3 MB, both restricted to JPEG/PNG/WebP,
  writes scoped to your own folder (avatars) or a club you may write the crest
  of. Reads are public, which is intended for a crest and a player photo.
- No service-role key exists anywhere in the repository, the history, or either
  deployment. Nothing in the app or the console can bypass a policy.

---

## Fixed in this pass

**S1 · The `referee` table was the only table in the project with grants.**
Postgres gives new tables in `public` to `anon` and `authenticated` by default.
Forty-six migrations revoked it; the referee migration, written the day before
this review, did not. Row-level security was on with no policies, so the
escalation was in fact refused — a player trying to insert themselves as a
referee got *"new row violates row-level security policy"* — but one setting
was the only thing between a signed-in stranger and a referee's badge, and the
project's rule is that no table is reachable at all. Revoked, and
`security_probe.sql` now asserts it for every table so it cannot come back.

**S2 · Three console lists answered an unauthorised caller with an empty list.**
`admin_club_queue`, `admin_venues` and `admin_referees` carried their
authorisation in a `WHERE` clause. Nothing leaked. But "there are no clubs
waiting" and "you may not see the clubs waiting" are different sentences, and
this product has spent weeks removing places where it said the first and meant
the second. They refuse out loud now, and the probe fails if a fourth appears.

**S3 · Two helpers had drifted open on Postgres's default grant** —
`is_blocked_between`, which answers whether two named people have blocked each
other, and a trigger body no client should be able to call. Both revoked, and
both classes are now asserted by the probe.

---

## Open — your decisions, not mine

**F1 · Anyone can ask whether a phone number has an X League account.**
`auth_email_for_sign_in` is callable without an account and answers truthfully,
with no rate limit. Walking every Egyptian mobile prefix produces a list of X
League users' phone numbers. The sign-in screen needs the answer — that is how
it knows whether to offer sign-in or sign-up — so this cannot simply be closed.
The options are a rate limit keyed on IP, a captcha in front of it, or removing
the distinction from the client and letting the sign-in attempt fail generically.
*Severity: medium — privacy, not access.*

**F2 · A staff account can be claimed by whoever gets there first.**
`staff_set_first_password(username, password)` is callable without an account and
sets the password on any staff account that does not have one yet.
`staff_auth_status(username)` — also open — says which usernames exist and which
are unclaimed, so an attacker is told exactly what to aim at. **Nothing is
claimable today**: the only accounts without a password are ten test rows with no
username at all. But the window opens every time you create a staff account and
closes only when that person signs in. The fix is to require the recovery code
for the first claim as well as for a reset, which is one migration and a small
change to the console's staff screen. *Severity: high when a staff account is
pending, none otherwise.*

**F3 · Sign-up bypasses Supabase Auth entirely.** `sign_up` writes `auth.users`
directly rather than going through GoTrue. That was a deliberate choice — it is
what makes a phone number and a password work as credentials — but it means
GoTrue's rate limiting, its captcha hook, and its leaked-password check never
run. An attacker can create accounts in a loop. The database's own guards
(`send_message` allows ten messages in ten seconds, `submit_report` deduplicates)
show the shape of the fix: a per-IP or per-number throttle inside `sign_up`.
*Severity: medium — abuse and junk data, not access.*

Related: Supabase's **leaked-password protection is off** for this project. It is
one toggle in the dashboard, and worth turning on for the console's own sign-in
— but note it will not cover player sign-up, for the reason above.

**F4 · Ten test accounts are live in production.** `Basel Elsayed`,
`Salma Rashad`, `Karim Tarek` and `Test Squad 1` through `7`, plus seven
`a9000000-…` players sitting in a club called "QA Test FC". They have no
password and no email, so nobody can sign in as them, but they are real rows
that can appear in a squad, a club and a table. This is the same class of defect
the product has been clearing for weeks — a screen showing something that is not
true — and it needs a decision about which of them the demo account still
depends on before they are deleted.
*Severity: low as a vulnerability, higher as a correctness problem.*

---

## Carried on purpose

Eighteen dependency advisories, every one of them in the bundler and the
prebuild tooling — Metro, `@expo/config-plugins`, `xcode`, `image-size`. None of
their code is in the APK; the attack they describe is feeding a malicious asset
to a build, and the assets are ours. `npm audit fix` resolves none of them: it
rewrites three hundred lines of lockfile and leaves the count at eighteen,
because the fixed versions sit outside what Expo SDK 57 pins, and going past
that pin has broken this build before. They are listed by name in
`scripts/security-check.mjs`, so a *new* advisory in anything else still fails
the check.

The Supabase linter reports 200 `SECURITY DEFINER` functions callable by
`anon` or `authenticated`, and 43 tables with RLS on and no policies. Both are
this project's architecture rather than defects: the functions *are* the API, and
a table with no policy is a table nobody can read, which is the intent.
