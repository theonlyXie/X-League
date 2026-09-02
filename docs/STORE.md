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

## What does not exist yet

**There has never been an iOS build.** Not a failing one — none at all. `/ios`
is generated at prebuild and gitignored, CI builds Android only, and no Apple
Developer membership, bundle identifier, certificate or App Store Connect record
has been created. Everything under "Apple" below starts from nothing, and it is
the longest pole by a wide margin.

**There has never been a release-signed Android artefact either.** CI runs
`assembleRelease` with no signing config, so Gradle falls back to the debug
keystore: the APK installs and runs, and Play will refuse it. Play also wants an
`.aab`, not an `.apk`. `eas.json` already has a production profile that builds
an app bundle; it has never been run, because that needs credentials.

## Still only you can do these

1. **A contact address.** `admin/lib/contact.ts` still holds the placeholder.
   Both stores check that it reaches somebody, and both ask for a support URL.
   The three public pages show a warning until it is real.
2. **Real payment channels.** The three platform channels still read
   "REPLACE THIS" and are switched off, so nobody is shown a wrong number —
   but the one open cup charges EGP 300 and the entry screen honestly says
   "this cup has not said where to send the money yet". A reviewer following
   that path hits a dead end, which is Guideline 2.1. Either fill the channels
   in from the console, or set the cup a reviewer will find to a zero fee.
3. **The one live cup is called "Bb".** A reviewer opening the app finds a
   competition named like a keyboard test. Rename it or replace it with a real
   one before submitting; on its own it can read as an unfinished app.
4. **Store paperwork.** Privacy labels (Apple) and the Data safety form (Play),
   matching the privacy policy: phone number, name, optional photo, area, chat
   messages, football record. No location, no analytics, no advertising.
5. **Age rating — read this one twice.** X League is open to players of any
   age, and cups are 15+. That is a decision with teeth: an app that knowingly
   admits children *and* has open chat, photo upload and personal data falls
   under Google Play's Families policy and Apple's rules for apps aimed at
   minors, and in some countries needs verifiable parental consent. Answer both
   questionnaires honestly — chat, user photos, minors — and expect questions.

   The cheapest way to make this pass, if review pushes back: turn chat and
   photo upload off for accounts under a chosen age. The birth year is already
   collected, so it is a rule rather than a rebuild.
6. **Screenshots** of the real app, in Arabic, with no test data in frame.
   `app.json` sets `supportsTablet: true`, which means Apple reviews it on iPad
   and iPad screenshots are required. If the app is not meant for iPad, set that
   to false and the requirement goes away.

## Apple, from nothing

1. Apple Developer Program membership, and an organisation enrolment if the app
   is published as X League rather than as a person.
2. Register the bundle identifier `com.xleague.app`.
3. A build. `eas build -p ios --profile production` needs the membership and
   will create the certificate and profile itself.
4. An App Store Connect record, then TestFlight, then the listing: name,
   subtitle, description, keywords, support URL, privacy policy URL, screenshots.
5. Privacy nutrition labels, and the age rating questionnaire.
6. The demo account below goes in App Review Information, with the notes.

Two things that are already right and worth not undoing: sign-in is a phone
number and a password with no third-party login, so **Sign in with Apple is not
required**; and a cup's entry fee buys a place in a real football match, which is
a physical service, so it is **outside in-app purchase** rather than a 3.1.1
violation. Neither of those is true any more if a social login or a digital
subscription is added.

## Play, from a debug APK

1. A Play Console developer account, and an upload key — let Play App Signing
   hold the app key.
2. `eas build -p android --profile production` for a signed `.aab`.
3. Internal testing, then **closed testing**. A personal developer account
   opened since November 2023 must run closed testing with a minimum number of
   testers for fourteen continuous days before it may apply for production
   access. An organisation account is exempt. Check which kind yours is before
   planning the launch date, because this is a two-week wall, not a form.
4. Store listing, Data safety form, content rating questionnaire, screenshots.

## Done in the app

- Account deletion, in the app and at a public URL.
- Report a message, block a player, unblock from Me → Blocked players, mute a room.
- Privacy policy, terms and deletion page published on the console.
- The terms are linked from sign-up and the age is confirmed with a tick.
- Export compliance, permission strings and the version are in `app.json`.
- The documents' domain is set, and all three pages answer.
- Android asks for `INTERNET` and nothing else; four permissions the SDK would
  otherwise merge in are blocked by name.
- A security pass over the whole product, written up in `docs/SECURITY.md`.
- The test cup is deleted.
