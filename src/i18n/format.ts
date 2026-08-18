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
const tag = (locale: Locale) => (locale === 'ar' ? 'ar-EG-u-nu-arab' : 'en-GB');

/** A plain number: counts, XP, distances. */
export function num(value: number, locale: Locale): string {
  try {
    return new Intl.NumberFormat(tag(locale)).format(value);
  } catch {
    return String(value);
  }
}

/**
 * Money. Egyptian pounds are written `EGP 300` in English and `٣٠٠ ج.م` in
 * Arabic — the symbol trails the amount, which is why this is not a prefix.
 */
export function money(value: number, locale: Locale): string {
  const amount = num(value, locale);
  return locale === 'ar' ? `${amount} ج.م` : `EGP ${amount}`;
}

/** An hour of the day, in the venue's own zone. */
export function hour(iso: string, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(tag(locale), {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: VENUE_TIMEZONE,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** A date the way each surface writes it: `Tue 18 Aug`, `الثلاثاء ١٨ أغسطس`. */
export function shortDate(iso: string, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(tag(locale), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: VENUE_TIMEZONE,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function longDate(iso: string, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(tag(locale), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: VENUE_TIMEZONE,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * A slot label like `9:00` rendered for the locale. The grid shows bare hours,
 * so this converts the digits without adding a meridiem.
 */
export function slotLabel(label: string, locale: Locale): string {
  if (locale !== 'ar') return label;
  return label.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
}

/** The countdown on a hold — mono digits, converted for Arabic. */
export function clock(text: string, locale: Locale): string {
  return slotLabel(text, locale);
}

/**
 * An evening slot label with its meridiem: `9:00 PM`, `٩:٠٠ م`.
 *
 * Arabic puts the marker after the digits and uses `م`, and writing it as a
 * separate English run makes the bidi algorithm reorder it to the wrong side —
 * which is exactly what happened before this existed.
 */
export function pmLabel(label: string, locale: Locale): string {
  return locale === 'ar' ? `${slotLabel(label, locale)} م` : `${label} PM`;
}
