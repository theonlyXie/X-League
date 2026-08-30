import { openBrowser, newPage, visit, signIn, watchCalls, makeReport, requireServer } from './lib.mjs';
import { ROUTES, PLAYER_SURFACES, OWNER_SURFACES, MUST_REACH_BACKEND } from './routes.mjs';

/**
 * Every signed-in screen reaches the database, and the database answers.
 *
 * `leak` asks what a screen says; this asks whether it had any right to say it.
 * The two are not the same question, and the gap between them is where this
 * product's defects lived. A screen that calls a function it is not allowed to
 * call renders "No teams yet" — the same words, to the pixel, as a screen
 * belonging to somebody who genuinely has no teams. No sentinel string can
 * separate those. The status code separates them immediately.
 *
 * So the assertions here are about the wire, not the pixels:
 *
 *   1. Nothing a signed-in screen asks for comes back 4xx or 5xx.
 *   2. Nothing it asks for goes unanswered.
 *   3. A screen that is supposed to show your data asked for it.
 *
 * The third is the one that catches a screen quietly falling back to a fixture:
 * it renders, it is error-free, it leaks no sentinel because somebody renamed
 * the sample player — and it never opened a connection.
 *
 *   QA_PLAYER_PHONE, QA_PLAYER_PASSWORD
 *   QA_OWNER_PHONE,  QA_OWNER_PASSWORD   (a member of a venue's staff)
 *
 * Reads and navigates only. Nothing here books, cancels, or writes.
 */

const name = (path) => ROUTES.find((r) => r.path === path)?.name ?? path;

/** `rpc/my_teams 200` — the call map, so a report can be read without a debugger. */
const summarise = (calls) =>
  calls.length
    ? calls.map((c) => `${c.name} ${c.failed ?? c.status ?? 'no answer'}`).join(', ')
    : 'no calls';

async function sweep(browser, report, { phone, password, surfaces, who }) {
  const page = await newPage(browser);
  watchCalls(page);
  await signIn(page, phone, password);

  const home = await visit(page, '/');
  if (home.text.includes('Sign in to see your matches')) {
    report.fail(`${who} is signed in`, 'still on the signed-out home screen — check the credentials');
    await page.close();
    return;
  }
  report.pass(`${who} is signed in`);

  for (const path of surfaces) {
    const { calls } = await visit(page, path);
    const label = `${who} · ${name(path)}`;

    // A request that never came back is not a pass. The static-export trap was
    // exactly this shape: an unreachable host, requests left hanging, and a
    // clean run for the worst possible reason.
    const silent = calls.filter((c) => c.failed || c.status === null);
    const refused = calls.filter((c) => c.status !== null && c.status >= 400);

    if (refused.length) {
      const detail = [];
      for (const c of refused) {
        const body = c.body ? await c.body : '';
        detail.push(`${c.method} ${c.name} → ${c.status}${body ? ` · ${body}` : ''}`);
      }
      report.fail(label, detail.join('\n       '));
    } else if (silent.length) {
      report.fail(label, silent.map((c) => `${c.name} · ${c.failed ?? 'no response'}`).join('\n       '));
    } else if (MUST_REACH_BACKEND.includes(path) && calls.length === 0) {
      report.fail(label, 'showed a screen of your data without asking the database for any');
    } else {
      report.pass(`${label}  ${summarise(calls)}`);
    }
  }

  await page.close();
}

async function main() {
  await requireServer();
  const report = makeReport('wire');

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
    await sweep(browser, report, { phone: player[0], password: player[1], surfaces: PLAYER_SURFACES, who: 'player' });
  } else {
    report.note('no player credentials — skipping the player surfaces');
  }

  if (owner[0]) {
    await sweep(browser, report, { phone: owner[0], password: owner[1], surfaces: OWNER_SURFACES, who: 'owner' });
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
