import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BOOKING, DEFAULT_SLOT, HOLD_SECONDS, ROSTER, RosterEntry, SLOTS_TAKEN, SlotTime, VENUES } from '@/data/player';
import { loadJson, saveJson } from '@/lib/storage';
import { newBookingCode, quoteFromHourly } from '@/lib/venueQuote';
import type { BookingContextValue, HoldState, SavedBooking } from '@/state/bookingTypes';

type Persisted = {
  slot: SlotTime;
  venueName: string;
  venueHourly: number;
  hold: HoldState;
  holdSeconds: number;
  checkedIn: boolean;
  roster: RosterEntry[];
  discountActive: boolean;
  activeBooking: SavedBooking | null;
  history: SavedBooking[];
};

const STORAGE_KEY = 'xleague.booking.v1';

const DEFAULT: Persisted = {
  slot: DEFAULT_SLOT,
  venueName: VENUES[0].name,
  venueHourly: VENUES[0].hourly,
  hold: 'idle',
  holdSeconds: HOLD_SECONDS,
  checkedIn: false,
  roster: ROSTER,
  discountActive: false,
  activeBooking: null,
  history: [],
};

const BookingContext = createContext<BookingContextValue | null>(null);

function seedActiveBooking(): SavedBooking {
  return {
    code: BOOKING.code,
    venue: BOOKING.venue,
    pitch: BOOKING.pitch,
    area: BOOKING.area,
    slot: DEFAULT_SLOT,
    deposit: BOOKING.deposit,
    status: 'confirmed',
    confirmedAt: Date.now(),
  };
}

export function DemoBookingProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Persisted>(DEFAULT);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadJson<Persisted>(STORAGE_KEY, DEFAULT).then((loaded) => {
      const normalized = { ...DEFAULT, ...loaded, venueHourly: loaded.venueHourly ?? VENUES[0].hourly };
      // Demo seed: first open shows tonight's confirmed booking on Home.
      const next =
        normalized.activeBooking || normalized.history.length
          ? normalized
          : { ...normalized, activeBooking: seedActiveBooking(), hold: 'confirmed' as HoldState };
      setData(next);
      setReady(true);
    });
  }, []);

  const persist = useCallback(async (next: Persisted) => {
    setData(next);
    await saveJson(STORAGE_KEY, next);
  }, []);

  const stopTimer = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    if (data.hold !== 'holding') {
      stopTimer();
      return;
    }
    timer.current = setInterval(() => {
      setData((prev) => {
        if (prev.holdSeconds <= 1) {
          const next = { ...prev, hold: 'expired' as HoldState, holdSeconds: 0 };
          saveJson(STORAGE_KEY, next);
          return next;
        }
        const next = { ...prev, holdSeconds: prev.holdSeconds - 1 };
        return next;
      });
    }, 1000);
    return stopTimer;
  }, [data.hold, stopTimer]);

  const beginHold = useCallback(() => {
    persist({ ...data, holdSeconds: HOLD_SECONDS, hold: 'holding' });
  }, [data, persist]);

  const releaseHold = useCallback(() => {
    setData((prev) => {
      if (prev.hold === 'confirmed' || prev.hold === 'cancelled') return prev;
      const next = { ...prev, hold: 'idle' as HoldState, holdSeconds: HOLD_SECONDS };
      saveJson(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const confirmBooking = useCallback(() => {
    setData((prev) => {
      const quote = quoteFromHourly(prev.venueHourly);
      const booking: SavedBooking = {
        code: newBookingCode(),
        venue: prev.venueName,
        pitch: BOOKING.pitch,
        area: BOOKING.area,
        slot: prev.slot,
        deposit: quote.deposit,
        status: 'confirmed',
        confirmedAt: Date.now(),
      };
      const next = {
        ...prev,
        hold: 'confirmed' as HoldState,
        activeBooking: booking,
        history: [booking, ...prev.history.filter((b) => b.code !== booking.code)],
        checkedIn: false,
      };
      saveJson(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const cancelBooking = useCallback(() => {
    const cancelled = data.activeBooking
      ? { ...data.activeBooking, status: 'cancelled' as const }
      : null;
    persist({
      ...data,
      hold: 'cancelled',
      activeBooking: null,
      history: cancelled ? [cancelled, ...data.history] : data.history,
      checkedIn: false,
    });
  }, [data, persist]);

  const selectSlot = useCallback(
    (slot: SlotTime) => {
      if (SLOTS_TAKEN.includes(slot)) return;
      persist({ ...data, slot });
    },
    [data, persist],
  );

  const selectVenue = useCallback((venueName: string, hourly = VENUES[0].hourly, _pitchId?: string) => {
    setData((prev) => {
      const next = { ...prev, venueName, venueHourly: hourly };
      saveJson(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const toggleCheckIn = useCallback(() => persist({ ...data, checkedIn: !data.checkedIn }), [data, persist]);

  const fillRosterSlot = useCallback(
    (name: string) => {
      const roster = data.roster.map((r) =>
        r.tag === 'OPEN' && !r.filled ? { ...r, name, tag: 'IN' as const, filled: true, meta: 'Invited · pending' } : r,
      );
      persist({ ...data, roster });
    },
    [data, persist],
  );

  const toggleDiscount = useCallback(() => persist({ ...data, discountActive: !data.discountActive }), [data, persist]);

  const value = useMemo<BookingContextValue>(() => {
    const endHour = parseInt(data.slot, 10) + 1;
    const minutes = Math.floor(data.holdSeconds / 60);
    const seconds = String(data.holdSeconds % 60).padStart(2, '0');
    return {
      slot: data.slot,
      selectSlot,
      slotLabel: `${data.slot} PM`,
      slotEndLabel: `${endHour}:00 PM`,
      taken: SLOTS_TAKEN,
      venueName: data.venueName,
      venueHourly: data.venueHourly,
      selectVenue,
      hold: data.hold,
      holdSeconds: data.holdSeconds,
      holdText: `${minutes}:${seconds}`,
      beginHold,
      releaseHold,
      confirmBooking,
      cancelBooking,
      activeBooking: data.activeBooking,
      bookingHistory: data.history,
      checkedIn: data.checkedIn,
      toggleCheckIn,
      roster: data.roster,
      fillRosterSlot,
      discountActive: data.discountActive,
      toggleDiscount,
      ready,
      live: false,
    };
  }, [data, selectSlot, selectVenue, beginHold, releaseHold, confirmBooking, cancelBooking, toggleCheckIn, fillRosterSlot, toggleDiscount, ready]);

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useDemoBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useDemoBooking must be used inside DemoBookingProvider');
  return ctx;
}

export type { SavedBooking, HoldState };
