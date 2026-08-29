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
 */

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export const POSITIONS: { code: Position; label: string; blurb: string }[] = [
  { code: 'GK', label: 'Goalkeeper', blurb: 'Diving, handling, reflexes and positioning' },
  { code: 'DEF', label: 'Defender', blurb: 'Defending and physicality carry your score' },
  { code: 'MID', label: 'Midfielder', blurb: 'Passing and dribbling carry your score' },
  { code: 'FWD', label: 'Forward', blurb: 'Shooting and pace carry your score' },
];

export type Anchor = { label: string; score: number };
export type Question = { attribute: string; name: string; prompt: string; anchors: Anchor[] };

/** Four rungs, spread across the range an amateur league actually occupies. */
const rungs = (a: string, b: string, c: string, d: string): Anchor[] => [
  { label: a, score: 45 },
  { label: b, score: 60 },
  { label: c, score: 72 },
  { label: d, score: 85 },
];

export const OUTFIELD_QUESTIONS: Question[] = [
  {
    attribute: 'SPD',
    name: 'Speed',
    prompt: 'A ball is played in behind and you are chasing it with a defender.',
    anchors: rungs(
      'I get there second most times',
      'It depends who I am up against',
      'I usually win that race',
      'I back myself against anyone in the league',
    ),
  },
  {
    attribute: 'SHO',
    name: 'Shooting',
    prompt: 'You are through one-on-one with the keeper.',
    anchors: rungs(
      'I often rush it',
      'I score if I pick my spot',
      'I score more often than not',
      'I expect to score, either foot',
    ),
  },
  {
    attribute: 'PAS',
    name: 'Passing',
    prompt: 'You get the ball under pressure with a teammate making a run.',
    anchors: rungs(
      'I play the safe ball backwards',
      'I find him if the pass is simple',
      'I usually pick the run out',
      'I set up chances other people do not see',
    ),
  },
  {
    attribute: 'DRI',
    name: 'Dribbling',
    prompt: 'A defender closes you down in a tight corner.',
    anchors: rungs(
      'I tend to lose it there',
      'I can shield it and win a foul',
      'I get out of it most times',
      'I take people on and beat them',
    ),
  },
  {
    attribute: 'DEF',
    name: 'Defending',
    prompt: 'You are the last man and an attacker is running straight at you.',
    anchors: rungs(
      'I dive in and get beaten',
      'I slow them down and hope for help',
      'I usually hold them up and win it back',
      'I read it early and take the ball cleanly',
    ),
  },
  {
    attribute: 'PHY',
    name: 'Physicality',
    prompt: 'Fifty minutes in, the game has stretched and it is end to end.',
    anchors: rungs(
      'I am asking to come off',
      'I can keep going at a lower tempo',
      'I am still getting up and down',
      'I am strongest at the end of games',
    ),
  },
];

export const GK_QUESTIONS: Question[] = [
  {
    attribute: 'DIV',
    name: 'Diving',
    prompt: 'A shot is struck low towards your bottom corner.',
    anchors: rungs(
      'I get a hand to it occasionally',
      'I save the ones near me',
      'I reach most of them',
      'I make saves that change games',
    ),
  },
  {
    attribute: 'HAN',
    name: 'Handling',
    prompt: 'A wet ball is driven hard at your chest.',
    anchors: rungs(
      'It usually spills',
      'I parry it somewhere safe',
      'I hold most of them',
      'I catch it clean and start the attack',
    ),
  },
  {
    attribute: 'KIC',
    name: 'Kicking',
    prompt: 'You have the ball at your feet and a forward is pressing you.',
    anchors: rungs(
      'I hit it long and hope',
      'I find a teammate if he shows early',
      'I play out under pressure',
      'I can pick a pass into the other half',
    ),
  },
  {
    attribute: 'REF',
    name: 'Reflexes',
    prompt: 'A deflection changes direction two yards in front of you.',
    anchors: rungs(
      'I am already committed',
      'I stop the ones straight at me',
      'I adjust and save most',
      'I react to things I should not reach',
    ),
  },
  {
    attribute: 'SPD',
    name: 'Speed',
    prompt: 'A through ball is played into the space behind your defence.',
    anchors: rungs(
      'I stay on my line',
      'I come for the obvious ones',
      'I sweep behind my defence',
      'I get there first almost every time',
    ),
  },
  {
    attribute: 'POS',
    name: 'Positioning',
    prompt: 'An attacker cuts in and shoots from a tight angle.',
    anchors: rungs(
      'I get caught out of position',
      'I cover my near post',
      'I cut the angle down well',
      'I make the goal look small',
    ),
  },
];

export const questionsFor = (position: Position) =>
  position === 'GK' ? GK_QUESTIONS : OUTFIELD_QUESTIONS;

/** What the card explains about itself while it is still provisional (§5.1). */
export const CONFIDENCE_COPY: Record<string, string> = {
  provisional:
    'Provisional — most of this card is still your own assessment. It becomes yours properly as verified matches build up.',
  emerging:
    'Emerging — verified match evidence is taking over from your own assessment.',
  established:
    'Established — this card is built from verified play. Your own assessment counts for no more than 15%.',
};
