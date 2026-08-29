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
import { DEFAULT_SLOT, HOLD_SECONDS, SLOT_TIMES, SLOTS_TAKEN, SlotTime, BOOKING } from '@/data/player';
import { isLive } from '@/lib/supabase';
import * as api from '@/data/api';
import { DEMO_PITCH_ID, DEMO_VENUE_ID, today } from '@/data/venue';

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
  /** The selected hour, 0-23, for the screens to format. */
  slotHour: number;
  /** The hour it ends at. */
  slotEndHour: number;
  /** Hours already sold, through any channel. */
  taken: SlotTime[];
  /**
   * Every hour this pitch actually sells, from the venue calendar.
   *
   * The grid used to be drawn from a constant — the design's six evening
   * hours — so a venue selling 2 PM to 6 PM was advertised as selling six
   * hours it does not, with the ones it does nowhere on the screen. Tapping an
   * invented hour failed honestly, but the grid had already offered it.
   */
  times: SlotTime[];
  /**
   * Price per hour label. A pitch can be priced differently by hour (OWN-007),
   * so the footer quotes the hour the player actually selected rather than one
   * number for the whole evening.
   */
  slotPrices: Record<string, number>;
  slotDeposits: Record<string, number>;
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
  /** True when the booking was actually made. False is not a navigation. */
  confirmBooking: () => Promise<boolean>;

  checkedIn: boolean;
  toggleCheckIn: () => void;

  /** Re-read availability from the venue calendar. */
  refresh: () => Promise<void>;

  /**
   * Point the spine at a pitch and a date. Discovery hands these in from the
   * venue the player tapped; before it existed the pitch came from `.env`, so
   * the app could only ever sell one.
   */
  setTarget: (pitchId: string, date: string, venueId?: string) => void;
  pitchId: string;
  /** The venue that pitch belongs to, so checkout can name it. */
  venueId: string;
  date: string;
};

const BookingContext = createContext<BookingContextValue | null>(null);

const hourOf = (t: SlotTime) => parseInt(t, 10);

/**
 * A slot's identity: its hour, as a string.
 *
 * Not a display label. A label is ambiguous — a venue open from 10 in the
 * morning until midnight has two hours that read `10:00` — and this value is
 * the key for `taken`, for `slotPrices` and for the selection itself. The
 * screens render it through `hourLabel`, which adds AM or PM.
 */
const labelOf = (s: api.Slot) => String(s.hour) as SlotTime;

export function BookingProvider({ children }: { children: ReactNode }) {
  const [pitchId, setPitchId] = useState<string>(DEMO_PITCH_ID);
  const [venueId, setVenueId] = useState<string>(DEMO_VENUE_ID);
  const [date, setDate] = useState<string>(() => today());
  const [slot, setSlot] = useState<SlotTime>(DEFAULT_SLOT);
  // Seeded with the design's sold hours for the showcase. Once a live
  // calendar has been read, `refresh` replaces this wholesale — including on
  // failure, so a fixture's struck-through hours never survive an outage and
  // masquerade as this venue's.
  const [taken, setTaken] = useState<SlotTime[]>(isLive ? [] : SLOTS_TAKEN);
  const [slots, setSlots] = useState<api.Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreachable, setUnreachable] = useState(false);

  const [hold, setHold] = useState<HoldState>('idle');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  // Empty, not the fixture. Seeding it with `XL-7K42` meant a failed confirm
  // still had a booking code to show, and the confirmation screen showed it.
  const [code, setCode] = useState<string>('');
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
    if (!isLive || !pitchId) return;
    setLoading(true);
    try {
      const fetched = await api.searchAvailability(pitchId, date);
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
  }, [pitchId, date]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Changing pitch has to drop any hold in flight. A countdown left running
   * against a slot at another venue would be showing the player a claim on
   * inventory they are no longer looking at.
   */
  const setTarget = useCallback(
    (nextPitch: string, nextDate: string, nextVenue?: string) => {
      setPitchId((current) => {
        if (current !== nextPitch) {
          setHold('idle');
          setExpiresAt(null);
          setBookingId(null);
          setConflict(null);
        }
        return nextPitch;
      });
      setDate(nextDate);
      if (nextVenue) setVenueId(nextVenue);
    },
    [],
  );

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
      // No captain name: the server falls back to the signed-in player's own
      // profile, which is more honest than the client asserting who it is.
      result = await api.holdSlot(pitchId, chosen.startsAt, {
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
  }, [slot, slots, refresh, pitchId]);

  const releaseHold = useCallback(() => {
    setHold((h) => {
      if (h === 'confirmed') return h;
      if (isLive && bookingId && h === 'holding') api.releaseHold(bookingId).catch(() => {});
      return 'idle';
    });
  }, [bookingId]);

  /**
   * BKG-006. Returns whether the booking was actually made.
   *
   * It used to return `void`, and checkout navigated to the confirmation
   * screen unconditionally — so a player whose hold had expired, or whose
   * network dropped mid-confirm, got the full ceremony: VoidMark, "YOU'RE
   * PLAYING", a booking code and a cash amount, for a booking that does not
   * exist. They would then turn up at a pitch quoting a code from the design
   * fixture. The caller has to be able to tell, so this says.
   */
  const confirmBooking = useCallback(async (): Promise<boolean> => {
    if (!isLive || !bookingId) {
      setCode(BOOKING.code);
      setHold('confirmed');
      return true;
    }
    try {
      const result = await api.confirmBooking(bookingId);
      if (!result.ok) {
        setHold('expired');
        return false;
      }
      setCode(result.code);
      setHold('confirmed');
      return true;
    } catch {
      setConflict({ reason: 'Could not reach the venue calendar. Try again.', alternatives: [] });
      setUnreachable(true);
      return false;
    }
  }, [bookingId]);

  const toggleCheckIn = useCallback(() => {
    setCheckedIn((c) => {
      if (isLive && bookingId && !c) api.checkInBooking(bookingId).catch(() => {});
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
      slotHour: hourOf(slot),
      slotEndHour: hourOf(slot) + 1,
      taken,
      times: isLive ? slots.map(labelOf) : SLOT_TIMES,
      slotPrices: Object.fromEntries(slots.map((s) => [labelOf(s), s.priceEgp])),
      slotDeposits: Object.fromEntries(slots.map((s) => [labelOf(s), s.depositEgp])),
      loading,
      unreachable,
      hold,
      // Zero once the hold is gone. The countdown is derived from the local
      // clock, but a hold can end on the server first — a refused confirm, or
      // a slot claimed elsewhere — and the banner then read "Your hold
      // expired" beside a clock still counting down four minutes.
      holdText: hold === 'expired' ? '0:00' : `${minutes}:${seconds}`,
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
      setTarget,
      pitchId,
      venueId,
      date,
    };
  }, [
    slot,
    selectSlot,
    taken,
    slots,
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
    setTarget,
    pitchId,
    venueId,
    date,
  ]);

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking must be used inside a BookingProvider');
  return ctx;
}
