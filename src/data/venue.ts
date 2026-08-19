/**
 * Which venue the app is pointed at.
 *
 * These are the identifiers of the seeded evening (`supabase/seed.sql`). They
 * are configuration rather than fixtures: once venue discovery is wired, the
 * pitch id comes from the search result the player tapped and these go away.
 */
export const DEMO_PITCH_ID = process.env.EXPO_PUBLIC_PITCH_ID ?? '';
export const DEMO_VENUE_ID = process.env.EXPO_PUBLIC_VENUE_ID ?? '';

/** The evening the design books. */
export const BOOKING_DATE = '2026-08-18';

/**
 * The venue's own timezone. Inventory is sold in local hours (NFR-LOC-002),
 * and Egypt observes DST — which is exactly why the app never turns an hour
 * label into an instant itself. `search_availability` returns the instant for
 * every slot, and holding one hands that same string straight back.
 */
export const VENUE_TIMEZONE = 'Africa/Cairo';
