#!/usr/bin/env node
/**
 * The repository half of the security counter.
 *
 * The database half is `supabase/tests/security_probe.sql`, which asserts the
 * posture of the schema itself. This one asserts the posture of the code and
 * what ships with it: that nothing secret is committed, that no build artefact
 * carries a key, that the dependencies with known holes are the ones we know
 * about, and that no screen evaluates a string.
 *
 * Every check is a count that must be zero. It prints a tally by severity and
 * exits non-zero if anything high or critical is standing, so it can gate a
 * build rather than only inform one.
 *
 *   node scripts/security-check.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const findings = [];
const accepted = [];
const note = (severity, title, detail) => findings.push({ severity, title, detail });

const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    // git grep exits 1 when it matches nothing, which is the good case.
    return e.stdout ?? '';
  }
};

const tracked = sh('git', ['ls-files']).split('\n').filter(Boolean);

// ---------------------------------------------------------------------------
// 1. Nothing secret is committed
// ---------------------------------------------------------------------------

// A service-role key is the whole database with the locks off. It is not used
// anywhere in this project, and the day it is committed is the day the project
// ends, so this is checked first and hardest.
const serviceRole = sh('git', ['grep', '-lI', '-E', 'sb_secret_|service_role_key|SUPABASE_SERVICE_ROLE', '--', '.'])
  .split('\n')
  .filter(Boolean);
if (serviceRole.length) {
  note('critical', 'A service-role key may be committed', serviceRole.join(', '));
}

// `-e` because the pattern starts with a dash and git would read it as a flag.
const privateKeys = sh('git', ['grep', '-lI', '-E', '-e', '-----BEGIN [A-Z ]*PRIVATE KEY', '--', '.'])
  .split('\n')
  .filter(Boolean);
if (privateKeys.length) {
  note('critical', 'A private key is committed', privateKeys.join(', '));
}

// `.env` holds whatever a developer pointed their build at. `.env.production`
// is committed on purpose and holds only publishable values; that is checked
// below rather than banned here.
const envTracked = tracked.filter((f) => /(^|\/)\.env$|(^|\/)\.env\.local$/.test(f));
if (envTracked.length) {
  note('high', 'A local .env file is committed', envTracked.join(', '));
}

const gitignore = existsSync('.gitignore') ? readFileSync('.gitignore', 'utf8') : '';
if (!/^\.env$/m.test(gitignore)) {
  note('high', '.gitignore does not ignore .env', 'add a line reading .env');
}

// The committed env files must contain publishable values and nothing else.
for (const f of tracked.filter((x) => /\.env\.production$/.test(x))) {
  const body = readFileSync(f, 'utf8');
  for (const line of body.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (!m) continue;
    const [, key, value] = m;
    const publishable = /^(EXPO_PUBLIC_|NEXT_PUBLIC_)/.test(key);
    if (!publishable) {
      note('high', `${f} sets a non-public variable`, key);
    }
    if (/^sb_secret_|^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*(service_role)/.test(value)) {
      note('critical', `${f} holds a secret-shaped value`, key);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Nothing dangerous in the code that ships
// ---------------------------------------------------------------------------

const evalLike = sh('git', [
  'grep', '-nI', '-E', String.raw`\beval\(|new Function\(|dangerouslySetInnerHTML`,
  '--', 'app', 'src', 'admin/app', 'admin/components', 'admin/lib',
]).split('\n').filter(Boolean);
if (evalLike.length) {
  note('high', 'Code evaluates a string or injects raw HTML', evalLike.slice(0, 5).join(' | '));
}

// A password or token written into the source is a password everybody who can
// read the repository knows.
const hardcoded = sh('git', [
  'grep', '-nI', '-E', String.raw`(password|passwd|secret|token)\s*[:=]\s*['"][^'"$}{]{8,}['"]`,
  '--', 'app', 'src', 'admin/app', 'admin/components', 'admin/lib', 'scripts',
]).split('\n').filter(Boolean)
  // A named field on a typed object is a shape, not a value.
  .filter((l) => !/:\s*['"]?(string|text|password)['"]?\s*[;,]/.test(l));
if (hardcoded.length) {
  note('high', 'A credential may be hardcoded', hardcoded.slice(0, 5).join(' | '));
}

// ---------------------------------------------------------------------------
// 3. Dependencies
// ---------------------------------------------------------------------------

/**
 * Advisories that have been looked at and are being carried on purpose.
 *
 * All of these are in the bundler and the prebuild tooling — they run on a
 * developer's machine and in CI, and none of their code is in the APK. The
 * attack they describe is feeding a malicious asset to the build, and the
 * assets are ours. `npm audit fix` does not resolve any of them: it rewrites
 * three hundred lines of lockfile and leaves the count at eighteen, because
 * the fixed versions are outside what the Expo SDK pins. Bumping past that pin
 * has broken this build before.
 *
 * A new advisory in anything not on this list still fails the check, which is
 * the point of writing the list down rather than lowering the threshold.
 */
const ACCEPTED = new Set([
  'image-size', 'metro', 'metro-config', 'metro-transform-worker',
  '@expo/cli', '@expo/config', '@expo/config-plugins', '@expo/inline-modules',
  '@expo/local-build-cache-provider', '@expo/metro-config', '@expo/prebuild-config',
  'expo', 'expo-router', 'expo-splash-screen', 'xcode',
  'query-string', 'decode-uri-component', 'send', 'serve-static',
  // Reached only through `xcode`, which generates an iOS project. Its "fix" is a
  // major downgrade of expo-splash-screen.
  'uuid',
]);

for (const [where, dir] of [['app', '.'], ['console', 'admin']]) {
  let audit;
  try {
    audit = JSON.parse(sh('npm', ['audit', '--json', '--prefix', dir]));
  } catch {
    note('medium', `Could not audit the ${where} dependencies`, 'npm audit did not return JSON');
    continue;
  }
  let carried = 0;
  for (const [name, v] of Object.entries(audit?.vulnerabilities ?? {})) {
    const severity = { critical: 'critical', high: 'high', moderate: 'medium', low: 'low' }[v.severity];
    if (!severity) continue;
    if (ACCEPTED.has(name)) {
      carried += 1;
      continue;
    }
    note(severity, `${where}: ${name} has a ${v.severity} advisory`, 'npm audit');
  }
  if (carried) accepted.push(`${where}: ${carried} build-toolchain advisories carried on purpose`);
}

// ---------------------------------------------------------------------------
// The tally
// ---------------------------------------------------------------------------

const order = ['critical', 'high', 'medium', 'low'];
const counts = Object.fromEntries(order.map((s) => [s, 0]));
for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;

for (const f of findings) {
  console.log(`  ${f.severity.toUpperCase().padEnd(8)} ${f.title}`);
  if (f.detail) console.log(`           ${f.detail}`);
}

for (const a of accepted) console.log(`  ACCEPTED ${a}`);

const tally = order.map((s) => `${counts[s]} ${s}`).join(' · ');
console.log(findings.length ? `\nsecurity: ${tally}` : `\nsecurity: nothing standing (${accepted.length ? tally + ', ' : ''}accepted risks listed above)`);

// Moderate advisories in a build toolchain are worth knowing and not worth
// failing a build over. Anything higher stops it.
process.exit(counts.critical + counts.high > 0 ? 1 : 0);
