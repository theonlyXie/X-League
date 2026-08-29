#!/usr/bin/env node
/**
 * Every English string must have an Arabic counterpart of the same shape.
 *
 * NFR-LOC-001 asks for both directions fully supported, and the failure mode is
 * quiet: a key present in `en` and missing from `ar` renders the literal
 * `undefined` to an Arabic-speaking player, and a key that is a template
 * function on one side and a plain string on the other throws when called.
 * Neither shows up in a typecheck, because `STRINGS[locale]` is asserted to the
 * English shape, and neither shows up at all until somebody switches language.
 *
 *   npm run check:i18n
 */
import { readFileSync } from 'node:fs';

const PATH = 'src/i18n/strings.ts';
const src = readFileSync(PATH, 'utf8');

/** The body of one locale's object literal, by brace matching. */
function section(name) {
  const start = src.indexOf(`  ${name}: {`);
  if (start === -1) throw new Error(`No \`${name}\` section in ${PATH}`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i);
  }
  throw new Error(`Unbalanced braces in \`${name}\``);
}

/**
 * Key -> 'fn' | 'str'. Values are single-quoted, double-quoted (when the copy
 * contains an apostrophe), or an arrow function taking interpolations.
 */
function keysOf(body) {
  const out = new Map();
  for (const m of body.matchAll(/^\s{4}(\w+):\s*(\(|'|")/gm)) {
    out.set(m[1], m[2] === '(' ? 'fn' : 'str');
  }
  return out;
}

const en = keysOf(section('en'));
const ar = keysOf(section('ar'));

const missing = [...en.keys()].filter((k) => !ar.has(k));
const extra = [...ar.keys()].filter((k) => !en.has(k));
const mismatch = [...en.entries()]
  .filter(([k, kind]) => ar.has(k) && ar.get(k) !== kind)
  .map(([k]) => k);

const problems = [
  missing.length && `missing from ar: ${missing.join(', ')}`,
  extra.length && `in ar but not en: ${extra.join(', ')}`,
  mismatch.length && `string/function mismatch: ${mismatch.join(', ')}`,
].filter(Boolean);

if (problems.length) {
  console.error(`${PATH}: ${en.size} English keys, ${ar.size} Arabic\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(`${en.size} strings, both languages complete and matched.`);
