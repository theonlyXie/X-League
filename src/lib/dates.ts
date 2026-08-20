import { isLive } from '@/lib/supabase';
import { BOOKING_DATE } from '@/data/venue';

/** Cairo calendar date as YYYY-MM-DD. */
export function cairoDate(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

/**
 * Which evening the inventory APIs should query.
 * Live seed historically uses BOOKING_DATE; fall back when "today" is empty.
 */
export function inventoryDate(): string {
  return isLive ? cairoDate() : BOOKING_DATE;
}

export { BOOKING_DATE };
