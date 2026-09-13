import { supabase } from '@/lib/supabase';

/**
 * Reaching somebody, notifications and reports.
 *
 * The messaging that used to live here is gone. What replaced it is a number:
 * the server decides whether the caller is entitled to somebody's WhatsApp —
 * the same relationship rule that used to decide whether a direct conversation
 * could be opened at all — and the app opens WhatsApp with it.
 */

export type Reachable = {
  displayName: string;
  /** Digits in `wa.me` form: country code, no plus. Never built on the client. */
  waNumber: string;
};

type ReachResult = { ok: boolean; reachable?: Reachable; reason?: string };

/**
 * A player's number, if this player is entitled to it.
 *
 * Refused for a stranger, exactly as opening a conversation with one used to
 * be, and refused in both directions of a block. The refusal is a sentence the
 * screen can show, because "no" has to be explainable.
 */
export async function whatsappForPlayer(playerId: string): Promise<ReachResult> {
  const { data, error } = await supabase().rpc('whatsapp_for_player', {
    p_player_id: playerId,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  if (!row?.ok) return { ok: false, reason: row?.reason ?? undefined };
  return {
    ok: true,
    reachable: { displayName: row.display_name, waNumber: row.wa_number },
  };
}

/** Which side of the booking came back — the app words the button accordingly. */
export type BookingSide = 'venue' | 'captain';

/**
 * The other side of a booking: the venue to its captain, the captain to the
 * venue's staff. One call rather than two, because a booking has exactly one
 * counterparty and the screen should not have to work out which it is.
 */
export async function bookingWhatsapp(
  bookingId: string,
): Promise<ReachResult & { who?: BookingSide }> {
  const { data, error } = await supabase().rpc('booking_whatsapp', {
    p_booking_id: bookingId,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  if (!row?.ok) return { ok: false, who: row?.who ?? undefined, reason: row?.reason ?? undefined };
  return {
    ok: true,
    who: row.who,
    reachable: { displayName: row.display_name, waNumber: row.wa_number },
  };
}

export type Blocked = {
  playerId: string;
  displayName: string;
  photoUrl: string | null;
  since: string;
};

/**
 * Blocking.
 *
 * It used to mean a blocked person's messages stopped existing for the person
 * who blocked them. With no messages it means something simpler and just as
 * necessary: neither of you can get the other's number out of X League. What
 * happens on WhatsApp after that is WhatsApp's own block list, which is the
 * one that can actually stop a message arriving.
 */
export async function blockPlayer(playerId: string): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('block_player', { p_player_id: playerId });
  if (error) throw error;
  const row = (data as any[])[0];
  return row?.ok ? { ok: true } : { ok: false, reason: row?.reason ?? undefined };
}

export async function unblockPlayer(playerId: string): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('unblock_player', { p_player_id: playerId });
  if (error) throw error;
  const row = (data as any[])[0];
  return row?.ok ? { ok: true } : { ok: false, reason: row?.reason ?? undefined };
}

export async function myBlocks(): Promise<Blocked[]> {
  const { data, error } = await supabase().rpc('my_blocks');
  if (error) throw error;
  return (data as any[]).map((r) => ({
    playerId: r.player_id,
    displayName: r.display_name,
    photoUrl: r.photo_url ?? null,
    since: r.since,
  }));
}

export type Notification = {
  notificationId: string;
  kind: string;
  title: string;
  body: string | null;
  /** Where tapping it goes: {screen, booking_id | club_id | ...}. */
  payload: Record<string, string>;
  read: boolean;
  at: string;
};

export async function myNotifications(limit = 30): Promise<Notification[]> {
  const { data, error } = await supabase().rpc('my_notifications', { p_limit: limit });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    notificationId: r.notification_id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    payload: r.payload ?? {},
    read: r.read,
    at: r.at,
  }));
}

export async function unreadNotifications(): Promise<number> {
  const { data, error } = await supabase().rpc('unread_notifications');
  if (error) throw error;
  return Number(data ?? 0);
}

/** Passing no id marks everything read, which is what opening the list does. */
export async function markNotificationsRead(notificationId?: string): Promise<number> {
  const { data, error } = await supabase().rpc('mark_notifications_read', {
    p_notification_id: notificationId ?? null,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export type ReportReason = 'abuse' | 'no_show' | 'unsafe' | 'spam' | 'wrong_info' | 'other';

export async function submitReport(
  subjectKind: 'player' | 'venue' | 'booking',
  subjectId: string,
  reason: ReportReason,
  body?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('submit_report', {
    p_subject_kind: subjectKind,
    p_subject_id: subjectId,
    p_reason: reason,
    p_body: body ?? null,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}
