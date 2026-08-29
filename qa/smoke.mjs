import { openBrowser, newPage, visit, makeReport, requireServer } from './lib.mjs';
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
async function main() {
  await requireServer();
  const report = makeReport('smoke');
  const browser = await openBrowser();
  const page = await newPage(browser);

  for (const route of ROUTES) {
    const { text, errors } = await visit(page, route.path);

    if (text.length < 20) {
      report.fail(`${route.name} (${route.path}) renders`, `body was ${text.length} chars`);
    } else if (errors.length) {
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
