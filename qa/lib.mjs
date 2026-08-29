import { chromium } from 'playwright';

/**
 * The browser driver the checks share.
 *
 * Everything here exists to answer one question the type system cannot: what
 * does this screen actually put in front of a person? Every defect this
 * harness was written for got past `tsc` and past review, and was obvious
 * within seconds of looking at the rendered page.
 */

export const BASE = process.env.QA_BASE_URL ?? 'http://localhost:8081';

/** The phone frame the design draws at. */
const VIEWPORT = { width: 390, height: 900 };

/**
 * Chromium is pre-installed in some environments and not others. Prefer an
 * explicit path, fall back to whatever Playwright resolves for itself, and say
 * plainly which one is missing rather than failing inside the launch.
 */
function launchOptions() {
  const explicit = process.env.QA_CHROMIUM ?? process.env.PLAYWRIGHT_CHROMIUM;
  return explicit ? { executablePath: explicit } : {};
}

export async function openBrowser() {
  try {
    return await chromium.launch(launchOptions());
  } catch (e) {
    throw new Error(
      `Could not launch Chromium. Set QA_CHROMIUM to a browser binary, or run ` +
        `\`npx playwright install chromium\` from qa/.\n${e.message}`,
    );
  }
}

/**
 * One page, with its console and its crashes captured from the first frame.
 *
 * The errors matter as much as the pixels. A React duplicate-key warning is
 * how the slot grid announced that a venue open from ten in the morning drew
 * two chips reading `10:00`, one of which booked the wrong hour — a bug no
 * screenshot would have made obvious and no typecheck could have caught.
 */
export async function newPage(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.errors = errors;
  return page;
}

/**
 * Go to a route and wait for it to settle.
 *
 * Expo's web build renders after hydration, so a `load` event means the
 * bundle arrived rather than that anything is on screen. The settle time is
 * generous on purpose: a check that races the app reports failures that are
 * its own.
 */
export async function visit(page, route, { settleMs = 5000 } = {}) {
  const before = page.errors.length;
  await page.goto(BASE + route, { waitUntil: 'load' });
  await page.waitForTimeout(settleMs);
  return {
    route,
    text: (await page.innerText('body')).replace(/\s*\n+\s*/g, ' | ').trim(),
    errors: page.errors.slice(before),
  };
}

/** Sign in through the real screen. There is no back door, by design. */
export async function signIn(page, phone, password) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load' });
  await page.waitForTimeout(4500);
  await page.getByLabel('Mobile number', { exact: false }).first().fill(phone);
  await page.getByLabel('Password', { exact: true }).first().fill(password);
  await page.getByText('Sign in', { exact: true }).first().click();
  await page.waitForTimeout(7000);
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const RED = '[31m';
const GREEN = '[32m';
const DIM = '[2m';
const OFF = '[0m';

export function makeReport(title) {
  const failures = [];
  let checked = 0;

  return {
    pass(what) {
      checked++;
      console.log(`  ${GREEN}ok${OFF}   ${what}`);
    },
    fail(what, detail) {
      checked++;
      failures.push({ what, detail });
      console.log(`  ${RED}FAIL${OFF} ${what}`);
      if (detail) console.log(`       ${DIM}${detail}${OFF}`);
    },
    note(text) {
      console.log(`  ${DIM}${text}${OFF}`);
    },
    /** Exits non-zero on any failure, so this is usable as a gate. */
    finish() {
      console.log(
        `\n${title}: ${checked - failures.length}/${checked} passed` +
          (failures.length ? `, ${RED}${failures.length} failed${OFF}` : ''),
      );
      if (failures.length) process.exitCode = 1;
      return failures.length === 0;
    },
  };
}

/** A dev server that is not running produces a wall of confusing failures. */
export async function requireServer() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(90_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.error(
      `Nothing answering at ${BASE}.\n` +
        `Start it with \`npm run web\` from the repository root, or set QA_BASE_URL.\n${e.message}`,
    );
    process.exit(2);
  }
}
