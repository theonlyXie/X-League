/**
 * The anchored self-assessment (PRO-002).
 *
 * §5.1 is explicit that this uses "anchored questions and examples, not a
 * single vanity slider" — so every question describes a situation from a real
 * five-a-side game and every answer is something a player can recognise having
 * done. Nobody is asked to rate their own pace out of 99.
 *
 * The scores behind the anchors are deliberately not shown. A player choosing
 * between numbers optimises the number; a player choosing between situations
 * answers the question.
 *
 * The words themselves live in the string table and this file holds only their
 * keys. They were English in both languages until now, which meant an Arabic
 * player's very first minute in the product — the six questions that decide
 * their card — was in a language they had just declined to use.
 */
import type { TextKey } from '@/i18n/strings';

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export const POSITIONS: { code: Position; label: TextKey; blurb: TextKey }[] = [
  { code: 'GK', label: 'asPosGk', blurb: 'asPosGkBlurb' },
  { code: 'DEF', label: 'asPosDef', blurb: 'asPosDefBlurb' },
  { code: 'MID', label: 'asPosMid', blurb: 'asPosMidBlurb' },
  { code: 'FWD', label: 'asPosFwd', blurb: 'asPosFwdBlurb' },
];

export type Anchor = { label: TextKey; score: number };
export type Question = { attribute: string; name: TextKey; prompt: TextKey; anchors: Anchor[] };

/** Four rungs, spread across the range an amateur league actually occupies. */
const rungs = (a: TextKey, b: TextKey, c: TextKey, d: TextKey): Anchor[] => [
  { label: a, score: 45 },
  { label: b, score: 60 },
  { label: c, score: 72 },
  { label: d, score: 85 },
];

const q = (attribute: string, prefix: string): Question => ({
  attribute,
  name: `${prefix}Name` as TextKey,
  prompt: `${prefix}Prompt` as TextKey,
  anchors: rungs(
    `${prefix}A1` as TextKey,
    `${prefix}A2` as TextKey,
    `${prefix}A3` as TextKey,
    `${prefix}A4` as TextKey,
  ),
});

export const OUTFIELD_QUESTIONS: Question[] = [
  q('SPD', 'asOutSpd'),
  q('SHO', 'asOutSho'),
  q('PAS', 'asOutPas'),
  q('DRI', 'asOutDri'),
  q('DEF', 'asOutDef'),
  q('PHY', 'asOutPhy'),
];

export const GK_QUESTIONS: Question[] = [
  q('DIV', 'asGkDiv'),
  q('HAN', 'asGkHan'),
  q('KIC', 'asGkKic'),
  q('REF', 'asGkRef'),
  q('SPD', 'asGkSpd'),
  q('POS', 'asGkPos'),
];

export const questionsFor = (position: Position) =>
  position === 'GK' ? GK_QUESTIONS : OUTFIELD_QUESTIONS;

/** What the card explains about itself while it is still provisional (§5.1). */
export const CONFIDENCE_COPY: Record<string, TextKey> = {
  provisional: 'asConfProvisional',
  emerging: 'asConfEmerging',
  established: 'asConfEstablished',
};
