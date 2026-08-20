/**
 * Fixture data for the admin console, carried over from `XL Admin.dc.html`.
 * §6.10 / ADM-012: every privileged mutation writes an immutable audit record,
 * which is why the console shows the ledger and the trail side by side.
 */

export const ADMIN_USER = { role: 'Ops · Salma R.', scope: 'Super admin · audited' } as const;

export const ADMIN_NAV: { label: string; badge: string }[] = [
  { label: 'Overview', badge: '' },
  { label: 'Venues', badge: '12' },
  { label: 'Users & teams', badge: '' },
  { label: 'Tournaments', badge: '3' },
  { label: 'Match desk', badge: '' },
  { label: 'Moderation', badge: '4' },
  { label: 'Points & seasons', badge: '' },
  { label: 'Reports', badge: '' },
];

export type KpiTone = 'neutral' | 'gold' | 'alert';

export const ADMIN_KPIS: { label: string; value: string; sub: string; tone: KpiTone }[] = [
  { label: 'BOOKINGS TODAY', value: '1,284', sub: '+11% vs last Tue', tone: 'neutral' },
  { label: 'CONFLICT RATE', value: '0.2%', sub: '3 venues drifting', tone: 'neutral' },
  { label: 'CASH AT GATE', value: '128k', sub: 'EGP due tonight · collect on check-in', tone: 'gold' },
  { label: 'DISPUTES OPEN', value: '2', sub: 'oldest 4h', tone: 'alert' },
  { label: 'VERIFIED PLAY', value: '73%', sub: 'cash-checked-in matches', tone: 'neutral' },
];

export type LedgerKind = 'new' | 'fail' | 'normal';

export type LedgerRow = {
  code: string;
  venue: string;
  captain: string;
  source: string;
  deposit: string;
  status: string;
  kind: LedgerKind;
};

export const LEDGER: LedgerRow[] = [
  { code: 'XL-7K42', venue: 'Stadium One · Pitch A', captain: 'Basel Elsayed', source: 'App', deposit: 'Cash · due', status: 'CONFIRMED', kind: 'new' },
  { code: 'XL-7K51', venue: 'Stadium One · Pitch C', captain: 'Nour Kamal', source: 'App', deposit: 'Cash · due', status: 'CONFIRMED', kind: 'normal' },
  { code: 'XL-7K38', venue: 'The Box · Indoor 1', captain: 'Hesham Fouad', source: 'Phone', deposit: 'Cash · unpaid', status: 'HELD', kind: 'normal' },
  { code: 'XL-7K33', venue: 'Nasr Sports · Pitch 2', captain: 'Karim Tarek', source: 'App', deposit: 'Cash · collected', status: 'CHECKED IN', kind: 'normal' },
  { code: 'XL-7K29', venue: 'The Box · Indoor 2', captain: '—', source: 'Walk-in', deposit: 'Cash · collected', status: 'COMPLETED', kind: 'normal' },
  { code: 'XL-7K21', venue: 'Stadium One · Pitch B', captain: 'Amr Sabry', source: 'App', deposit: 'Cash · refunded', status: 'FAILED', kind: 'fail' },
  { code: 'XL-7K18', venue: 'Zamalek 5s · Pitch A', captain: 'Ziad Magdy', source: 'Phone', deposit: 'Cash · collected', status: 'COMPLETED', kind: 'normal' },
];

export const LEDGER_FOOTER =
  'Showing 7 of 1,284 today · immutable audit record written for every state change';

export const ATTENTION: { title: string; detail: string; severe: boolean }[] = [
  {
    title: 'Availability drift · The Box',
    detail: 'Phone bookings entered 40+ min late for 3 days. Slots sold twice in app.',
    severe: true,
  },
  {
    title: 'Cash deposit no-shows · 6 captains',
    detail: 'Second unexcused no-show this season. Restriction is ready to apply.',
    severe: false,
  },
  {
    title: 'Rating ring suspected · 5 accounts',
    detail: 'Reciprocal pairs across 9 matches. Evidence void will recalculate cards.',
    severe: false,
  },
];

export const AUDIT: { at: string; event: string; actor: string }[] = [
  { at: '21:38', event: 'Booking confirmed · cash at gate', actor: 'player:basel.e · app v1.4' },
  { at: '21:37', event: 'Slot held for 5 minutes', actor: 'system · inventory lock' },
  { at: '21:37', event: 'Availability served from venue calendar', actor: 'venue:stadium-one' },
  { at: '21:12', event: 'Price updated · 9 PM daypart EGP 300', actor: 'owner:stadium-one · staff M.A.' },
  { at: '18:04', event: 'Pitch A reopened after maintenance block', actor: 'owner:stadium-one' },
];

export const ADMIN_VENUES = [
  { name: 'Stadium One', area: 'Nasr City', pitches: 3, occupancy: '78%', drift: 'none', status: 'Live' },
  { name: 'The Box', area: 'Nasr City', pitches: 2, occupancy: '91%', drift: '40 min late', status: 'Watch' },
  { name: 'Nasr Sports Club', area: 'Nasr City', pitches: 4, occupancy: '100%', drift: 'none', status: 'Live' },
  { name: 'Zamalek 5s', area: 'Zamalek', pitches: 2, occupancy: '64%', drift: 'none', status: 'Live' },
];

export const ADMIN_USERS = [
  { name: 'Basel Elsayed', role: 'Player · captain', card: 'OVR 78 · Established', flag: '' },
  { name: 'M. Adel', role: 'Owner staff · Stadium One', card: 'Check-in + cash', flag: '' },
  { name: 'Salma R.', role: 'Ops · super admin', card: 'Audited console', flag: '' },
  { name: 'Hesham Fouad', role: 'Player', card: 'OVR 71 · Forming', flag: 'Unpaid deposit' },
];

export const ADMIN_TOURNAMENTS = [
  { name: 'Nasr City 5s', stage: 'Group A · MD3', teams: 8, next: 'Tonight 9 PM' },
  { name: 'Cairo Night Cup', stage: 'Round of 16', teams: 16, next: 'Thu 20 Aug' },
  { name: 'Ramadan Invitational', stage: 'Registration', teams: 12, next: '1 Sep draw' },
];

export const MATCH_DESK = [
  { code: 'XL-7K42', fixture: 'Void FC vs Nasr Lions', venue: 'Stadium One A', kick: '21:00', state: 'Lobby' },
  { code: 'XL-7K51', fixture: 'Nour K. 5-a-side', venue: 'Stadium One C', kick: '22:00', state: 'Confirmed' },
  { code: 'CUP-12', fixture: 'Box United vs Gate 2', venue: 'The Box 1', kick: 'Thu 20:00', state: 'Scheduled' },
];

export const MODERATION = [
  { id: 'M-104', title: 'Rating ring · 5 accounts', detail: 'Reciprocal pairs across 9 matches.', action: 'Recalculate cards' },
  { id: 'M-101', title: 'Abuse report · chat', detail: 'Match lobby XL-7K21 · 2 reports.', action: 'Mute 7 days' },
  { id: 'M-098', title: 'Fake venue listing', detail: 'Nasr rooftop 7s · no owner KYC.', action: 'Unpublish' },
  { id: 'M-090', title: 'Card name dispute', detail: 'Display name vs national ID mismatch.', action: 'Hold card' },
];

export const SEASON = {
  name: 'Season 1 · 2026',
  window: '1 Jun – 30 Sep',
  xpCap: 'Level is activity, never ability',
  decay: 'Unverified attributes decay 1 pt / 30 days idle',
};

export const ADMIN_REPORTS = [
  { label: 'Bookings today', value: '1,284', detail: '+11% vs last Tuesday' },
  { label: 'Conflict rate', value: '0.2%', detail: '3 venues drifting' },
  { label: 'Cash at gate', value: 'EGP 128k', detail: 'Due tonight across Cairo' },
  { label: 'Verified play share', value: '73%', detail: 'Checked-in matches / confirmed' },
];
