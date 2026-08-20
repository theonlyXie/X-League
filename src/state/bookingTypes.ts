import { RosterEntry, SlotTime } from '@/data/player';

export type HoldState = 'idle' | 'holding' | 'expired' | 'confirmed' | 'cancelled';

export type SavedBooking = {
  code: string;
  venue: string;
  pitch: string;
  area: string;
  slot: SlotTime;
  deposit: number;
  status: 'confirmed' | 'cancelled' | 'checked_in';
  confirmedAt: number;
  /** Server booking id — required for live check-in / cash collection. */
  bookingId?: string;
};

export type BookingContextValue = {
  slot: SlotTime;
  selectSlot: (slot: SlotTime) => void;
  slotLabel: string;
  slotEndLabel: string;
  taken: SlotTime[];
  venueName: string;
  venueHourly: number;
  selectVenue: (name: string, hourly?: number, pitchId?: string) => void;

  hold: HoldState;
  holdSeconds: number;
  holdText: string;
  beginHold: () => void | Promise<boolean | void>;
  releaseHold: () => void;
  confirmBooking: () => void | Promise<void>;

  activeBooking: SavedBooking | null;
  bookingHistory: SavedBooking[];
  cancelBooking: () => void;

  checkedIn: boolean;
  /**
   * Owner confirms cash deposit collected at the gate (BKG-009).
   * One-way — cash confirmation cannot be undone from the client.
   */
  confirmCashCollection: (bookingId?: string) => void | Promise<void>;
  /** @deprecated use confirmCashCollection */
  toggleCheckIn: () => void;

  roster: RosterEntry[];
  fillRosterSlot: (name: string) => void;

  discountActive: boolean;
  toggleDiscount: () => void;
  ready: boolean;

  /** Live mode only */
  live?: boolean;
  loading?: boolean;
  unreachable?: boolean;
  refresh?: () => Promise<void>;
  bookingId?: string | null;
  conflict?: { reason: string; alternatives: SlotTime[] } | null;
  clearConflict?: () => void;
};
