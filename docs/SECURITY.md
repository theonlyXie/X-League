# X League — the security pass

A review of the whole product from the outside in, and then an attempt to break
it from the inside. What follows is what was tried, what held, what did not, and
the four decisions that are yours rather than mine.

Re-run the whole thing at any time:

```
npm run security                      # the repository: secrets, code, dependencies
psql -f supabase/tests/security_probe.sql   # the schema: eight invariants
supabase/tests/run_all.sh             # everything, 730 cases
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
| Claim a staff account | no such function any more — see F2 |
| Browse venues, cups, the boards | allowed, and meant to be |
| **Ask whether a phone number has an account** | answered, forty times an hour — see F1 |

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

## Closed since this pass

**F1 · Rate limited.** `auth_email_for_sign_in` still answers — the sign-in
screen needs it before there is a session — but the part worth protecting is now
allowanced: forty lookups an hour from one address, keyed on the `x-forwarded-for`
the gateway sets. Past the allowance the function still returns the derived
address, so sign-in keeps working, and returns `exists_already` as **null**
rather than false. Null means "not saying", and the client reads it as "ask
GoTrue and report what it says". Answering false would have been worse than
saying nothing: it would send somebody who has an account to create a second.

Degrading rather than refusing is deliberate. Egypt is heavily carrier-NAT'd and
one address is routinely a whole neighbourhood, so a limit that locked people out
would be a worse bug than the one it fixed.

**F2 · There is no unclaimed console account.** The old answer was
`staff_set_first_password`, callable by anybody, which set the first password on
any staff account that did not have one — so every account created sat claimable
by whoever guessed the username, and `staff_auth_status` told an anonymous caller
which usernames those were.

Hardening it would have meant asking for a code. But if an account must hold a
code before it can be claimed, it may as well hold a password too — and then
there is nothing for the function to act on. So both are gone rather than
guarded: `admin_create_console_account` creates the account with an unguessable
password already on it and hands back a recovery code, and `staff_reset_password`
— which has always required a hashed code and locked after five wrong ones — is
the only door. The anon surface got smaller instead of more complicated, and
`access_probe` asserts the shorter list.

**F3 · Sign-up is allowanced too.** Two limits, because they protect against
different things: `sign_up_call` counts every call including the ones that fail
validation, which stops the function's own "that number already has an account"
being used as a free oracle; `sign_up_made` counts accounts actually created.
120 and 30 an hour per address — far past any real group of friends signing up
together at a pitch, and far short of what an abuse run wants.

Both F1 and F3 key on `request_ip()`, which returns null when there is no request
context at all. A direct `psql` connection is already inside, and lumping the
suites into one shared bucket would have made them fail in a different place
each run.

**Dependencies.** The console's critical advisory is gone: `next` is on 16.3.4
and `sharp` came with it. `js-yaml` — reached only through `@expo/xcpretty`,
which pretty-prints Xcode build output — is pinned to 4.3.2 by an `overrides`
entry in the app's `package.json` rather than by the SDK-wide bump `npm audit fix`
wanted, which moved fifty-four Expo packages to fix one build-time DoS.
`npm run security` now reports nothing standing.

---

## Open — your decisions, not mine

**F4 · Test accounts are live in production.** `Basel Elsayed`,
`Salma Rashad`, `Karim Tarek` and `Test Squad 1` through `7`, plus seven
`a9000000-…` players sitting in a club called "QA Test FC". They have no
password and no email, so nobody can sign in as them, but they are real rows
that can appear in a squad, a club and a table. This is the same class of defect
the product has been clearing for weeks — a screen showing something that is not
true — and it needs a decision about which of them the demo account still
depends on before they are deleted. Nothing in this repository can make that
decision, and a migration that deleted them would be a migration that might
delete the account App Review signs in with.
*Severity: low as a vulnerability, higher as a correctness problem.*

**Leaked-password protection is off** for this project. It is one toggle in the
Supabase dashboard, and worth turning on for the console's own sign-in — but note
it will not cover player sign-up, because `sign_up` writes `auth.users` directly
rather than going through GoTrue. That is the same trade F3 describes and the
reason the throttle lives in the function.

## Carried on purpose

Eighteen dependency advisories, every one of them in the bundler and the
prebuild tooling — Metro, `@expo/config-plugins`, `xcode`, `image-size`. None of
their code is in the APK; the attack they describe is feeding a malicious asset
to a build, and the assets are ours. `npm audit fix` resolves none of them: it
rewrites three hundred lines of lockfile and leaves the count at eighteen,
because the fixed versions sit outside what Expo SDK 57 pins, and going past
that pin has broken this build before. They are listed by name in
`scripts/security-check.mjs`, so a *new* advisory in anything else still fails
the check — which is how `js-yaml` was noticed, and why it is pinned by an
override rather than added to that list.

The Supabase linter reports 200 `SECURITY DEFINER` functions callable by
`anon` or `authenticated`, and 43 tables with RLS on and no policies. Both are
this project's architecture rather than defects: the functions *are* the API, and
a table with no policy is a table nobody can read, which is the intent.
