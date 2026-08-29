# X League

Egypt-first amateur-football platform: find a verified pitch, hold and confirm a
real slot, build a player identity from verified play, and give venue owners one
calendar that every booking channel lands in.

This repository implements the `X League.dc.html` design canvas — option **1a–1d**,
the committed booking spine — as a React Native app.

## Running it

```bash
npm install
npm start          # Expo dev server (press i / a / w)
npm run web        # web only
npm run typecheck  # tsc --noEmit
npm run build:web  # static web bundle
```

## What is built

A season, not one evening. A player finds a pitch, holds it, fills the squad,
plays, gets rated, and their card moves; the venue prices its hours, closes
what it cannot sell, takes cash at the gate and reconciles the week; the
platform verifies venues, moderates reports and can explain every privileged
action from the audit log.

Every screen reads live data. The only fixtures left are the fallbacks that
render when no database is configured, so the app can still be opened and
looked at with an empty `.env`.

### Player

| Screen | Spec | Route |
| --- | --- | --- |
| Home | P-02 | `/` |
| Play search | P-03 | `/play` |
| Pitch detail | P-04 | `/play/pitch` |
| Checkout | P-05 | `/play/checkout` |
| Confirmation | P-06 | `/play/confirmation` |
| Fill the squad | P-07 / P-11 | `/play/invite` |
| Player card | P-08 / P-09 | `/me` |
| Rate a match | P-09 | `/play/rate` |
| Teams | P-10 | `/teams` |
| Chat | P-12 / P-14 | `/chat` |
| Match lobby | P-13 | `/play/lobby` |
| Cups | P-15 – P-20 | `/cups` |
| Notifications | — | `/notifications` |
| Onboarding | P-01 | `/onboarding` |

### Venue

| Screen | Spec | Route |
| --- | --- | --- |
| Today | O-01 | `/owner` |
| Calendar | O-02 | `/owner/calendar` |
| Pricing | O-03 | `/owner/setup/pricing` |
| Closures | O-04 | `/owner/setup/closures` |
| Staff | O-05 | `/owner/setup/staff` |
| Money | O-06 | `/owner/money` |
| Venue profile | O-07 | `/owner/setup/profile` |
| Reviews | O-08 | `/owner/reviews` |

### Platform

`/admin` carries all of A-01 – A-08 in one console: overview, verification
queue, users and suspensions, moderation, ledger, policy settings and the audit
log. Which sections appear depends on the caller's platform role, though every
function checks authority for itself regardless.

The three surfaces share one identity, so Player and Owner mode switch without
signing out (RBAC-005): the switch lives on the player card under **Workspace**,
and the black `OWNER` chip in the venue header switches back.

## Building an APK

The native projects are not committed — `android/` and `ios/` are generated from
`app.json` by prebuild, so configuration lives in one place.

```bash
# Cloud build (needs a free Expo account; EAS generates and keeps the keystore)
npx eas login
npx eas build --platform android --profile preview   # -> installable .apk

# Local build (needs Android SDK 36 + JDK 17-21)
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
# -> android/app/build/outputs/apk/release/app-release.apk
```

`preview` produces an APK for sideloading; `production` produces an AAB for
Play. A local `assembleRelease` signs with the **debug** keystore — fine for
installing on a device, not for distribution. Generate a real keystore before
publishing.

To point a build at the database, set `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_VENUE_ID` and
`EXPO_PUBLIC_PITCH_ID` (locally in `.env`, or `eas env:create` for cloud
builds). Without them the APK still installs and runs — on fixtures, in demo
mode. The anon key is publishable by design and ships inside any client build.

Permissions are deliberately narrow: `INTERNET` and `VIBRATE`. Storage,
overlay and microphone permissions that arrive from library manifests are
stripped via `android.blockedPermissions`, because the app does not use them
and each one is something Play review would want justified.

## Layout

```
app/                     expo-router routes; directory structure is the URL structure
  (player)/              player tabs — the group adds no path segment
    play/                everything downstream of Play, so the Play tick stays
                         gold through the whole booking flow
    cups/  chat/         the other two tabs
  owner/                 owner tabs, Operative surfaces
    setup/               pricing, closures, staff, venue profile
  teams/  notifications  reachable from the profile rather than a tab
  admin.tsx              the console's own fixed 1180pt canvas
src/
  theme/tokens.ts        every colour, radius and metric, lifted from the design
  theme/typography.ts    Inter faces by name + em→pt tracking
  components/            Txt, VoidMark, SlotGrid, tab bars, icons
  components/operative.tsx  the Operative kit Owner Mode and admin share
  data/api.ts            the booking spine's RPCs
  data/discovery.ts      venues, reviews, cancellation, standing
  data/squad.ts          squads, invitations, teams, player search
  data/progress.ts       matches, peer ratings, XP
  data/social.ts         conversations, notifications, reports
  data/cups.ts           tournaments
  data/manage.ts         Owner Mode configuration and the admin console
  state/booking.tsx      slot selection, the hold countdown, owner check-in
```

Each `data/` module mirrors one migration, and every one converts snake_case to
camelCase once at the boundary — a screen never sees a database column name.

## The booking spine

`supabase/migrations/` holds the schema and the operations. The product's core
promise — one pitch-hour, one owner — is a database constraint, not application
code, because NFR-REL-002 cannot be honoured by careful callers alone:

```sql
exclude using gist (pitch_id with =, during with &&)
  where (state in ('held', 'pending_payment', 'confirmed', 'checked_in', 'completed'))
```

Two transactions reaching for the same interval cannot both commit; the loser
gets `23P01` and is handed the nearest alternatives (BKG-011). Only states that
actually occupy the pitch are in the predicate, so a cancellation, a no-show or
an expired hold releases the interval the moment its state changes.

A hold carries its own `expires_at`, so AC-03 is a fact about the row rather
than a timer in a client — the countdown on screen is derived from the server's
instant, and a backgrounded app resumes showing the truth. Every transition
goes through a Postgres function so the check and the write share a transaction
(§7.2), and every one writes a `booking_event` (ADM-012).

`source` is not optional on a booking: an app, phone, WhatsApp or walk-in
reservation is the same kind of thing in the same timeline, which is what makes
AC-05 work — staff enter a phone booking and it disappears from player search.

### Identity and staff scoping

AUTH-001 asks for a verified mobile number plus a one-time password, and that
is still where this is going. Until there is an SMS provider it is a mobile
number plus a password the person chooses — see below. AUTH-005: one identity
carries the player role and any venue roles, which is what makes the workspace
switch in §3.1 possible without a second account.

`venue_staff` is the RBAC-002 answer — a person is staff *at named venues*,
stored as a row rather than a claim in a token, so revoking access takes effect
on the next call. `is_venue_staff()` is the predicate; `check_in_booking`,
`record_offline_booking` and `owner_day` all go through it.

The privileged functions no longer accept an `actor` argument. It was
forgeable, which made ADM-012's audit trail worthless; the actor is now derived
from the session by `current_actor()`. A hold also belongs to whoever took it,
so confirming or releasing someone else's is refused.

**Sign-up is a password, not an OTP, until there is SMS.** Supabase answers
`phone_provider_disabled` to any phone signup while no SMS provider is
configured, which meant nobody could create an account at all. So `sign_up`
(in `20260822108600_password_auth.sql`) creates the account itself: a phone
number, a password, and a display name.

GoTrue authenticates on an email address, so each account carries a derived one
— `201000000042@xleague.app` — that exists only as a lookup key. It is never
shown, never sent to, and never asked for. `auth_email_for_phone` is the single
place that mapping lives, so moving to real phone OTP later means deleting one
function rather than unpicking a convention spread across two clients.

Why the account row is written directly rather than through GoTrue's signup:
that path sends a confirmation mail, is rate-limited to a couple an hour on the
built-in SMTP, and rejects domains with no MX record — all three wrong for an
address nobody will ever read. Sign-in through the normal password grant then
works unchanged, because GoTrue verifies the bcrypt hash this writes.

Numbers are normalised before anything else: `+201000000042`, `00201000000042`
and `01000000042` are one Egyptian mobile written three ways people actually
write it, and left alone they became three accounts with three cards. The
local-trunk rule is Egypt-specific, which is right while the product is
Egypt-only and is the line to revisit when it is not.

`sign_up` is the only anon-callable function in the schema that writes anything
real. What makes that acceptable is what it cannot write: it never touches
`platform_role`, so no sequence of calls produces an administrator.
`auth_probe.sql` asserts that directly.

**Signing up as a venue owner** creates the venue pending verification, makes
the caller its owner, and gives it one pitch so it can be booked at all. It
lands in the same admin verification queue as any other venue (VEN-006 /
ADM-008). It is not a second account — the same identity carries both roles.

### The player card

§5.1's model, in `supabase/migrations/20260818090400_player_card.sql`. A
self-assessment creates a **provisional** card, never a verified claim:
self-assessment supplies up to 70% until three verified matches, is
progressively replaced between three and nine, and is capped at 15% from ten.
Confidence follows the same ladder — Provisional, Emerging, Established.

OVR is a weighted summary of *position-relevant* attributes, from a versioned
`scoring_rule` (§5.1's central-midfielder weights are the published example).
The same attributes score 76 as a forward and 66 in midfield, which is the
point. Every snapshot records the rule version that produced it (PRO-004), and
snapshots are append-only, so changing position writes a new one rather than
overwriting history (PRO-011).

There is no match system yet, so every real card reads Provisional with zero
evidence — which is the honest state, not a placeholder.

### Language and direction

English LTR and Arabic RTL (NFR-LOC-001), switchable from the profile
(AUTH-002). Arabic uses IBM Plex Sans Arabic, Arabic-Indic numerals, EGP as
`٣٠٠ ج.م`, and Cairo-zone dates — all through `src/i18n/format.ts` rather than
scattered through screens.

Two bidi traps are handled deliberately, because both produced wrong output
before they were: two numerals either side of a neutral separator get reordered
and read as one number (`٤ من ٥ · ٢` rendered as `٤ من ٢٠٥`), so Arabic
phrasing keeps a word between them; and a meridiem written as a separate Latin
run jumps to the wrong side, so `pmLabel` composes it into the Arabic string.

On native, mirroring is a process-level setting — `I18nManager.forceRTL` needs
a reload — so the switch says so rather than pretending the layout flipped. On
web the document direction changes immediately.

### Access control

RLS is on for every table with no policy granting direct access, so the tables
are unreachable through the API. The only way in is a function, and each is
`SECURITY DEFINER` with a pinned `search_path`. A client cannot insert a booking
row and sidestep the exclusion constraint, because a client cannot touch the
table at all (RBAC-001).

`search_availability` and `nearest_alternatives` are callable by `anon` — §2
says a guest may browse. Everything that changes inventory needs a session:
`hold_slot` accepts an anonymous call only so it can answer "Sign in to hold a
slot" instead of a bare `42501`, and it writes nothing without `auth.uid()`.
`confirm_booking`, `release_hold`, `check_in_booking`, `record_offline_booking`
and `owner_day` require `authenticated`, and the venue-side three then check
the caller against `venue_staff` inside the function.

### Running it

```bash
# any Postgres 14+
psql -f supabase/migrations/20260818090000_booking_spine.sql
psql -f supabase/migrations/20260818090100_booking_operations.sql
psql -f supabase/migrations/20260818090200_access_control.sql
psql -f supabase/seed.sql        # the evening the design books

./supabase/tests/booking_spine_test.sh

# identity and staff scoping
psql -f supabase/seed_identities.sql
psql -f supabase/tests/rbac_probe.sql
psql -f supabase/tests/card_probe.sql
```

The test suite covers the release gates the database is responsible for —
AC-01, AC-02 (five concurrent holds, one winner), AC-03, AC-05, BKG-005,
BKG-009, BKG-011 and OWN-006 — and reseeds itself, so runs are independent.

Copy `.env.example` to `.env` to point the app at a database. Without it the
app runs on fixtures in demo mode; that switch is made in exactly one place,
`src/lib/supabase.ts`.

### Squads, matches and the card's evidence

A booking is a transaction; a match is a fact about people. `booking_participant`
is the middle: a squad place is a claim on inventory the captain already paid
for, so capacity is enforced in the database exactly like pitch occupancy is,
and a pending invitation holds that shirt the way a hold holds a pitch-hour.

A checked-in booking becomes a `match` with a team sheet drawn from the accepted
squad. Check-in is load-bearing — it is the venue's testimony that people turned
up, and without it a completed match would be a self-report, which is precisely
what the card is designed not to trust. The people on the sheet rate each other,
three independent raters make the match verified evidence, and the card is
rebuilt blending self-assessment with peer means at the weight §5.1's ladder
prescribes. An attribute nobody rated keeps its self-assessed value rather than
decaying toward a number no one asserted.

XP is an append-only ledger rather than a counter, so a total is explainable
line by line, and a unique index rather than careful code is what stops a match
paying twice.

### Paying: nothing up front

There is no deposit. A player books, turns up, and settles the whole price at
the venue on the day.

The spine was built the other way — a price rule carried a deposit, a booking
inherited it, a trigger raised an obligation for it, a late cancellation
forfeited it — and all of that reads from one source, `price_rule.deposit_egp`.
So `20260822108900_no_deposit.sql` changes the source rather than performing
surgery across nine migrations: with no deposit on any rule the machinery
downstream is inert rather than removed, and every existing case still passes
because each already handled a zero deposit correctly. The columns stay, so
reinstating a deposit later is a migration rather than a rewrite; what is gone
is any way to set one, because `set_price_rule` no longer takes the argument.

The money is still owed, and still recorded. Removing the deposit removed the
only thing a venue could mark collected, which would have left `venue_payouts`
and `admin_ledger` reading zero forever — not "no down payment" but "no
accounting". A confirmed booking now raises its whole price as a `balance`
obligation instead: same table, same states, same `record_payment`, due at the
venue rather than up front.

### Cancellation, and the policy P-05 states

The checkout screen tells players in both languages that cancellation is free
until the cutoff and that two unexcused no-shows in a season restrict booking.
Both are enforced. The cutoff and the limit are rows in
`policy_setting` rather than constants, so the admin console moves them without
a deploy, and the restriction is checked in `hold_slot` because that is the only
place inventory is claimed and therefore the only place the promise can be kept.

Cancelling returns the hour to inventory the moment it commits — the exclusion
constraint only counts live states, so no sweeper is in the loop.

### Tournaments

A fixture is not a separate kind of match. It points at the same `match` row the
spine produces, so a cup game is booked, checked in, rated and credited exactly
like any other, and the exclusion constraint stays the only thing deciding
whether a pitch-hour is sold twice. Standings are appended snapshots rather than
a live aggregate, because a table shown mid-tournament has to be reproducible
afterwards and a points rule that changes must not rewrite history.

### Conversations

A conversation is derived from a relationship that already exists — a squad, a
team, or two people who have shared a pitch. Player search honours PRO-006
visibility, so messaging honours the same boundary; otherwise it is an open
channel to any account whose name somebody can guess. There is deliberately no
"new message" button.

A notification is a row rather than a push. Delivery is a separate concern, but
the record of what a player was told survives whether or not a device was
reachable.

## Design system

Three surface modes, from §4.1 of the SRS:

- **Void** (`#080808`) — player identity and competition. Cipher Gold
  (`#C6A34B`) is reserved for the one action that matters on each screen.
- **Operative** (`#F3EEE5`) — owner and admin. Denser type, 8–12pt corners,
  ink rather than gold for the active tab; gold means money.
- **Ceremony** — the confirmation moment, where the X-to-void mark is drawn
  at full size.

Type is Inter, loaded as five named faces because React Native does not
synthesise weights. `Txt` resolves the design's `em` tracking against the size
it is used at.

## Where the implementation departs from the artboards

- **No painted device chrome.** The artboards draw a phone bezel, a `9:41`
  status bar and a home indicator. A real app gets those from the OS, so screens
  reserve the safe-area insets instead of drawing over them.
- **Cups and Chat are inert.** They are in the tab bar because the spec's IA
  has them, but the design ships no screens behind them, so they are drawn
  disabled rather than filled with invented product.
- **Hold expiry exists.** The artboards only draw a running countdown. AC-03
  requires the hold to expire and the slot to return to inventory, so checkout
  has an expired state that releases the hold and offers the nearest
  alternative. Leaving checkout without confirming releases the hold too.
- **Touch targets meet the 44pt floor.** Several controls are drawn at 38pt;
  they keep their drawn size and gain `hitSlop`.
- **Icons are drawn, not typed.** `←`, `›`, `···`, `★` and `▲` are inline SVG so
  they scale and recolour with the rest of the design.
- **The X strokes are gradients.** Flat lines read as a hard cross and lose the
  convergence on the void.

## Not yet built

**Whole subsystems, no screens.** Tournaments (P-15–P-20), messaging and
recruitment (P-10–P-12, P-14), the remaining owner screens (O-03–O-08) and
admin sections (A-02–A-08). These are the M2/M3 surfaces; most have no
artboards, so building them means designing them too. Of the 26 entities in
§7.1 the schema carries 8 — Team, Match, PeerRating, PointLedger, Message,
Tournament and the rest of the M2/M3 tables do not exist.

**Screens on fixtures.** Home (P-02) and the admin console (A-01) read no live
data at all. Venue discovery is fixtures everywhere: the pitch the app books is
the one named in `.env`, so search returns a list of one real pitch dressed in
fixture venues. The card's form and rater tiles read empty for a real account,
because peer ratings, XP and levels have no tables behind them yet.

**Phone OTP, when there is an SMS provider.** The password path above is what
runs today and needs no provider. Switching to OTP later is a provider account,
an SMS provider under Authentication → Providers → Phone, and deleting the
derived-address mapping — the rest of the identity model is unchanged.

**Partial.** Arabic covers the player surface; Owner Mode and admin are wired
to the database but untranslated. Cancellation and refunds are copy on the
checkout screen, not a code path.
