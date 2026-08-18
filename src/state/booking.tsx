import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DEFAULT_SLOT, HOLD_SECONDS, SLOTS_TAKEN, SlotTime, BOOKING } from '@/data/player';
import { isLive } from '@/lib/supabase';
import * as api from '@/data/api';
import { DEMO_PITCH_ID, BOOKING_DATE } from '@/data/venue';

/**
 * The booking spine's shared state.
 *
 * §5.4 is the rule this models: one hold owns a pitch-time interval, the hold
 * carries a visible countdown, and confirmation converts that same hold into a
 * booking.
 *
 * The countdown is derived from an expiry *instant*, never from a decrementing
 * counter. When a database is configured that instant is the server's
 * `expires_at`, so the interface cannot drift from the row that actually owns
 * the slot — a backgrounded app resumes showing the truth rather than however
 * far its own timer happened to get.
 */

export type HoldState = 'idle' | 'holding' | 'expired' | 'confirmed';

type BookingContextValue = {
  slot: SlotTime;
  selectSlot: (slot: SlotTime) => void;
  slotLabel: string;
  slotEndLabel: string;
  /** Hours already sold, through any channel. */
  taken: SlotTime[];
  /** True while availability is being re-read from the venue calendar. */
  loading: boolean;
  /** True when the venue calendar could not be reached (§4.7 error state). */
  unreachable: boolean;

  hold: HoldState;
  holdText: string;
  /** Non-null once a hold exists on the server. */
  bookingId: string | null;
  /** The confirmed booking's reference (BKG-006). */
  code: string;
  /** Set when a hold was lost to someone else — BKG-011 alternatives. */
  conflict: { reason: string; alternatives: SlotTime[] } | null;
  clearConflict: () => void;

  /** Resolves true when the hold was taken; false when the slot had gone. */
  beginHold: () => Promise<boolean>;
  releaseHold: () => void;
  confirmBooking: () => Promise<void>;

  checkedIn: boolean;
  toggleCheckIn: () => void;

  /** Re-read availability from the venue calendar. */
  refresh: () => Promise<void>;
};

const BookingContext = createContext<BookingContextValue | null>(null);

const hourOf = (t: SlotTime) => parseInt(t, 10);

/** The venue sells evening hours, so a 24h hour maps onto the PM label. */
const labelOf = (s: api.Slot) => `${s.hour - 12}:00` as SlotTime;

export function BookingProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<SlotTime>(DEFAULT_SLOT);
  const [taken, setTaken] = useState<SlotTime[]>(SLOTS_TAKEN);
  const [slots, setSlots] = useState<api.Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreachable, setUnreachable] = useState(false);

  const [hold, setHold] = useState<HoldState>('idle');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [code, setCode] = useState<string>(BOOKING.code);
  const [conflict, setConflict] = useState<BookingContextValue['conflict']>(null);
  const [checkedIn, setCheckedIn] = useState(false);

  /** Ticks once a second purely to re-render the derived countdown. */
  const [, setNow] = useState(() => Date.now());
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (hold !== 'holding') {
      if (ticker.current) clearInterval(ticker.current);
      ticker.current = null;
      return;
    }
    ticker.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (ticker.current) clearInterval(ticker.current);
      ticker.current = null;
    };
  }, [hold]);

  const remaining = expiresAt === null ? 0 : Math.max(0, Math.round((expiresAt - Date.now()) / 1000));

  // AC-03: the countdown reaching zero is the hold ending, not a display state.
  useEffect(() => {
    if (hold === 'holding' && remaining === 0 && expiresAt !== null) setHold('expired');
  }, [hold, remaining, expiresAt]);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      const fetched = await api.searchAvailability(DEMO_PITCH_ID, BOOKING_DATE);
      setSlots(fetched);
      setTaken(fetched.filter((s) => !s.available).map(labelOf));
      setUnreachable(false);
    } catch {
      // §4.7 requires an error state, not a silent failure: availability we
      // cannot verify must not be presented as if it were live. The grid keeps
      // whatever it last knew and the screen says the calendar is unreachable.
      setUnreachable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const beginHold = useCallback(async (): Promise<boolean> => {
    setConflict(null);

    if (!isLive) {
      setBookingId(null);
      setCode(BOOKING.code);
      setExpiresAt(Date.now() + HOLD_SECONDS * 1000);
      setHold('holding');
      return true;
    }

    // Hold the exact instant search returned. The app never assembles a
    // timestamp of its own — Egypt observes DST, and a client-side offset
    // would address the wrong hour for part of the year.
    const chosen = slots.find((s) => labelOf(s) === slot);
    if (!chosen) {
      setConflict({ reason: 'That hour is no longer on sale.', alternatives: [] });
      void refresh();
      return false;
    }

    let result: Awaited<ReturnType<typeof api.holdSlot>>;
    try {
      result = await api.holdSlot(DEMO_PITCH_ID, chosen.startsAt, {
        captainName: 'Basel Elsayed',
        holdSeconds: HOLD_SECONDS,
      });
    } catch {
      // A hold we could not place is not a hold. Never advance to checkout on
      // the strength of a request that failed.
      setConflict({ reason: 'Could not reach the venue calendar. Try again.', alternatives: [] });
      setUnreachable(true);
      return false;
    }

    if (!result.ok) {
      // Someone else took it between the search and the tap. That is a real
      // outcome, so say so and offer what is still there.
      setConflict({
        reason: result.reason,
        alternatives: result.alternatives.map(labelOf),
      });
      setHold('idle');
      void refresh();
      return false;
    }

    setBookingId(result.bookingId);
    setExpiresAt(new Date(result.expiresAt).getTime());
    setHold('holding');
    return true;
  }, [slot, slots, refresh]);

  const releaseHold = useCallback(() => {
    setHold((h) => {
      if (h === 'confirmed') return h;
      if (isLive && bookingId && h === 'holding') api.releaseHold(bookingId).catch(() => {});
      return 'idle';
    });
  }, [bookingId]);

  const confirmBooking = useCallback(async () => {
    if (!isLive || !bookingId) {
      setHold('confirmed');
      return;
    }
    try {
      const result = await api.confirmBooking(bookingId);
      if (!result.ok) {
        setHold('expired');
        return;
      }
      setCode(result.code);
      setHold('confirmed');
    } catch {
      setConflict({ reason: 'Could not reach the venue calendar. Try again.', alternatives: [] });
      setUnreachable(true);
    }
  }, [bookingId]);

  const toggleCheckIn = useCallback(() => {
    setCheckedIn((c) => {
      if (isLive && bookingId && !c) api.checkInBooking(bookingId, 'staff M.A.').catch(() => {});
      return !c;
    });
  }, [bookingId]);

  const selectSlot = useCallback(
    (next: SlotTime) => {
      if (taken.includes(next)) return;
      setSlot(next);
    },
    [taken],
  );

  const value = useMemo<BookingContextValue>(() => {
    const minutes = Math.floor(remaining / 60);
    const seconds = String(remaining % 60).padStart(2, '0');
    return {
      slot,
      selectSlot,
      slotLabel: `${slot} PM`,
      slotEndLabel: `${hourOf(slot) + 1}:00 PM`,
      taken,
      loading,
      unreachable,
      hold,
      holdText: `${minutes}:${seconds}`,
      bookingId,
      code,
      conflict,
      clearConflict: () => setConflict(null),
      beginHold,
      releaseHold,
      confirmBooking,
      checkedIn,
      toggleCheckIn,
      refresh,
    };
  }, [
    slot,
    selectSlot,
    taken,
    loading,
    unreachable,
    hold,
    remaining,
    bookingId,
    code,
    conflict,
    beginHold,
    releaseHold,
    confirmBooking,
    checkedIn,
    toggleCheckIn,
    refresh,
  ]);

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking must be used inside a BookingProvider');
  return ctx;
}
