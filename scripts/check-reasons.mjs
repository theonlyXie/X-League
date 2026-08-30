/**
 * Every refusal the database can send back has an Arabic translation.
 *
 * `src/i18n/reasons.ts` is keyed on the exact English sentence, which is the
 * cheap way to translate a hundred and sixty refusals without adding an error
 * code to every return statement in the schema — and the expensive part of
 * that choice is that rewording a sentence in a migration silently falls back
 * to English. This is the thing that stops it being silent.
 *
 *   node scripts/check-reasons.mjs
 *
 * It reads the refusals straight out of `supabase/migrations/` rather than
 * from a list somebody maintains, so a new one is caught the moment it lands.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The refusals, as they appear in the schema. */
function refusalsInMigrations() {
  const dir = join(root, 'supabase', 'migrations');
  const found = new Set();

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(dir, file), 'utf8');

    // `return query select false, …, 'Because.'` — the ordinary refusal.
    for (const stmt of sql.match(/return query select[^;]*?;/gs) ?? []) {
      if (!stmt.includes('false')) continue;
      for (const [, lit] of stmt.matchAll(/'([^']{6,})'/g)) {
        if (/^[A-Z]/.test(lit) && /[.?]$/.test(lit)) found.add(lit);
      }
    }

    // `raise exception 'Because.'` — the refusal that is an error.
    for (const [, lit] of sql.matchAll(/raise exception '([^']{6,})'/g)) {
      found.add(lit);
    }

    // `v_reason := 'Because.'` — a refusal decided some lines above the return.
    // `registration_quote` is written this way, and every one of its answers
    // about a promo code was missed until this line existed.
    for (const [, lit] of sql.matchAll(/v_reason\s*:=\s*'([^']{6,})'/g)) {
      found.add(lit);
    }
  }
  return [...found];
}

/** The table and the patterns, read from the module itself. */
function translated() {
  const source = readFileSync(join(root, 'src', 'i18n', 'reasons.ts'), 'utf8');
  const keys = new Set();
  for (const [, lit] of source.matchAll(/^\s*'((?:[^'\\]|\\.)+)':/gm)) {
    keys.add(lit.replace(/\\'/g, "'"));
  }
  // Multi-line entries key on the line above their value.
  for (const [, lit] of source.matchAll(/^\s*'((?:[^'\\]|\\.)+)':\s*$/gm)) {
    keys.add(lit.replace(/\\'/g, "'"));
  }
  const patterns = [...source.matchAll(/re:\s*\/\^(.+?)\$\/,/g)].map(
    ([, body]) => new RegExp(`^${body}$`),
  );
  return { keys, patterns };
}

const refusals = refusalsInMigrations();
const { keys, patterns } = translated();

const missing = refusals.filter(
  (r) => !keys.has(r) && !patterns.some((p) => p.test(r)) && !r.includes('%'),
);

// A sentence assembled by `format()` cannot be matched literally, so it has to
// be covered by a pattern — and the pattern has to match what a person sees,
// not the template. So the placeholder is filled with a probe value and the
// patterns are asked about the result, which is the actual question.
const rendered = (t) => t.replace(/%s/g, '7').replace(/%/g, '7');
const templated = refusals.filter(
  (r) => r.includes('%') && !patterns.some((p) => p.test(rendered(r))),
);

if (missing.length || templated.length) {
  console.error(`\n${missing.length + templated.length} refusals have no Arabic:\n`);
  for (const r of missing) console.error(`  ${r}`);
  for (const r of templated) console.error(`  (needs a pattern) ${r}`);
  console.error('\nAdd them to src/i18n/reasons.ts.\n');
  process.exit(1);
}

console.log(
  `${refusals.length} refusals, all translated ` +
    `(${keys.size} exact, ${patterns.length} patterns).`,
);
