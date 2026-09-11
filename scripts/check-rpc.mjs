#!/usr/bin/env node
/**
 * Every RPC the clients call exists in the schema, with the arguments they send.
 *
 *   supabase/tests/bootstrap.sh && node scripts/check-rpc.mjs
 *
 * This exists because the product shipped for ten days with sign-up broken and
 * nothing noticed. A change added three questions to the sign-up screen, passed
 * them to `sign_up` as `p_birth_year`, `p_gender` and `p_governorate`, and never
 * wrote the migration. PostgREST resolves a function by matching the body's keys
 * against parameter names, so it did not ignore the extra three — it failed to
 * find `sign_up` at all and answered PGRST202. Nobody could create an account.
 * `search_venues` and `set_my_details` went the same way in the same change.
 *
 * Nothing in the repository could have caught it. `tsc` does not know what a
 * database is; the SQL suites test the schema against itself and never make the
 * call the app makes; the browser checks need an account, which is the thing
 * that had stopped working. This is the seam, and it is a seam precisely because
 * the two halves are written in different languages and checked by different
 * tools.
 *
 * How it works: the call sites are read out of the TypeScript — `.rpc('name', {
 * p_x: ..., p_y: ... })` — and matched against `pg_proc`. A call is satisfied by
 * any overload whose parameter names are a superset of the keys sent, which is
 * PostgREST's own rule. Positional arguments are not a thing here; both clients
 * pass an object, and a call with no object at all is satisfied by any overload
 * whose parameters all have defaults.
 *
 * It needs a database to read the schema from. `supabase/tests/bootstrap.sh`
 * builds one from the migrations in a few seconds, which is what CI does before
 * running this beside the suites.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const PGHOST = process.env.PGHOST ?? '/tmp/pgsock';
const PGPORT = process.env.PGPORT ?? '5433';
const PGUSER = process.env.PGUSER ?? 'postgres';

/** Where the two clients live. Both talk to the same schema. */
const SOURCES = ['app', 'src', 'admin/app', 'admin/lib', 'admin/components'];

// ---------------------------------------------------------------------------
// What the clients call
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

/**
 * The keys of an object literal, at its top level only.
 *
 * A nested object — `{ p_filter: { state: 'open' } }` — has keys of its own that
 * are not parameter names, and counting them would report a mismatch against a
 * function that is perfectly fine.
 */
function topLevelKeys(body) {
  const keys = [];
  for (const match of body.matchAll(/(^|[,{[(])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g)) {
    const before = body.slice(0, match.index);
    const opened = (before.match(/[{[(]/g) ?? []).length;
    const closed = (before.match(/[}\])]/g) ?? []).length;
    if (opened === closed) keys.push(match[2]);
  }
  return keys;
}

const calls = new Map();

for (const base of SOURCES) {
  for (const file of walk(join(root, base))) {
    const source = readFileSync(file, 'utf8');
    const re = /\.rpc\(\s*'([a-z0-9_]+)'\s*(?:,\s*\{)?/g;
    let match;
    while ((match = re.exec(source))) {
      const name = match[1];
      let keys = [];

      // The regex ends on `{` when the call passes an object; scan to its match.
      if (source[re.lastIndex - 1] === '{') {
        let depth = 1;
        let i = re.lastIndex;
        while (i < source.length && depth > 0) {
          const c = source[i];
          if (c === '{') depth += 1;
          else if (c === '}') depth -= 1;
          i += 1;
        }
        keys = topLevelKeys(source.slice(re.lastIndex, i - 1));
      }

      if (!calls.has(name)) calls.set(name, { name, keys: new Set(), files: new Set() });
      const call = calls.get(name);
      keys.forEach((k) => call.keys.add(k));
      call.files.add(relative(root, file));
    }
  }
}

// ---------------------------------------------------------------------------
// What the schema has
// ---------------------------------------------------------------------------

let rows;
try {
  rows = execFileSync(
    'psql',
    [
      '-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-At', '-F', '\t',
      '-c',
      `select p.proname, coalesce(string_agg(a.argname, ',' order by a.ord), '')
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         left join lateral unnest(coalesce(p.proargnames, '{}'::text[]))
              with ordinality as a(argname, ord) on true
        where n.nspname = 'public'
        group by p.oid, p.proname;`,
    ],
    { encoding: 'utf8' },
  );
} catch (e) {
  console.error(
    'check-rpc: could not read the schema.\n' +
      `  psql -h ${PGHOST} -p ${PGPORT} -U ${PGUSER} did not answer.\n` +
      '  Build one first:  supabase/tests/bootstrap.sh',
  );
  process.exit(2);
}

const schema = new Map();
for (const line of rows.split('\n').filter(Boolean)) {
  const [name, args] = line.split('\t');
  if (!schema.has(name)) schema.set(name, []);
  schema.get(name).push(new Set((args ?? '').split(',').filter(Boolean)));
}

// ---------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------

const problems = [];

for (const call of [...calls.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const overloads = schema.get(call.name);
  const sent = [...call.keys].sort();

  if (!overloads) {
    problems.push({
      name: call.name,
      what: 'no function of that name exists',
      sent,
      have: [],
      files: [...call.files],
    });
    continue;
  }

  // PostgREST's rule: a candidate matches when it accepts every key sent.
  if (!overloads.some((params) => sent.every((key) => params.has(key)))) {
    problems.push({
      name: call.name,
      what: 'no overload accepts the arguments sent',
      sent,
      have: overloads.map((p) => [...p].sort()),
      files: [...call.files],
    });
  }
}

if (problems.length === 0) {
  console.log(`${calls.size} RPCs called by the clients, all present with the arguments they send.`);
  process.exit(0);
}

for (const p of problems) {
  console.error(`\n  ${p.name} — ${p.what}`);
  console.error(`    sends: ${p.sent.length ? p.sent.join(', ') : '(no arguments)'}`);
  if (p.have.length) {
    for (const params of p.have) {
      console.error(`    has:   ${params.length ? params.join(', ') : '(no arguments)'}`);
    }
  }
  console.error(`    from:  ${p.files.join(', ')}`);
}
console.error(
  `\ncheck-rpc: ${problems.length} of ${calls.size} calls would fail at runtime with PGRST202.\n`,
);
process.exit(1);
