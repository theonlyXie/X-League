/**
 * Fixture data for Owner Mode, carried over from `XL Owner.dc.html`.
 *
 * §5.4: the owner calendar is the canonical inventory timeline — app, phone,
 * WhatsApp, recurring and walk-in reservations all land here with a source
 * label, which is why `source` is never optional.
 */

export type BookingSource = 'app' | 'phone' | 'walk' | 'open' | 'block';

export const VENUE = { name: 'Stadium One', pitches: ['A', 'B', 'C'] } as const;

/**
 * The sample evening, in the reader's language.
 *
 * These used to be plain English constants, which meant a venue opening the app
 * in Arabic — before it has signed in, which is the first thing it does — read
 * a whole screen of English. The names and the pitch labels stay as they are:
 * those are somebody's data, and a venue that calls its pitch "Pitch A" calls
 * it that in both languages.
 */
type Copy = (typeof import('@/i18n/strings'))['STRINGS']['en'];

export const ownerKpis = (t: Copy, num: (n: number) => string) =>
  [
    { label: t.ownOccupancy, value: `${num(78)}%`, sub: t.shSlotsOpen(num(3)), accent: false },
    { label: t.ownCashDue, value: num(400), sub: t.shGates(num(4)), accent: true },
    { label: t.ownConflicts, value: num(0), sub: t.ownOneCalendar, accent: false },
  ] as const;

export type Arrival = {
  time: string;
  meridiem: string;
  title: string;
  source: BookingSource;
  /** Shown as a source badge next to the title, when it is not an app booking. */
  badge?: string;
  detail: string;
  /** Money line — gold when it is cash to collect, burgundy when it is owed. */
  money?: { text: string; tone: 'due' | 'unpaid'; amount?: string };
  /** The app booking that just landed gets the highlighted treatment. */
  justBooked?: { code: string };
  /** Present when the row came from the venue calendar rather than fixtures. */
  bookingId?: string;
  checkedIn?: boolean;
  /** What is still owed on this booking, from the ledger. */
  dueEgp?: number;
  /** The booking's own state, so a no-show stays visible as one. */
  state?: string;
};

export const arrivals = (t: Copy, money: (egp: number) => string): Arrival[] => [
  {
    time: '9:00',
    meridiem: t.shPm,
    title: 'Basel Elsayed · Pitch A',
    source: 'app',
    detail: t.shSideAndSubs,
    money: { text: t.ownDueAtGate(money(100)), tone: 'due' },
    justBooked: { code: 'XL-7K42' },
  },
  {
    time: '10:00',
    meridiem: t.shPm,
    title: 'Hesham F. · Pitch A',
    source: 'phone',
    badge: t.shPhone,
    detail: t.shRegularTuesday,
    money: { text: t.shDepositUnpaid, tone: 'unpaid' },
  },
  {
    time: '10:00',
    meridiem: t.shPm,
    title: 'Walk-in · Pitch B',
    source: 'walk',
    badge: t.shDesk,
    detail: t.shPaidNoContact,
  },
];

export const openTonight = (t: Copy) => ({ count: 3, detail: t.shOpenHours });

export type Cell = {
  source: BookingSource;
  title: string;
  detail: string;
  /** When the cell came from a real calendar — what tapping it can act on. */
  startsAt?: string;
  pitchId?: string;
  pitchLabel?: string;
  priceEgp?: number;
  bookingId?: string;
};
export type CalendarRow = { time: string; a: Cell; b: Cell; c: Cell };

const cell = (source: BookingSource, title: string, detail: string): Cell => ({ source, title, detail });

/**
 * One evening across three pitches, every channel visible at once.
 *
 * A function of the copy for the same reason the arrivals are: this is what a
 * venue reads before it signs in, and it was English regardless of language.
 * `5-a-side` and the walk-in label are the venue's own words in the fiction, so
 * they come from the table like the rest of the chrome.
 */
export const calendar = (t: Copy, money: (egp: number) => string): CalendarRow[] => {
  const open = (price: number) => cell('open', t.ownChannelOpen, money(price));
  const walk = () => cell('walk', t.ownChannelWalkIn, t.shPaid);
  const side = t.ownFiveASide;

  return [
    {
      time: '6 PM',
      a: walk(),
      b: open(300),
      c: cell('phone', 'Sameh A.', side),
    },
    {
      time: '7 PM',
      a: open(300),
      b: cell('phone', 'Karim T.', side),
      c: cell('phone', 'Sameh A.', side),
    },
    {
      time: '8 PM',
      a: cell('phone', 'Amr S.', t.shDepositOk),
      b: open(300),
      c: cell('block', t.ownCellBlocked, t.shWatering),
    },
    {
      time: '9 PM',
      a: cell('app', 'Basel E.', `XL-7K42 · ${t.ownCash}`),
      b: walk(),
      c: cell('phone', 'Ziad M.', side),
    },
    {
      time: '10 PM',
      a: cell('phone', 'Hesham F.', t.shUnpaid),
      b: walk(),
      c: cell('app', 'Nour K.', 'XL-7K51'),
    },
    {
      time: '11 PM',
      a: open(260),
      b: open(260),
      c: open(260),
    },
  ];
};

/**
 * The legend is drawn on the live calendar as well as the showcase one, so its
 * labels are keys rather than words — they were English on a venue's real
 * Arabic screen, which is the one place in this file where that is a defect
 * rather than sample data.
 */
export const CALENDAR_LEGEND: { source: BookingSource; label: OwnerChannelKey }[] = [
  { source: 'app', label: 'ownChannelApp' },
  { source: 'phone', label: 'ownChannelPhone' },
  { source: 'walk', label: 'ownChannelWalkIn' },
  { source: 'open', label: 'ownChannelOpen' },
];

type OwnerChannelKey = 'ownChannelApp' | 'ownChannelPhone' | 'ownChannelWalkIn' | 'ownChannelOpen';
