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
