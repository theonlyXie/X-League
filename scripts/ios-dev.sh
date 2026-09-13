#!/usr/bin/env bash
#
# Clone to running on an iPhone, in one command.
#
#   bash scripts/ios-dev.sh                 # debug build, on a connected device
#   bash scripts/ios-dev.sh --release       # what a real user gets: no bundler
#   bash scripts/ios-dev.sh --team ABCDE12345
#   bash scripts/ios-dev.sh --clean         # regenerate ios/ from scratch
#   bash scripts/ios-dev.sh --simulator     # no device to hand
#
# Everything here is `npx expo prebuild` and `npx expo run:ios` with the checks
# in front of them. The checks are the point: each of the failures below costs
# twenty minutes to diagnose from the error Xcode actually prints, and about
# five seconds to diagnose from a sentence naming it.
#
# There is no cloud build in this script and no Expo account needed. `prebuild`
# generates an ordinary Xcode project from app.json and everything after that is
# xcodebuild.
#
# macOS only. iOS builds cannot happen anywhere else.

set -euo pipefail

cd "$(dirname "$0")/.."

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GOLD=$'\033[33m'
  GREEN=$'\033[32m'; OFF=$'\033[0m'
else
  BOLD=''; DIM=''; RED=''; GOLD=''; GREEN=''; OFF=''
fi

step()  { printf '\n%s==>%s %s%s%s\n' "$GOLD" "$OFF" "$BOLD" "$1" "$OFF"; }
note()  { printf '    %s%s%s\n' "$DIM" "$1" "$OFF"; }
good()  { printf '    %s✓%s %s\n' "$GREEN" "$OFF" "$1"; }

# A failure names the fix on the next line. An error that only says what broke
# leaves somebody searching; one that says what to type does not.
die() {
  printf '\n%s✗ %s%s\n' "$RED" "$1" "$OFF" >&2
  shift
  for line in "$@"; do printf '  %s\n' "$line" >&2; done
  printf '\n' >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------

CONFIGURATION='Debug'
TEAM_ID="${XLEAGUE_TEAM_ID:-}"
CLEAN=0
TARGET='--device'

while [ $# -gt 0 ]; do
  case "$1" in
    --release)   CONFIGURATION='Release' ;;
    --clean)     CLEAN=1 ;;
    --simulator) TARGET='' ;;
    --team)      shift; [ $# -gt 0 ] || die 'The --team flag needs an ID.' 'Example: --team ABCDE12345'; TEAM_ID="$1" ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^#\{1,2\} \{0,1\}//'
      exit 0 ;;
    *) die "Unknown option: $1" 'Run with --help to see what this takes.' ;;
  esac
  shift
done

printf '%s\n' "${BOLD}X League — iOS${OFF}"
note "configuration: $CONFIGURATION"
[ -n "$TARGET" ] && note 'target: a connected iPhone' || note 'target: the simulator'

# ---------------------------------------------------------------------------
# The one thing this script cannot do for you
# ---------------------------------------------------------------------------

step 'Before anything else'
cat <<'NOTICE'
    The two migrations below must already be applied to the live Supabase
    project. Nothing in this repository applies them — CI only tests them
    against a throwaway Postgres — and without them sign-up fails and venue
    search returns nothing, which looks exactly like a broken app.

      supabase/migrations/20260911090000_the_questions_sign_up_asks.sql
      supabase/migrations/20260911091000_a_door_that_counts_who_knocks.sql

    Supabase dashboard -> SQL Editor, in that order. Or `supabase db push`.
NOTICE

# ---------------------------------------------------------------------------
# The machine
# ---------------------------------------------------------------------------

step 'Checking the Mac'

[ "$(uname -s)" = 'Darwin' ] || die \
  'This only runs on macOS.' \
  'iOS builds need Xcode, and Xcode only exists on a Mac.'
good 'macOS'

command -v xcodebuild >/dev/null 2>&1 || die \
  'Xcode is not installed.' \
  'Install the latest Xcode from the App Store, open it once to let it' \
  'finish setting up, then run this again.'

# The classic misconfiguration: Command Line Tools installed, Xcode itself
# never selected. Every build then fails with something that does not mention
# it.
DEVELOPER_DIR_PATH="$(xcode-select -p 2>/dev/null || true)"
case "$DEVELOPER_DIR_PATH" in
  *Xcode*) good "Xcode at $DEVELOPER_DIR_PATH" ;;
  *) die \
      'xcode-select points at the Command Line Tools, not at Xcode.' \
      'Fix it with:' \
      '' \
      '  sudo xcode-select -s /Applications/Xcode.app' ;;
esac

command -v node >/dev/null 2>&1 || die \
  'Node is not installed.' \
  'Install it with:  brew install node'

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die \
  "Node $NODE_MAJOR is too old — this needs 20 or newer." \
  'Upgrade with:  brew upgrade node'
good "node $(node -v)"

command -v pod >/dev/null 2>&1 || die \
  'CocoaPods is not installed.' \
  'Install it with:  brew install cocoapods'
good "cocoapods $(pod --version 2>/dev/null || echo '?')"

command -v watchman >/dev/null 2>&1 \
  && good 'watchman' \
  || note 'watchman is missing — optional, but the file watcher is flakier without it (brew install watchman)'

# Committed on purpose, and the reason a build made anywhere finds the
# database. Its absence means somebody removed it, not that it needs creating.
[ -f .env.production ] || die \
  '.env.production is missing.' \
  'It is committed to this repository on purpose — the app has no database' \
  'without it. Restore it with:  git checkout .env.production'
good '.env.production'

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

step 'Installing JavaScript dependencies'
npm install --no-audit --no-fund

# ---------------------------------------------------------------------------
# The Xcode project
# ---------------------------------------------------------------------------

if [ "$CLEAN" -eq 1 ] || [ ! -d ios ]; then
  step 'Generating the Xcode project from app.json'
  note 'ios/ is generated and gitignored — deleting it costs nothing'
  npx expo prebuild --platform ios --clean
else
  step 'Reusing the existing ios/ project'
  note 'run with --clean after any change to app.json'
fi

WORKSPACE="$(find ios -maxdepth 1 -name '*.xcworkspace' -print -quit 2>/dev/null || true)"
[ -n "$WORKSPACE" ] || die \
  'prebuild produced no .xcworkspace.' \
  'Try again from scratch:' \
  '' \
  '  rm -rf ios && bash scripts/ios-dev.sh --clean'
good "$WORKSPACE"

# ---------------------------------------------------------------------------
# Signing
# ---------------------------------------------------------------------------
#
# The only step that needs your Apple Developer account. Xcode issues the
# certificate and the provisioning profile itself once it knows the team.

PBXPROJ="$(find ios -maxdepth 2 -name 'project.pbxproj' -print -quit 2>/dev/null || true)"

if [ -n "$TEAM_ID" ] && [ -n "$PBXPROJ" ]; then
  step "Setting the signing team to $TEAM_ID"

  case "$TEAM_ID" in
    *[!A-Za-z0-9]*) die \
      "That does not look like a Team ID: $TEAM_ID" \
      'It is ten alphanumeric characters, from Apple Developer -> Membership details.' ;;
  esac

  # `/usr/bin/sed` by name, because a Homebrew GNU sed earlier on PATH does not
  # take BSD's `-i ''`. Both settings go on one line rather than two: a literal
  # newline in a BSD sed replacement needs escaping, `\t` there inserts the
  # letter t rather than a tab, and a pbxproj parses `A = x; B = y;` on one line
  # exactly as it parses two. Idempotent so a second run is harmless, and
  # verified below rather than assumed — ios/ is disposable if it ever does go
  # wrong.
  #
  # Anchored on the *setting* rather than on a particular identifier. It used to
  # name `com.xleague.app` literally, which meant renaming the app in app.json
  # silently took `--team` out of service until somebody noticed the die below.
  # The backreference keeps whatever identifier prebuild actually wrote.
  if grep -q 'DEVELOPMENT_TEAM = [A-Za-z0-9]*;' "$PBXPROJ"; then
    /usr/bin/sed -i '' "s/DEVELOPMENT_TEAM = [A-Za-z0-9]*;/DEVELOPMENT_TEAM = ${TEAM_ID};/g" "$PBXPROJ"
  else
    /usr/bin/sed -i '' \
      "s/PRODUCT_BUNDLE_IDENTIFIER = \([A-Za-z0-9._-]*\);/DEVELOPMENT_TEAM = ${TEAM_ID}; PRODUCT_BUNDLE_IDENTIFIER = \1;/g" \
      "$PBXPROJ"
  fi

  grep -q "DEVELOPMENT_TEAM = ${TEAM_ID};" "$PBXPROJ" || die \
    'Could not write the signing team into the project.' \
    'Set it by hand instead — it is two clicks:' \
    '' \
    "  open $WORKSPACE" \
    '  select the project, then the app target, then Signing & Capabilities,' \
    '  tick "Automatically manage signing" and choose your team.'
  good 'signing team set'
elif [ -n "$PBXPROJ" ] && ! grep -q 'DEVELOPMENT_TEAM = [A-Z0-9]' "$PBXPROJ"; then
  step 'Signing'
  note 'No development team is set on the generated project yet.'
  note 'The build will stop at signing unless you do one of these:'
  printf '\n'
  printf '      %sOnce, in the GUI%s\n' "$BOLD" "$OFF"
  printf '        open %s\n' "$WORKSPACE"
  printf '        project -> app target -> Signing & Capabilities -> your team\n\n'
  printf '      %sOr non-interactively, every time%s\n' "$BOLD" "$OFF"
  printf '        bash scripts/ios-dev.sh --team YOURTEAMID\n'
  printf '        (Apple Developer -> Membership details -> Team ID)\n\n'
  note 'Carrying on — stop here with Ctrl-C if you would rather set it first.'
  sleep 4
fi

# ---------------------------------------------------------------------------
# The device
# ---------------------------------------------------------------------------

if [ -n "$TARGET" ]; then
  step 'Looking for a connected iPhone'
  # Informational only. `expo run:ios --device` shows its own picker, and this
  # is here to name the two reasons a phone is plugged in and still invisible.
  DEVICES="$(xcrun xctrace list devices 2>/dev/null | /usr/bin/sed -n '/^== Devices ==/,/^== /p' || true)"
  if printf '%s' "$DEVICES" | grep -qi 'iphone'; then
    good 'an iPhone is visible to Xcode'
  else
    note 'No iPhone visible. If one is plugged in, it is almost always one of:'
    note '  · Developer Mode is off — Settings > Privacy & Security > Developer Mode, then restart'
    note '  · the "Trust This Computer?" prompt was dismissed — unplug, replug, unlock'
  fi
fi

# ---------------------------------------------------------------------------
# Build and run
# ---------------------------------------------------------------------------

step "Building ($CONFIGURATION) and installing"
note 'the first build compiles every pod — 10 to 20 minutes; later ones are a minute or two'

if [ "$CONFIGURATION" = 'Release' ]; then
  note 'Release: JavaScript is bundled in, so this app runs with no Mac attached'
fi

set +e
# shellcheck disable=SC2086
npx expo run:ios $TARGET --configuration "$CONFIGURATION"
RUN_STATUS=$?
set -e

if [ "$RUN_STATUS" -ne 0 ]; then
  die \
    "The build failed (exit $RUN_STATUS)." \
    'The three that account for almost all of them:' \
    '' \
    '  · No signing team          -> see the Signing section above' \
    '  · "Untrusted Developer"    -> on the phone: Settings > General >' \
    '                                VPN & Device Management > your Apple ID > Trust' \
    '  · Pods out of step         -> bash scripts/ios-dev.sh --clean' \
    '' \
    'Xcode prints more than the terminal does. To read the real error:' \
    '' \
    "  open $WORKSPACE"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

printf '\n%s✓ Running on the device.%s\n\n' "$GREEN" "$OFF"
cat <<'DONE'
    The app opens in Arabic — that is deliberate. The language switch is at
    the top right of every player screen.

    The demo account, from docs/STORE.md:

      mobile     01000000009
      password   XLeagueDemo2026!

    Or tap "Look around without an account" to browse cups, venues and the
    boards with no sign-in at all.
DONE

if [ "$CONFIGURATION" = 'Debug' ]; then
  cat <<'NEXT'
    This is a debug build: it needs the bundler running on this Mac and it is
    slower than the real thing. Before judging performance or animation:

      bash scripts/ios-dev.sh --release

NEXT
fi
