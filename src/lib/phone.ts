/**
 * Egyptian mobile numbers, as people actually type them.
 *
 * The country code is not a field. Every account on this platform is Egyptian,
 * so `+20` is shown as a fixed affix beside the input and the person types the
 * number they would read out — with or without the leading zero they are used
 * to dialling.
 *
 * That matters more than it looks, because of how the server normalises. The
 * database's `normalise_phone` turns `0…` of eleven digits into `20…` and
 * leaves anything else alone, so the *shape* of what the client sends decides
 * which account it resolves to:
 *
 *   +20 with `1012345678`    → 201012345678   ✓
 *   +20 with `01012345678`   → 2001012345678  ✗ a different account entirely
 *
 * The screen previously prefilled an editable `+20` and left the rest to the
 * person, so anybody typing their number the habitual way — with the zero —
 * signed up under an address nobody could ever sign in to again. Stripping the
 * zero here is what makes both spellings the same account.
 */

export const COUNTRY_CODE = '+20';

/** Egyptian mobiles are ten digits and begin 10, 11, 12 or 15. */
const NATIONAL_LENGTH = 10;

/**
 * Latin digits, from whatever the keyboard produced.
 *
 * An Arabic keyboard gives Arabic-Indic digits, and the obvious
 * `replace(/\D/g, '')` deletes them silently — so somebody typing their own
 * number on an Arabic layout would watch the field stay empty. Persian forms
 * are folded too: they turn up on keyboards people actually have installed.
 */
function toLatinDigits(raw: string): string {
  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0)!;
    if (ch >= '0' && ch <= '9') out += ch;
    else if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660); // ٠-٩
    else if (code >= 0x06f0 && code <= 0x06f9) out += String(code - 0x06f0); // ۰-۹
  }
  return out;
}

/**
 * The national part: what goes in the box beside the `+20`.
 *
 * Accepts every way somebody might arrive at it — typed, pasted from a
 * contact card, or read off a message — and reduces them all to the same ten
 * digits.
 */
export function nationalDigits(raw: string): string {
  let d = toLatinDigits(raw);
  if (d.startsWith('00')) d = d.slice(2); // 0020…, dialled internationally
  // Only when there is clearly a country code in front: no Egyptian mobile
  // begins with 20, but the length test keeps a pasted 20-prefixed number from
  // being confused with one that merely got truncated.
  if (d.startsWith('20') && d.length > NATIONAL_LENGTH) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1); // the trunk zero, as dialled at home
  return d.slice(0, NATIONAL_LENGTH);
}

/** True once the box holds a number the network would actually route. */
export function isEgyptianMobile(national: string): boolean {
  return /^1[0125]\d{8}$/.test(national);
}

/** What the server is asked about: the number in full, unambiguously. */
export function toE164(national: string): string {
  return `${COUNTRY_CODE}${national}`;
}

/** `101 234 5678` — grouped the way the number is said aloud. */
export function groupNational(national: string): string {
  const a = national.slice(0, 3);
  const b = national.slice(3, 6);
  const c = national.slice(6, 10);
  return [a, b, c].filter(Boolean).join(' ');
}
