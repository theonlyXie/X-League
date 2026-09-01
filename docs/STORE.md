# Submitting X League

What is done, what only you can do, and the text to paste into each console.

## The account App Review signs in with

Sign-up demands a real Egyptian mobile, and App Review works from California.
Without this they file the app as broken, and it is the most common cause of a
"we were unable to review your app" reply.

| | |
|---|---|
| Mobile | `01000000009` (the app adds `+20`) |
| Password | `XLeagueDemo2026!` |
| Name | X League Demo |
| Card | MID, 67 OVR, provisional |

It is a demo account and its password is meant to be typed into App Store
Connect in plain text, which is how Apple asks for it. Change it if you like —
from the app, Me → Change password — and change it here too.

## Review notes, to paste as they are

> X League books five-a-side football pitches in Egypt and runs local cups.
>
> **Signing in.** Use the demo account above. Sign-up requires an Egyptian
> mobile number, so please use it rather than registering.
>
> **Without an account.** The first screen offers "Look around without an
> account" — cups, venues and the leaderboards are readable without signing in.
>
> **Payments.** Nothing is bought inside the app. A pitch is paid in cash at
> the venue. A cup entry fee is paid directly to X League by bank transfer or
> mobile wallet, outside the app, for a real-world event — the app only shows
> where to send it and records the reference. SuPoints are earned by playing;
> they reduce an entry fee and cannot be bought, sold or exchanged for money.
>
> **Prizes.** Cup prizes are trophies and standing. There is no cash prize and
> no wagering.
>
> **User-generated content.** Chat rooms come from a booking, a team or a club.
> Hold any message to report it or to block its author; blocked people's
> messages disappear and they cannot open a direct conversation. Reports reach
> our console and we act within 24 hours.
>
> **Account deletion.** Me → Delete my account, in two taps. Also available
> without installing the app at /delete-account.
>
> **Language.** The app opens in Arabic. The switch is at the top of every
> screen, marked EN.

## Still only you can do these

1. **A contact address.** `admin/lib/contact.ts` has a placeholder. Both stores
   check that it reaches somebody. The three public pages show a warning until
   it is real.
2. **The documents' domain.** `EXPO_PUBLIC_LEGAL_BASE_URL` in `.env.production`
   — the console deployment's own domain, no trailing slash. The app hides the
   terms and privacy links until this is set rather than shipping a dead tap.
3. **Real payment channels.** The three platform channels still read
   "REPLACE THIS" and are switched off, so nobody sees them. Put the real
   InstaPay handle, wallet number and contact number in from the console before
   any cup takes an entry fee.
4. **Store paperwork.** Privacy labels (Apple) and the Data safety form (Play),
   matching the privacy policy: phone number, name, optional photo, area, chat
   messages, football record. No location, no analytics, no advertising.
5. **Age rating.** 18+, matching the terms. Both questionnaires ask about
   contests and about user-generated content; both now apply.
6. **Screenshots** of the real app, in Arabic, with no test data in frame.

## Done in the app

- Account deletion, in the app and at a public URL.
- Report a message, block a player, unblock from Me → Blocked players, mute a room.
- Privacy policy, terms and deletion page published on the console.
- The terms are linked from sign-up and the age is confirmed with a tick.
- Export compliance, permission strings and the version are in `app.json`.
- The test cup is deleted.
