/**
 * No English reaches a person without going through the string table.
 *
 *   node scripts/check-copy.mjs
 *
 * `check-i18n.mjs` proves both languages have the same keys. It cannot see a
 * sentence that never became a key — and eight of those were found by opening
 * the app in Arabic and reading it: a visible "Signed in as …" on the account
 * screen, and six accessibility labels that an Arabic screen reader would have
 * read out in English. A sweep had already been done and missed every one,
 * because it looked at what was drawn rather than at every literal that ends up
 * in front of somebody.
 *
 * So this looks at the literals. Two or more words with a capital at the front,
 * in a file under `app/` or `src/`, outside a comment. That catches real copy
 * and a handful of things that are legitimately English, which are listed
 * below by name rather than by a pattern loose enough to hide the next one.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * English that is meant to be English.
 *
 * The showcase names are the design's own sample data, drawn in English and
 * shown only where the app is explicitly standing in for an account that does
 * not exist. `English` is the label on the language switch, which has to read
 * as itself in both languages or nobody can switch back.
 */
const ALLOWED = new Set([
  'Basel Elsayed', // sign-up placeholder, the design's example name
  'Stadium One', // showcase venue
  'Nasr City', // showcase area
  'English', // the language switch names itself
  'xMidYMid slice', // an SVG preserveAspectRatio value, not copy
  // The crash screen is deliberately English. Its job is to be screenshotted
  // and sent to whoever is fixing it, next to a stack trace that is English
  // whatever the app's language is; a translated error report helps nobody.
  'Try again',
  // The last-resort crash alert, English for the same reason: it exists to be
  // screenshotted and sent on, beside a stack trace that is English anyway.
  'Something went wrong',
  // Part of the same crash trail, and English for the same reason.
  'Last screen: ${path}',
]);

/**
 * Refusals are translated too, just through a different table.
 *
 * A few of them are written on the client — the fallback when the server
 * refuses a hold without saying why — and every screen puts them through
 * `reason()` like any other. So a literal already in `reasons.ts` is covered,
 * and saying so here is more honest than listing it as an exception.
 */
const REASONS = new Set(
  [...readFileSync(join(root, 'src', 'i18n', 'reasons.ts'), 'utf8').matchAll(
    /^\s*'((?:[^'\\]|\\.)+)':/gm,
  )].map(([, lit]) => lit.replace(/\\'/g, "'")),
);

/**
 * The design's own sample data, drawn in English.
 *
 * These two modules are the fixture the app draws when there is no account to
 * draw instead, and the rtl walk exempts the same surfaces for the same reason.
 * Translating them is worth doing and is not this check's business: the point
 * here is that no *product* copy escapes the string table.
 */
const FIXTURES = [
  'src/data/player.ts',
  'src/data/owner.ts',
  // Not copy: the spellings a venue might type for an amenity, matched against
  // free text so the chip can be drawn in the reader's language. Nothing here
  // reaches a screen — the label that does is a key in the string table.
  'src/data/amenities.ts',
];

// The run may contain an apostrophe — `Live from ${venue}'s calendar` was
// hardcoded on the owner's calendar in English, next to the key that already
// said it, and hid here for weeks because `'s` broke the match.
// The word cap used to be eight, which meant a *longer* English sentence
// escaped — exactly backwards. "Verify your number to book and to reach owner
// mode" is ten words and sat hardcoded on the account screen because of it.
//
// Two holes this pattern used to have, both of which shipped English into the
// Arabic interface and both of which this check reported as clean:
//
//   * it required a capital first letter, so `of all reviews` and
//     `worth reading` — two labels on the owner's review screen — never
//     matched at all;
//   * its character class had no comma and no em dash, so a literal containing
//     either could never reach its own closing quote. The whole
//     "Pick from the same grid a player sees. An hour somebody has already
//     booked cannot be closed — cancel the booking first." sentence sat
//     hardcoded on the closures screen behind that one gap.
//
// So the first word may now be lower case, and the run may contain the
// punctuation real sentences contain. What keeps that from matching every
// identifier and CSS value in the tree is the two-word minimum, the ALLOWED
// list, and NOT_COPY below.
const LITERAL =
  /(['"`])([A-Za-z][A-Za-z]+(?:[ ][A-Za-z0-9${}.,;:!?\u2019\u2014\u2013()%-]+){1,24})\1/g;
//
// `throw new Error` and the matchers are not copy, they are code that happens to
// contain English. A developer exception is read by a developer, and a needle
// like `'did not play'` is matching a message Postgres sent — translating either
// would break the thing it is part of.
const NOT_COPY =
  /(accessibilityRole|fontFamily|import |from ['"]|require\(|@\/|https?:\/\/|StyleSheet|Platform\.|process\.env|console\.|throw new Error\(|\.includes\(|\bhas\()/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === 'i18n') continue;
      out.push(...walk(full));
    } else if (name.endsWith('.tsx') || name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const found = [];
for (const file of [...walk(join(root, 'app')), ...walk(join(root, 'src'))]) {
  const rel = relative(root, file);
  if (FIXTURES.includes(rel)) continue;

  const lines = readFileSync(file, 'utf8').split('\n');
  let inBlockComment = false;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (inBlockComment) {
      // A JSX comment is `{/* … */}`, and its closing brace is what ends it —
      // two of these were reported as untranslated copy until this said so.
      if (trimmed.includes('*/')) inBlockComment = false;
      return;
    }
    if (trimmed.startsWith('/*') || trimmed.startsWith('{/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true;
      return;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    if (NOT_COPY.test(line)) return;

    for (const [, , text] of line.matchAll(LITERAL)) {
      if (text.toUpperCase() === text) continue; // A CONSTANT, not a sentence.
      if (ALLOWED.has(text) || REASONS.has(text)) continue;
      found.push(`${rel}:${i + 1}  ${text}`);
    }
  });
}

if (found.length) {
  console.error(`\n${found.length} English literals with no key:\n`);
  for (const f of found) console.error(`  ${f}`);
  console.error('\nPut them in src/i18n/strings.ts, or add them to ALLOWED here');
  console.error('with a reason if they are meant to stay English.\n');
  process.exit(1);
}

console.log('No English copy outside the string table.');
