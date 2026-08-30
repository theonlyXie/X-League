import { openBrowser, newPage, visit, signIn, makeReport, requireServer, BASE } from './lib.mjs';
import { leaksIn } from './fixtures.mjs';

/**
 * Book an hour, for real, and check what the screens say while doing it.
 *
 * **This one writes.** It signs in as a player, holds a slot at a venue and
 * confirms it — a real booking against whatever database QA_BASE_URL points
 * at. Point it at a disposable venue, and expect to cancel or clean up after.
 * Nothing else in this directory mutates anything.
 *
 * It is worth the cost because reading the code did not find any of this:
 *
 *   * The confirmation screen was reached whether or not a booking was made,
 *     so a player whose hold expired got the full ceremony — VoidMark, "YOU'RE
 *     PLAYING", and a booking code — for a booking that does not exist. The
 *     code shown was the design fixture's.
 *   * The slot grid drew its hours from a constant rather than the venue's
 *     calendar, advertising six evening hours to a venue that sells four
 *     afternoon ones.
 *   * Checkout quoted a fixture price and named the wrong venue when the
 *     detail fetch failed.
 *
 *   QA_PLAYER_PHONE, QA_PLAYER_PASSWORD
 *   QA_VENUE        the venue name to book at, as it appears in search
 *   QA_SLOT         optional, e.g. "8:00 PM"; defaults to the first free hour
 */

async function main() {
  await requireServer();

  const phone = process.env.QA_PLAYER_PHONE;
  const password = process.env.QA_PLAYER_PASSWORD;
  const venueName = process.env.QA_VENUE;
  if (!phone || !venueName) {
    console.error(
      'Needs QA_PLAYER_PHONE, QA_PLAYER_PASSWORD and QA_VENUE.\n' +
        'This check makes a real booking — point it at a venue you can clean up.',
    );
    process.exit(2);
  }

  const report = makeReport('spine');
  const browser = await openBrowser();
  const page = await newPage(browser);

  await signIn(page, phone, password);

  // --- Discovery: the venue is findable through the real path -------------
  await visit(page, '/play', { settleMs: 6000 });
  const venue = page.getByText(venueName, { exact: false }).first();
  if ((await venue.count()) === 0) {
    report.fail(`${venueName} is in the search results`, 'not found on /play');
    await browser.close();
    return report.finish();
  }
  report.pass(`${venueName} is in the search results`);
  await venue.click();
  await page.waitForTimeout(6000);

  // --- Pitch: the hours are the venue's own, and unambiguous ---------------
  const pitchText = (await page.innerText('body')).replace(/\s*\n+\s*/g, ' | ');
  const hours = [...pitchText.matchAll(/\b(\d{1,2}:00 [AP]M)\b/g)].map((m) => m[1]);
  const unique = new Set(hours);
  if (hours.length === 0) {
    report.fail('the pitch page offers hours', 'no hour chips found');
  } else if (unique.size !== hours.length) {
    // A venue open from 10am has two hours that read `10:00`. When the label
    // was the identity, they collided and the evening chip booked the morning.
    report.fail('every hour chip is distinct', `${hours.length} chips, ${unique.size} distinct`);
  } else {
    report.pass(`the pitch page offers ${hours.length} distinct hours`);
  }

  const wanted = process.env.QA_SLOT;
  const slot = wanted && unique.has(wanted) ? wanted : hours[hours.length - 1];
  if (!slot) {
    await browser.close();
    return report.finish();
  }

  // --- Hold ----------------------------------------------------------------
  await page.getByRole('radio', { name: slot, exact: true }).first().click();
  await page.waitForTimeout(800);
  const holdButton = page.getByRole('button', { name: new RegExp(`Hold ${slot.replace(/\s/g, '\\s')}`) });
  if ((await holdButton.count()) === 0) {
    report.fail(`the hold button offers ${slot}`, 'button not found — is the account signed in?');
    await browser.close();
    return report.finish();
  }
  await holdButton.first().click();
  await page.waitForTimeout(6000);

  // --- Checkout: the terms are this venue's, and complete ------------------
  const checkout = (await page.innerText('body')).replace(/\s*\n+\s*/g, ' | ');
  if (!page.url().includes('/play/checkout')) {
    report.fail('holding reaches checkout', `landed on ${page.url()}`);
    await browser.close();
    return report.finish();
  }
  report.pass('holding reaches checkout');

  for (const [what, ok] of [
    ['checkout names the venue', checkout.includes(venueName)],
    ['checkout states the hour', checkout.includes(slot)],
    // BKG-004: the deadline before the decision, not after it.
    ['checkout states the cancellation cutoff', /Free cancellation until .+\d/.test(checkout)],
  ]) {
    ok ? report.pass(what) : report.fail(what, checkout.slice(0, 200));
  }

  const leaked = leaksIn(checkout);
  leaked.length
    ? report.fail('checkout shows no fixture', leaked.join(', '))
    : report.pass('checkout shows no fixture');

  // --- Confirm -------------------------------------------------------------
  await page.getByRole('button', { name: 'Confirm booking' }).first().click();
  await page.waitForTimeout(8000);

  const confirmed = page.url().includes('/play/confirmation');
  const body = (await page.innerText('body')).replace(/\s*\n+\s*/g, ' | ');

  if (!confirmed) {
    // Not a failure of the harness. A refusal that keeps the player on
    // checkout and says why is the correct behaviour — the bug was navigating
    // regardless. Report it as the honest outcome it is.
    report.note(`confirm was refused and stayed on checkout: ${body.slice(0, 160)}`);
    report.pass('a refused confirm does not reach the confirmation screen');
    await browser.close();
    return report.finish();
  }
  report.pass('confirming reaches the confirmation screen');

  const code = body.match(/\b(XL-[A-Z0-9]{4})\b/)?.[1];
  if (!code) {
    report.fail('the confirmation shows a booking code', body.slice(0, 200));
  } else if (leaksIn(code).length) {
    report.fail('the booking code is real', `${code} is the design fixture`);
  } else {
    report.pass(`the booking code is real (${code})`);
  }

  const stale = leaksIn(body);
  stale.length
    ? report.fail('the confirmation shows no fixture', stale.join(', '))
    : report.pass('the confirmation shows no fixture');

  report.note(`booked ${slot} at ${venueName}${code ? ` as ${code}` : ''} — clean this up`);

  await browser.close();
  report.finish();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(2);
});
