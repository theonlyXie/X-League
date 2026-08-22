import { useCallback, useEffect, useState } from 'react';
import * as api from '@/data/api';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';
import { today } from '@/data/venue';
import { CALENDAR, CalendarRow, Cell, BookingSource } from '@/data/owner';

/**
 * O-02's grid, from the venue calendar.
 *
 * The venue is whichever one the signed-in person actually works at
 * (RBAC-002) — the server refuses `owner_day` for anything else, so there is
 * nothing to choose on the client. A person with no staff role sees the
 * fixtures, because they have no venue to show.
 */
export function useOwnerDay() {
  const { venues, signedIn } = useSession();
  const venue = venues[0] ?? null;

  const [rows, setRows] = useState<CalendarRow[]>(CALENDAR);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLive || !signedIn || !venue) {
      setLive(false);
      setRows(CALENDAR);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const cells = await api.ownerDay(venue.venueId, today());
      setRows(toRows(cells));
      setLive(true);
    } catch (e) {
      // §4.7: an unreachable calendar says so rather than passing off stale
      // fixtures as this evening's real occupancy.
      setError(e instanceof Error ? e.message : 'Could not reach the venue calendar.');
      setLive(false);
    } finally {
      setLoading(false);
    }
  }, [signedIn, venue]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, live, loading, error, venueName: venue?.name ?? null, reload: load };
}

/** Turn the flat cell list into the three-pitch grid the screen draws. */
function toRows(cells: api.OwnerCell[]): CalendarRow[] {
  const byHour = new Map<number, api.OwnerCell[]>();
  for (const cell of cells) {
    const list = byHour.get(cell.hour) ?? [];
    list.push(cell);
    byHour.set(cell.hour, list);
  }

  return [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, list]) => {
      const pitches = [...list].sort((a, b) => a.pitchLabel.localeCompare(b.pitchLabel));
      const [a, b, c] = pitches;
      return {
        time: `${hour > 12 ? hour - 12 : hour} ${hour >= 12 ? 'PM' : 'AM'}`,
        a: toCell(a),
        b: toCell(b),
        c: toCell(c),
      };
    });
}

function toCell(cell: api.OwnerCell | undefined): Cell {
  if (!cell) return { source: 'open', title: 'Open', detail: '' };
  if (!cell.state) {
    return { source: 'open', title: 'Open', detail: `EGP ${cell.priceEgp}` };
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
  };
}
