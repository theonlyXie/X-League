import { BOOKING } from '@/data/player';
import { Arrival, CALENDAR, CalendarRow, Cell } from '@/data/owner';
import type { SavedBooking } from '@/state/booking';

export function arrivalFromBooking(booking: SavedBooking, playerName: string): Arrival {
  const [hour] = booking.slot.split(':');
  const collected = booking.status === 'checked_in';
  return {
    time: hour,
    meridiem: 'PM',
    title: `${playerName} · ${booking.pitch}`,
    source: 'app',
    detail: '5-a-side · 5 + 2 subs · 60 min',
    money: {
      text: collected
        ? `EGP ${booking.deposit} cash collected`
        : `EGP ${booking.deposit} cash to collect at gate`,
      tone: 'due',
    },
    justBooked: { code: booking.code },
    bookingId: booking.bookingId,
    checkedIn: collected,
    depositEgp: booking.deposit,
  };
}

function slotToCalendarTime(slot: string) {
  const hour = parseInt(slot, 10);
  return `${hour} PM`;
}

function calendarCellFromBooking(booking: SavedBooking, playerName: string): Cell {
  const short = playerName.split(' ')[0] ?? playerName;
  return {
    source: 'app',
    title: `${short} E.`,
    detail: `${booking.code} · cash`,
  };
}

/** Overlay the live app booking onto the owner calendar grid. */
export function calendarWithLiveBooking(booking: SavedBooking | null, playerName: string): CalendarRow[] {
  if (!booking || booking.status === 'cancelled') return CALENDAR;
  const timeKey = slotToCalendarTime(booking.slot);
  const live = calendarCellFromBooking(booking, playerName);
  return CALENDAR.map((row) => {
    if (row.time !== timeKey) return row;
    return { ...row, a: live };
  });
}

export function arrivalsWithLiveBooking(
  booking: SavedBooking | null,
  playerName: string,
  fixtures: Arrival[],
): Arrival[] {
  if (!booking || booking.status === 'cancelled') return fixtures;
  const live = arrivalFromBooking(booking, playerName);
  const rest = fixtures.filter((a) => !a.justBooked || a.justBooked.code !== booking.code);
  return [live, ...rest];
}
