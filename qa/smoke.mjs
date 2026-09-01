import { openBrowser, newPage, visit, makeReport, requireServer, lookAround } from './lib.mjs';
import { ROUTES } from './routes.mjs';

/**
 * Every route renders, and none of them complains.
 *
 * Needs no account and mutates nothing, which is what makes it the check worth
 * running on every change. It asserts two things per screen:
 *
 *   1. Something rendered. A blank body is a crash that React swallowed.
 *   2. The console stayed quiet. This is the half people skip, and it is the
 *      half that found the worst bug of the review pass: a duplicate-key
 *      warning was React reporting that the slot grid had drawn two chips with
 *      the same identity, one of which booked the wrong hour.
 */
/**
 * A picture of whatever failed, named after the route.
 *
 * On a laptop the console output is enough. In CI it is not: "Checkout is not
 * quiet" with a stack trace does not show that the screen underneath it was
 * blank, and the workflow uploads these so the failure can be looked at rather
 * than reasoned about.
 */
async function shoot(page, route) {
  const name = `failure-${route.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'}.png`;
  await page.screenshot({ path: new URL(name, import.meta.url).pathname, fullPage: true }).catch(() => {});
}

async function main() {
  await requireServer();
  const report = makeReport('smoke');
  const browser = await openBrowser();
  const page = await newPage(browser);

  // Past the sign-in gate, once, or every route below is the sign-in screen.
  if (!(await lookAround(page))) {
    report.fail('the way past the sign-in gate', 'no "look around" link on the first screen');
  }

  for (const route of ROUTES) {
    const { text, errors } = await visit(page, route.path);

    if (text.length < 20) {
      await shoot(page, route);
      report.fail(`${route.name} (${route.path}) renders`, `body was ${text.length} chars`);
    } else if (errors.length) {
      await shoot(page, route);
      report.fail(`${route.name} (${route.path}) is quiet`, errors.slice(0, 3).join('\n       '));
    } else {
      report.pass(`${route.name} (${route.path})`);
    }
  }

  await browser.close();
  report.finish();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(2);
});
