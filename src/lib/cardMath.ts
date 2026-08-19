import { ATTRIBUTES, Position, POSITIONS } from '@/data/onboarding';

export type SelfScores = Record<(typeof ATTRIBUTES)[number]['key'], number>;

/** Position weights for OVR — MID favours passing and dribbling. */
const WEIGHTS: Record<Position, Partial<Record<(typeof ATTRIBUTES)[number]['key'], number>>> = {
  GK: { DEF: 1.4, PHY: 1.3, SPD: 0.9 },
  DEF: { DEF: 1.5, PHY: 1.2, PAS: 1.1 },
  MID: { PAS: 1.5, DRI: 1.3, SPD: 1.1 },
  FWD: { SHO: 1.5, DRI: 1.2, SPD: 1.2 },
};

export function attributesFromScores(scores: SelfScores) {
  return ATTRIBUTES.map((a) => ({ key: a.key, value: scores[a.key] }));
}

export function ovrFromScores(scores: SelfScores, position: Position) {
  const w = WEIGHTS[position];
  let sum = 0;
  let weight = 0;
  for (const attr of ATTRIBUTES) {
    const mult = w[attr.key] ?? 1;
    sum += scores[attr.key] * mult;
    weight += mult;
  }
  return Math.round(sum / weight);
}

export function confidenceLabel(verifiedMatches: number) {
  if (verifiedMatches >= 15) return 'ESTABLISHED' as const;
  if (verifiedMatches >= 5) return 'FORMING' as const;
  return 'NEW' as const;
}

export function selfAssessedPct(verifiedMatches: number) {
  if (verifiedMatches >= 18) return 15;
  if (verifiedMatches === 0) return 100;
  return Math.max(15, 100 - verifiedMatches * 5);
}
