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
  { label: 'CASH AT GATE', value: '128k', sub: 'EGP due tonight', tone: 'gold' },
  { label: 'DISPUTES OPEN', value: '2', sub: 'oldest 4h', tone: 'alert' },
  { label: 'VERIFIED PLAY', value: '73%', sub: 'checked-in matches', tone: 'neutral' },
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
  { code: 'XL-7K38', venue: 'The Box · Indoor 1', captain: 'Hesham Fouad', source: 'Phone', deposit: 'Unpaid', status: 'HELD', kind: 'normal' },
  { code: 'XL-7K33', venue: 'Nasr Sports · Pitch 2', captain: 'Karim Tarek', source: 'App', deposit: 'Paid', status: 'CHECKED IN', kind: 'normal' },
  { code: 'XL-7K29', venue: 'The Box · Indoor 2', captain: '—', source: 'Walk-in', deposit: 'Paid', status: 'COMPLETED', kind: 'normal' },
  { code: 'XL-7K21', venue: 'Stadium One · Pitch B', captain: 'Amr Sabry', source: 'App', deposit: 'Refunded', status: 'FAILED', kind: 'fail' },
  { code: 'XL-7K18', venue: 'Zamalek 5s · Pitch A', captain: 'Ziad Magdy', source: 'Phone', deposit: 'Paid', status: 'COMPLETED', kind: 'normal' },
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
  { at: '21:38', event: 'Booking confirmed · cash deposit selected', actor: 'player:basel.e · app v1.4' },
  { at: '21:37', event: 'Slot held for 5 minutes', actor: 'system · inventory lock' },
  { at: '21:37', event: 'Availability served from venue calendar', actor: 'venue:stadium-one' },
  { at: '21:12', event: 'Price updated · 9 PM daypart EGP 300', actor: 'owner:stadium-one · staff M.A.' },
  { at: '18:04', event: 'Pitch A reopened after maintenance block', actor: 'owner:stadium-one' },
];
