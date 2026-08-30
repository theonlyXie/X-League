import { openBrowser, newPage, visit, signIn, makeReport, requireServer } from './lib.mjs';
import { PLAYER_SURFACES, OWNER_SURFACES, ROUTES } from './routes.mjs';
import { leaksIn, SHOWCASE_MARKERS } from './fixtures.mjs';

/**
 * No signed-in surface shows the design's sample data.
 *
 * This is the check the whole harness exists for. The product's worst class of
 * bug was never a crash — it was a screen quietly substituting a fixture for a
 * real person's data and saying nothing: a venue owner shown three invented
 * arrivals with an instruction to collect cash at the gate from somebody who
 * does not exist, and the error text underneath in small grey type.
 *
 * Needs two accounts on whatever database QA_BASE_URL points at. It reads and
 * navigates only — nothing here books, cancels, or writes.
 *
 *   QA_PLAYER_PHONE, QA_PLAYER_PASSWORD
 *   QA_OWNER_PHONE,  QA_OWNER_PASSWORD   (a member of a venue's staff)
 */

const name = (path) => ROUTES.find((r) => r.path === path)?.name ?? path;

async function sweep(browser, report, { phone, password, surfaces, who }) {
  const page = await newPage(browser);
  await signIn(page, phone, password);

  // If sign-in did not take, every assertion below is meaningless rather than
  // passing — say so instead of reporting a clean sweep of a signed-out app.
  const home = await visit(page, '/');
  if (home.text.includes('Sign in to see your matches')) {
    report.fail(`${who} is signed in`, 'still on the signed-out home screen — check the credentials');
    await page.close();
    return;
  }
  report.pass(`${who} is signed in`);

  for (const path of surfaces) {
    const { text, errors } = await visit(page, path);
    const found = leaksIn(text, SHOWCASE_MARKERS);
    if (found.length) {
      report.fail(`${who} · ${name(path)}`, `fixture on screen: ${found.join(', ')}`);
    } else if (errors.length) {
      report.fail(`${who} · ${name(path)}`, errors.slice(0, 2).join('\n       '));
    } else {
      report.pass(`${who} · ${name(path)}`);
    }
  }

  await page.close();
}

async function main() {
  await requireServer();
  const report = makeReport('leak');

  const player = [process.env.QA_PLAYER_PHONE, process.env.QA_PLAYER_PASSWORD];
  const owner = [process.env.QA_OWNER_PHONE, process.env.QA_OWNER_PASSWORD];

  if (!player[0] && !owner[0]) {
    console.error(
      'No credentials. Set QA_PLAYER_PHONE / QA_PLAYER_PASSWORD and optionally\n' +
        'QA_OWNER_PHONE / QA_OWNER_PASSWORD against a database you are happy to read.',
    );
    process.exit(2);
  }

  const browser = await openBrowser();

  if (player[0]) {
    await sweep(browser, report, {
      phone: player[0],
      password: player[1],
      surfaces: PLAYER_SURFACES,
      who: 'player',
    });
  } else {
    report.note('no player credentials — skipping the player surfaces');
  }

  if (owner[0]) {
    await sweep(browser, report, {
      phone: owner[0],
      password: owner[1],
      surfaces: OWNER_SURFACES,
      who: 'owner',
    });
  } else {
    report.note('no owner credentials — skipping Owner Mode');
  }

  await browser.close();
  report.finish();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(2);
});
