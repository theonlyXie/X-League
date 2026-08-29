# X League — browser checks

What the SQL suites cannot tell you: what a person actually sees.

The 397 cases under `supabase/tests/` prove the database keeps its promises —
one pitch-hour has one owner, a venue's staff reach only their own venues, a
card cannot be rated into existence by one friend. None of that says whether
the screen in front of a player is showing them their own booking or a
character from the design file.

Every defect these checks were written for got past `tsc`, past review, and
past the SQL suite. All of them were obvious within seconds of opening the
rendered page.

## Why it has its own package.json

Same reason `admin/` does. The Expo app at the repository root is built by
`expo prebuild` and Gradle, and its `npm ci` runs on every push. Adding
Playwright there would pull a browser download into the APK build for a
dependency the app never ships. Nothing in here can affect that build.

## Running it

```
cd qa
npm install                 # once
npx playwright install chromium   # unless QA_CHROMIUM points at one
```

Then, with the app running (`npm run web` from the repository root):

```
npm run smoke               # no account, no writes — run this on every change
npm run leak                # needs accounts, reads only
npm run spine               # needs accounts, MAKES A REAL BOOKING
```

| Variable | For |
|---|---|
| `QA_BASE_URL` | Defaults to `http://localhost:8081` |
| `QA_CHROMIUM` | A browser binary, when Playwright's own is not installed |
| `QA_PLAYER_PHONE` / `QA_PLAYER_PASSWORD` | `leak`, `spine` |
| `QA_OWNER_PHONE` / `QA_OWNER_PASSWORD` | `leak` — an account on a venue's staff |
| `QA_VENUE` | `spine` — the venue to book at, as it appears in search |
| `QA_SLOT` | `spine`, optional — e.g. `8:00 PM` |
| `QA_SETTLE_MS` | How long a route may take to paint before it counts as blank. A ceiling, not a wait — default 5000, and CI raises it because a hosted runner is slower. |
| `QA_QUIET_MS` | How long after first paint to keep listening for console errors. Default 900. Lowering it turns the console assertion into a coin flip. |

## The three checks

**`smoke`** visits all 28 routes signed out and asserts each one rendered
something and left the console quiet. It needs no account and writes nothing,
which is what makes it the one to run habitually. The console half is the half
people skip, and it is the half that caught the worst bug of the review pass:
a React duplicate-key warning was the slot grid reporting that it had drawn two
chips with the same identity — a venue open from ten in the morning showed
`10:00` twice, and tapping the evening one held the morning hour.

**`leak`** signs in and asserts that no signed-in surface shows the design's
sample data. This is the one that matters most. The dominant failure of this
product was never a crash; it was a screen substituting a fixture for real data
and saying nothing — a venue owner shown three invented arrivals, one of them
instructing the gate to collect EGP 100 from a person who does not exist, with
the error text underneath in small grey type.

The sentinel list is in `fixtures.mjs`, and what is *missing* from it is
deliberate: `Stadium One`, `Basel Elsayed` and `Nasr City` are fixture values
that are also seeded rows, so a sentinel on them would fire on honest screens.
A check that cries wolf is a check people learn to skip.

**`spine`** books an hour for real and inspects the screens on the way through:
that the hour chips are the venue's own and all distinct, that checkout names
the right venue and states the cancellation cutoff *before* the decision, and
that the confirmation carries a generated booking code rather than the
fixture's. A refusal that keeps the player on checkout is reported as a pass,
because that is the correct behaviour — the bug was navigating to a
confirmation screen regardless of whether anything had been booked.

## What it does not cover

Honest list.

- **Sixteen screens have never been exercised against real data** — squads and
  invitations, chat, teams, cups on either side, the admin console, four owner
  Setup screens, onboarding. They render, and that is all `smoke` claims.
- **Arabic and RTL.** `npm run check:i18n` proves both locales carry the same
  keys; nothing here has ever looked at a mirrored layout.
- **Anything after the match.** Reporting a result needs a booking in the past,
  which needs either waiting or reaching into the database — the walk in the
  review pass moved a booking's time by hand to get there, and that is not
  something a browser script can honestly automate.
- **Contrast and layout.** The token ramp was fixed by computing the ratios,
  not by looking. A check that renders and measures them would be a good
  addition and does not exist yet.
