# X League

Egypt-first amateur-football platform: find a verified pitch, hold and confirm a
real slot, build a player identity from verified play, and give venue owners one
calendar that every booking channel lands in.

This repository implements the `X League.dc.html` design canvas — option **1a–1d**,
the committed booking spine — as a React Native app.

## Quick start (demo mode — no backend)

```bash
npm install
npm start          # Expo dev server (press a for Android)
```

No `.env` file is required. The app runs on **local fixtures + AsyncStorage**:
bookings, profile, chat, venue submissions, and owner check-in all persist on device.

### Demo script

1. **Onboarding** → set position and scores → Home
2. **Play** → pick a venue → hold a slot → confirm → ceremony screen
3. **Me → Owner mode** → Today shows your booking; check in at the gate
4. **Me → Register your venue** → submit → **Admin → Venues** → Approve → venue appears in Play
5. **Chat, Cups, Bookings** — fixture data with local message persistence

## Running it

```bash
npm start          # Expo dev server (press i / a / w)
npm run web        # web only
npm run typecheck  # tsc --noEmit
npm run build:web  # static web bundle
npm run build:apk  # Android release APK (arm64)
```

## Screens

| Screen | Spec | Route |
| --- | --- | --- |
| Sign-in (live only) | AUTH-001 | `/sign-in` |
| Onboarding | P-01 | `/onboarding` |
| Home | P-02 | `/` |
| Play search | P-03 | `/play` |
| Pitch detail | P-04 | `/play/pitch` |
| Checkout | P-05 | `/play/checkout` |
| Confirmation | P-06 | `/play/confirmation` |
| My bookings | P-07 | `/bookings` |
| Player card | P-08 / P-09 | `/me` |
| Chat inbox / thread | P-10–P-12, P-14 | `/chat` |
| Match lobby | P-13 | `/play/lobby` |
| Cups / tournament | P-15–P-20 | `/cups` |
| Owner register / pending | — | `/owner/register`, `/owner/pending` |
| Owner Today | O-01 | `/owner` |
| Owner Calendar | O-02 | `/owner/calendar` |
| Owner Bookings | O-03 | `/owner/bookings` |
| Owner Customers | O-04 | `/owner/customers` |
| Owner More | O-05–O-08 | `/owner/more` |
| Admin console | A-01–A-08 | `/admin` |

Player, Owner, and Admin share one identity (RBAC-005): switch workspaces from **Me** without signing out.

## Layout

```
app/                     expo-router routes
  (player)/              player tabs
    play/                booking flow (Play tab stays gold)
  owner/                 owner tabs + register/pending
  admin.tsx              admin console (1180pt canvas)
  sign-in.tsx            phone OTP (live mode only)
src/
  state/                 booking, profile, venues, messages, session
  lib/supabase.ts        Supabase client; demo vs live gate
  data/api.ts            Postgres RPC wrappers (live mode)
supabase/
  migrations/            booking spine schema + RPCs
  setup_remote.sql       one-file seed for Supabase SQL Editor
```

## Demo vs live mode

| | Demo (default) | Live (Supabase) |
| --- | --- | --- |
| Trigger | No `.env` | `EXPO_PUBLIC_SUPABASE_URL` + anon key in `.env` |
| Auth | Local onboarding only | Phone OTP sign-in |
| Bookings | AsyncStorage + fixtures | Server holds via `hold_slot` RPC |
| Venues | Fixtures + local owner approvals | DB seed + `list_player_venues` |
| Owner ops | Local sync + fixtures | `owner_arrivals`, `owner_day` RPCs |

Copy `.env.example` → `.env` when ready for live mode. See **Supabase setup** below.

## Persistence (demo mode)

Bookings, profile (onboarding → Void card), chat messages, venue owner submissions
(pending → admin approve/reject), check-in, and owner discount state are saved
locally with AsyncStorage.

### Owner venue signup

1. **Me → Register your venue** — submit name and area
2. Owner waits on pending screen; calendar tabs stay locked
3. **Admin → Venues** — approve or reject
4. Approved venues appear in **Play** search; owner mode unlocks with the venue name

## Supabase setup (when ready)

Project: **ymuknkhapibmtqkrlmia** — https://ymuknkhapibmtqkrlmia.supabase.co

1. Copy `.env.example` → `.env` and add URL + anon key
2. Supabase **SQL Editor** → run `supabase/setup_remote.sql`
3. `npm run supabase:setup` — writes venue/pitch UUIDs to `.env`
4. Enable **Phone auth + SMS** in Supabase dashboard (or use `supabase/seed_identities.sql` for dev)
5. **Admin console (web):** open `/admin` — requires a row in `platform_admin`. Salma Rashad (`22222222-…`) is seeded by `setup_remote.sql` and `seed_identities.sql`. Overview KPIs, ledger, audit trail, and venue approval queue read from Supabase RPCs when `.env` is set.

Migrations live in `supabase/migrations/`. Do not re-run the base migration if
`search_availability` already works on your project.

## Android APK

```bash
npm install
npm run build:apk
# android/app/build/outputs/apk/release/app-release.apk
```

arm64-v8a, debug-signed for sideloading. Or: `npx eas-cli build --platform android --profile preview`.

## Not yet built

- Chat / cups backend sync (local fixtures + AsyncStorage work offline)

## Language

Tap **ع** / **EN** in the **top-right corner** (player screens) or next to the owner chip
to switch Arabic ↔ English. Arabic enables RTL. Choice persists.

## Payments

**Cash at the gate only.** No in-app or card payments. The player confirms a booking,
brings the deposit to the venue, and the owner taps **Check in · collect** to confirm
cash was received.
