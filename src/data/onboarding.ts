/**
 * P-01 Onboarding + self-assessment.
 * §5.1: a new card starts as self-assessed; verified play then replaces that
 * evidence. The six attributes match the Void card.
 */

export const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const;
export type Position = (typeof POSITIONS)[number];

export const ATTRIBUTES = [
  { key: 'SPD', label: 'Pace' },
  { key: 'SHO', label: 'Shooting' },
  { key: 'PAS', label: 'Passing' },
  { key: 'DRI', label: 'Dribbling' },
  { key: 'DEF', label: 'Defending' },
  { key: 'PHY', label: 'Physical' },
] as const;

export const ONBOARDING_COPY = {
  welcomeKicker: 'Egypt · amateur football',
  welcomeTitle: 'Find a pitch. Hold a slot. Build a card from verified play.',
  welcomeBody:
    'X League is one calendar for every booking channel, and one identity that only moves when you actually play.',
  positionTitle: 'Where do you play?',
  positionBody: 'This seeds your Void card. You can change it after verified matches.',
  assessTitle: 'Rate yourself once',
  assessBody:
    'Self-assessment is 100% of a new card. Each verified match replaces it. No single rater can move an attribute more than ±2.',
  doneTitle: 'Your card is live',
  doneBody: 'Basel, Stadium One has a 9 PM slot tonight. Hold it before it is gone.',
} as const;
