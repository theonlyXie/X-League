import { useCallback, useEffect, useState } from 'react';
import { isLive } from '@/lib/supabase';
import { today } from '@/data/venue';
import { useSession } from '@/state/session';
import {
  myBookings,
  myNextBooking,
  searchVenues,
  type NextBooking,
  type PastBooking,
  type VenueSummary,
} from '@/data/discovery';
import { myInvitations, mySquadMatches, squadCounts, type Invitation, type SquadCounts } from '@/data/squad';
import { myCardEvidence, type CardEvidence } from '@/data/progress';

/**
 * Everything P-02 shows, in one place.
 *
 * Home used to render five fixture constants. The awkward part of making it
 * live is not the fetching — it is that each section can legitimately be empty,
 * and an empty section is a different screen rather than a blank space. So this
 * distinguishes "still loading", "loaded and there is nothing", and "could not
 * reach the server", and the screen renders all three differently.
 */

export type HomeState = {
  loading: boolean;
  /** True when the server could not be reached at all. */
  unreachable: boolean;
  /** The next match this player is part of, whether or not they booked it. */
  next: NextBooking | null;
  /** Squad counts for that match, when there is one. */
  counts: SquadCounts | null;
  /** True when the player is in the squad but somebody else is the captain. */
  guestOfCaptain: boolean;
  invitations: Invitation[];
  /**
   * A match this player captained that has finished and still has no result.
   * Nothing else in the product credits points, so Home asks for it — it is
   * the one prompt that is worth interrupting the screen for.
   */
  awaitingResult: PastBooking | null;
  nearby: VenueSummary[];
  /** Total saleable slots across the venues shown, for the "12 slots" link. */
  liveSlots: number;
  evidence: CardEvidence | null;
  reload: () => void;
};

export function useHome(): HomeState {
  const { signedIn, restoring } = useSession();
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const [next, setNext] = useState<NextBooking | null>(null);
  const [counts, setCounts] = useState<SquadCounts | null>(null);
  const [guestOfCaptain, setGuestOfCaptain] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [awaitingResult, setAwaitingResult] = useState<PastBooking | null>(null);
  const [nearby, setNearby] = useState<VenueSummary[]>([]);
  const [evidence, setEvidence] = useState<CardEvidence | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!isLive || restoring) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setUnreachable(false);
      try {
        // Venues are public, so they load whether or not anybody is signed in —
        // a guest opening the app should still see what is on tonight.
        //
        // The date is passed explicitly, in the venue's zone. Omitting it let
        // the server default to `current_date`, which on this deployment is
        // UTC — so between midnight and 03:00 Cairo, Home searched *yesterday*
        // and reported every venue fully booked while Play, two taps away,
        // showed fourteen free hours at the same venues. Two screens
        // disagreeing about what day it is, on the screen people open first.
        const venues = await searchVenues({ date: today(), limit: 6 });
        if (cancelled) return;
        setNearby(venues);

        if (!signedIn) {
          setNext(null);
          setCounts(null);
          setInvitations([]);
          setAwaitingResult(null);
          setEvidence(null);
          return;
        }

        const [booking, invites, squadMatches, past, ev] = await Promise.all([
          myNextBooking(),
          myInvitations(),
          mySquadMatches(5),
          myBookings(20).catch(() => [] as PastBooking[]),
          myCardEvidence().catch(() => null),
        ]);
        if (cancelled) return;

        // The server decides what is awaiting a result — the same condition
        // `complete_match` enforces — so this only has to pick the most recent.
        setAwaitingResult(past.find((b) => b.awaitingResult) ?? null);

        // A player who accepted somebody else's invitation has a match tonight
        // without having booked anything, so Home has to look in both places.
        const soonest = squadMatches[0];
        const useSquadMatch =
          !booking || (soonest && new Date(soonest.startsAt) < new Date(booking.startsAt));

        if (booking && !useSquadMatch) {
          setNext(booking);
          setGuestOfCaptain(false);
          setCounts(await squadCounts(booking.bookingId).catch(() => null));
        } else if (soonest) {
          setNext({
            bookingId: soonest.bookingId,
            code: null,
            state: 'confirmed',
            startsAt: soonest.startsAt,
            endsAt: soonest.startsAt,
            venueId: '',
            venueName: soonest.venueName,
            area: soonest.area,
            pitchLabel: soonest.pitchLabel,
            entryNote: null,
            mapUrl: null,
            lat: null,
            lon: null,
            priceEgp: 0,
            depositEgp: 0,
          });
          setGuestOfCaptain(!soonest.isCaptain);
          setCounts(await squadCounts(soonest.bookingId).catch(() => null));
        } else {
          setNext(null);
          setCounts(null);
          setGuestOfCaptain(false);
        }

        setInvitations(invites);
        setEvidence(ev);
      } catch {
        // §4.7: a screen that cannot reach the server says so rather than
        // rendering yesterday's numbers as though they were tonight's.
        if (!cancelled) setUnreachable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, restoring, nonce]);

  return {
    loading: isLive ? loading : false,
    unreachable,
    next,
    counts,
    guestOfCaptain,
    invitations,
    awaitingResult,
    nearby,
    liveSlots: nearby.reduce((sum, v) => sum + v.openSlots, 0),
    evidence,
    reload,
  };
}
