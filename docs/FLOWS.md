# X League — the flows

What the product actually does, screen by screen, in the order a person meets
them. Written after a full review of every surface against the database behind
it, so this describes the app as it is rather than as the design intended.

There are four people in this product and they never share a screen: a player,
a venue's staff, a platform moderator or admin, and a visitor who has not
signed in. The last one matters more than it usually does — browsing is open,
and only booking needs an account.

---

## 1. Arriving

**The door comes first.** A launch with no session lands on `app/sign-in.tsx`,
not on Home. The gate is a component at the root of `app/_layout.tsx`; it
waits for the stored session to be read back (`restoring`) and for the
navigator to have mounted before it acts, because doing either too early
throws a signed-in person out of their own app on every launch. A build with
no database configured is not gated — it cannot sign anybody in, and says so
on the account screen instead.

**Signed out, by choice.** The gate has one link out: *look around without an
account*. Reading stays open on purpose — cups, venues and the boards are
anon-readable in the database, because a cup nobody can see is a cup nobody
enters — so `app/(player)/index.tsx` is still Home for a visitor, and the
whole discovery path works: search, a venue's page, its hours, its prices, its
reviews. The one thing they cannot do is hold a slot, and the button says so
rather than failing afterwards: "Sign in to hold 9:00 PM". Guest standing
lasts the launch, and signing out ends it, so a sign-out returns to the door.

The design's showcase card and sample shift stand in on Home, `/me` and Owner
Mode for a visitor, because there is no account to show instead. That is the
*only* circumstance in which a fixture is drawn. A signed-in person whose data
cannot be read is told so and shown nothing else.

**Signing in.** `app/sign-in.tsx`, one screen for both directions. A phone
number and a password; the number is turned into a lookup address
(`+20 100 000 0001` → `201000000001@xleague.app`) so Supabase Auth has an
email to key on, and the number itself never leaves the account. Creating an
account asks one extra question — player, or venue owner — and a venue owner
also gives a venue name and area.

**A venue owner's account is usable the moment it exists.** Sign-up creates
the venue, makes them its owner, creates a first pitch, seeds a week of
opening hours (10:00–24:00, every day) and a price for them. Before this it
created a venue with no hours and no price, which meant a venue that had
registered through the product was structurally unbookable and had no screen
that could fix it.

**And that answer is not final.** A player who turns out to have a pitch opens
`/open-a-venue` from the account screen: `register_my_venue` does the same
work sign-up does, for an account that already exists. There is no role flag —
Owner Mode is drawn from `my_venues`, so listing the ground *is* the
promotion, and the card they play on is untouched. One pending venue at a
time, so an account cannot bury the verification queue.

---

## 2. The booking spine (P-03 → P-06)

This is the path the whole product is built around, and it is atomic at every
step: nothing is reserved until the server says so, and nothing is confirmed
on the client's word.

```
Play  →  Pitch  →  Hold  →  Checkout  →  Confirmation  →  Lobby
```

**Play** (`play/index.tsx`). Three day chips — tonight, tomorrow, the day
after — and three evening windows. The date is resolved in Africa/Cairo, not
UTC: the server refuses to sell the past, and computing "tonight" in UTC made
it yesterday after about 9 PM local, which emptied the screen for exactly the
people browsing at peak booking hour.

**Pitch** (`play/pitch.tsx`). The venue's real amenities, its real house
rules, its reviews, and a grid of the hours *it* sells — derived from
`search_availability`, not from a constant. An hour already taken through any
channel is struck through; the venue's phone bookings and walk-ins are in the
same calendar as the app's, which is the point of OWN-006.

**Hold** (`hold_slot`). A hold owns a pitch-hour interval for about five
minutes, enforced by a Postgres exclusion constraint rather than by
application logic — two people tapping the same hour at the same instant
cannot both win. The countdown the player sees is derived from the server's
`expires_at`, so backgrounding the app and coming back shows the truth rather
than however far a local timer got. Losing the race says so, and offers the
nearest hours that are still free.

**Checkout** (`play/checkout.tsx`). The venue, the date, the hour, the format,
the whole price, and the cancellation cutoff resolved in the venue's own zone
— everything BKG-004 asks to be shown before the decision. Nothing is taken up
front; the full amount is settled at the venue on the day. Leaving this screen
without confirming releases the hold.

**Confirmation** (`play/confirmation.tsx`). The ceremony surface — the only
place the X-to-void mark is drawn at full size. A booking code, the amount to
bring, the venue's own entry note, and Navigate when the venue has a map link
or a pin.

The screen is reached **only when a booking was actually made.** It used to be
reached unconditionally, so a player whose hold had expired got the full
ceremony — code and all — for a booking that did not exist.

**Lobby** (`play/lobby.tsx`). The match, once it is real: the squad, the chat
room that opened with the booking, and the captain's controls. A captain sees
Cancel booking; a squad member sees Leave match. Cancelling before the cutoff
returns the hour to sale and nothing is owed; after it, the full price is
still owed to the venue, and the player is told which of the two just
happened.

---

## 3. The squad (P-07 / P-13)

A booking is a five-a-side match, so the captain fills it.

`play/invite.tsx` searches players by name and invites them; a guest with no
account can be added by name alone. Invitations arrive on the invited player's
Home with Accept and Decline, and on their notifications. Accepting or
declining says what happened — a refusal (the squad filled while they were
deciding, someone already answered for them) is shown rather than swallowed.

Teams (`teams/index.tsx`, `teams/[id].tsx`) are the durable version of the
same idea: a named group you invite from repeatedly, and the unit that enters
a cup.

---

## 4. After the match (MCH / PTS / P-08)

This is the part that turns a booking into a card, and every step of it is
somebody choosing to do it.

```
Check-in (venue)  →  Result (captain)  →  Ratings (squad)  →  Card
```

**Check-in** happens at the gate, in Owner Mode, and is what makes a match
count as evidence at all. A booking nobody checked in is a booking.

**Result** (`play/result.tsx`). The captain reports that the match happened,
with or without a score — five-a-side often ends without an agreed one, and
what the card cares about is that it was played. This is the only path to
`award_match_points`, so before this screen existed the whole progression
system was reachable in SQL and from nowhere else. The same screen asks how
the venue was: one to five stars and an optional note, which is where every
venue rating in the product comes from.

**Ratings** (`play/rate.tsx`). Six sliders per team-mate, closing a week after
the match. Individual raters stay anonymous, and no single match can move an
attribute by more than ±2. Once enough of the squad has rated, the match flips
to verified and becomes evidence.

**The card** (`me.tsx`). An overall, six attributes, a position and a
confidence band — with the weight between self-assessment and match evidence
stated openly, and one attribute's provenance explained in full. A player who
has not built a card yet is offered the six-question assessment; a player
whose card could not be *read* is told that instead, because offering "Build
my card" to an established player would overwrite the assessment they already
made.

**XP** (`points.tsx`) is a separate axis and always has been: activity, never
ability. The total on Home opens the ledger that produced it, line by line,
no-show penalties included.

---

## 5. Owner Mode (O-01 → O-07)

A venue's staff reach it from `/me` — same identity, different workspace, no
second sign-in (RBAC-005). Someone who manages more than one venue switches
between them from the header.

**Today** (`owner/index.tsx`) is the shift. Occupancy, cash still to collect,
conflicts, and every arrival due — app, phone, WhatsApp and walk-in in one
list, each labelled with where it came from. Against each: check in, collect
the cash, or mark a no-show. All three used to be drawn only for app
bookings, so a venue physically could not check in the phone booking in the
next row.

**Calendar** (`owner/calendar.tsx`) is the canonical inventory timeline: one
column per pitch the venue actually has, one row per sellable hour, every
occupancy item colour-coded by channel. Tapping an open hour records a phone
or walk-in booking into the same timeline — which is what makes "one calendar,
every channel" true rather than aspirational.

**Money** (`owner/money.tsx`). Gross, collected, outstanding and forfeited by
evening. Gross is what the hours sold for; collected is what the gate actually
took. Those are different numbers and the screen keeps them apart.

**Setup** is five screens:

| | |
|---|---|
| Hours and pitches | When you open, and what you open. Setting a day replaces it; equal hours closes it. A new pitch inherits the week the others keep. |
| Pricing | What each hour sells for, versioned by validity window rather than edited in place — a booking taken last week was quoted against the rule live then. |
| Closures | Take hours off sale. Closing an hour somebody has bought is refused. |
| Staff | Who can work the gate. Nobody can grant a role above their own, or change their own. |
| Venue profile | What players see: name, area, phone, entry note, house rules, amenities, and the map link the Navigate button opens. |

Verification is deliberately absent from Setup. A venue cannot mark itself
verified — that is the entire value of the badge.

---

## 6. The platform

Two doors, same database.

**In the app** (`app/admin.tsx`), for staff on a phone: an overview, the
verification queue, the report queue, user search and suspension, the ledger,
the settings and the audit log.

**On the web** (`admin/`, deployed separately), for running cups. A cup is
created as a draft, opened for entries, entries are accepted or declined one
by one, the draw is made, each fixture is scheduled onto a real booked
pitch-hour, and the result is read off the match the captain reported rather
than typed in. The table is computed from the fixtures and never submitted.

Staff sign in with a username and password — they are not players and the
account is not tied to a handset. A platform role is granted in the database,
never from a screen.

**Reports** reach both queues from the report sheet on a venue's page. Until
recently nothing in the product could file one, so the queues could only ever
say "Nothing reported."

---

## 7. What holds all of this up

Three decisions that every flow above depends on:

**No table is readable.** RLS is on and no table has grants. Every read and
every write in both clients goes through a `SECURITY DEFINER` function with a
pinned `search_path`, and each one checks `auth.uid()` for itself. Bypassing
the sign-in screen gets you refusals from the database, not a console. There
is no service-role key in this repository.

**Inventory is owned by Postgres.** The exclusion constraint on
`booking.during` is what makes double-booking impossible; cancelling returns
an hour to sale the moment it commits, with no sweeper in the loop, because
the constraint only counts live states.

**Goals belong to people, and somebody has to say so.** The score is the
match's truth; the sheet under it says who scored and who set them up. It is
written by the captain, the venue or the cup's organiser, it replaces itself
rather than accumulating, and a side's scorers may add up to less than its
score — an own goal belongs to nobody — but never to more. The scorers'
leaderboard and two of a cup's five awards are made of nothing else.

**A cup result counts when both sides say the same thing.** Each side's
captain reports what they saw; the second is told the score from their own end
("they say you lost 1–3") and records their own account. Agreement writes the
result and pays everybody. Disagreement makes the match disputed and pays
nobody until the organiser settles it. One side reporting alone pays nobody
either — a result the other club never confirmed is not a result. A casual
booking has one captain and a venue check-in behind it, so it is untouched.

**A cup is what verifies a stat.** A booked match is still a match: it earns
points and shows in the form strip. It is not evidence. A match becomes
evidence only when a cup fixture stands behind it *and* three independent
people who played rated in it — the competition says the result was real and
adjudicated, the ratings say what happened inside it. Where the organiser
arranged the ground themselves there is no booking to point at, so they write
the score down and the two squads that entered become the team sheet.

**Money is a ledger.** A confirmed booking raises an obligation; the gate
collects it; a late cancellation forfeits it; a waived one stays as a record
that it existed. Nothing is deleted to make a report tidy.

---

## Known gaps

Honest list, as of this pass:

- **Week view.** The calendar shows one day. The Day/Week toggle was removed
  rather than wired, because there is no week query behind it and a control
  that promises one and does nothing is worse than its absence.
- **Direct messages.** `direct_conversation` exists and no screen opens one.
  This is deliberate for now — chat opens with a match, not with a person —
  but the lobby and a team page are the natural entry points when it changes.
- **Photos.** `venue_photo` is read by the pitch page and written by nothing;
  every venue shows a placeholder.
- **Date picker.** The third day chip is "Day after", not a picker.
- **Notifications are written in English.** The server composes them, and the
  notification list puts them through the same table the refusals use — so the
  ones with a mapping arrive in Arabic and the rest fall back to English. Every
  notification kind wants a key eventually.
- **Realtime.** Nothing is pushed. The owner surfaces pull to refresh and the
  notification badge polls; a busy gate will want a subscription eventually.
- **A second pitch has no price.** `add_pitch` inherits the venue's opening
  hours but not its price rules, so a newly added pitch shows EGP 0 until
  somebody sets one in Pricing. It is visible and correctable on the screen
  next door, which is why it is a gap rather than a defect.
