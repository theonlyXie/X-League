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
npm run rtl                 # no account needed, no writes — Arabic and mirrored
npm run wire                # needs accounts, reads only
npm run leak                # needs accounts, reads only
npm run spine               # needs accounts, MAKES A REAL BOOKING
```

| Variable | For |
|---|---|
| `QA_BASE_URL` | Defaults to `http://localhost:8081` |
| `QA_CHROMIUM` | A browser binary, when Playwright's own is not installed |
| `QA_PLAYER_PHONE` / `QA_PLAYER_PASSWORD` | `wire`, `leak`, `spine` |
| `QA_OWNER_PHONE` / `QA_OWNER_PASSWORD` | `wire`, `leak` — an account on a venue's staff. Optional for `rtl`, which uses it to check Owner Mode's live screens as well as its showcase ones. |
| `QA_VENUE` | `spine` — the venue to book at, as it appears in search |
| `QA_SLOT` | `spine`, optional — e.g. `8:00 PM` |
| `QA_SETTLE_MS` | How long a route may take to paint before it counts as blank. A ceiling, not a wait — default 5000, and CI raises it because a hosted runner is slower. |
| `QA_QUIET_MS` | How long after first paint to keep listening for console errors. Default 900. Lowering it turns the console assertion into a coin flip. |

## The five checks

**`smoke`** visits all 28 routes signed out and asserts each one rendered
something and left the console quiet. It needs no account and writes nothing,
which is what makes it the one to run habitually. The console half is the half
people skip, and it is the half that caught the worst bug of the review pass:
a React duplicate-key warning was the slot grid reporting that it had drawn two
chips with the same identity — a venue open from ten in the morning showed
`10:00` twice, and tapping the evening one held the morning hour.

**`rtl`** puts the app in Arabic and walks every route mirrored, asserting the
document really is in RTL, that the page does not scroll sideways, and that no
English from the app's own string table is on screen. The sentinels are read
out of `src/i18n/strings.ts` rather than copied, so they cannot go stale when
somebody rewords a button.

`npm run check:i18n` already proves both locales carry the same keys. What it
cannot prove is that a screen *reaches* for one — a hardcoded English label
passes key parity perfectly, because there is no key for it to be missing. The
first run failed 11 of 28 routes on exactly that: the Owner Mode tab bar, the
whole Setup menu and most of the money screen rendered English in both
languages, with correct Arabic sitting unused in the table beside them.

Give it `QA_OWNER_PHONE` and it runs Owner Mode a second time signed in. That
pass is not extra thoroughness — Owner Mode draws the design's sample shift
when signed out and the venue's real one when signed in, and they are different
code. `OCCUPANCY`, `CASH DUE` and `CONFLICTS` were hardcoded on the live branch
only, where no signed-out run could ever have reached them.

The three routes in `FIXTURE_COPY_WHEN_SIGNED_OUT` are exempt from the copy
assertion alone, and the exemption is printed on every run rather than applied
quietly. Direction and mirroring are still checked there. See the honest list
below for what that leaves undone.

**`wire`** signs in and asserts that every screen meant to show you your own
data actually asked the database for it, and that the database answered. It is
the check `leak` cannot be: a screen that calls a function it has no permission
to call renders *"No teams yet"* — the same words, to the pixel, as a screen
belonging to somebody who genuinely has no teams. No sentinel string separates
those two. A status code separates them instantly.

So it asserts on the wire rather than the pixels: nothing comes back 4xx or 5xx,
nothing is left unanswered, and a screen on the `MUST_REACH_BACKEND` list that
renders without opening a connection is a failure rather than a pass. That last
rule is the one that catches a screen quietly falling back to a fixture after
somebody has renamed the sample player out of `fixtures.mjs`.

`rtl` also asserts that no key name is on screen in either language. A screen
rendering `asOutSpdName` instead of its copy is not an English leak — a key is
not English — so no sentinel catches it, and that is exactly what nearly
shipped while the assessment questions were being converted to keys.

`wire` also prints each screen's call map, which is where it earns its keep beyond
the pass line. Its first run was green on all twenty surfaces and still showed
`my_profile`, `my_venues` and `my_platform_role` going out three times apiece on
every load — GoTrue emits both `SIGNED_IN` and `INITIAL_SESSION` for one
restored session, and the session provider called `getSession()` alongside them
for the same answer a third time. Nine round trips before a screen had asked for
anything, and because the owner screens wait on that identity, it tripled their
fetches too.

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

- **Reaching the database is not the same as being right.** `wire` now signs in
  and drives all twenty surfaces — chat, teams, cups, closures, staff, venue
  profile and reviews among them — and every one of them calls its function and
  gets a 200. That retires the older "sixteen screens have never been exercised
  against real data", but only that far: it proves each screen asked the right
  question and was answered, not that it drew the answer correctly. Nobody has
  yet checked a rendered squad list against the rows behind it.
- **The admin console.** `/admin` renders and is in `smoke`, but no check signs
  in as a platform admin, so nothing there is exercised.
- **Writes, apart from the booking spine.** Recording a closure, changing a
  price, adding staff, replying in chat, registering for a cup — every one of
  those is a button no check has ever pressed.
- **The design's sample copy is still English.** `rtl` covers the app's own
  words. The showcase arrivals, gate notes and KPI figures that Owner Mode and
  the confirmation screen draw when reached without an account were written in
  English and stayed that way, so an Arabic visitor gets Arabic chrome around
  English sample content. Translating that data set is real work nobody has
  done; the exemption list names exactly where it shows.
- **Hardcoded English with no key at all is invisible to `rtl`.** The sentinels
  are the string table, so a phrase that was never added to it cannot be
  matched. A sweep by hand found around fifty of them — every auth failure, most
  screen error messages, and the whole anchored self-assessment, which meant an
  Arabic player's first minute in the product was in English. They have keys
  now, but the check still cannot find the next one: only reading the source
  can.
- **Mirroring is checked, not reviewed.** "Does not scroll sideways" catches a
  layout that breaks outright. It says nothing about an icon that should have
  flipped and did not, or a chevron still pointing the wrong way.
- **Anything after the match.** Reporting a result needs a booking in the past,
  which needs either waiting or reaching into the database — the walk in the
  review pass moved a booking's time by hand to get there, and that is not
  something a browser script can honestly automate.
- **Contrast and layout.** The token ramp was fixed by computing the ratios,
  not by looking. A check that renders and measures them would be a good
  addition and does not exist yet.
