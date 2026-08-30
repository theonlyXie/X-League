import { openBrowser, newPage, visit, signIn, makeReport, requireServer, BASE } from './lib.mjs';
import { ROUTES, OWNER_SURFACES, FIXTURE_COPY_WHEN_SIGNED_OUT } from './routes.mjs';
import { loadStrings, englishSentinels } from './strings.mjs';

/**
 * The app in Arabic, mirrored, on every route.
 *
 * `npm run check:i18n` proves both locales carry the same 416 keys. It cannot
 * prove a screen *uses* them — a hardcoded English label passes key parity
 * perfectly, because there is no key to be missing. And nothing in this
 * repository had ever looked at a mirrored layout at all, on a product whose
 * market reads right to left.
 *
 * Three assertions per route:
 *
 *   1. The document is actually in RTL. If direction never applied, everything
 *      below passes for the wrong reason.
 *   2. No English from the app's own string table is on screen. Read from
 *      `src/i18n/strings.ts` rather than copied, so it cannot go stale.
 *   3. The page does not scroll sideways. Mirroring is where a hardcoded
 *      `left`, `marginLeft` or `flexDirection: 'row'` stops agreeing with the
 *      layout, and pushing content off the edge is how that shows up.
 *
 * Signed out, like `smoke`, so it needs no account and writes nothing — and
 * then, if `QA_OWNER_PHONE` / `QA_OWNER_PASSWORD` are set, over Owner Mode
 * again signed in.
 *
 * That second pass is not optional thoroughness. Owner Mode draws the design's
 * sample shift when signed out and the venue's real one when signed in, and
 * they are different code. Three hardcoded English tile labels — OCCUPANCY,
 * CASH DUE, CONFLICTS — sat on the live branch only, invisible to any number
 * of signed-out runs, which is the precise blind spot this harness exists to
 * close.
 */

/** Direction is stored, not negotiated — the app reads this key on boot. */
const STORAGE_KEY = 'x-league.locale';

const name = (path) => ROUTES.find((r) => r.path === path)?.name ?? path;

/** Put the app in Arabic before it boots, on the origin it reads the key from. */
async function useArabic(page) {
  // Switching through the UI instead would test the toggle rather than the
  // screens, and would have to be redone on every reload the harness performs.
  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate((key) => localStorage.setItem(key, 'ar'), STORAGE_KEY);
}

async function checkRoute(page, report, path, { sentinels, keyNames, exempt, who }) {
  const { text, errors } = await visit(page, path);

  const layout = await page.evaluate(() => ({
    dir: document.documentElement.getAttribute('dir'),
    // +2 rather than >, because sub-pixel rounding on a scaled viewport
    // reports a fractional overhang on pages that are in fact exact.
    overflowBy: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));

  const label = `${who ? `${who} · ` : ''}${name(path)} (${path})`;

  if (layout.dir !== 'rtl') {
    report.fail(label, `document direction is ${layout.dir ?? 'unset'}, not rtl`);
    return;
  }

  // A key on screen instead of its copy. This is not an English leak — a key
  // is not English — so no sentinel would ever catch it, and it passed every
  // other assertion here while the onboarding questions were being converted
  // to keys. It is checked in both languages because it is wrong in both.
  const rawKeys = keyNames.filter((k) => text.includes(k));
  if (rawKeys.length) {
    report.fail(
      `${who ? `${who} · ` : ''}${name(path)} (${path})`,
      `string-table key rendered instead of its copy: ${rawKeys.slice(0, 4).join(', ')}`,
    );
    return;
  }

  const leaked = exempt ? [] : sentinels.filter((s) => text.includes(s.value));

  if (leaked.length) {
    report.fail(
      label,
      `English on an Arabic screen: ${leaked
        .slice(0, 4)
        .map((s) => `${s.key} — "${s.value}"`)
        .join('; ')}${leaked.length > 4 ? ` (+${leaked.length - 4} more)` : ''}`,
    );
  } else if (layout.overflowBy > 2) {
    report.fail(label, `page scrolls sideways by ${layout.overflowBy}px when mirrored`);
  } else if (errors.length) {
    report.fail(label, errors.slice(0, 2).join('\n       '));
  } else {
    report.pass(exempt ? `${label}  — mirrored; sample copy not checked` : label);
  }
}

async function main() {
  await requireServer();
  const report = makeReport('rtl');

  const strings = await loadStrings();
  const sentinels = englishSentinels(strings);
  // Long enough not to collide with ordinary words on screen. A key like `back`
  // would match the English word; `asOutSpdName` matches only itself.
  const keyNames = Object.keys(strings.en).filter((k) => k.length >= 8);
  report.note(
    `${sentinels.length} English phrases must not appear while in Arabic, ` +
      `and ${keyNames.length} key names must not appear in either`,
  );

  const browser = await openBrowser();
  const page = await newPage(browser);
  await useArabic(page);

  for (const route of ROUTES) {
    // Sign-in and onboarding are reachable before a locale is ever chosen, but
    // they read the same stored value, so they are checked like the rest.
    await checkRoute(page, report, route.path, {
      sentinels,
      keyNames,
      // Named rather than skipped, so the exemption stays visible in every run
      // instead of quietly shrinking what the check covers.
      exempt: FIXTURE_COPY_WHEN_SIGNED_OUT.includes(route.path),
    });
  }
  await page.close();

  const owner = [process.env.QA_OWNER_PHONE, process.env.QA_OWNER_PASSWORD];
  if (owner[0]) {
    const staff = await newPage(browser);
    // Signed in first, then switched. Doing it the other way round means
    // driving a sign-in form whose labels are in Arabic, and a check that
    // depends on translated selectors breaks every time the copy is reworded.
    // The locale and the session live side by side in storage, so setting one
    // afterwards does not disturb the other.
    await signIn(staff, owner[0], owner[1]);
    await useArabic(staff);

    // No exemption on this pass: signed in there is no sample shift to draw,
    // so every word on screen is the product's own and must be Arabic.
    for (const path of OWNER_SURFACES) {
      await checkRoute(staff, report, path, { sentinels, keyNames, exempt: false, who: 'owner' });
    }
    await staff.close();
  } else {
    report.note('no QA_OWNER_PHONE — Owner Mode checked signed out only, where it draws sample data');
  }

  await browser.close();
  report.finish();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(2);
});
