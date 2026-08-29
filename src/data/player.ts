/**
 * Fixture data for the player surface, carried over verbatim from
 * `XL Player.dc.html`. The booking spine is one real evening: Basel Elsayed
 * holds the 9 PM slot on Pitch A at Stadium One, paid in cash at the venue.
 */

/**
 * An hour label as the grid draws it — `'9:00'`, `'14:00'`.
 *
 * This used to be a union of the design's six evening hours. That made the
 * type a claim about every venue in Egypt: a pitch selling 2 PM to 6 PM had no
 * representable slots, and the grid drew the six evening hours regardless, so
 * it advertised hours the venue does not sell and hid the ones it does.
 */
export type SlotTime = string;

/** The design's evening, for the demo build and the signed-out visitor. */
export const SLOT_TIMES: SlotTime[] = ['6:00', '7:00', '8:00', '9:00', '10:00', '11:00'];

/** Hours already sold — through any channel, which is the whole point. */
export const SLOTS_TAKEN: SlotTime[] = ['6:00', '11:00'];

export const DEFAULT_SLOT: SlotTime = '9:00';

/** §5.4: the hold is atomic and configurable; the design counts from 4:52. */
export const HOLD_SECONDS = 292;

export const BOOKING = {
  code: 'XL-7K42',
  venue: 'Stadium One',
  pitch: 'Pitch A',
  area: 'Nasr City',
  date: 'Tue 18 Aug 2026',
  format: '5-a-side · 5 + 2 subs',
  hourly: 300,
  bookingFee: 0,
  gateNote: 'Gate 2 · ask for Pitch A · arrive 10 minutes early',
  cancellation: 'Free cancellation until 3:00 PM today.',
} as const;

export type Venue = {
  name: string;
  verified: boolean;
  rating: number;
  reviews: number;
  distanceKm: number;
  surface: string;
  hourly: number;
  /** Hours still saleable tonight; empty means fully booked. */
  open: string[];
  /** Hours shown struck through on the card. */
  gone?: string[];
  note?: string;
  /** The soonest bookable hour, as Home labels it. */
  nextSlot: string;
  /** How many further hours are open after `nextSlot`. */
  moreSlots: number;
};

export const VENUES: Venue[] = [
  {
    name: 'Stadium One',
    verified: true,
    rating: 4.8,
    reviews: 126,
    distanceKm: 2.1,
    surface: 'Artificial turf',
    hourly: 300,
    open: ['7:00', '8:00', '9:00', '10:00'],
    nextSlot: '9:00 PM',
    moreSlots: 3,
  },
  {
    name: 'The Box',
    verified: false,
    rating: 4.6,
    reviews: 81,
    distanceKm: 3.4,
    surface: 'Indoor',
    hourly: 260,
    open: ['10:00'],
    gone: ['8:00'],
    note: '2 slots left tonight',
    nextSlot: '10:00 PM',
    moreSlots: 1,
  },
  {
    name: 'Nasr Sports Club',
    verified: false,
    rating: 4.4,
    reviews: 52,
    distanceKm: 4.8,
    surface: 'Artificial turf',
    hourly: 280,
    open: [],
    note: 'Fully booked tonight · notify me',
    nextSlot: '—',
    moreSlots: 0,
  },
];

export const PITCH_AMENITIES = ['5-a-side', 'Artificial turf', 'Floodlit', 'Parking', 'Showers'];

export const HOUSE_RULES =
  'Deposit is paid in cash at the gate. Free cancellation until 6 hours before kick-off. No metal studs. Gate 2, ask for Pitch A.';

export type RosterEntry = {
  name: string;
  meta: string;
  tag: 'YOU' | 'IN' | 'OPEN' | 'SUB';
  filled: boolean;
};

/** §5.5: the lobby shows the confirmed roster and the open needs together. */
export const ROSTER: RosterEntry[] = [
  { name: 'Basel E.', meta: 'MID · OVR 78 · captain', tag: 'YOU', filled: true },
  { name: 'Omar Khaled', meta: 'MID · OVR 77', tag: 'IN', filled: true },
  { name: 'Youssef Adel', meta: 'FWD · OVR 74', tag: 'IN', filled: true },
  { name: 'Mahmoud H.', meta: 'GK · OVR 71', tag: 'IN', filled: true },
  { name: 'Invite a defender', meta: 'DEF needed · 1 slot', tag: 'OPEN', filled: false },
  { name: 'Substitute 1', meta: 'Any position', tag: 'SUB', filled: false },
  { name: 'Substitute 2', meta: 'Any position', tag: 'SUB', filled: false },
];

export const LOBBY_CHAT = [
  { initials: 'OK', line: "I'll bring the bibs. Who has the ball?" },
  { initials: 'YA', line: 'Me. Gate 2 at 8:50.' },
];

export const INVITATION = {
  from: 'Omar Khaled',
  initials: 'OK',
  need: 'MID',
  when: 'Thu 20 Aug · 8:00 PM · The Box',
};

/**
 * §5.1: the card is an original football identity. OVR is a weighted summary
 * of position-relevant attributes; `selfAssessedPct` is what still comes from
 * self-assessment rather than verified match evidence.
 */
export const CARD = {
  name: 'BASEL E.',
  ovr: 78,
  position: 'MID',
  confidence: 'ESTABLISHED' as const,
  level: 12,
  form: 3,
  verifiedMatches: 18,
  raters: 41,
  selfAssessedPct: 15,
  /** The attribute the card detail explains the provenance of. */
  explained: 'PAS' as const,
  attributes: [
    { key: 'SPD', value: 76 },
    { key: 'SHO', value: 72 },
    { key: 'PAS', value: 84 },
    { key: 'DRI', value: 80 },
    { key: 'DEF', value: 61 },
    { key: 'PHY', value: 73 },
  ],
} as const;

/** §5.3: XP and level are a separate system from card ability. */
export const PROGRESSION = { level: 12, xp: 1840, nextLevelXp: 2400 } as const;

export const PLAYER = { firstName: 'Basel', initials: 'BE', greeting: 'Evening', today: 'Tuesday 18 August' } as const;
