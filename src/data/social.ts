import { supabase } from '@/lib/supabase';

/**
 * Conversations, notifications and reports.
 *
 * Opening a conversation is idempotent — `lobbyConversation` and
 * `directConversation` return the existing room if there is one — so a screen
 * can call them on mount without accumulating empty rooms.
 */

export type ConversationKind = 'lobby' | 'team' | 'club' | 'direct';

export type ConversationSummary = {
  conversationId: string;
  kind: ConversationKind;
  /** Already resolved to something readable: a venue, a team, or a person. */
  title: string;
  lastBody: string | null;
  lastAt: string | null;
  unread: number;
  bookingId: string | null;
  teamId: string | null;
  clubId: string | null;
};

export async function myConversations(limit = 30): Promise<ConversationSummary[]> {
  const { data, error } = await supabase().rpc('my_conversations', { p_limit: limit });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    conversationId: r.conversation_id,
    kind: r.kind,
    title: r.title,
    lastBody: r.last_body,
    lastAt: r.last_at,
    unread: r.unread,
    bookingId: r.booking_id,
    teamId: r.team_id,
    clubId: r.club_id ?? null,
  }));
}

export type Message = {
  messageId: string;
  senderId: string | null;
  senderName: string;
  body: string;
  mine: boolean;
  at: string;
};

export async function conversationMessages(
  conversationId: string,
  limit = 50,
  before?: string,
): Promise<Message[]> {
  const { data, error } = await supabase().rpc('conversation_messages', {
    p_conversation_id: conversationId,
    p_limit: limit,
    p_before: before ?? null,
  });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    messageId: r.message_id,
    senderId: r.sender_id,
    senderName: r.sender_name,
    body: r.body,
    mine: r.mine,
    at: r.at,
  }));
}

export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('send_message', {
    p_conversation_id: conversationId,
    p_body: body,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

type OpenResult = { ok: boolean; conversationId?: string; reason?: string };

const toOpen = (row: any): OpenResult =>
  row.ok ? { ok: true, conversationId: row.conversation_id } : { ok: false, reason: row.reason };

/** MSG-001: the lobby exists because the squad does. */
export async function lobbyConversation(bookingId: string): Promise<OpenResult> {
  const { data, error } = await supabase().rpc('lobby_conversation', { p_booking_id: bookingId });
  if (error) throw error;
  return toOpen((data as any[])[0]);
}

export async function teamConversation(teamId: string): Promise<OpenResult> {
  const { data, error } = await supabase().rpc('team_conversation', { p_team_id: teamId });
  if (error) throw error;
  return toOpen((data as any[])[0]);
}

/**
 * MSG-002: refused unless the two have shared a team or a pitch. The reason
 * comes back as copy the screen can show, because "no" needs to be explainable.
 */
/**
 * A club's own room. The squad that enters a cup together is the group that
 * most needs somewhere to talk, and until this existed a conversation could
 * only come from a booking lobby or a team — so a club had no way in at all.
 */
export async function clubConversation(clubId: string): Promise<OpenResult> {
  const { data, error } = await supabase().rpc('club_conversation', { p_club_id: clubId });
  if (error) throw error;
  return toOpen((data as any[])[0]);
}

/** Silence a room without leaving it. */
export async function muteConversation(
  conversationId: string,
  muted: boolean,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('mute_conversation', {
    p_conversation_id: conversationId,
    p_muted: muted,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row?.ok ? { ok: true } : { ok: false, reason: row?.reason ?? undefined };
}

export type Blocked = {
  playerId: string;
  displayName: string;
  photoUrl: string | null;
  since: string;
};

/**
 * Blocking, which the app had no way to do.
 *
 * A blocked person's messages stop existing for the person who blocked them,
 * and in a room of two the message is refused outright. The blocked person is
 * never told — that is the point of it.
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

export async function directConversation(playerId: string): Promise<OpenResult> {
  const { data, error } = await supabase().rpc('direct_conversation', { p_player_id: playerId });
  if (error) throw error;
  return toOpen((data as any[])[0]);
}

export async function markConversationRead(conversationId: string): Promise<boolean> {
  const { data, error } = await supabase().rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  return Boolean(data);
}

export type Notification = {
  notificationId: string;
  kind: string;
  title: string;
  body: string | null;
  /** Where tapping it goes: {screen, booking_id | conversation_id | ...}. */
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
  subjectKind: 'player' | 'venue' | 'message' | 'booking',
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
