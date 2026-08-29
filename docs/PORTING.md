# What `main` had, and this branch does not

`main` and this branch both descend from PR #1 and then diverged into two
parallel implementations of the same product. The merge at `4824b06` recorded
main's history and kept this branch's tree, for one decisive reason: the live
Supabase project runs 36 migrations, every one of them from this lineage.
Main's client code is written against a schema 23 migrations behind
production, and main's own two migrations were never applied to it at all.

Nothing is lost. Every file below is reachable at **`0d74234`**, main's head
before the merge:

```
git show 0d74234:<path>
git checkout 0d74234 -- <path>     # to bring one back
```

This is the list to work through, not a promise to work through all of it —
several of these are second implementations of something this branch already
has, and are here for reference rather than for porting.

---

## Worth porting: features this branch does not have

| Path | What it is |
|---|---|
| `app/(player)/bookings/index.tsx`, `[code].tsx`, `_layout.tsx` | A player's booking history, addressable by booking code. This branch shows the next booking on Home and past ones only as card evidence; there is no list. |
| `app/owner/register.tsx`, `app/owner/pending.tsx` | Venue registration as its own flow, and a screen for a venue awaiting verification. This branch registers a venue through the sign-up screen and says nothing afterwards about the pending state. |
| `src/components/VenueMap.tsx`, `src/lib/maps.ts` | A map view of venues. This branch has list search only, and a Navigate button that deep-links out. |
| `app/owner/(main)/customers.tsx` | A venue's customer list. Nothing equivalent here. |
| `app/owner/(main)/bookings.tsx` | A flat booking list for a venue, beside the calendar grid. |
| `scripts/setup-supabase.mjs`, `supabase/setup_remote.sql` | A one-shot project bootstrap. This branch applies migrations through the Supabase MCP instead, which is why it has no equivalent. |

## Reference only: second implementations of what this branch has

These solve problems already solved here, differently. Read them before
changing the equivalent, not instead of it.

| Path | This branch's version |
|---|---|
| `src/i18n/en.ts`, `ar.ts`, `index.ts` | `src/i18n/strings.ts` + `format.ts` + `index.tsx`, with `scripts/check-i18n.mjs` enforcing parity |
| `app/owner/(main)/*` | `app/owner/*` |
| `src/state/adminConsole*.tsx`, `adminConsoleTypes.ts` | `app/admin.tsx` + `src/data/manage.ts` |
| `src/state/booking{Demo,Live,Types}.tsx` | `src/state/booking.tsx`, one provider with an `isLive` switch |
| `src/state/venues*.tsx` | `src/state/home.ts` + `src/data/discovery.ts` |
| `src/data/admin.ts`, `adminApi.ts`, `chat.ts`, `onboarding.ts`, `ownerOps.ts` | `src/data/api.ts`, `manage.ts`, `social.ts`, `discovery.ts`, `squad.ts` |
| `src/lib/cardMath.ts` | the card is computed server-side, in `my_card()` |
| `src/lib/dates.ts` | `src/i18n/format.ts` + `src/data/venue.ts` |
| `src/lib/venueConfig.ts`, `venueQuote.ts`, `ownerLive.ts` | `src/state/ownerToday.ts`, `ownerDay.ts` |
| `src/components/LanguageCorner.tsx` | the language switch on `/me` |
| `src/lib/storage.ts` | `AsyncStorage` directly, in `src/i18n/index.tsx` |

## Not portable

| Path | Why |
|---|---|
| `supabase/migrations/20260818090600_player_venues_and_seed.sql` | Never applied to the live project, and this branch's `discovery.sql` covers the same ground against a schema that has moved 23 migrations since. |
| `supabase/migrations/20260818090700_admin_console.sql` | Same — and `20260822100600_owner_and_admin.sql` is the version production actually runs. |

Porting either would mean writing a new migration against today's schema
rather than replaying these.
