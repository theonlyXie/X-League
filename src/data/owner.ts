/**
 * Fixture data for Owner Mode, carried over from `XL Owner.dc.html`.
 *
 * §5.4: the owner calendar is the canonical inventory timeline — app, phone,
 * WhatsApp, recurring and walk-in reservations all land here with a source
 * label, which is why `source` is never optional.
 */

export type BookingSource = 'app' | 'phone' | 'walk' | 'open' | 'block';

export const VENUE = { name: 'Stadium One', shift: 'Tue 18 Aug · evening shift', pitches: ['A', 'B', 'C'] } as const;

export const OWNER_KPIS = [
  { label: 'OCCUPANCY', value: '78%', sub: '3 slots open', accent: false },
  { label: 'CASH DUE', value: '400', sub: 'EGP · 4 gates', accent: true },
  { label: 'CONFLICTS', value: '0', sub: 'one calendar', accent: false },
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
  money?: { text: string; tone: 'due' | 'unpaid' };
  /** The app booking that just landed gets the highlighted treatment. */
  justBooked?: { code: string };
  /** Present when the row came from the venue calendar rather than fixtures. */
  bookingId?: string;
  checkedIn?: boolean;
  depositEgp?: number;
};

export const ARRIVALS: Arrival[] = [
  {
    time: '9:00',
    meridiem: 'PM',
    title: 'Basel Elsayed · Pitch A',
    source: 'app',
    detail: '5-a-side · 5 + 2 subs · 60 min',
    money: { text: 'EGP 100 cash to collect at gate', tone: 'due' },
    justBooked: { code: 'XL-7K42' },
  },
  {
    time: '10:00',
    meridiem: 'PM',
    title: 'Hesham F. · Pitch A',
    source: 'phone',
    badge: 'PHONE',
    detail: '5-a-side · regular Tuesday',
    money: { text: 'Deposit unpaid · 2nd reminder sent', tone: 'unpaid' },
  },
  {
    time: '10:00',
    meridiem: 'PM',
    title: 'Walk-in · Pitch B',
    source: 'walk',
    badge: 'DESK',
    detail: 'Paid in full · no contact on file',
  },
];

export const OPEN_TONIGHT = {
  count: 3,
  detail: '7:00 PM · 8:00 PM Pitch B · 11:00 PM',
};

export type Cell = { source: BookingSource; title: string; detail: string };
export type CalendarRow = { time: string; a: Cell; b: Cell; c: Cell };

const cell = (source: BookingSource, title: string, detail: string): Cell => ({ source, title, detail });

/** One evening across three pitches, every channel visible at once. */
export const CALENDAR: CalendarRow[] = [
  {
    time: '6 PM',
    a: cell('walk', 'Walk-in', 'paid'),
    b: cell('open', 'Open', 'EGP 300'),
    c: cell('phone', 'Sameh A.', '5-a-side'),
  },
  {
    time: '7 PM',
    a: cell('open', 'Open', 'EGP 300'),
    b: cell('phone', 'Karim T.', '5-a-side'),
    c: cell('phone', 'Sameh A.', '5-a-side'),
  },
  {
    time: '8 PM',
    a: cell('phone', 'Amr S.', 'deposit ok'),
    b: cell('open', 'Open', 'EGP 300'),
    c: cell('block', 'Blocked', 'watering'),
  },
  {
    time: '9 PM',
    a: cell('app', 'Basel E.', 'XL-7K42 · cash'),
    b: cell('walk', 'Walk-in', 'paid'),
    c: cell('phone', 'Ziad M.', '5-a-side'),
  },
  {
    time: '10 PM',
    a: cell('phone', 'Hesham F.', 'unpaid'),
    b: cell('walk', 'Walk-in', 'paid'),
    c: cell('app', 'Nour K.', 'XL-7K51'),
  },
  {
    time: '11 PM',
    a: cell('open', 'Open', 'EGP 260'),
    b: cell('open', 'Open', 'EGP 260'),
    c: cell('open', 'Open', 'EGP 260'),
  },
];

export const CALENDAR_LEGEND: { source: BookingSource; label: string }[] = [
  { source: 'app', label: 'App' },
  { source: 'phone', label: 'Phone' },
  { source: 'walk', label: 'Walk-in' },
  { source: 'open', label: 'Open' },
];
