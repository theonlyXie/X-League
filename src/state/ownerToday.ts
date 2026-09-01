import { useCallback, useEffect, useState } from 'react';
import * as api from '@/data/api';
import { isLive } from '@/lib/supabase';
import { useRefreshTick } from '@/state/refresh';
import { useSession } from '@/state/session';
import { today } from '@/data/venue';
import { useI18n } from '@/i18n';

/**
 * O-01's arrivals and tiles, from the venue's own calendar.
 *
 * Scoped by the server to the venues the signed-in person works at (RBAC-002).
 *
 * Three states, not two. `showcase` is the demo build and the signed-out
 * visitor, who are shown the design's sample shift because there is no venue
 * to show them instead. A signed-in operator is never in that state: if their
 * calendar cannot be read they get the error, and nothing else.
 *
 * That distinction used to be missing, and the consequence was the worst thing
 * this app could do — a real venue whose network dropped was shown three
 * invented arrivals, one of them instructing the gate to collect EGP 100 from
 * a person who does not exist.
 */
export function useOwnerToday() {
  const { t } = useI18n();
  const { activeVenue, signedIn } = useSession();
  const venue = activeVenue;
  const showcase = !isLive || !signedIn || !venue;

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
        api.ownerArrivals(venue.venueId, today()),
        api.ownerSummary(venue.venueId, today()),
      ]);
      setArrivals(a);
      setSummary(s);
    } catch (e) {
      // The Error branch used to surface the provider's own English, which is
      // the one thing an operator cannot act on in either language.
      if (__DEV__) console.warn('[owner]', e);
      setError(t.errVenueCalendar);
      setArrivals(null);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [signedIn, venue]);

  const tick = useRefreshTick();
  useEffect(() => {
    void load();
  }, [load, tick]);

  return {
    arrivals,
    summary,
    loading,
    error,
    /** The screen is showing this venue's real evening. */
    live: arrivals !== null,
    /** There is no venue to show, so the design's sample shift stands in. */
    showcase,
    venueName: venue?.name ?? null,
    venueId: venue?.venueId ?? null,
    reload: load,
  };
}
