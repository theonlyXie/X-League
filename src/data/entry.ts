import { supabase } from '@/lib/supabase';

/**
 * What it costs a club to enter a cup, and how the money is said to have moved.
 *
 * The quote is a question and the entry is a decision, and they are two calls
 * for that reason — a captain moving the points slider is not committing to
 * anything. What they are not is two sources of truth: the server recomputes
 * the discount when the entry is made, so the number on the screen and the
 * number on the entry come from the same place.
 *
 * Nothing here moves money. There is no card and no gateway: the captain
 * transfers to one of the channels the cup names, says what they sent, and
 * somebody at X League agrees.
 */

export type PaymentChannel = {
  kind: 'instapay' | 'bank' | 'wallet' | 'contact';
  label: string;
  value: string;
  instructions: string | null;
};

export async function paymentChannels(tournamentId: string): Promise<PaymentChannel[]> {
  const { data, error } = await supabase().rpc('tournament_payment_channels', {
    p_tournament_id: tournamentId,
  });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    kind: r.kind,
    label: r.label,
    value: r.value,
    instructions: r.instructions,
  }));
}

export type Quote = {
  feeEgp: number;
  promoOffEgp: number;
  pointsSpent: number;
  pointsOffEgp: number;
  amountDueEgp: number;
  pointsBalance: number;
  /** False when a code was typed and refused; `reason` then says why. */
  promoOk: boolean;
  reason: string | null;
};

export async function registrationQuote(
  tournamentId: string,
  promoCode: string | null,
  points: number,
): Promise<Quote | null> {
  const { data, error } = await supabase().rpc('registration_quote', {
    p_tournament_id: tournamentId,
    p_promo_code: promoCode || null,
    p_points: points,
  });
  if (error) throw error;
  const rows = data as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return {
    feeEgp: r.fee_egp,
    promoOffEgp: r.promo_off_egp,
    pointsSpent: r.points_spent,
    pointsOffEgp: r.points_off_egp,
    amountDueEgp: r.amount_due_egp,
    pointsBalance: r.points_balance,
    promoOk: r.promo_ok,
    reason: r.reason,
  };
}

export async function myPointsBalance(): Promise<number> {
  const { data, error } = await supabase().rpc('my_points_balance');
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function enterCup(
  tournamentId: string,
  clubId: string,
  opts: { promoCode?: string | null; points?: number; paymentNote?: string | null } = {},
): Promise<{ ok: boolean; reason?: string; registrationId?: string; amountDueEgp?: number }> {
  const { data, error } = await supabase().rpc('register_club_for_tournament', {
    p_tournament_id: tournamentId,
    p_club_id: clubId,
    p_promo_code: opts.promoCode || null,
    p_points: opts.points ?? 0,
    p_payment_note: opts.paymentNote || null,
  });
  if (error) throw error;
  const r = (data as any[])[0];
  return {
    ok: !!r?.ok,
    reason: r?.reason ?? undefined,
    registrationId: r?.registration_id ?? undefined,
    amountDueEgp: r?.amount_due_egp ?? undefined,
  };
}

export async function claimPayment(
  registrationId: string,
  note: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('claim_registration_payment', {
    p_registration_id: registrationId,
    p_note: note,
  });
  if (error) throw error;
  const r = (data as any[])[0];
  return { ok: !!r?.ok, reason: r?.reason ?? undefined };
}
