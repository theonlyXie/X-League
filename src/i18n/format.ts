import { VENUE_TIMEZONE } from '@/data/venue';

export type Locale = 'en' | 'ar';

/**
 * NFR-LOC-002: dates, times, numbers and EGP are locale-aware, while stored
 * time stays UTC with an explicit zone.
 *
 * Arabic uses Arabic-Indic numerals (`nu-arab`), which is what option 1i draws
 * — `٩:٠٠ م`, `١٠٠ ج.م`. That is a formatting decision, not a translation one,
 * so it lives here rather than in the string tables.
 */
const tag = (locale: Locale) => (locale === 'ar' ? 'ar-EG' : 'en-GB');

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/**
 * Map ASCII digits onto Arabic-Indic ones.
 *
 * The locale extension `-u-nu-arab` would do this, but engines disagree about
 * whether they honour it — Hermes is built with Intl on both platforms, yet its
 * iOS implementation is backed by NSFormatter and does not reliably apply the
 * numbering-system extension. Doing the substitution here means the digits look
 * the same on every device instead of only on the ones that happen to support
 * it, and it costs nothing.
 */
const toArabicDigits = (text: string) => text.replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)]);

/** A plain number: counts, XP, distances. */
export function num(value: number, locale: Locale): string {
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(tag(locale)).format(value);
  } catch {
    formatted = String(value);
  }
  return locale === 'ar' ? toArabicDigits(formatted) : formatted;
}

/**
 * Money. Egyptian pounds are written `EGP 300` in English and `٣٠٠ ج.م` in
 * Arabic — the symbol trails the amount, which is why this is not a prefix.
 */
export function money(value: number, locale: Locale): string {
  const amount = num(value, locale);
  return locale === 'ar' ? `${amount} ج.م` : `EGP ${amount}`;
}

/**
 * An hour of the day, in the venue's own zone.
 *
 * A formatting failure must never leak an ISO timestamp to a player standing at
 * a gate, so every fallback here degrades to something a person can read.
 */
export function hour(iso: string, locale: Locale): string {
  const when = new Date(iso);
  try {
    const text = new Intl.DateTimeFormat(tag(locale), {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: VENUE_TIMEZONE,
    }).format(when);
    return locale === 'ar' ? toArabicDigits(text) : text;
  } catch {
    // The minutes are dropped in this fallback rather than mislabelled: every
    // slot in this product is on the hour, and a wrong meridiem is worse than
    // a missing `:30`.
    return hourLabel(when.getHours(), locale);
  }
}

/**
 * A moment, with its hour: `3:00 PM on Sun 30 Aug`, `٣:٠٠ م يوم الأحد ٣٠ أغسطس`.
 *
 * For the cancellation cutoff, which is an hour on a day. Rendering it as a
 * bare date told a player booking on Sunday that they could cancel free
 * "until Sunday" — which reads as the end of that day and is wrong by nine
 * hours.
 */
export function momentLabel(iso: string, locale: Locale): string {
  const when = new Date(iso);
  const time = hour(iso, locale);
  const day = shortDate(iso, locale);
  if (Number.isNaN(when.getTime())) return day;
  return locale === 'ar' ? `${time} يوم ${day}` : `${time} on ${day}`;
}

/** A date the way each surface writes it: `Tue 18 Aug`, `الثلاثاء ١٨ أغسطس`. */
export function shortDate(iso: string, locale: Locale): string {
  const when = new Date(iso);
  try {
    const text = new Intl.DateTimeFormat(tag(locale), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: VENUE_TIMEZONE,
    }).format(when);
    return locale === 'ar' ? toArabicDigits(text) : text;
  } catch {
    return plainDate(when, locale);
  }
}

export function longDate(iso: string, locale: Locale): string {
  const when = new Date(iso);
  try {
    const text = new Intl.DateTimeFormat(tag(locale), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: VENUE_TIMEZONE,
    }).format(when);
    return locale === 'ar' ? toArabicDigits(text) : text;
  } catch {
    return plainDate(when, locale);
  }
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/** Last resort when Intl is unavailable — readable, never an ISO string. */
function plainDate(when: Date, locale: Locale): string {
  const day = String(when.getDate());
  const month = (locale === 'ar' ? MONTHS_AR : MONTHS_EN)[when.getMonth()];
  return locale === 'ar' ? `${toArabicDigits(day)} ${month}` : `${day} ${month}`;
}

/**
 * A slot label like `9:00` rendered for the locale. The grid shows bare hours,
 * so this converts the digits without adding a meridiem.
 */
export function slotLabel(label: string, locale: Locale): string {
  return locale === 'ar' ? toArabicDigits(label) : label;
}

/** The countdown on a hold — mono digits, converted for Arabic. */
export function clock(text: string, locale: Locale): string {
  return slotLabel(text, locale);
}

/**
 * An hour of the day, from the 24-hour hour: `9:00 PM`, `10:00 AM`, `٩:٠٠ م`.
 *
 * This used to be `pmLabel`, which took an already-formatted `9:00` and
 * appended PM — an assumption that held only for the evening the design drew.
 * A venue open from 10 in the morning produced two chips both reading `10:00`,
 * one of them the wrong hour, and the grid could not tell them apart: tapping
 * the evening slot held the morning one.
 *
 * Arabic puts the marker after the digits and uses `ص` / `م`, and writing it
 * as a separate English run makes the bidi algorithm reorder it to the wrong
 * side — which is exactly what happened before this existed.
 */
export function hourLabel(hour24: number, locale: Locale): string {
  const h = ((hour24 % 24) + 24) % 24;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  const digits = slotLabel(`${twelve}:00`, locale);
  if (locale === 'ar') return `${digits} ${h < 12 ? 'ص' : 'م'}`;
  return `${digits} ${h < 12 ? 'AM' : 'PM'}`;
}
