import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '@/data/api';
import * as adminApi from '@/data/adminApi';
import { Venue } from '@/data/player';
import { resetVenueCache } from '@/lib/venueConfig';
import { useSession } from '@/state/session';
import type { VenueSubmission, VenuesContextValue } from '@/state/venuesTypes';

const VenuesContext = createContext<VenuesContextValue | null>(null);

function rowsToVenues(rows: api.PlayerVenueRow[]): Venue[] {
  const byVenue = new Map<string, api.PlayerVenueRow[]>();
  for (const row of rows) {
    const list = byVenue.get(row.venueName) ?? [];
    list.push(row);
    byVenue.set(row.venueName, list);
  }
  return [...byVenue.entries()].map(([name, pitches]) => {
    const head = pitches[0]!;
    return {
      name,
      verified: head.verification === 'verified',
      rating: head.verification === 'verified' ? 4.6 : 0,
      reviews: head.verification === 'verified' ? 120 : 0,
      distanceKm: 2.4,
      surface: 'Artificial turf',
      hourly: head.hourlyEgp,
      lat: head.lat,
      lng: head.lon,
      open: ['6:00', '7:00', '8:00', '9:00'],
      nextSlot: '9:00 PM',
      moreSlots: 3,
      note: head.verification === 'pending' ? 'New on X League' : undefined,
    };
  });
}

function mapSubmission(row: Record<string, string>, ownerName: string): VenueSubmission {
  return {
    id: row.id,
    name: row.name,
    area: row.area,
    ownerName,
    status: row.status as VenueSubmission['status'],
    submittedAt: new Date(row.submitted_at).getTime(),
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).getTime() : undefined,
    rejectionReason: row.rejection_reason ?? undefined,
  };
}

export function LiveVenuesProvider({ children }: { children: ReactNode }) {
  const { displayName, signedIn, venues: staffVenues, isAdmin } = useSession();
  const [ready, setReady] = useState(false);
  const [playerVenues, setPlayerVenues] = useState<Venue[]>([]);
  const [mine, setMine] = useState<VenueSubmission | null>(null);
  const [pendingSubmissions, setPendingSubmissions] = useState<VenueSubmission[]>([]);

  const reload = useCallback(async () => {
    try {
      const rows = await api.listPlayerVenues();
      setPlayerVenues(rowsToVenues(rows));
    } catch {
      setPlayerVenues([]);
    }
  }, []);

  const reloadMine = useCallback(async () => {
    if (!signedIn) {
      setMine(null);
      return;
    }
    try {
      const row = await adminApi.myVenueSubmissionLive();
      setMine(row ? mapSubmission(row, displayName ?? 'Owner') : null);
    } catch {
      setMine(null);
    }
  }, [signedIn, displayName]);

  const reloadPending = useCallback(async () => {
    if (!isAdmin) {
      setPendingSubmissions([]);
      return;
    }
    try {
      const rows = await adminApi.fetchPendingSubmissions();
      setPendingSubmissions(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          area: r.area,
          ownerName: r.ownerName,
          status: 'pending' as const,
          submittedAt: new Date(r.submittedAt).getTime(),
        })),
      );
    } catch {
      setPendingSubmissions([]);
    }
  }, [isAdmin]);

  useEffect(() => {
    Promise.all([reload(), reloadMine(), reloadPending()]).finally(() => setReady(true));
  }, [reload, reloadMine, reloadPending]);

  const submitVenue = useCallback(
    async (name: string, area: string, ownerName: string) => {
      const row = await adminApi.submitVenueLive(name, area);
      const entry = mapSubmission(row, ownerName);
      setMine(entry);
      return entry;
    },
    [],
  );

  const approve = useCallback(
    async (id: string) => {
      const result = await adminApi.approveVenueSubmission(id);
      if (!result.ok) throw new Error(result.reason ?? 'Approval failed');
      resetVenueCache();
      await Promise.all([reload(), reloadPending()]);
    },
    [reload, reloadPending],
  );

  const reject = useCallback(
    async (id: string, reason?: string) => {
      const result = await adminApi.rejectVenueSubmission(id, reason);
      if (!result.ok) throw new Error(result.reason ?? 'Rejection failed');
      await reloadPending();
    },
    [reloadPending],
  );

  const submissionForOwner = useCallback(
    (_ownerName: string) => mine,
    [mine],
  );

  const submissions = useMemo(() => (mine ? [mine] : []), [mine]);

  const value = useMemo<VenuesContextValue>(
    () => ({
      ready,
      submissions,
      submitVenue,
      approve,
      reject,
      playerVenues,
      pendingSubmissions,
      submissionForOwner,
    }),
    [ready, submissions, submitVenue, approve, reject, playerVenues, pendingSubmissions, submissionForOwner],
  );

  // When user becomes venue staff after approval, refresh player list.
  useEffect(() => {
    if (staffVenues.length) void reload();
  }, [staffVenues.length, reload]);

  return <VenuesContext.Provider value={value}>{children}</VenuesContext.Provider>;
}

export function useLiveVenues() {
  const ctx = useContext(VenuesContext);
  if (!ctx) throw new Error('useLiveVenues must be used inside LiveVenuesProvider');
  return ctx;
}
