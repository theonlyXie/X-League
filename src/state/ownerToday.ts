import { useCallback, useEffect, useState } from 'react';
import * as api from '@/data/api';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';
import { BOOKING_DATE } from '@/data/venue';

/**
 * O-01's arrivals and tiles, from the venue's own calendar.
 *
 * Scoped by the server to the venues the signed-in person works at (RBAC-002);
 * a person with no staff role gets nothing, and the screen falls back to the
 * design's sample shift rather than pretending.
 */
export function useOwnerToday() {
  const { venues, signedIn } = useSession();
  const venue = venues[0] ?? null;

  const [arrivals, setArrivals] = useState<api.Arrival[] | null>(null);
  const [summary, setSummary] = useState<api.OwnerSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLive || !signedIn || !venue) {
      setArrivals(null);
      setSummary(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [a, s] = await Promise.all([
        api.ownerArrivals(venue.venueId, BOOKING_DATE),
        api.ownerSummary(venue.venueId, BOOKING_DATE),
      ]);
      setArrivals(a);
      setSummary(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the venue calendar.');
      setArrivals(null);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [signedIn, venue]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    arrivals,
    summary,
    loading,
    error,
    live: arrivals !== null,
    venueName: venue?.name ?? null,
    reload: load,
  };
}
