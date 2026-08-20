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
import { BOOKING, DEFAULT_SLOT, HOLD_SECONDS, ROSTER, RosterEntry, SLOTS_TAKEN, SlotTime, VENUES } from '@/data/player';
import * as api from '@/data/api';
import { findPitch, getDefaultPitchId } from '@/lib/venueConfig';
import { inventoryDate } from '@/lib/dates';
import { loadJson, saveJson } from '@/lib/storage';
import { quoteFromHourly } from '@/lib/venueQuote';
import type { BookingContextValue, HoldState, SavedBooking } from '@/state/bookingTypes';
import { useSession } from '@/state/session';

const OVERLAY_KEY = 'xleague.booking.live-overlay.v1';

type Overlay = {
  roster: RosterEntry[];
  discountActive: boolean;
  checkedIn: boolean;
  activeBooking: SavedBooking | null;
  history: SavedBooking[];
};

const DEFAULT_OVERLAY: Overlay = {
  roster: ROSTER,
  discountActive: false,
  checkedIn: false,
  activeBooking: null,
  history: [],
};

const BookingContext = createContext<BookingContextValue | null>(null);

const hourOf = (t: SlotTime) => parseInt(t, 10);
const labelOf = (s: api.Slot) => `${s.hour - 12}:00` as SlotTime;

export function LiveBookingProvider({ children }: { children: ReactNode }) {
  const { displayName } = useSession();
  const [ready, setReady] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(DEFAULT_OVERLAY);

  const [pitchId, setPitchId] = useState(getDefaultPitchId());
  const [slot, setSlot] = useState<SlotTime>(DEFAULT_SLOT);
  const [venueName, setVenueName] = useState<string>(BOOKING.venue);
  const [venueHourly, setVenueHourly] = useState<number>(VENUES[0].hourly);
  const [taken, setTaken] = useState<SlotTime[]>(SLOTS_TAKEN);
  const [slots, setSlots] = useState<api.Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreachable, setUnreachable] = useState(false);

  const [hold, setHold] = useState<HoldState>('idle');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [depositEgp, setDepositEgp] = useState<number>(BOOKING.deposit);
  const [conflict, setConflict] = useState<BookingContextValue['conflict']>(null);

  const [, setNow] = useState(() => Date.now());
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadJson<Overlay>(OVERLAY_KEY, DEFAULT_OVERLAY).then((o) => {
      setOverlay(o);
      setReady(true);
    });
  }, []);

  const persistOverlay = useCallback(async (next: Overlay) => {
    setOverlay(next);
    await saveJson(OVERLAY_KEY, next);
  }, []);

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

  useEffect(() => {
    if (hold === 'holding' && remaining === 0 && expiresAt !== null) setHold('expired');
  }, [hold, remaining, expiresAt]);

  const refresh = useCallback(async () => {
    if (!pitchId) return;
    setLoading(true);
    try {
      const fetched = await api.searchAvailability(pitchId, inventoryDate());
      setSlots(fetched);
      setTaken(fetched.filter((s) => !s.available).map(labelOf));
      setUnreachable(false);
    } catch {
      setUnreachable(true);
    } finally {
      setLoading(false);
    }
  }, [pitchId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const beginHold = useCallback(async (): Promise<boolean> => {
    setConflict(null);

    const chosen = slots.find((s) => labelOf(s) === slot);
    if (!chosen) {
      setConflict({ reason: 'That hour is no longer on sale.', alternatives: [] });
      void refresh();
      return false;
    }

    try {
      const result = await api.holdSlot(pitchId, chosen.startsAt, {
        captainName: displayName ?? 'Player',
        holdSeconds: HOLD_SECONDS,
      });
      if (!result.ok) {
        setConflict({
          reason: result.reason,
          alternatives: result.alternatives.map(labelOf),
        });
        setHold('idle');
        void refresh();
        return false;
      }
      setBookingId(result.bookingId);
      setDepositEgp(result.depositEgp);
      setVenueHourly(result.priceEgp);
      setExpiresAt(new Date(result.expiresAt).getTime());
      setHold('holding');
      return true;
    } catch {
      setConflict({ reason: 'Could not reach the venue calendar. Try again.', alternatives: [] });
      setUnreachable(true);
      return false;
    }
  }, [slot, slots, refresh, displayName, pitchId]);

  const releaseHold = useCallback(() => {
    setHold((h) => {
      if (h === 'confirmed' || h === 'cancelled') return h;
      if (bookingId && h === 'holding') api.releaseHold(bookingId).catch(() => {});
      return 'idle';
    });
  }, [bookingId]);

  const confirmBooking = useCallback(async () => {
    if (!bookingId) {
      setHold('confirmed');
      return;
    }
    try {
      const result = await api.confirmBooking(bookingId);
      if (!result.ok) {
        setHold('expired');
        return;
      }
      const booking: SavedBooking = {
        code: result.code,
        venue: venueName,
        pitch: BOOKING.pitch,
        area: BOOKING.area,
        slot,
        deposit: depositEgp,
        status: 'confirmed',
        confirmedAt: Date.now(),
        bookingId,
      };
      await persistOverlay({
        ...overlay,
        activeBooking: booking,
        history: [booking, ...overlay.history.filter((b) => b.code !== booking.code)],
        checkedIn: false,
      });
      setHold('confirmed');
    } catch {
      setConflict({ reason: 'Could not reach the venue calendar. Try again.', alternatives: [] });
      setUnreachable(true);
    }
  }, [bookingId, venueName, slot, depositEgp, overlay, persistOverlay]);

  const cancelBooking = useCallback(() => {
    const cancelled = overlay.activeBooking
      ? { ...overlay.activeBooking, status: 'cancelled' as const }
      : null;
    void persistOverlay({
      ...overlay,
      activeBooking: null,
      history: cancelled ? [cancelled, ...overlay.history] : overlay.history,
      checkedIn: false,
    });
    setHold('cancelled');
  }, [overlay, persistOverlay]);

  const confirmCashCollection = useCallback(
    async (targetBookingId?: string) => {
      if (overlay.checkedIn && !targetBookingId) return;
      const id = targetBookingId ?? overlay.activeBooking?.bookingId ?? bookingId;
      if (id) {
        try {
          const result = await api.checkInBooking(id);
          if (!result.ok) return;
        } catch {
          return;
        }
      }
      const active =
        overlay.activeBooking && (!targetBookingId || overlay.activeBooking.bookingId === targetBookingId)
          ? { ...overlay.activeBooking, status: 'checked_in' as const }
          : overlay.activeBooking;
      await persistOverlay({
        ...overlay,
        checkedIn: active?.bookingId === id || !targetBookingId ? true : overlay.checkedIn,
        activeBooking: active,
        history: active
          ? overlay.history.map((b) => (b.code === active.code ? active : b))
          : overlay.history,
      });
    },
    [overlay, bookingId, persistOverlay],
  );

  const toggleCheckIn = useCallback(() => {
    void confirmCashCollection();
  }, [confirmCashCollection]);

  const selectSlot = useCallback(
    (next: SlotTime) => {
      if (taken.includes(next)) return;
      setSlot(next);
    },
    [taken],
  );

  const selectVenue = useCallback((name: string, hourly = VENUES[0].hourly, nextPitchId?: string) => {
    setVenueName(name);
    setVenueHourly(hourly);
    const resolved = nextPitchId ?? findPitch(name)?.pitchId ?? pitchId;
    if (resolved) setPitchId(resolved);
  }, [pitchId]);

  const fillRosterSlot = useCallback(
    (name: string) => {
      const roster = overlay.roster.map((r) =>
        r.tag === 'OPEN' && !r.filled ? { ...r, name, tag: 'IN' as const, filled: true, meta: 'Invited · pending' } : r,
      );
      void persistOverlay({ ...overlay, roster });
    },
    [overlay, persistOverlay],
  );

  const toggleDiscount = useCallback(() => {
    void persistOverlay({ ...overlay, discountActive: !overlay.discountActive });
  }, [overlay, persistOverlay]);

  const value = useMemo<BookingContextValue>(() => {
    const minutes = Math.floor(remaining / 60);
    const seconds = String(remaining % 60).padStart(2, '0');
    const quote = quoteFromHourly(venueHourly);
    const activeBooking =
      overlay.activeBooking ??
      (hold === 'confirmed' && bookingId
        ? {
            code: BOOKING.code,
            venue: venueName,
            pitch: BOOKING.pitch,
            area: BOOKING.area,
            slot,
            deposit: depositEgp || quote.deposit,
            status: 'confirmed' as const,
            confirmedAt: Date.now(),
          }
        : null);

    return {
      slot,
      selectSlot,
      slotLabel: `${slot} PM`,
      slotEndLabel: `${hourOf(slot) + 1}:00 PM`,
      taken,
      venueName,
      venueHourly,
      selectVenue,
      hold,
      holdSeconds: remaining,
      holdText: `${minutes}:${seconds}`,
      beginHold,
      releaseHold,
      confirmBooking,
      cancelBooking,
      activeBooking,
      bookingHistory: overlay.history,
      checkedIn: overlay.checkedIn,
      confirmCashCollection,
      toggleCheckIn,
      roster: overlay.roster,
      fillRosterSlot,
      discountActive: overlay.discountActive,
      toggleDiscount,
      ready,
      live: true,
      loading,
      unreachable,
      refresh,
      bookingId,
      conflict,
      clearConflict: () => setConflict(null),
    };
  }, [
    remaining,
    slot,
    selectSlot,
    taken,
    venueName,
    venueHourly,
    selectVenue,
    hold,
    beginHold,
    releaseHold,
    confirmBooking,
    cancelBooking,
    overlay,
    toggleCheckIn,
    confirmCashCollection,
    fillRosterSlot,
    toggleDiscount,
    ready,
    loading,
    unreachable,
    refresh,
    bookingId,
    conflict,
    depositEgp,
  ]);

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useLiveBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useLiveBooking must be used inside LiveBookingProvider');
  return ctx;
}
