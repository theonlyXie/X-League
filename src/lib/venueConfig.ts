import * as api from '@/data/api';
import { DEMO_PITCH_ID, DEMO_VENUE_ID } from '@/data/venue';
import { isLive } from '@/lib/supabase';

export type ResolvedVenue = api.PlayerVenueRow;

let cache: ResolvedVenue[] | null = null;
let defaultPitch: ResolvedVenue | null = null;

/** Load venues from Supabase or fall back to env-configured ids. */
export async function loadLiveVenues(): Promise<ResolvedVenue[]> {
  if (!isLive) return [];
  if (cache) return cache;
  try {
    cache = await api.listPlayerVenues();
    defaultPitch =
      cache.find((v) => v.venueName === 'Stadium One' && v.pitchLabel === 'Pitch A') ?? cache[0] ?? null;
    return cache;
  } catch {
    return [];
  }
}

export function getDefaultPitchId(): string {
  return defaultPitch?.pitchId ?? DEMO_PITCH_ID;
}

export function getDefaultVenueId(): string {
  return defaultPitch?.venueId ?? DEMO_VENUE_ID;
}

export function findPitch(venueName: string, pitchLabel = 'Pitch A'): ResolvedVenue | null {
  if (!cache) return null;
  return (
    cache.find((v) => v.venueName === venueName && v.pitchLabel === pitchLabel) ??
    cache.find((v) => v.venueName === venueName) ??
    null
  );
}

export function resetVenueCache() {
  cache = null;
  defaultPitch = null;
}
