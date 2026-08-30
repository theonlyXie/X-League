import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '@/data/api';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';
import { today } from '@/data/venue';
import { calendar, Cell, BookingSource } from '@/data/owner';
import { useI18n } from '@/i18n';

/** One row of the grid: an hour, and one cell per pitch the venue actually has. */
export type DayRow = { hour: number; time: string; cells: Cell[] };

/**
 * O-02's grid, from the venue calendar.
 *
 * The venue is whichever one the signed-in person works at (RBAC-002) — the
 * server refuses `owner_day` for anything else, so there is nothing to choose
 * on the client.
 *
 * Two things this used to get wrong, both of them the kind that hide inventory
 * rather than merely look wrong:
 *
 *   * The rows were seeded with the design fixture and the error path never
 *     cleared them, so an unreachable calendar drew somebody else's evening —
 *     complete with a booking code and a name — as this venue's occupancy.
 *   * The grid was three columns wide and `toRows` destructured `[a, b, c]`,
 *     so a venue with four pitches had its fourth silently deleted from the
 *     screen whose whole job is showing every hour it owns.
 */
export function useOwnerDay(date: string = today()) {
  const { t, money, hourLabel } = useI18n();
  const { activeVenue, signedIn } = useSession();
  const venue = activeVenue;
  const showcase = !isLive || !signedIn || !venue;

  const [cells, setCells] = useState<api.OwnerCell[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLive || !signedIn || !venue) {
      setCells(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setCells(await api.ownerDay(venue.venueId, date));
    } catch (e) {
      // §4.7: an unreachable calendar says so rather than passing off stale
      // fixtures as this evening's real occupancy.
      // The Error branch used to surface the provider's own English, which is
      // the one thing an operator cannot act on in either language.
      if (__DEV__) console.warn('[owner]', e);
      setError(t.errVenueCalendar);
      setCells(null);
    } finally {
      setLoading(false);
    }
  }, [signedIn, venue, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = useMemo<Copy>(
    () => ({
      t,
      open: t.ownChannelOpen,
      booked: t.ownCellBooked,
      blocked: t.ownCellBlocked,
      arrived: t.ownCellArrived,
      holding: t.ownCellHolding,
      money,
      hourLabel,
    }),
    [t, money, hourLabel],
  );

  const { pitches, rows } = useMemo(() => {
    if (cells) return toGrid(cells, copy);
    if (showcase) return showcaseGrid(copy);
    return { pitches: [] as string[], rows: [] as DayRow[] };
  }, [cells, showcase, copy]);

  return {
    pitches,
    rows,
    live: cells !== null,
    showcase,
    loading,
    error,
    venueName: venue?.name ?? null,
    venueId: venue?.venueId ?? null,
    reload: load,
  };
}

/**
 * The flat cell list, as a grid with one column per pitch.
 *
 * Columns come from the cells themselves rather than from a constant, so a
 * venue with one pitch gets one column and a venue with six gets six.
 */
function toGrid(cells: api.OwnerCell[], copy: Copy): { pitches: string[]; rows: DayRow[] } {
  const pitches = [...new Set(cells.map((c) => c.pitchLabel))].sort((a, b) => a.localeCompare(b));

  const byHour = new Map<number, Map<string, api.OwnerCell>>();
  for (const cell of cells) {
    const row = byHour.get(cell.hour) ?? new Map<string, api.OwnerCell>();
    row.set(cell.pitchLabel, cell);
    byHour.set(cell.hour, row);
  }

  const rows = [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, row]) => ({
      hour,
      time: copy.hourLabel(hour),
      cells: pitches.map((label) => toCell(row.get(label), copy)),
    }));

  return { pitches, rows };
}

/**
 * The design's sample evening, for the demo build and the signed-out visitor.
 *
 * The cells are the fixture's, drawn in English on purpose. The hour is not:
 * a clock is the product's own chrome, and the fixture's `6 PM` rendered as
 * `PM ٦` beside a column of Arabic — so it comes from the same formatter the
 * live grid uses.
 */
function showcaseGrid(copy: Copy): { pitches: string[]; rows: DayRow[] } {
  return {
    pitches: ['A', 'B', 'C'],
    rows: calendar(copy.t, copy.money).map((row, i) => ({
      hour: 18 + i,
      time: copy.hourLabel(18 + i),
      cells: [row.a, row.b, row.c],
    })),
  };
}

/**
 * What the grid needs to say a cell in words.
 *
 * Threaded in rather than reached for, because this module builds the grid for
 * the demo build as well as the live one and neither should be able to render
 * an English word on an Arabic screen. It used to: an Arabic owner's calendar
 * said "Open", "Booked", "arrived" and "EGP 250" — the last with Western digits
 * and a Latin currency, in an app that renders every other number in
 * Arabic-Indic.
 */
type Copy = {
  /** The whole table, for the showcase fixture, which builds its own sentences. */
  t: (typeof import('@/i18n/strings'))['STRINGS']['en'];
  open: string;
  booked: string;
  blocked: string;
  arrived: string;
  holding: string;
  money: (egp: number) => string;
  hourLabel: (hour: number) => string;
};

function toCell(cell: api.OwnerCell | undefined, copy: Copy): Cell {
  if (!cell) return { source: 'open', title: copy.open, detail: '' };
  if (!cell.state) {
    return {
      source: 'open',
      title: copy.open,
      detail: copy.money(cell.priceEgp),
      startsAt: cell.startsAt,
      pitchId: cell.pitchId,
      pitchLabel: cell.pitchLabel,
      priceEgp: cell.priceEgp,
    };
  }

  // The grid's job is to make the channel unmistakable at a glance (OWN-006).
  const source: BookingSource =
    cell.source === 'walk_in' ? 'walk' : cell.source === 'block' ? 'block' : cell.source === 'app' ? 'app' : 'phone';

  const detail =
    cell.source === 'block'
      ? copy.blocked
      : cell.state === 'checked_in'
        ? copy.arrived
        : cell.state === 'held'
          ? copy.holding
          : (cell.code ?? cell.state);

  return {
    source,
    title: cell.captainName ?? copy.booked,
    detail,
    startsAt: cell.startsAt,
    pitchId: cell.pitchId,
    pitchLabel: cell.pitchLabel,
    priceEgp: cell.priceEgp,
    bookingId: cell.bookingId ?? undefined,
  };
}
