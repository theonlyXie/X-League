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

One evening, followed end to end: Basel Elsayed finds a live 5-a-side slot at
Stadium One, holds it, pays a cash deposit at the gate, and the venue sees the
booking land in the same calendar that holds its phone and walk-in bookings.

| Screen | Spec | Route |
| --- | --- | --- |
| Home | P-02 | `/` |
| Play search | P-03 | `/play` |
| Pitch detail | P-04 | `/play/pitch` |
| Checkout | P-05 | `/play/checkout` |
| Confirmation | P-06 | `/play/confirmation` |
| Match lobby | P-13 | `/play/lobby` |
| Player card | P-08 / P-09 | `/me` |
| Owner Today | O-01 | `/owner` |
| Owner Calendar | O-02 | `/owner/calendar` |
| Admin Overview | A-01 | `/admin` |

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
  owner/                 owner tabs, Operative surfaces
  admin.tsx              the console's own fixed 1180pt canvas
src/
  theme/tokens.ts        every colour, radius and metric, lifted from the design
  theme/typography.ts    Inter faces by name + em→pt tracking
  components/            Txt, VoidMark, SlotGrid, tab bars, icons
  data/                  the design's fixture data, typed
  state/booking.tsx      slot selection, the hold countdown, owner check-in
```

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

AUTH-001: sign-in is a verified mobile number plus a one-time password.
AUTH-005: one identity carries the player role and any venue roles, which is
what makes the workspace switch in §3.1 possible without a second account.

`venue_staff` is the RBAC-002 answer — a person is staff *at named venues*,
stored as a row rather than a claim in a token, so revoking access takes effect
on the next call. `is_venue_staff()` is the predicate; `check_in_booking`,
`record_offline_booking` and `owner_day` all go through it.

The privileged functions no longer accept an `actor` argument. It was
forgeable, which made ADM-012's audit trail worthless; the actor is now derived
from the session by `current_actor()`. A hold also belongs to whoever took it,
so confirming or releasing someone else's is refused.

**SMS is not configured yet.** `auth/v1/otp` answers `phone_provider_disabled`
until an SMS provider is set up under Authentication → Providers → Phone in the
Supabase dashboard (Twilio, MessageBird, Vonage or Textlocal). The sign-in
screen says so in plain language rather than leaking the provider's error. Until
then, `supabase/seed_identities.sql` creates three test identities directly.

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

**Blocked on an SMS provider.** Phone OTP is built and the schema is live, but
Supabase has no SMS provider configured, so `requestOtp` cannot deliver a code
to a real handset. This is the one item that needs an account decision rather
than code.

**Partial.** Arabic covers the player surface; Owner Mode and admin are wired
to the database but untranslated. Cancellation and refunds are copy on the
checkout screen, not a code path.
