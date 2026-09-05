import { supabase } from '@/lib/supabase';

/**
 * The money for a pitch, and the two halves of agreeing it moved.
 *
 * Nothing here takes a payment. A transfer goes from a player's wallet to a
 * venue's, outside this app entirely; what the app holds is where to send it,
 * one person saying they sent it, and the other saying it arrived. Keeping
 * those two as separate acts by separate people is the whole design — a claim
 * that settled the booking by itself would be a venue holding an hour for money
 * nobody had checked for.
 */

export type ChannelKind = 'instapay' | 'bank' | 'wallet' | 'contact';

export type VenueChannel = {
  channelId: string;
  kind: ChannelKind;
  label: string;
  value: string;
  instructions: string | null;
  active: boolean;
  sort: number;
};

export async function venuePaymentChannels(venueId: string): Promise<VenueChannel[]> {
  const { data, error } = await supabase().rpc('venue_payment_channels', {
    p_venue_id: venueId,
  });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    channelId: r.channel_id,
    kind: r.kind,
    label: r.label,
    value: r.value,
    instructions: r.instructions,
    active: r.active,
    sort: r.sort,
  }));
}

export async function setVenuePaymentChannel(input: {
  channelId?: string | null;
  venueId: string;
  kind: ChannelKind;
  label: string;
  value: string;
  instructions?: string | null;
  active?: boolean;
  sort?: number;
}): Promise<{ ok: boolean; channelId?: string; reason?: string }> {
  const { data, error } = await supabase().rpc('set_venue_payment_channel', {
    p_id: input.channelId ?? null,
    p_venue_id: input.venueId,
    p_kind: input.kind,
    p_label: input.label,
    p_value: input.value,
    p_instructions: input.instructions ?? null,
    p_active: input.active ?? true,
    p_sort: input.sort ?? 0,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return { ok: !!row?.ok, channelId: row?.channel_id ?? undefined, reason: row?.reason ?? undefined };
}

export async function deleteVenuePaymentChannel(
  channelId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('delete_venue_payment_channel', { p_id: channelId });
  if (error) throw error;
  const row = (data as any[])[0];
  return { ok: !!row?.ok, reason: row?.reason ?? undefined };
}

/** The captain says they sent it. Opens the room and returns it. */
export async function claimBookingPayment(
  bookingId: string,
  kind: ChannelKind,
  note: string,
): Promise<{ ok: boolean; conversationId?: string; reason?: string }> {
  const { data, error } = await supabase().rpc('claim_booking_payment', {
    p_booking_id: bookingId,
    p_kind: kind,
    p_note: note,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return {
    ok: !!row?.ok,
    conversationId: row?.conversation_id ?? undefined,
    reason: row?.reason ?? undefined,
  };
}

/** The venue says it arrived. This is the half that settles the booking. */
export async function confirmBookingPayment(
  bookingId: string,
  reference?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('confirm_booking_payment', {
    p_booking_id: bookingId,
    p_reference: reference ?? null,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return { ok: !!row?.ok, reason: row?.reason ?? undefined };
}

export type PaymentClaim = {
  bookingId: string;
  code: string;
  captainName: string;
  captainPhone: string | null;
  startsAt: string;
  pitchLabel: string;
  priceEgp: number;
  claimedAt: string;
  note: string | null;
  kind: ChannelKind | null;
  settled: boolean;
};

export async function venuePaymentClaims(venueId: string): Promise<PaymentClaim[]> {
  const { data, error } = await supabase().rpc('venue_payment_claims', {
    p_venue_id: venueId,
    p_limit: 100,
  });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    bookingId: r.booking_id,
    code: r.code,
    captainName: r.captain_name,
    captainPhone: r.captain_phone,
    startsAt: r.starts_at,
    pitchLabel: r.pitch_label,
    priceEgp: r.price_egp,
    claimedAt: r.claimed_at,
    note: r.note,
    kind: r.kind,
    settled: r.settled,
  }));
}

/** The room this booking is settled in. Created the first time it is asked for. */
export async function venueConversation(
  bookingId: string,
): Promise<{ ok: boolean; conversationId?: string; reason?: string }> {
  const { data, error } = await supabase().rpc('venue_conversation', {
    p_booking_id: bookingId,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return {
    ok: !!row?.ok,
    conversationId: row?.conversation_id ?? undefined,
    reason: row?.reason ?? undefined,
  };
}
