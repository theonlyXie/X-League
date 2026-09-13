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
> **User-generated content.** X League hosts no messaging. Players who share a
> club, a team or a match can open WhatsApp on each other from the app; nobody
> else is shown a number, and a block removes it in both directions. What people
> write inside X League is limited to their own name, a photo, a club name and a
> crest. Players and venues can be reported, reports reach our console, and we
> act within 24 hours.
>
> **Account deletion.** Me → Delete my account, in two taps. Also available
> without installing the app at /delete-account.
>
> **Language.** The app opens in Arabic. The switch is at the top of every
> screen, marked EN.

## What does not exist yet

**There has never been an iOS build.** Not a failing one — none at all. The
Expo project exists and GitHub is connected to it, so the machine that would
build one is ready; what is missing is the Apple Developer membership, the
bundle identifier registered against it, and an App Store Connect record. That
membership is now the single longest pole in the whole submission.

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
   matching the privacy policy: phone number, name, optional photo, area,
   football record. No messages — the app hosts none. No location, no analytics,
   no advertising.
5. **Age rating.** X League is open to players of any age, and cups are 15+.
   This got considerably easier when in-app messaging was removed: there is no
   chat to declare, which is the single question that pulls an app with minors
   on it into Google Play's Families policy and Apple's rules for apps aimed at
   minors. Answer both questionnaires honestly — user photos, minors, and the
   fact that the app can open WhatsApp on a number — and expect questions about
   the last one.

   What remains, if review pushes back: photo upload, and handing one player
   another's number. Both can be turned off for accounts under a chosen age.
   The birth year is already collected, so it is a rule rather than a rebuild.
6. **Screenshots** of the real app, in Arabic, with no test data in frame.
   `app.json` sets `supportsTablet: true`, which means Apple reviews it on iPad
   and iPad screenshots are required. If the app is not meant for iPad, set that
   to false and the requirement goes away.

## Apple, from nothing

The Expo side is done. The repository is linked to the EAS project
`cipherlabs/x-league` (`ff2b2f9d-9cdf-492f-9c5c-8a8b05e620d1`, in `app.json`),
GitHub is connected, and `eas.json` has a production profile that builds for
iOS. **EAS builds iOS; the `Android release` workflow in this repository builds
Android.** That division is not a preference: an app is published under exactly
one upload key for its whole life, and asking EAS for an Android build offers to
generate a second one. If the Expo dashboard's GitHub trigger is configured,
set it to iOS only.

What is left is the Apple membership, and there is no way around it. A Mac is
not needed; EAS builds on its own.

**1 · Apple Developer Program membership**, $99 a year. Enrol as an
organisation rather than an individual if the app is to be published as X League
— that needs a D-U-N-S number and takes days to weeks, so start it first. This
is the long pole in the whole submission.

**2 · Register the bundle identifier** `com.xleague.app` in the developer
portal. It already matches `app.json`.

**3 · Build.** `npx eas login`, then:

```
npx eas build --platform ios --profile production
```

EAS creates the distribution certificate and the provisioning profile itself the
first time, from the Apple account you sign in with. Nothing needs a Mac. Until
the membership exists this stops at the credentials step, which is the only
thing still standing between here and a TestFlight build.

**4 · App Store Connect**: create the app record, upload the build (`eas submit
-p ios`), put it through TestFlight, then fill the listing — name, subtitle,
description, keywords, support URL, privacy policy URL, screenshots.

**5 · Privacy nutrition labels and the age rating questionnaire**, matching the
privacy policy. The demo account below goes in App Review Information along with
the review notes.

Two things that are already right and worth not undoing: sign-in is a phone
number and a password with no third-party login, so **Sign in with Apple is not
required**; and a cup's entry fee buys a place in a real football match, which is
a physical service, so it is **outside in-app purchase** rather than a 3.1.1
violation. Neither stays true if a social login or a digital subscription is
added.

## Play, from here

The signing is now wired. `plugins/withReleaseSigning.js` adds a release signing
config to the generated Gradle project — the native folder is generated rather
than committed, so it had to be a config plugin; editing `build.gradle` by hand
would survive exactly until the next `--clean`. When the four properties are
absent it falls back to the debug key, which is what keeps the credential-free
APK workflow working.

**1 · Make the upload key.** Once, on your own machine. Keep the file and both
passwords somewhere you will still have them in five years — losing the upload
key means asking Google to reset it, and losing the *app* key means never
updating the app again. (Let Play App Signing hold the app key; this is only the
upload key.)

```
keytool -genkeypair -v \
  -keystore x-league-upload.jks \
  -alias x-league \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storetype JKS
```

**2 · Put it in the repository's secrets**, at Settings → Secrets and variables
→ Actions. The key itself never enters the repository.

```
base64 -w0 x-league-upload.jks     # macOS: base64 -i x-league-upload.jks
```

| Secret | Value |
|---|---|
| `XLEAGUE_UPLOAD_KEYSTORE_BASE64` | the output of the line above |
| `XLEAGUE_UPLOAD_STORE_PASSWORD` | the keystore password |
| `XLEAGUE_UPLOAD_KEY_ALIAS` | `x-league` |
| `XLEAGUE_UPLOAD_KEY_PASSWORD` | the key password |

**3 · Run the *Android release* workflow** from the Actions tab. It stops at the
first step if a secret is missing, builds an `.aab` and a matching `.apk`, and
then refuses to publish either if the certificate turns out to be
`CN=Android Debug` or if the bundle has no database in it. The run summary
prints the certificate's SHA-256, which is what you register with anything that
checks the app's signature.

To build one locally instead, put the same four values in
`~/.gradle/gradle.properties` as `XLEAGUE_UPLOAD_STORE_FILE`,
`XLEAGUE_UPLOAD_STORE_PASSWORD`, `XLEAGUE_UPLOAD_KEY_ALIAS` and
`XLEAGUE_UPLOAD_KEY_PASSWORD`, then `npx expo prebuild -p android --clean &&
cd android && ./gradlew bundleRelease`.

**4 · Bump the version before each upload.** `app.json` holds `version` and
`android.versionCode`, and Play refuses a `versionCode` it has already seen.
`eas.json` is set to `appVersionSource: local` so nothing keeps a second counter
that could disagree.

**5 · Then the console**: developer account, upload the bundle to internal
testing, then closed testing. A personal developer account opened since November
2023 must run closed testing with a minimum number of testers for **fourteen
continuous days** before it may apply for production access. An organisation
account is exempt. Check which kind yours is before choosing a launch date,
because this is a two-week wall rather than a form. Then the store listing, the
Data safety form, the content rating questionnaire and the screenshots.

## Done in the app

- Account deletion, in the app and at a public URL.
- Report a player or a venue, block a player, unblock from Me → Blocked players.
  A block also withdraws the number, in both directions.
- Privacy policy, terms and deletion page published on the console.
- The terms are linked from sign-up and the age is confirmed with a tick.
- Export compliance, permission strings and the version are in `app.json`.
- The documents' domain is set, and all three pages answer.
- Android asks for `INTERNET` and nothing else; four permissions the SDK would
  otherwise merge in are blocked by name.
- A security pass over the whole product, written up in `docs/SECURITY.md`.
- The test cup is deleted.
