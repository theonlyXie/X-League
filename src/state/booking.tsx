import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BOOKING, DEFAULT_SLOT, HOLD_SECONDS, ROSTER, RosterEntry, SLOTS_TAKEN, SlotTime, VENUES } from '@/data/player';
import { loadJson, saveJson } from '@/lib/storage';

const STORAGE_KEY = 'xleague.booking.v1';

/**
 * The booking spine's shared state — persisted locally so holds, confirmations
 * and check-ins survive an app restart.
 */

export type HoldState = 'idle' | 'holding' | 'expired' | 'confirmed' | 'cancelled';

export type SavedBooking = {
  code: string;
  venue: string;
  pitch: string;
  area: string;
  slot: SlotTime;
  deposit: number;
  status: 'confirmed' | 'cancelled';
  confirmedAt: number;
};

type Persisted = {
  slot: SlotTime;
  venueName: string;
  hold: HoldState;
  holdSeconds: number;
  checkedIn: boolean;
  roster: RosterEntry[];
  discountActive: boolean;
  activeBooking: SavedBooking | null;
  history: SavedBooking[];
};

type BookingContextValue = {
  slot: SlotTime;
  selectSlot: (slot: SlotTime) => void;
  slotLabel: string;
  slotEndLabel: string;
  taken: SlotTime[];
  venueName: string;
  selectVenue: (name: string) => void;

  hold: HoldState;
  holdSeconds: number;
  holdText: string;
  beginHold: () => void;
  releaseHold: () => void;
  confirmBooking: () => void;
  cancelBooking: () => void;

  activeBooking: SavedBooking | null;
  bookingHistory: SavedBooking[];

  checkedIn: boolean;
  toggleCheckIn: () => void;

  roster: RosterEntry[];
  fillRosterSlot: (name: string) => void;

  discountActive: boolean;
  toggleDiscount: () => void;
  ready: boolean;
};

const DEFAULT: Persisted = {
  slot: DEFAULT_SLOT,
  venueName: VENUES[0].name,
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

export function BookingProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Persisted>(DEFAULT);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadJson<Persisted>(STORAGE_KEY, DEFAULT).then((loaded) => {
      // Demo seed: first open shows tonight's confirmed booking on Home.
      const next =
        loaded.activeBooking || loaded.history.length
          ? loaded
          : { ...loaded, activeBooking: seedActiveBooking(), hold: 'confirmed' as HoldState };
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
    if (data.hold === 'confirmed' || data.hold === 'cancelled') return;
    persist({ ...data, hold: 'idle', holdSeconds: HOLD_SECONDS });
  }, [data, persist]);

  const confirmBooking = useCallback(() => {
    const booking: SavedBooking = {
      code: BOOKING.code,
      venue: data.venueName,
      pitch: BOOKING.pitch,
      area: BOOKING.area,
      slot: data.slot,
      deposit: BOOKING.deposit,
      status: 'confirmed',
      confirmedAt: Date.now(),
    };
    persist({
      ...data,
      hold: 'confirmed',
      activeBooking: booking,
      history: [booking, ...data.history.filter((b) => b.code !== booking.code)],
    });
  }, [data, persist]);

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

  const selectVenue = useCallback(
    (venueName: string) => persist({ ...data, venueName }),
    [data, persist],
  );

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
    };
  }, [data, selectSlot, selectVenue, beginHold, releaseHold, confirmBooking, cancelBooking, toggleCheckIn, fillRosterSlot, toggleDiscount, ready]);

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking must be used inside BookingProvider');
  return ctx;
}

export function useActiveBooking() {
  const { activeBooking, slotLabel, slotEndLabel } = useBooking();
  if (!activeBooking) return null;
  return { ...activeBooking, slotLabel, slotEndLabel };
}
