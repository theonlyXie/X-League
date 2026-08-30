import { readFile } from 'node:fs/promises';

/**
 * The app's own string table, read from the source the app ships.
 *
 * Copying the strings into the harness would mean the check drifts out of step
 * with the app the first time somebody rewords a button, and a stale sentinel
 * is worse than none — it fails on honest screens until people learn to ignore
 * the whole check. So this reads `src/i18n/strings.ts` itself.
 *
 * It is TypeScript, so it is handed to TypeScript. The first attempt here
 * stripped the `as const` and the trailing `export type` by hand and fell over
 * on `(amount: string) => ...` — which is the whole argument against doing this
 * with regular expressions, since the next annotation to be added would break
 * it again silently.
 */
const SOURCE = new URL('../src/i18n/strings.ts', import.meta.url);

export async function loadStrings() {
  const ts = (await import('typescript')).default;
  const source = await readFile(SOURCE, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  });
  const { STRINGS } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);
  return STRINGS;
}

/**
 * English copy that must never be on screen while the app is in Arabic.
 *
 * Three filters, each removing a way this could cry wolf:
 *
 *   - only entries whose Arabic differs from the English, which drops the
 *     handful that are deliberately the same in both ("X League", "EGP") and
 *     would otherwise fail on every correctly translated screen;
 *   - only plain strings, because the template functions are formats rather
 *     than text and never appear verbatim;
 *   - only phrases long enough to be unmistakable, so a short word cannot
 *     match inside a venue name that genuinely is in Latin script.
 */
/**
 * Phrases short and ordinary enough to be somebody's data.
 *
 * A venue recording a walk-in types a name, and at Stadium One that name is
 * literally "Walk-in" — nine bookings of it. The customer list then shows a
 * customer called Walk-in, which is the venue's own data and reads to this
 * check as untranslated chrome. Excluding the key is more honest than loosening
 * the rule for everything: these are the words a person might plausibly type
 * into a field the app later prints back.
 */
const COULD_BE_DATA = new Set(['ownWalkIn', 'ownChannelWalkIn', 'ownChannelApp', 'ownChannelPhone']);

export function englishSentinels(strings) {
  return Object.entries(strings.en)
    .filter(([key, value]) => {
      const arabic = strings.ar[key];
      return typeof value === 'string' && typeof arabic === 'string' && arabic !== value;
    })
    .filter(([key]) => !COULD_BE_DATA.has(key))
    .filter(([, value]) => value.length >= 7 && /[A-Za-z]{4}/.test(value))
    .map(([key, value]) => ({ key, value }));
}
