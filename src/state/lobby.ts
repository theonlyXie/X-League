import { useCallback, useEffect, useState } from 'react';
import { isLive } from '@/lib/supabase';
import {
  bookingSquad,
  squadCounts,
  type SquadCounts,
  type SquadMember,
} from '@/data/squad';
import { bookingTerms, myBookings, type BookingTerms, type PastBooking } from '@/data/discovery';
import { useI18n } from '@/i18n';

/**
 * P-13's data, for one booking.
 *
 * The counts come from `squadCounts` rather than from counting the roster this
 * screen holds: a player may be shown only part of a squad, and counting what
 * they can see would report "3 of 5" for a match that is full.
 *
 * There is no conversation to open any more. The lobby used to fetch a room
 * and its last fifty messages on mount; a squad now reaches each other on
 * WhatsApp, one button per person, and that number is fetched only when
 * somebody presses it.
 */

export type LobbyState = {
  loading: boolean;
  /** Set when the booking is not one this player is part of. */
  denied: string | null;
  squad: SquadMember[];
  counts: SquadCounts | null;
  booking: PastBooking | null;
  terms: BookingTerms | null;
  reload: () => void;
};

export function useLobby(bookingId: string | null): LobbyState {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState<string | null>(null);
  const [squad, setSquad] = useState<SquadMember[]>([]);
  const [counts, setCounts] = useState<SquadCounts | null>(null);
  const [booking, setBooking] = useState<PastBooking | null>(null);
  const [terms, setTerms] = useState<BookingTerms | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!isLive || !bookingId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      setDenied(null);
      try {
        const [members, cnt, mine, tms] = await Promise.all([
          bookingSquad(bookingId),
          squadCounts(bookingId).catch(() => null),
          // The booking's own facts. `my_bookings` is the captain's list, so a
          // squad member simply gets nothing here and the header falls back to
          // what the squad call already told us.
          // A swallowed failure here silently demotes the captain to a squad
          // member: the lobby decides captain-or-member on whether this
          // returned their booking, so a dropped connection swapped "Cancel
          // booking" for "Leave match" and removed the invite and remove
          // controls. Two destructive actions, quietly exchanged.
          myBookings(50),
          bookingTerms(bookingId).catch(() => null),
        ]);
        if (cancelled) return;
        setSquad(members);
        setCounts(cnt);
        setBooking(mine.find((b) => b.bookingId === bookingId) ?? null);
        setTerms(tms);
      } catch (e: unknown) {
        // RBAC-006: not being in a squad is a legitimate answer, not a crash.
        if (!cancelled) {
          const message = (e as { message?: string })?.message ?? '';
          setDenied(
            message.includes('not part of that match')
              ? t.errNotPartOfMatch
              : t.errThisMatchUnreadable,
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookingId, nonce]);

  return {
    loading: isLive ? loading : false,
    denied,
    squad,
    counts,
    booking,
    terms,
    reload,
  };
}
