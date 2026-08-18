/**
 * Fixture data for Cups — tournaments, standings and fixtures (P-15–P-20).
 * The design's competition surface stays on Void; gold is reserved for the
 * live or next-up match.
 */

export type CupStatus = 'live' | 'open' | 'soon';

export type Cup = {
  id: string;
  name: string;
  area: string;
  format: string;
  stage: string;
  status: CupStatus;
  teams: number;
  next: string;
  prize: string;
};

export const CUPS: Cup[] = [
  {
    id: 'nasr-5s',
    name: 'Nasr City 5s',
    area: 'Nasr City',
    format: '5-a-side · 8 teams',
    stage: 'Group A · matchday 3',
    status: 'live',
    teams: 8,
    next: 'Tonight · 9:00 PM · Stadium One',
    prize: 'EGP 8,000 + season seeding',
  },
  {
    id: 'cairo-night',
    name: 'Cairo Night Cup',
    area: 'Maadi · Nasr City · Zamalek',
    format: '5-a-side · 16 teams',
    stage: 'Round of 16',
    status: 'open',
    teams: 16,
    next: 'Thu 20 Aug · entries close 18:00',
    prize: 'EGP 20,000',
  },
  {
    id: 'ramadan-inv',
    name: 'Ramadan Invitational',
    area: 'Greater Cairo',
    format: '7-a-side · 12 teams',
    stage: 'Draw 1 Sep',
    status: 'soon',
    teams: 12,
    next: 'Registration from 25 Aug',
    prize: 'Void cards + club kit',
  },
];

export const GROUP_A = [
  { team: 'Void FC', p: 6, w: 2, d: 0, l: 0, gd: 7, pts: 6, you: true },
  { team: 'Nasr Lions', p: 6, w: 1, d: 1, l: 0, gd: 3, pts: 4, you: false },
  { team: 'Box United', p: 5, w: 1, d: 0, l: 1, gd: 0, pts: 3, you: false },
  { team: 'Gate 2', p: 5, w: 0, d: 0, l: 2, gd: -10, pts: 0, you: false },
];

export const CUP_FIXTURES = [
  { when: 'Tonight · 9:00 PM', home: 'Void FC', away: 'Nasr Lions', pitch: 'Stadium One · A', live: true },
  { when: 'Thu 20 Aug · 8:00 PM', home: 'Box United', away: 'Gate 2', pitch: 'The Box · Indoor 1', live: false },
  { when: 'Sat 22 Aug · 7:00 PM', home: 'Void FC', away: 'Box United', pitch: 'Stadium One · B', live: false },
];

export const CUP_RULES =
  'Eligibility is verified play only. Self-assessed cards may enter group play; knockout requires an Established card. Walkovers after 10 minutes. Referees are venue-appointed.';
