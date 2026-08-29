import { supabase } from '@/lib/supabase';

/**
 * Typed wrappers over the booking-spine functions.
 *
 * Every one of these is a single round trip to a Postgres function, so the
 * check and the write happen in one transaction. Nothing here retries a failed
 * hold: losing the race is a real outcome the interface has to show (BKG-011),
 * not a transient error to paper over.
 */

export type BookingSource = 'app' | 'phone' | 'whatsapp' | 'walk_in' | 'block';

export type BookingState =
  | 'held'
  | 'pending_payment'
  | 'confirmed'
  | 'checked_in'
  | 'completed'
  | 'expired'
  | 'cancelled'
  | 'no_show';

export type Slot = {
  /** ISO instant. Hand this back verbatim when holding — never rebuild it. */
  startsAt: string;
  endsAt: string;
  /** Hour of day in the venue's own timezone, which is what the UI labels. */
  hour: number;
  priceEgp: number;
  depositEgp: number;
  available: boolean;
  /** Which channel took it, when it is gone. */
  takenBy: BookingSource | null;
};

type SlotRow = {
  starts_at: string;
  ends_at: string;
  hour: number;
  price_egp: number;
  deposit_egp: number;
  available: boolean;
  taken_by: BookingSource | null;
};

const toSlot = (r: SlotRow): Slot => ({
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  hour: r.hour,
  priceEgp: r.price_egp,
  depositEgp: r.deposit_egp,
  available: r.available,
  takenBy: r.taken_by,
});

/** VEN-001 / VEN-002: only what is saleable right now, and when that was true. */
export async function searchAvailability(pitchId: string, date: string): Promise<Slot[]> {
  const { data, error } = await supabase().rpc('search_availability', {
    p_pitch_id: pitchId,
    p_date: date,
  });
  if (error) throw error;
  return (data as SlotRow[]).map(toSlot);
}

export type HoldResult =
  | { ok: true; bookingId: string; expiresAt: string; priceEgp: number; depositEgp: number }
  | { ok: false; reason: string; alternatives: Slot[] };

/**
 * BKG-002/003. When this returns `ok: false` the slot genuinely went to someone
 * else between the search and the tap — the alternatives come back with it so
 * the player has somewhere to go rather than a dead end.
 */
export async function holdSlot(
  pitchId: string,
  startsAt: string,
  opts: { minutes?: number; captainName?: string; holdSeconds?: number } = {},
): Promise<HoldResult> {
  const { data, error } = await supabase().rpc('hold_slot', {
    p_pitch_id: pitchId,
    p_starts_at: startsAt,
    p_minutes: opts.minutes ?? 60,
    p_captain_name: opts.captainName ?? null,
    p_hold_seconds: opts.holdSeconds ?? 292,
  });
  if (error) throw error;

  const row = data as {
    ok: boolean;
    booking_id: string | null;
    expires_at: string | null;
    price_egp: number | null;
    deposit_egp: number | null;
    reason: string | null;
  };

  if (!row.ok) {
    return {
      ok: false,
      reason: row.reason ?? 'That slot is no longer available.',
      alternatives: await nearestAlternatives(pitchId, startsAt),
    };
  }

  return {
    ok: true,
    bookingId: row.booking_id!,
    expiresAt: row.expires_at!,
    priceEgp: row.price_egp ?? 0,
    depositEgp: row.deposit_egp ?? 0,
  };
}

export async function nearestAlternatives(pitchId: string, startsAt: string): Promise<Slot[]> {
  const { data, error } = await supabase().rpc('nearest_alternatives', {
    p_pitch_id: pitchId,
    p_starts_at: startsAt,
  });
  if (error) throw error;
  return (data as { starts_at: string; hour: number; price_egp: number }[]).map((r) => ({
    startsAt: r.starts_at,
    endsAt: r.starts_at,
    hour: r.hour,
    priceEgp: r.price_egp,
    depositEgp: 0,
    available: true,
    takenBy: null,
  }));
}

/** BKG-005: safe to call twice — a retry returns the original booking code. */
export async function confirmBooking(
  bookingId: string,
): Promise<{ ok: true; code: string } | { ok: false; reason: string }> {
  const { data, error } = await supabase().rpc('confirm_booking', { p_booking_id: bookingId });
  if (error) throw error;
  const row = (data as { ok: boolean; code: string | null; reason: string | null }[])[0];
  return row.ok
    ? { ok: true, code: row.code! }
    : { ok: false, reason: row.reason ?? 'That hold is no longer active.' };
}

/** Leaving checkout without confirming. Safe to call on an already-dead hold. */
export async function releaseHold(bookingId: string): Promise<boolean> {
  const { data, error } = await supabase().rpc('release_hold', { p_booking_id: bookingId });
  if (error) throw error;
  return Boolean(data);
}

/**
 * BKG-009: the venue marks arrival and takes the cash.
 *
 * There is no `actor` argument any more. The server derives who acted from the
 * session and checks it against the venue (RBAC-002) — an actor string supplied
 * by the caller was forgeable and made the audit trail worthless.
 */
export async function checkInBooking(bookingId: string): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('check_in_booking', {
    p_booking_id: bookingId,
  });
  if (error) throw error;
  const row = (data as { ok: boolean; reason: string | null }[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

/** OWN-003 / AC-05: a phone or walk-in booking, into the same timeline. */
export async function recordOfflineBooking(
  pitchId: string,
  startsAt: string,
  source: BookingSource,
  captainName: string,
  minutes = 60,
): Promise<{ ok: boolean; bookingId?: string; reason?: string }> {
  const { data, error } = await supabase().rpc('record_offline_booking', {
    p_pitch_id: pitchId,
    p_starts_at: startsAt,
    p_minutes: minutes,
    p_source: source,
    p_captain_name: captainName,
  });
  if (error) throw error;
  const row = (data as { ok: boolean; booking_id: string | null; reason: string | null }[])[0];
  return row.ok
    ? { ok: true, bookingId: row.booking_id! }
    : { ok: false, reason: row.reason ?? undefined };
}

export type OwnerCell = {
  pitchId: string;
  pitchLabel: string;
  hour: number;
  startsAt: string;
  /** The booking occupying this hour, when there is one. */
  bookingId: string | null;
  state: BookingState | null;
  source: BookingSource;
  code: string | null;
  captainName: string | null;
  priceEgp: number;
};

/** O-02: the owner's whole day, every channel in one grid. */
export async function ownerDay(venueId: string, date: string): Promise<OwnerCell[]> {
  const { data, error } = await supabase().rpc('owner_day', {
    p_venue_id: venueId,
    p_date: date,
  });
  if (error) throw error;
  return (
    data as {
      pitch_id: string;
      pitch_label: string;
      hour: number;
      starts_at: string;
      booking_id: string | null;
      state: BookingState | null;
      source: BookingSource;
      code: string | null;
      captain_name: string | null;
      price_egp: number;
    }[]
  ).map((r) => ({
    pitchId: r.pitch_id,
    pitchLabel: r.pitch_label,
    hour: r.hour,
    startsAt: r.starts_at,
    bookingId: r.booking_id,
    state: r.state,
    source: r.source,
    code: r.code,
    captainName: r.captain_name,
    priceEgp: r.price_egp,
  }));
}

// ---------------------------------------------------------------------------
// The player card (§5.1)
// ---------------------------------------------------------------------------

export type Card = {
  displayName: string;
  ovr: number;
  position: string;
  /** Attribute key -> 1..99, in the order the position's rule weights them. */
  attributes: { key: string; value: number }[];
  confidence: 'provisional' | 'emerging' | 'established';
  /** Completed, verified matches standing behind the card. */
  evidenceCount: number;
  /** Share still supplied by the player's own assessment, 0..1. */
  selfWeight: number;
  ruleVersion: string;
  snapshotAt: string;
};

type CardRow = {
  display_name: string;
  ovr: number;
  position_code: string;
  attributes: Record<string, number>;
  confidence: Card['confidence'];
  evidence_count: number;
  self_weight: number | string;
  rule_version: string;
  snapshot_at: string;
};

/** Keep the six attributes in the order the design's card lays them out. */
const ATTRIBUTE_ORDER: Record<string, string[]> = {
  GK: ['DIV', 'HAN', 'KIC', 'REF', 'SPD', 'POS'],
  DEFAULT: ['SPD', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'],
};

const toCard = (r: CardRow): Card => {
  const order = ATTRIBUTE_ORDER[r.position_code] ?? ATTRIBUTE_ORDER.DEFAULT;
  const keys = [...new Set([...order.filter((k) => k in r.attributes), ...Object.keys(r.attributes)])];
  return {
    displayName: r.display_name,
    ovr: r.ovr,
    position: r.position_code,
    attributes: keys.map((key) => ({ key, value: r.attributes[key] })),
    confidence: r.confidence,
    evidenceCount: r.evidence_count,
    selfWeight: Number(r.self_weight),
    ruleVersion: r.rule_version,
    snapshotAt: r.snapshot_at,
  };
};

/** PRO-003: the card, with its confidence and evidence count exposed. */
export async function myCard(): Promise<Card | null> {
  const { data, error } = await supabase().rpc('my_card');
  if (error) throw error;
  const rows = data as CardRow[];
  return rows.length ? toCard(rows[0]) : null;
}

/** PRO-002: the anchored assessment, which yields a provisional card. */
export async function submitSelfAssessment(
  position: string,
  answers: Record<string, number>,
): Promise<Card | null> {
  const { data, error } = await supabase().rpc('submit_self_assessment', {
    p_position: position,
    p_answers: answers,
  });
  if (error) throw error;
  const rows = data as Omit<CardRow, 'display_name' | 'snapshot_at'>[];
  if (!rows.length) return null;
  return toCard({ ...rows[0], display_name: '', snapshot_at: new Date().toISOString() } as CardRow);
}

// ---------------------------------------------------------------------------
// Owner Today (O-01)
// ---------------------------------------------------------------------------

export type Arrival = {
  bookingId: string;
  pitchLabel: string;
  startsAt: string;
  hour: number;
  state: BookingState;
  source: BookingSource;
  code: string | null;
  captainName: string | null;
  /**
   * What is still owed on this booking, from `payment_reference`. It used to
   * be `booking.deposit_egp`, which the no-deposit change set to zero on every
   * row — so the gate was told to collect nothing from anybody.
   */
  dueEgp: number;
  /** Whether the venue has already taken the cash. */
  paid: boolean;
  checkedIn: boolean;
};

export async function ownerArrivals(venueId: string, date: string): Promise<Arrival[]> {
  const { data, error } = await supabase().rpc('owner_arrivals', {
    p_venue_id: venueId,
    p_date: date,
  });
  if (error) throw error;
  return (data as Record<string, never>[]).map((r: any) => ({
    bookingId: r.booking_id,
    pitchLabel: r.pitch_label,
    startsAt: r.starts_at,
    hour: r.hour,
    state: r.state,
    source: r.source,
    code: r.code,
    captainName: r.captain_name,
    dueEgp: r.due_egp,
    paid: r.paid,
    checkedIn: r.checked_in,
  }));
}

export type OwnerSummary = {
  occupancyPct: number;
  openSlots: number;
  cashDueEgp: number;
  cashGates: number;
  conflicts: number;
};

export async function ownerSummary(venueId: string, date: string): Promise<OwnerSummary> {
  const { data, error } = await supabase().rpc('owner_summary', {
    p_venue_id: venueId,
    p_date: date,
  });
  if (error) throw error;
  const r = (data as any[])[0];
  return {
    occupancyPct: r.occupancy_pct,
    openSlots: r.open_slots,
    cashDueEgp: r.cash_due_egp,
    cashGates: r.cash_gates,
    conflicts: r.conflicts,
  };
}
