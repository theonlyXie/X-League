import { supabase } from '@/lib/supabase';

/**
 * Ready to play, and calling for the people who are.
 *
 * Two halves of one problem: a captain who is three short, and a player with
 * nothing on. Everything here is a thin call onto a function that decides
 * things — nothing in this file filters a list or works out who matches, and
 * that is deliberate. The matching rule lives once, in `calls_for` on the
 * server, so a screen cannot disagree with what the server will allow.
 */

export type Availability = {
  available: boolean;
  /** When it lapses. Null when the player is not available. */
  until: string | null;
  /** How many open calls this player matches right now. */
  openCalls: number;
};

export async function myAvailability(): Promise<Availability> {
  const { data, error } = await supabase().rpc('my_availability');
  if (error) throw error;
  const r = (data as any[])[0];
  return {
    available: Boolean(r?.available),
    until: r?.available_until ?? null,
    openCalls: r?.open_calls ?? 0,
  };
}

export async function setAvailability(on: boolean): Promise<string | null> {
  const { data, error } = await supabase().rpc('set_availability', { p_on: on });
  if (error) throw error;
  return (data as any[])[0]?.available_until ?? null;
}

export type PositionCode = 'GK' | 'DEF' | 'MID' | 'FWD';

export const POSITIONS: PositionCode[] = ['GK', 'DEF', 'MID', 'FWD'];

export type Call = {
  callId: string;
  bookingId: string;
  venueName: string;
  area: string | null;
  kickOff: string;
  priceEgp: number | null;
  positions: PositionCode[];
  minOvr: number | null;
  wanted: number;
  note: string | null;
  captain: string | null;
};

export async function openCalls(limit = 20): Promise<Call[]> {
  const { data, error } = await supabase().rpc('open_calls', { p_limit: limit });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    callId: r.call_id,
    bookingId: r.booking_id,
    venueName: r.venue_name,
    area: r.area,
    kickOff: r.kick_off,
    priceEgp: r.price_egp,
    positions: (r.positions ?? []) as PositionCode[],
    minOvr: r.min_ovr,
    wanted: r.wanted,
    note: r.note,
    captain: r.captain,
  }));
}

type Outcome = { ok: boolean; reason?: string };

const outcome = (rows: any[]): Outcome => {
  const r = rows[0];
  return r?.ok ? { ok: true } : { ok: false, reason: r?.reason ?? undefined };
};

export async function answerCall(callId: string): Promise<Outcome> {
  const { data, error } = await supabase().rpc('answer_call', { p_call_id: callId });
  if (error) throw error;
  return outcome(data as any[]);
}

export async function withdrawAnswer(callId: string): Promise<Outcome> {
  const { data, error } = await supabase().rpc('withdraw_answer', { p_call_id: callId });
  if (error) throw error;
  return outcome(data as any[]);
}

/** The call standing on my own booking, if there is one. */
export type MyCall = {
  callId: string;
  positions: PositionCode[];
  minOvr: number | null;
  wanted: number;
  note: string | null;
  offers: number;
};

export async function myCall(bookingId: string): Promise<MyCall | null> {
  const { data, error } = await supabase().rpc('my_call', { p_booking_id: bookingId });
  if (error) throw error;
  const r = (data as any[])[0];
  if (!r) return null;
  return {
    callId: r.call_id,
    positions: (r.positions ?? []) as PositionCode[],
    minOvr: r.min_ovr,
    wanted: r.wanted,
    note: r.note,
    offers: r.offers ?? 0,
  };
}

export async function openCall(
  bookingId: string,
  opts: { positions?: PositionCode[]; minOvr?: number | null; wanted?: number; note?: string } = {},
): Promise<{ ok: boolean; callId?: string; reason?: string }> {
  const { data, error } = await supabase().rpc('open_call', {
    p_booking_id: bookingId,
    p_positions: opts.positions ?? [],
    p_min_ovr: opts.minOvr ?? null,
    p_wanted: opts.wanted ?? 1,
    p_note: opts.note ?? null,
  });
  if (error) throw error;
  const r = (data as any[])[0];
  return r?.ok ? { ok: true, callId: r.call_id } : { ok: false, reason: r?.reason ?? undefined };
}

export async function closeCall(bookingId: string): Promise<Outcome> {
  const { data, error } = await supabase().rpc('close_call', { p_booking_id: bookingId });
  if (error) throw error;
  return outcome(data as any[]);
}

export type Offer = {
  responseId: string;
  playerId: string;
  displayName: string;
  photoUrl: string | null;
  position: PositionCode | null;
  ovr: number | null;
  area: string | null;
  offeredAt: string;
};

export async function callOffers(bookingId: string): Promise<Offer[]> {
  const { data, error } = await supabase().rpc('call_offers', { p_booking_id: bookingId });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    responseId: r.response_id,
    playerId: r.player_id,
    displayName: r.display_name,
    photoUrl: r.photo_url ?? null,
    position: (r.position_code ?? null) as PositionCode | null,
    ovr: r.ovr,
    area: r.area,
    offeredAt: r.offered_at,
  }));
}

export async function acceptOffer(
  responseId: string,
  slotKind: 'starter' | 'sub' = 'starter',
): Promise<Outcome> {
  const { data, error } = await supabase().rpc('accept_offer', {
    p_response_id: responseId,
    p_slot_kind: slotKind,
  });
  if (error) throw error;
  return outcome(data as any[]);
}

export async function declineOffer(responseId: string): Promise<Outcome> {
  const { data, error } = await supabase().rpc('decline_offer', { p_response_id: responseId });
  if (error) throw error;
  return outcome(data as any[]);
}
