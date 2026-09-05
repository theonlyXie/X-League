import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { TextInput } from '@/components/TextField';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, onVoid, radius, void_ } from '@/theme/tokens';
import {
  blockPlayer,
  conversationMessages,
  markConversationRead,
  myConversations,
  sendMessage,
  submitReport,
  type Message,
} from '@/data/social';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * P-14 — one thread.
 *
 * Messages arrive newest-first from the server (that is the order a page of
 * history is fetched in) and are reversed here for display, so "load older"
 * stays a paging concern rather than something the transport has to know about.
 *
 * The room keeps itself current. It used to fetch once on open and then only
 * again when you sent something, so the other half of a conversation arrived
 * only if you left the screen and came back — two people messaging each other
 * were each reading a snapshot taken before the other one replied. That is not
 * a chat, and "pull to refresh to see what they said" is not an instruction
 * anybody should be given.
 *
 * It polls rather than subscribing. Supabase's realtime channel delivers row
 * changes to a client that can read the row, which means a select grant and a
 * policy on `message` — and this schema deliberately grants no table access to
 * anybody, reading everything through functions that decide who may see what.
 * A socket is not worth putting the first hole in that. Four seconds on an open
 * room is one small request, and it stops the moment the screen is not in front
 * of somebody.
 */

/** How often an open room asks whether anything was said. */
const BEAT_MS = 4000;
export default function Thread() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const conversationId = params.id ?? null;
  const { reason, t, hour } = useI18n();

  const [messages, setMessages] = useState<Message[]>([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(isLive);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** The message somebody long-pressed, if any. */
  const [acting, setActing] = useState<Message | null>(null);
  /** §4.7: a room we could not read is not a room with nothing in it. */
  const [unreadable, setUnreadable] = useState(false);
  const scroller = useRef<ScrollView | null>(null);

  /**
   * The newest message and how many there are, as they were last drawn.
   *
   * A poll that finds nothing new must not call `setMessages`: a new array of
   * equal messages is still a new array, and the `ScrollView` would jump to the
   * bottom every four seconds under somebody reading further up.
   */
  const seen = useRef<{ newest: string | null; count: number }>({ newest: null, count: 0 });

  const apply = useCallback((rows: Message[]) => {
    const newest = rows[0]?.messageId ?? null;
    if (newest === seen.current.newest && rows.length === seen.current.count) return false;
    seen.current = { newest, count: rows.length };
    setMessages(rows);
    return true;
  }, []);

  const load = useCallback(async () => {
    if (!isLive || !conversationId) return;
    try {
      const rows = await conversationMessages(conversationId, 60);
      apply(rows);
      setUnreadable(false);
      void markConversationRead(conversationId);
    } catch {
      setUnreadable(true);
      setNotice(t.errNotInConversation);
    }
  }, [conversationId, apply]);

  /**
   * The same read, quietly.
   *
   * A poll that fails changes nothing on screen. Marking the room read is
   * hitched to something actually having arrived, so an idle room open on a
   * table is one select every four seconds and no writes at all.
   */
  const poll = useCallback(async () => {
    if (!isLive || !conversationId) return;
    try {
      const rows = await conversationMessages(conversationId, 60);
      if (apply(rows)) void markConversationRead(conversationId);
    } catch {
      /* the room stays as it was */
    }
  }, [conversationId, apply]);

  useEffect(() => {
    if (!isLive || !conversationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      // The room's name comes from the list rather than a second RPC: it is
      // already resolved there to a venue, a team or a person.
      try {
        const rooms = await myConversations();
        const room = rooms.find((r) => r.conversationId === conversationId);
        if (!cancelled && room) setTitle(room.title);
      } catch {
        /* the header simply stays empty */
      }
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, load]);

  /**
   * The beat, only while this room is the screen somebody is looking at.
   *
   * `useFocusEffect` stops it when the thread is pushed behind another screen,
   * and the AppState check stops it when the phone is in a pocket — an interval
   * carries on firing in the background otherwise, and polling a chat nobody is
   * reading is just battery.
   */
  useFocusEffect(
    useCallback(() => {
      if (!isLive || !conversationId) return;
      // Focus is also a return: whatever was said while this screen was behind
      // another one should be there before the first beat, not four seconds in.
      void poll();
      const beat = setInterval(() => {
        if (AppState.currentState === 'active') void poll();
      }, BEAT_MS);
      return () => clearInterval(beat);
    }, [conversationId, poll]),
  );

  // The keyboard opening changes how much of the room is visible, which is
  // exactly when the newest message should still be the one you can see.
  useEffect(() => {
    const shown = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => scroller.current?.scrollToEnd({ animated: true }),
    );
    return () => shown.remove();
  }, []);

  const ordered = [...messages].reverse();

  return (
    /**
     * Android had no keyboard avoidance at all here — `behavior` was left
     * undefined on that platform, so the keyboard opened straight over the
     * composer and over the last thing said. `padding` on iOS and `height` on
     * Android is what the rest of the app uses, and this is the one screen that
     * does not go through `Screen` to get it.
     */
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: void_.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 20,
          paddingVertical: 10,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/chat'))}
          hitSlop={8}
          style={{
            width: 34,
            height: 34,
            borderRadius: radius.icon,
            borderWidth: 1,
            borderColor: 'rgba(243,238,229,.14)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={16} color={onVoid.secondary} />
        </Pressable>
        <Txt size={17} weight="bold" em={-0.02} color={onVoid.primary}>
          {title || t.chatTitle}
        </Txt>
      </View>

      <ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
      >
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={gold.base} />
          </View>
        ) : null}

        {!loading && !unreadable && ordered.length === 0 ? (
          <Txt size={12.5} color={onVoid.dim}>
            {t.noMessages}
          </Txt>
        ) : null}

        {ordered.map((m) => (
          <Pressable
            key={m.messageId}
            accessibilityRole="button"
            accessibilityLabel={m.mine ? m.body : t.messageActions}
            // Apple 1.2 asks for a way to report content and a way to block
            // the person who wrote it. Long-press is where people look for it,
            // and there is nothing to do to your own message.
            onLongPress={m.mine || !m.senderId ? undefined : () => setActing(m)}
            delayLongPress={350}
            style={{
              alignSelf: m.mine ? 'flex-end' : 'flex-start',
              maxWidth: '82%',
              gap: 4,
            }}
          >
            {!m.mine ? (
              <Txt size={10.5} color={onVoid.dim}>
                {m.senderName}
              </Txt>
            ) : null}
            <View
              style={{
                paddingVertical: 10,
                paddingHorizontal: 13,
                borderRadius: radius.control,
                backgroundColor: m.mine ? 'rgba(198,163,75,.14)' : void_.surface,
                borderWidth: 1,
                borderColor: m.mine ? 'rgba(198,163,75,.3)' : onVoid.edgeFaint,
              }}
            >
              <Txt size={13.5} lh={1.5} color={onVoid.primary}>
                {m.body}
              </Txt>
            </View>
            <Txt size={10} color={onVoid.dim} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start' }}>
              {hour(m.at)}
            </Txt>
          </Pressable>
        ))}
      </ScrollView>

      {acting ? (
        <MessageActions
          message={acting}
          onClose={() => setActing(null)}
          onDone={(said) => {
            setActing(null);
            setNotice(said);
            void load();
          }}
        />
      ) : null}

      {notice ? (
        <Txt size={12} color={burgundy.action} style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          {notice}
        </Txt>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingBottom: 12 + insets.bottom,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: onVoid.edgeFaint,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t.messagePlaceholder}
          placeholderTextColor={onVoid.dim}
          multiline
          style={{
            flex: 1,
            minHeight: 44,
            maxHeight: 110,
            paddingHorizontal: 14,
            paddingTop: 12,
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: onVoid.edge,
            color: onVoid.primary,
            backgroundColor: void_.surface,
          }}
        />
        <Button
          label={t.send}
          height={44}
          disabled={sending || draft.trim().length === 0}
          onPress={async () => {
            if (!conversationId) return;
            setSending(true);
            const res = await sendMessage(conversationId, draft);
            setSending(false);
            if (res.ok) {
              setDraft('');
              setNotice(null);
              await load();
            } else {
              setNotice(reason(res.reason) ?? null);
            }
          }}
        />
      </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * What you can do about somebody else's message.
 *
 * The two things the store rule for user-generated content actually asks for,
 * in the place a person looks for them. Reporting goes to the same queue the
 * console already works from; blocking takes their messages out of this room
 * and stops them opening a direct one, and they are not told.
 */
function MessageActions({
  message,
  onClose,
  onDone,
}: {
  message: Message;
  onClose: () => void;
  onDone: (said: string) => void;
}) {
  const { reason, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (fn: () => Promise<{ ok: boolean; reason?: string }>, said: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fn();
      if (res.ok) onDone(said);
      else setNotice(res.reason ? (reason(res.reason) ?? res.reason) : t.reportFailed);
    } catch {
      setNotice(t.offline);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        marginHorizontal: 20,
        marginBottom: 10,
        padding: 14,
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: onVoid.edge,
        backgroundColor: void_.surface,
        gap: 10,
      }}
    >
      <Txt size={12.5} color={onVoid.muted} numberOfLines={2}>
        {message.senderName}: {message.body}
      </Txt>

      {notice ? (
        <Txt size={12} color={burgundy.action}>
          {notice}
        </Txt>
      ) : null}

      <Button
        label={t.reportMessage}
        variant="ghost"
        height={42}
        disabled={busy}
        onPress={() =>
          void run(() => submitReport('message', message.messageId, 'abuse'), t.reportSent)
        }
      />
      <Button
        label={t.blockPlayer}
        variant="danger"
        height={42}
        disabled={busy || !message.senderId}
        onPress={() =>
          void run(() => blockPlayer(message.senderId!), t.blockBlurb)
        }
      />
      <Button label={t.close} variant="ghost" height={42} disabled={busy} onPress={onClose} />
    </View>
  );
}
