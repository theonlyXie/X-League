import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { VENUES, Venue } from '@/data/player';
import { loadJson, saveJson } from '@/lib/storage';
import { useProfile } from '@/state/profile';

const STORAGE_KEY = 'xleague.venue-submissions.v1';

export type VenueSubmissionStatus = 'pending' | 'approved' | 'rejected';

export type VenueSubmission = {
  id: string;
  name: string;
  area: string;
  ownerName: string;
  status: VenueSubmissionStatus;
  submittedAt: number;
  reviewedAt?: number;
  rejectionReason?: string;
};

type VenuesContextValue = {
  ready: boolean;
  submissions: VenueSubmission[];
  submitVenue: (name: string, area: string, ownerName: string) => Promise<VenueSubmission>;
  approve: (id: string) => Promise<void>;
  reject: (id: string, reason?: string) => Promise<void>;
  /** Live venues players can search — platform fixtures + admin-approved owner venues. */
  playerVenues: Venue[];
  pendingSubmissions: VenueSubmission[];
  submissionForOwner: (ownerName: string) => VenueSubmission | null;
};

const VenuesContext = createContext<VenuesContextValue | null>(null);

function hashId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function submissionToVenue(s: VenueSubmission): Venue {
  const h = hashId(s.id);
  return {
    name: s.name,
    verified: false,
    rating: 0,
    reviews: 0,
    distanceKm: 3,
    surface: 'Artificial turf',
    hourly: 280,
    lat: 30.05 + (h % 1000) / 50000,
    lng: 31.32 + ((h >> 10) % 1000) / 50000,
    open: ['8:00', '9:00', '10:00'],
    nextSlot: '9:00 PM',
    moreSlots: 2,
    note: 'New on X League',
  };
}

export function VenuesProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [submissions, setSubmissions] = useState<VenueSubmission[]>([]);

  useEffect(() => {
    loadJson<VenueSubmission[]>(STORAGE_KEY, []).then((items) => {
      setSubmissions(items);
      setReady(true);
    });
  }, []);

  const persist = useCallback(async (next: VenueSubmission[]) => {
    setSubmissions(next);
    await saveJson(STORAGE_KEY, next);
  }, []);

  const submitVenue = useCallback(
    async (name: string, area: string, ownerName: string) => {
      const entry: VenueSubmission = {
        id: `vs-${Date.now()}`,
        name: name.trim(),
        area: area.trim(),
        ownerName: ownerName.trim(),
        status: 'pending',
        submittedAt: Date.now(),
      };
      const next = [
        entry,
        ...submissions.filter(
          (s) =>
            s.ownerName.trim().toLowerCase() !== ownerName.trim().toLowerCase() &&
            s.name.toLowerCase() !== name.trim().toLowerCase(),
        ),
      ];
      await persist(next);
      return entry;
    },
    [persist, submissions],
  );

  const approve = useCallback(
    async (id: string) => {
      await persist(
        submissions.map((s) =>
          s.id === id ? { ...s, status: 'approved' as const, reviewedAt: Date.now(), rejectionReason: undefined } : s,
        ),
      );
    },
    [persist, submissions],
  );

  const reject = useCallback(
    async (id: string, reason = 'Does not meet listing requirements') => {
      await persist(
        submissions.map((s) =>
          s.id === id ? { ...s, status: 'rejected' as const, reviewedAt: Date.now(), rejectionReason: reason } : s,
        ),
      );
    },
    [persist, submissions],
  );

  const submissionForOwner = useCallback(
    (ownerName: string) => {
      const key = ownerName.trim().toLowerCase();
      return (
        submissions
          .filter((s) => s.ownerName.trim().toLowerCase() === key)
          .sort((a, b) => b.submittedAt - a.submittedAt)[0] ?? null
      );
    },
    [submissions],
  );

  const pendingSubmissions = useMemo(() => submissions.filter((s) => s.status === 'pending'), [submissions]);

  const playerVenues = useMemo(() => {
    const approved = submissions.filter((s) => s.status === 'approved').map(submissionToVenue);
    const names = new Set(approved.map((v) => v.name.toLowerCase()));
    const platform = VENUES.filter((v) => !names.has(v.name.toLowerCase()));
    return [...platform, ...approved];
  }, [submissions]);

  const value = useMemo(
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

  return <VenuesContext.Provider value={value}>{children}</VenuesContext.Provider>;
}

export function useVenues() {
  const ctx = useContext(VenuesContext);
  if (!ctx) throw new Error('useVenues must be used inside VenuesProvider');
  return ctx;
}

/** Latest venue submission for the signed-in profile. */
export function useMyVenueSubmission() {
  const { profile } = useProfile();
  const { submissionForOwner, ...rest } = useVenues();
  const mine = useMemo(() => submissionForOwner(profile.firstName), [submissionForOwner, profile.firstName]);
  return { ...rest, mine };
}
