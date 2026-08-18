/**
 * Remaining owner-mode fixtures: bookings desk, CRM, staff, pitches, reports.
 * O-03–O-08 sit on the same Operative surface as Today and Calendar.
 */

export type DeskBooking = {
  code: string;
  when: string;
  who: string;
  pitch: string;
  source: 'app' | 'phone' | 'walk';
  deposit: 'due' | 'paid' | 'unpaid';
  status: string;
};

export const DESK_BOOKINGS: DeskBooking[] = [
  { code: 'XL-7K42', when: '9:00 PM', who: 'Basel Elsayed', pitch: 'A', source: 'app', deposit: 'due', status: 'Confirmed' },
  { code: 'XL-7K51', when: '10:00 PM', who: 'Nour Kamal', pitch: 'C', source: 'app', deposit: 'due', status: 'Confirmed' },
  { code: 'PHONE-18', when: '10:00 PM', who: 'Hesham Fouad', pitch: 'A', source: 'phone', deposit: 'unpaid', status: 'Held' },
  { code: 'WALK-09', when: '10:00 PM', who: 'Walk-in', pitch: 'B', source: 'walk', deposit: 'paid', status: 'Checked in' },
  { code: 'PHONE-12', when: '8:00 PM', who: 'Amr Sabry', pitch: 'A', source: 'phone', deposit: 'paid', status: 'Confirmed' },
  { code: 'PHONE-07', when: '6:00 PM', who: 'Sameh A.', pitch: 'C', source: 'phone', deposit: 'paid', status: 'In play' },
];

export type Customer = {
  name: string;
  initials: string;
  last: string;
  visits: number;
  outstanding: number;
  note: string;
};

export const CUSTOMERS: Customer[] = [
  { name: 'Basel Elsayed', initials: 'BE', last: 'Tonight · Pitch A', visits: 18, outstanding: 100, note: 'Captain · cash at gate' },
  { name: 'Hesham Fouad', initials: 'HF', last: 'Tonight · Pitch A', visits: 11, outstanding: 300, note: '2nd deposit reminder' },
  { name: 'Nour Kamal', initials: 'NK', last: 'Tonight · Pitch C', visits: 7, outstanding: 100, note: 'New app captain' },
  { name: 'Karim Tarek', initials: 'KT', last: 'Thu 13 Aug', visits: 22, outstanding: 0, note: 'Regular Tuesday 7 PM' },
  { name: 'Ziad Magdy', initials: 'ZM', last: 'Sun 16 Aug', visits: 9, outstanding: 0, note: 'Prefers Pitch C' },
];

export const STAFF = [
  { name: 'M. Adel', role: 'Shift lead', pin: 'Authorised to check in and take cash' },
  { name: 'Sara N.', role: 'Desk', pin: 'Phone + walk-in entry' },
  { name: 'Karim B.', role: 'Pitch A', pin: 'Check-in only' },
];

export const PITCHES = [
  { name: 'Pitch A', surface: 'Artificial turf', hourly: 300, note: 'Floodlit · Gate 2' },
  { name: 'Pitch B', surface: 'Artificial turf', hourly: 300, note: 'Walk-in heavy after 9' },
  { name: 'Pitch C', surface: 'Artificial turf', hourly: 280, note: 'Quiet-hour 11 PM · EGP 260' },
];

export const OWNER_REPORTS = [
  { label: 'Tonight occupancy', value: '78%', detail: '14 of 18 saleable hours' },
  { label: 'Cash still at gate', value: 'EGP 400', detail: '4 arrivals · collect before 23:00' },
  { label: 'No-show rate (30d)', value: '6%', detail: 'Below Cairo 5s median' },
  { label: 'App vs phone', value: '41% app', detail: 'Up 8 pts since Season 1' },
];
