import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import { TextInput } from '@/components/TextField';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from '@/components/Txt';
import { OpButton, OpHeader, OpNotice } from '@/components/operative';
import { ink, onOperative, operative, radius } from '@/theme/tokens';
import {
  conversationMessages,
  markConversationRead,
  myConversations,
  sendMessage,
  type Message,
} from '@/data/social';
import { isLive } from '@/lib/supabase';
import { useI18n } from '@/i18n';
import { useSession } from '@/state/session';

/**
 * The venue's side of a settling-up room.
 *
 * The same rooms and the same functions the player's Chat tab uses — a venue
 * reading this is simply another member of the audience — drawn in Owner Mode's
 * palette so somebody working the gate is not thrown into the player's world to
 * answer a question about money.
 *
 * A message with no sender is the app reporting what happened: the claim, and
 * the confirmation. They are set apart from what either person typed, because
 * "the venue confirmed the money arrived" carries weight only if it is obvious
 * nobody typed it.
 */
export default function OwnerThread() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const conversationId = params.id ?? null;
  const { reason, t, hour } = useI18n();
  const { signedIn } = useSession();

  const [messages, setMessages] = useState<Message[]>([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(isLive && signedIn);
  const [unreadable, setUnreadable] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const scroller = useRef<ScrollView | null>(null);

  const load = useCallback(async () => {
    // Every call here needs a session. Signed out they were fired anyway and
    // PostgREST answered 401, which the catch turned into "you are not in this
    // conversation" — true-ish, and not the reason. Two 401s per visit is also
    // what has kept the browser check red on main.
    if (!isLive || !signedIn || !conversationId) return;
    try {
      setMessages(await conversationMessages(conversationId, 60));
      setUnreadable(false);
      void markConversationRead(conversationId);
    } catch {
      setUnreadable(true);
      setNotice(t.errNotInConversation);
    }
  }, [conversationId, signedIn, t]);

  useEffect(() => {
    if (!isLive || !signedIn || !conversationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rooms = await myConversations();
        const room = rooms.find((r) => r.conversationId === conversationId);
        if (!cancelled && room) setTitle(room.title);
      } catch {
        /* the header stays empty rather than inventing a name */
      }
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, signedIn, load]);

  useEffect(() => {
    const shown = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => scroller.current?.scrollToEnd({ animated: true }),
    );
    return () => shown.remove();
  }, []);

  const ordered = [...messages].reverse();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: operative.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 6 }}>
        <OpHeader title={title || t.payTitle} onBack={() => router.back()} />
        <OpNotice text={notice} />

        <ScrollView
          ref={scroller}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 16, gap: 12 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        >
          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color={ink} />
            </View>
          ) : null}

          {/* "No messages yet" is the wrong sentence for somebody who is not
              signed in — the room may be full of them. */}
          {!signedIn ? (
            <Txt size={12.5} color="rgba(20,18,16,.5)">
              {t.signInToSee}
            </Txt>
          ) : null}

          {signedIn && !loading && !unreadable && ordered.length === 0 ? (
            <Txt size={12.5} color="rgba(20,18,16,.5)">
              {t.noMessages}
            </Txt>
          ) : null}

          {ordered.map((m) => {
            // No sender means the app said it, not a person.
            const system = !m.senderId;
            return (
              <View
                key={m.messageId}
                style={{
                  alignSelf: system ? 'center' : m.mine ? 'flex-end' : 'flex-start',
                  maxWidth: system ? '100%' : '82%',
                  gap: 4,
                }}
              >
                {!system && !m.mine ? (
                  <Txt size={10.5} color="rgba(20,18,16,.45)">
                    {m.senderName}
                  </Txt>
                ) : null}
                <View
                  style={{
                    paddingVertical: 9,
                    paddingHorizontal: 13,
                    borderRadius: radius.control,
                    borderWidth: 1,
                    borderColor: system ? 'transparent' : onOperative.line,
                    backgroundColor: system
                      ? 'rgba(20,18,16,.05)'
                      : m.mine
                        ? 'rgba(20,18,16,.07)'
                        : 'transparent',
                  }}
                >
                  <Txt
                    size={system ? 12 : 13.5}
                    lh={1.5}
                    color={system ? 'rgba(20,18,16,.65)' : ink}
                    style={system ? { textAlign: 'center' } : undefined}
                  >
                    {m.body}
                  </Txt>
                </View>
                <Txt
                  size={10}
                  color="rgba(20,18,16,.4)"
                  style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start' }}
                >
                  {hour(m.at)}
                </Txt>
              </View>
            );
          })}
        </ScrollView>

        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            alignItems: 'center',
            paddingBottom: 12 + insets.bottom,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: onOperative.line,
          }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t.messagePlaceholder}
            placeholderTextColor="rgba(20,18,16,.3)"
            multiline
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 110,
              paddingHorizontal: 13,
              paddingTop: 12,
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: onOperative.line,
              color: ink,
            }}
          />
          <OpButton
            label={t.send}
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
