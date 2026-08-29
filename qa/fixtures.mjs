/**
 * Strings that only exist in the design fixtures.
 *
 * The dominant defect of this product's first year was a screen quietly
 * substituting the design's sample data for a real person's — a signed-in
 * player greeted by a character's name, a venue owner shown three invented
 * arrivals with an instruction to collect cash from somebody who does not
 * exist, a confirmation screen showing a booking code for a booking that was
 * never made. Every one of them typechecked. Every one of them was obvious on
 * screen.
 *
 * So: a list of strings that cannot legitimately appear once somebody is
 * signed in against a real database. Each is chosen to be unambiguous —
 * nothing here can also be produced by real data.
 *
 * `Stadium One`, `Basel Elsayed` and `Nasr City` are deliberately *absent*.
 * They are fixture values, but they are also seeded rows in the live project,
 * so a sentinel on them would fire on perfectly honest screens. A check that
 * cries wolf is a check people learn to skip.
 */
export const FIXTURE_SENTINELS = [
  // The design's booking code. Real codes are generated and random.
  'XL-7K42',
  'XL-7K51',

  // Hardcoded dates from the artboards.
  'Tue 18 Aug',
  'Tuesday 18 August',
  'evening shift',

  // The fixture card's level and identity line.
  'LVL 12',
  'BASEL E.',

  // `t.gateNote` — a fixture that lived in the strings file rather than the
  // fixtures file, which is exactly why it survived so long.
  'Gate 2 · ask for Pitch A',

  // The fixture arrivals on Owner Today.
  '5-a-side · 5 + 2 subs · 60 min',
  '2nd reminder sent',
  'no contact on file',
  'regular Tuesday',

  // HOUSE_RULES: names a deposit the product no longer takes and a
  // cancellation window that is not the policy.
  'Deposit is paid in cash at the gate',
  'Free cancellation until 6 hours before kick-off',

  // The fixture's open-slots panel.
  '7:00 PM · 8:00 PM Pitch B · 11:00 PM',
];

/**
 * Copy that means the screen is standing in for a signed-out visitor. Finding
 * one of these while signed in is the same class of bug as a sentinel: the
 * surface has decided you are nobody.
 */
export const SHOWCASE_MARKERS = [
  'Sample shift — sign in as venue staff',
  'Sample day — sign in as venue staff',
];

/** Every sentinel found in a blob of rendered text. */
export function leaksIn(text, extra = []) {
  return [...FIXTURE_SENTINELS, ...extra].filter((s) => text.includes(s));
}
