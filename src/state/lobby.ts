import { useCallback, useEffect, useState } from 'react';
import { isLive } from '@/lib/supabase';
import {
  bookingSquad,
  squadCounts,
  type SquadCounts,
  type SquadMember,
} from '@/data/squad';
import { bookingTerms, myBookings, type BookingTerms, type PastBooking } from '@/data/discovery';
import { useI18n } from '@/i18n';
import {
  conversationMessages,
  lobbyConversation,
  markConversationRead,
  type Message,
} from '@/data/social';

/**
 * P-13's data, for one booking.
 *
 * The counts come from `squadCounts` rather than from counting the roster this
 * screen holds: a player may be shown only part of a squad, and counting what
 * they can see would report "3 of 5" for a match that is full.
 *
 * The lobby conversation is opened on mount. That call is idempotent — it
 * returns the existing room if there is one — so this cannot accumulate empty
 * rooms by being visited twice.
 */

export type LobbyState = {
  loading: boolean;
  /** Set when the booking is not one this player is part of. */
  denied: string | null;
  squad: SquadMember[];
  counts: SquadCounts | null;
  booking: PastBooking | null;
  terms: BookingTerms | null;
  conversationId: string | null;
  messages: Message[];
  reload: () => void;
  reloadMessages: () => void;
};

export function useLobby(bookingId: string | null): LobbyState {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState<string | null>(null);
  const [squad, setSquad] = useState<SquadMember[]>([]);
  const [counts, setCounts] = useState<SquadCounts | null>(null);
  const [booking, setBooking] = useState<PastBooking | null>(null);
  const [terms, setTerms] = useState<BookingTerms | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [nonce, setNonce] = useState(0);
  const [msgNonce, setMsgNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const reloadMessages = useCallback(() => setMsgNonce((n) => n + 1), []);

  useEffect(() => {
    if (!isLive || !bookingId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      setDenied(null);
      try {
        const [members, cnt, mine, tms] = await Promise.all([
          bookingSquad(bookingId),
          squadCounts(bookingId).catch(() => null),
          // The booking's own facts. `my_bookings` is the captain's list, so a
          // squad member simply gets nothing here and the header falls back to
          // what the squad call already told us.
          // A swallowed failure here silently demotes the captain to a squad
          // member: the lobby decides captain-or-member on whether this
          // returned their booking, so a dropped connection swapped "Cancel
          // booking" for "Leave match" and removed the invite and remove
          // controls. Two destructive actions, quietly exchanged.
          myBookings(50),
          bookingTerms(bookingId).catch(() => null),
        ]);
        if (cancelled) return;
        setSquad(members);
        setCounts(cnt);
        setBooking(mine.find((b) => b.bookingId === bookingId) ?? null);
        setTerms(tms);

        const room = await lobbyConversation(bookingId);
        if (cancelled) return;
        if (room.ok && room.conversationId) {
          setConversationId(room.conversationId);
          setMessages(await conversationMessages(room.conversationId, 50));
          void markConversationRead(room.conversationId);
        }
      } catch (e: unknown) {
        // RBAC-006: not being in a squad is a legitimate answer, not a crash.
        if (!cancelled) {
          const message = (e as { message?: string })?.message ?? '';
          setDenied(
            message.includes('not part of that match')
              ? t.errNotPartOfMatch
              : t.errThisMatchUnreadable,
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookingId, nonce]);

  // Messages refresh on their own beat, so sending one does not re-fetch the
  // whole squad.
  useEffect(() => {
    if (!isLive || !conversationId || msgNonce === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await conversationMessages(conversationId, 50);
        if (!cancelled) setMessages(rows);
      } catch {
        /* the thread keeps what it had */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, msgNonce]);

  return {
    loading: isLive ? loading : false,
    denied,
    squad,
    counts,
    booking,
    terms,
    conversationId,
    messages,
    reload,
    reloadMessages,
  };
}
