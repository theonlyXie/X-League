import { supabase } from '@/lib/supabase';
import type { BookingState } from './api';

/**
 * Venue discovery, reviews, and "what am I doing next".
 *
 * Everything here used to be a fixture array. The shape of these types is
 * deliberately the shape of the RPC's return, converted once at the boundary,
 * so a screen never sees a snake_case key and never has to know that
 * `open_slots` and `openSlots` are the same thing.
 */

export type VenueSummary = {
  venueId: string;
  name: string;
  area: string | null;
  verification: string;
  lat: number | null;
  lon: number | null;
  /** Null when the player has not shared a location — never a fabricated 0. */
  distanceKm: number | null;
  ratingAvg: number | null;
  ratingCount: number;
  /** Slots actually saleable on the searched date, from the live timeline. */
  openSlots: number;
  minPriceEgp: number;
  /** The next free hour, or null when the venue is full that day. */
  nextSlot: string | null;
  coverUrl: string | null;
  amenities: string[];
};

export type SearchVenuesOptions = {
  date?: string;
  lat?: number | null;
  lon?: number | null;
  fromHour?: number;
  toHour?: number;
  format?: string | null;
  limit?: number;
};

/**
 * VEN-001 / VEN-003: P-03's list, across every venue rather than one pitch.
 *
 * `p_date` is only sent when there is one. PostgREST applies a function's SQL
 * default for a parameter the body omits, but an explicit `null` *overrides*
 * it — which silently made every venue report zero open slots, because
 * availability for the null date is no availability at all.
 */
export async function searchVenues(opts: SearchVenuesOptions = {}): Promise<VenueSummary[]> {
  const { data, error } = await supabase().rpc('search_venues', {
    ...(opts.date ? { p_date: opts.date } : {}),
    p_tz: 'Africa/Cairo',
    p_lat: opts.lat ?? null,
    p_lon: opts.lon ?? null,
    p_from_hour: opts.fromHour ?? 0,
    p_to_hour: opts.toHour ?? 24,
    p_format: opts.format ?? null,
    p_limit: opts.limit ?? 25,
  });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    venueId: r.venue_id,
    name: r.name,
    area: r.area,
    verification: r.verification,
    lat: r.lat === null ? null : Number(r.lat),
    lon: r.lon === null ? null : Number(r.lon),
    distanceKm: r.distance_km === null ? null : Number(r.distance_km),
    ratingAvg: r.rating_avg === null ? null : Number(r.rating_avg),
    ratingCount: r.rating_count,
    openSlots: r.open_slots,
    minPriceEgp: r.min_price_egp,
    nextSlot: r.next_slot,
    coverUrl: r.cover_url,
    amenities: r.amenities ?? [],
  }));
}

export type VenuePitch = {
  id: string;
  label: string;
  format: string;
  surface: string | null;
  indoor: boolean;
};

export type VenueDetail = {
  venueId: string;
  name: string;
  area: string | null;
  verification: string;
  lat: number | null;
  lon: number | null;
  phone: string | null;
  amenities: string[];
  houseRules: string | null;
  entryNote: string | null;
  mapUrl: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  photos: { url: string; caption: string | null }[];
  pitches: VenuePitch[];
};

/** VEN-005: everything P-04's header shows, in one round trip. */
export async function venueDetail(venueId: string): Promise<VenueDetail | null> {
  const { data, error } = await supabase().rpc('venue_detail', { p_venue_id: venueId });
  if (error) throw error;
  const rows = data as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return {
    venueId: r.venue_id,
    name: r.name,
    area: r.area,
    verification: r.verification,
    lat: r.lat === null ? null : Number(r.lat),
    lon: r.lon === null ? null : Number(r.lon),
    phone: r.phone,
    amenities: r.amenities ?? [],
    houseRules: r.house_rules,
    entryNote: r.entry_note,
    mapUrl: r.map_url,
    ratingAvg: r.rating_avg === null ? null : Number(r.rating_avg),
    ratingCount: r.rating_count,
    photos: r.photos ?? [],
    pitches: r.pitches ?? [],
  };
}

export type Review = {
  rating: number;
  body: string | null;
  author: string;
  createdAt: string;
};

export async function venueReviews(venueId: string, limit = 20): Promise<Review[]> {
  const { data, error } = await supabase().rpc('venue_reviews', {
    p_venue_id: venueId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    rating: r.rating,
    body: r.body,
    author: r.author,
    createdAt: r.created_at,
  }));
}

/** VEN-008: only after you have played it, and only once. */
export async function submitReview(
  bookingId: string,
  rating: number,
  body?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('submit_review', {
    p_booking_id: bookingId,
    p_rating: rating,
    p_body: body ?? null,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

export type NextBooking = {
  bookingId: string;
  code: string | null;
  state: BookingState;
  startsAt: string;
  endsAt: string;
  venueId: string;
  venueName: string;
  area: string | null;
  pitchLabel: string;
  entryNote: string | null;
  mapUrl: string | null;
  lat: number | null;
  lon: number | null;
  priceEgp: number;
  depositEgp: number;
};

/** P-02: the thing the player is actually doing next, or nothing. */
export async function myNextBooking(): Promise<NextBooking | null> {
  const { data, error } = await supabase().rpc('my_next_booking', { p_tz: 'Africa/Cairo' });
  if (error) throw error;
  const rows = data as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return {
    bookingId: r.booking_id,
    code: r.code,
    state: r.state,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    venueId: r.venue_id,
    venueName: r.venue_name,
    area: r.area,
    pitchLabel: r.pitch_label,
    entryNote: r.entry_note,
    mapUrl: r.map_url,
    lat: r.lat === null ? null : Number(r.lat),
    lon: r.lon === null ? null : Number(r.lon),
    priceEgp: r.price_egp,
    depositEgp: r.deposit_egp,
  };
}

export type PastBooking = {
  bookingId: string;
  code: string | null;
  state: BookingState;
  startsAt: string;
  venueName: string;
  area: string | null;
  pitchLabel: string;
  priceEgp: number;
  reviewed: boolean;
};

export async function myBookings(limit = 20): Promise<PastBooking[]> {
  const { data, error } = await supabase().rpc('my_bookings', { p_limit: limit });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    bookingId: r.booking_id,
    code: r.code,
    state: r.state,
    startsAt: r.starts_at,
    venueName: r.venue_name,
    area: r.area,
    pitchLabel: r.pitch_label,
    priceEgp: r.price_egp,
    reviewed: r.reviewed,
  }));
}

export type BookingTerms = {
  cutoffAt: string;
  freeNow: boolean;
  depositEgp: number;
  balanceEgp: number;
  depositState: 'due' | 'collected' | 'refunded' | 'waived' | 'forfeited';
};

/**
 * What checkout should say rather than assume. The cutoff is resolved in the
 * venue's zone by the server, because "3 PM today" means 3 PM where the pitch
 * is, not where the phone is.
 */
export async function bookingTerms(bookingId: string): Promise<BookingTerms | null> {
  const { data, error } = await supabase().rpc('booking_terms', { p_booking_id: bookingId });
  if (error) throw error;
  const rows = data as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return {
    cutoffAt: r.cutoff_at,
    freeNow: r.free_now,
    depositEgp: r.deposit_egp,
    balanceEgp: r.balance_egp,
    depositState: r.deposit_state,
  };
}

/** BKG-008. `free` says whether the cutoff had passed, which the UI must show. */
export async function cancelBooking(
  bookingId: string,
): Promise<{ ok: boolean; free: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('cancel_booking', { p_booking_id: bookingId });
  if (error) throw error;
  const row = (data as any[])[0];
  return { ok: row.ok, free: row.free, reason: row.reason ?? undefined };
}

export type Standing = {
  noShows: number;
  lateCancels: number;
  limitReached: boolean;
  cashAllowed: boolean;
  seasonDays: number;
};

/** BKG-010: a restriction the player can see is one they can fix. */
export async function myStanding(): Promise<Standing | null> {
  const { data, error } = await supabase().rpc('my_standing');
  if (error) throw error;
  const rows = data as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return {
    noShows: r.no_shows,
    lateCancels: r.late_cancels,
    limitReached: r.limit_reached,
    cashAllowed: r.cash_allowed,
    seasonDays: r.season_days,
  };
}
