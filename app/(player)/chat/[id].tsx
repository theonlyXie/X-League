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
  conversationMessages,
  markConversationRead,
  myConversations,
  sendMessage,
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
          <View
            key={m.messageId}
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
          </View>
        ))}
      </ScrollView>

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
