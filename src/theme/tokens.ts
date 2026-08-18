/**
 * X League design tokens.
 *
 * Every value here is lifted verbatim from the Claude Design source
 * (`X League.dc.html`, `XL Player.dc.html`, `XL Owner.dc.html`,
 * `XL Admin.dc.html`) and from §4.1 of the Product UI & SRS v1.1.
 * Nothing is rounded or snapped to a grid — the design's own numbers win.
 */

/** Void — the player identity and competition surface. */
export const void_ = {
  /** Page ground. */
  bg: '#080808',
  /** Cards and rows sitting on the ground. */
  surface: '#0E0E0E',
  /** Top of the signature-card gradient. */
  raised: '#101010',
  /** Tab bar. */
  chrome: '#0A0A0A',
  /** Avatar / swatch fill. */
  inset: '#17150F',
  /** Deepest — the void disc itself. */
  disc: '#000000',
  /** Player-card gradient origin. */
  cardTop: '#15130E',
} as const;

/** Operative — the owner and admin surface. */
export const operative = {
  /** Page ground. */
  bg: '#F3EEE5',
  /** Cards and panels. */
  surface: '#FFFDF9',
  /** Table headers, tab bar, section bands. */
  band: '#EDE6D9',
  /** Walk-in booking fill. */
  walkIn: '#CFC4B1',
  /** Walk-in booking border. */
  walkInBorder: '#BFB29C',
} as const;

/** Cipher Gold — verified state, primary action, selected slot, progress. */
export const gold = {
  base: '#C6A34B',
  /** Hover / pressed on Void surfaces. */
  hover: '#D4B25C',
  /** Legible gold on Operative surfaces. */
  ink: '#8A6C22',
  /** Filled-cell border on Operative surfaces. */
  border: '#B08F35',
} as const;

/** Deep Burgundy — urgency, destructive action, disputes. */
export const burgundy = {
  base: '#651525',
  /** On Operative surfaces. */
  ink: '#8B2135',
  /** On Void surfaces. */
  onVoid: '#9C6070',
  /** Destructive control label on Void surfaces. */
  action: '#C4788A',
} as const;

/** The two status colours the design uses outside the core palette. */
export const status = {
  /** Confirmed / checked-in, on Operative surfaces. */
  positive: '#2C6B45',
  /** Quiet-hour pricing, on Void surfaces. */
  positiveOnVoid: '#8FBF9C',
} as const;

/** Bone/ivory ink used on Void surfaces. */
export const bone = '#F3EEE5';
/** Near-black ink used on Operative surfaces. */
export const ink = '#141210';

/**
 * Alpha ramps. The design writes these inline as `rgba(...)`; they are
 * enumerated here so a screen never has to guess an opacity.
 */
export const onVoid = {
  /** Primary text. */
  primary: bone,
  /** Secondary body copy. */
  secondary: 'rgba(243,238,229,.6)',
  /** Supporting detail. */
  muted: 'rgba(243,238,229,.5)',
  /** Metadata. */
  faint: 'rgba(243,238,229,.45)',
  /** Section eyebrows and inactive tabs. */
  dim: 'rgba(243,238,229,.35)',
  /** Struck-through / unavailable. */
  disabled: 'rgba(243,238,229,.2)',
  /** Strong hairline. */
  line: 'rgba(243,238,229,.16)',
  /** Standard hairline. */
  hairline: 'rgba(243,238,229,.12)',
  /** Card edge. */
  edge: 'rgba(243,238,229,.08)',
  /** Faintest card edge. */
  edgeFaint: 'rgba(243,238,229,.07)',
} as const;

export const onOperative = {
  primary: ink,
  secondary: 'rgba(20,18,16,.62)',
  muted: 'rgba(20,18,16,.5)',
  faint: 'rgba(20,18,16,.45)',
  dim: 'rgba(20,18,16,.4)',
  disabled: 'rgba(20,18,16,.28)',
  line: 'rgba(20,18,16,.18)',
  hairline: 'rgba(20,18,16,.1)',
  edge: 'rgba(20,18,16,.09)',
  edgeFaint: 'rgba(20,18,16,.06)',
} as const;

/** Gold at the alphas the design actually uses. */
export const goldAlpha = {
  /** Signature-card border. */
  frame: 'rgba(198,163,75,.55)',
  /** Selected / accented card border. */
  accent: 'rgba(198,163,75,.4)',
  /** Standard accent border. */
  edge: 'rgba(198,163,75,.32)',
  /** Quiet accent border. */
  edgeSoft: 'rgba(198,163,75,.22)',
  /** Filled accent background. */
  fill: 'rgba(198,163,75,.14)',
  /** Faint accent background. */
  fillSoft: 'rgba(198,163,75,.07)',
  /** Outer geometry ring. */
  ring: 'rgba(198,163,75,.13)',
  /** Inner geometry ring. */
  ringInner: 'rgba(198,163,75,.2)',
  /** The X strokes. */
  stroke: 'rgba(198,163,75,.4)',
  /** Void-disc edge. */
  discEdge: 'rgba(198,163,75,.5)',
} as const;

/**
 * Corners. §4.1: 16–24 px on consumer cards, 8–14 px on dense
 * owner/admin controls.
 */
export const radius = {
  device: 42,
  /** Signature card. */
  signature: 22,
  /** Consumer card. */
  card: 20,
  /** Nested consumer card. */
  cardInner: 18,
  /** Primary control. */
  control: 16,
  /** Row / secondary control. */
  row: 14,
  /** Small control. */
  chip: 12,
  /** Icon button. */
  icon: 11,
  /** Dense panel (Operative). */
  panel: 12,
  /** Dense control (Operative). */
  dense: 9,
  /** Dense chip (Operative). */
  denseChip: 8,
  /** Calendar cell. */
  cell: 7,
  /** Badge. */
  badge: 5,
  pill: 999,
} as const;

/** Motion — §4.1: 150–250 ms for state changes. */
export const motion = { fast: 150, base: 200, slow: 250 } as const;

/** The player device frame the design draws at. */
export const frame = { width: 390, height: 844 } as const;

/** The admin console's fixed canvas. */
export const console_ = { width: 1180, height: 740, rail: 196 } as const;
