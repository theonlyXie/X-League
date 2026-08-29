/**
 * The venue's own timezone. Inventory is sold in local hours (NFR-LOC-002),
 * and Egypt observes DST — which is exactly why the app never turns an hour
 * label into an instant itself. `search_availability` returns the instant for
 * every slot, and holding one hands that same string straight back.
 */
export const VENUE_TIMEZONE = 'Africa/Cairo';

/**
 * Which venue the app opens on when nothing has been chosen yet.
 *
 * Discovery is wired now, so the pitch a player books comes from the venue they
 * tapped rather than from here. These remain only as a fallback for a direct
 * link into the pitch screen with no venue in the URL, and for demo mode.
 */
export const DEMO_PITCH_ID = process.env.EXPO_PUBLIC_PITCH_ID ?? '';
export const DEMO_VENUE_ID = process.env.EXPO_PUBLIC_VENUE_ID ?? '';

/**
 * Today, in the venue's own zone.
 *
 * This used to be the fixed date on the artboards, which quietly expired the
 * whole app: run it the following week and every screen was empty, because the
 * only inventory the database knew about was in the past.
 */
export function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: VENUE_TIMEZONE });
}

/**
 * A date `offset` days from today, in the venue's zone.
 *
 * Callers used to reach for `new Date(...).toISOString().slice(0, 10)`, which
 * is UTC. Cairo runs two or three hours ahead, so after about 9 PM local that
 * returns *yesterday* — and the server correctly refuses to sell yesterday. It
 * made "Tonight" empty for exactly the people browsing at peak booking hour.
 */
export function dateFromToday(offset: number): string {
  return addDays(today(), offset);
}

/** `2026-08-29` plus n days, as calendar arithmetic rather than clock arithmetic. */
export function addDays(date: string, offset: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const when = new Date(Date.UTC(y, m - 1, d + offset));
  return when.toISOString().slice(0, 10);
}
