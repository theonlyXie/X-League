import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
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
 */
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
  const scroller = useRef<ScrollView | null>(null);

  const load = useCallback(async () => {
    if (!isLive || !conversationId) return;
    try {
      const rows = await conversationMessages(conversationId, 60);
      setMessages(rows);
      void markConversationRead(conversationId);
    } catch {
      setNotice(t.errNotInConversation);
    }
  }, [conversationId]);

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

  const ordered = [...messages].reverse();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: void_.bg, paddingTop: insets.top }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
      >
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={gold.base} />
          </View>
        ) : null}

        {!loading && ordered.length === 0 ? (
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
