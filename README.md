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
| Onboarding | P-01 | `/onboarding` |
| Home | P-02 | `/` |
| Play search | P-03 | `/play` |
| Pitch detail | P-04 | `/play/pitch` |
| Checkout | P-05 | `/play/checkout` |
| Confirmation | P-06 | `/play/confirmation` |
| Chat inbox / thread | P-10–P-12, P-14 | `/chat` |
| Match lobby | P-13 | `/play/lobby` |
| Cups / tournament | P-15–P-20 | `/cups` |
| Player card | P-08 / P-09 | `/me` |
| Owner Today | O-01 | `/owner` |
| Owner Calendar | O-02 | `/owner/calendar` |
| Owner Bookings | O-03 | `/owner/bookings` |
| Owner Customers | O-04 | `/owner/customers` |
| Owner More | O-05–O-08 | `/owner/more` |
| Admin console | A-01–A-08 | `/admin` |

The three surfaces share one identity, so Player and Owner mode switch without
signing out (RBAC-005): the switch lives on the player card under **Workspace**,
and the black `OWNER` chip in the venue header switches back.

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

## Android APK

```bash
npm install
npx expo prebuild --platform android --non-interactive
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
# android/app/build/outputs/apk/release/app-release.apk
```

The release APK is arm64-v8a (typical phones) and debug-signed so it can be sideloaded. Or, with an Expo account: `npx eas-cli build --platform android --profile preview`.

## Not yet built

Arabic copy (the RTL toggle is on Owner → More), and a live API — all data is still fixture data.
