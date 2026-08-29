import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '@/data/api';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';
import { today } from '@/data/venue';
import { CALENDAR, Cell, BookingSource } from '@/data/owner';

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
  const { venues, signedIn } = useSession();
  const venue = venues[0] ?? null;
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
      setError(e instanceof Error ? e.message : 'Could not reach the venue calendar.');
      setCells(null);
    } finally {
      setLoading(false);
    }
  }, [signedIn, venue, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const { pitches, rows } = useMemo(() => {
    if (cells) return toGrid(cells);
    if (showcase) return showcaseGrid();
    return { pitches: [] as string[], rows: [] as DayRow[] };
  }, [cells, showcase]);

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
function toGrid(cells: api.OwnerCell[]): { pitches: string[]; rows: DayRow[] } {
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
      time: `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour} ${hour >= 12 ? 'PM' : 'AM'}`,
      cells: pitches.map((label) => toCell(row.get(label))),
    }));

  return { pitches, rows };
}

/** The design's sample evening, for the demo build and the signed-out visitor. */
function showcaseGrid(): { pitches: string[]; rows: DayRow[] } {
  return {
    pitches: ['A', 'B', 'C'],
    rows: CALENDAR.map((row, i) => ({
      hour: 18 + i,
      time: row.time,
      cells: [row.a, row.b, row.c],
    })),
  };
}

function toCell(cell: api.OwnerCell | undefined): Cell {
  if (!cell) return { source: 'open', title: 'Open', detail: '' };
  if (!cell.state) {
    return {
      source: 'open',
      title: 'Open',
      detail: `EGP ${cell.priceEgp}`,
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
      ? 'blocked'
      : cell.state === 'checked_in'
        ? 'arrived'
        : cell.state === 'held'
          ? 'holding'
          : (cell.code ?? cell.state);

  return {
    source,
    title: cell.captainName ?? 'Booked',
    detail,
    startsAt: cell.startsAt,
    pitchId: cell.pitchId,
    pitchLabel: cell.pitchLabel,
    priceEgp: cell.priceEgp,
    bookingId: cell.bookingId ?? undefined,
  };
}
