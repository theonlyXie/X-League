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
 * How long a route may take to put something on screen. A ceiling, not a cost.
 *
 * This was a flat `waitForTimeout`, which meant 28 routes cost 28 × 5s whether
 * the app rendered in 200ms or not at all — three minutes on a laptop and
 * eleven on a CI runner, against a fifteen-minute job timeout. Waiting for the
 * render itself is both faster and stricter: a screen that never paints now
 * fails on its own terms rather than being judged by whatever happened to be
 * in the DOM when the clock ran out.
 */
export const SETTLE_MS = Number(process.env.QA_SETTLE_MS ?? 5000);

/**
 * Long enough after first paint for a late console error to arrive.
 *
 * Errors thrown during an effect land a tick or two after the text does, and
 * dropping this would quietly turn the console assertion into a coin flip.
 */
const QUIET_MS = Number(process.env.QA_QUIET_MS ?? 900);

/**
 * Long enough for a mount effect to have issued its first request.
 *
 * Without this, `networkidle` below answers before the fetching has begun.
 */
const EFFECT_MS = Number(process.env.QA_EFFECT_MS ?? 600);

/**
 * Go to a route and wait for it to render.
 *
 * Expo's web build paints after hydration, so a `load` event means the bundle
 * arrived rather than that anything is on screen.
 */
export async function visit(page, route, { settleMs = SETTLE_MS } = {}) {
  const before = page.errors.length;
  await page.goto(BASE + route, { waitUntil: 'load' });

  // Resolves the moment the screen has content. A timeout here is not an
  // error to swallow — it is the finding, and the empty text below reports it.
  await page
    .waitForFunction(() => (document.body?.innerText ?? '').trim().length > 20, null, {
      timeout: settleMs,
    })
    .catch(() => {});

  // The errors worth catching arrive *after* paint, from the effects that
  // fetch — the three 401s this harness found on its first run were exactly
  // that shape. An effect fires a tick after the paint it follows, so asking
  // for `networkidle` straight away can get "idle" back for the wrong reason:
  // the request has not started yet.
  //
  // So: give the effects a beat to start, then wait for the network they
  // started to finish, then keep listening a little longer for whatever the
  // failure logs.
  //
  // Confirmed by planting a 401 back into `/teams` and watching this fail on
  // it. That check is only meaningful against a server the browser can
  // actually reach: run against a static export whose Supabase URL is
  // unreachable and the requests simply hang, so no error ever arrives and
  // every route passes for the wrong reason.
  await page.waitForTimeout(EFFECT_MS);
  await page.waitForLoadState('networkidle', { timeout: settleMs }).catch(() => {});
  await page.waitForTimeout(QUIET_MS);

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
