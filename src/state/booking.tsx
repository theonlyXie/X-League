import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_SLOT, HOLD_SECONDS, SLOTS_TAKEN, SlotTime } from '@/data/player';

/**
 * The booking spine's shared state.
 *
 * §5.4 is the rule this models: one hold owns a pitch-time interval, the hold
 * carries a visible countdown, and confirmation converts that same hold into a
 * booking. The countdown only runs while the player is actually in checkout —
 * leaving checkout releases the hold, exactly as the design behaves.
 */

export type HoldState = 'idle' | 'holding' | 'expired' | 'confirmed';

type BookingContextValue = {
  /** The hour the player has selected on the pitch page. */
  slot: SlotTime;
  selectSlot: (slot: SlotTime) => void;
  /** `9:00 PM` — the slot as the interface labels it. */
  slotLabel: string;
  /** `10:00 PM` — one hour later. */
  slotEndLabel: string;
  /** Hours already sold through any channel. */
  taken: SlotTime[];

  hold: HoldState;
  /** Seconds left on the hold. */
  holdSeconds: number;
  /** `4:52` */
  holdText: string;
  beginHold: () => void;
  releaseHold: () => void;
  confirmBooking: () => void;

  /** Owner mode: whether the 9 PM arrival has been checked in and cash taken. */
  checkedIn: boolean;
  toggleCheckIn: () => void;
};

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<SlotTime>(DEFAULT_SLOT);
  const [hold, setHold] = useState<HoldState>('idle');
  const [holdSeconds, setHoldSeconds] = useState(HOLD_SECONDS);
  const [checkedIn, setCheckedIn] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    if (hold !== 'holding') {
      stopTimer();
      return;
    }
    timer.current = setInterval(() => {
      setHoldSeconds((s) => {
        if (s <= 1) {
          setHold('expired');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return stopTimer;
  }, [hold, stopTimer]);

  const beginHold = useCallback(() => {
    setHoldSeconds(HOLD_SECONDS);
    setHold('holding');
  }, []);

  /** Leaving checkout without confirming returns the slot to inventory. */
  const releaseHold = useCallback(() => {
    setHold((h) => (h === 'confirmed' ? h : 'idle'));
  }, []);

  const confirmBooking = useCallback(() => setHold('confirmed'), []);

  const toggleCheckIn = useCallback(() => setCheckedIn((c) => !c), []);

  const selectSlot = useCallback((next: SlotTime) => {
    if (SLOTS_TAKEN.includes(next)) return;
    setSlot(next);
  }, []);

  const value = useMemo<BookingContextValue>(() => {
    const endHour = parseInt(slot, 10) + 1;
    const minutes = Math.floor(holdSeconds / 60);
    const seconds = String(holdSeconds % 60).padStart(2, '0');
    return {
      slot,
      selectSlot,
      slotLabel: `${slot} PM`,
      slotEndLabel: `${endHour}:00 PM`,
      taken: SLOTS_TAKEN,
      hold,
      holdSeconds,
      holdText: `${minutes}:${seconds}`,
      beginHold,
      releaseHold,
      confirmBooking,
      checkedIn,
      toggleCheckIn,
    };
  }, [slot, selectSlot, hold, holdSeconds, beginHold, releaseHold, confirmBooking, checkedIn, toggleCheckIn]);

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking must be used inside a BookingProvider');
  return ctx;
}
