import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { myConversations, type ConversationSummary } from '@/data/social';
import { useSession } from '@/state/session';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * P-12 — every room this player is in.
 *
 * The rooms are derived from relationships that already exist: a squad, a team,
 * or two people who have shared a pitch. There is deliberately no "new message"
 * button here, because there is no way to start a conversation with a stranger
 * — the way in is the lobby you were invited to or the team you joined.
 */
export default function ChatList() {
  const router = useRouter();
  const { signedIn } = useSession();
  const { t, num, hour, shortDate } = useI18n();

  const [rooms, setRooms] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!isLive || !signedIn) {
      setLoading(false);
      setRooms([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await myConversations();
        if (!cancelled) setRooms(rows);
      } catch {
        if (!cancelled) setRooms([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, nonce]);

  const sameDay = (iso: string) =>
    new Date(iso).toDateString() === new Date().toDateString();

  return (
    <Screen
      contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}
      refreshControl={
        isLive && signedIn ? (
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={gold.base} colors={[gold.base]} />
        ) : undefined
      }
    >
      <Txt size={22} weight="bold" em={-0.02} color={onVoid.primary}>
        {t.chatTitle}
      </Txt>

      {isLive && !signedIn ? (
        <View style={{ gap: 12, alignItems: 'flex-start' }}>
          <Txt size={13} color={onVoid.muted}>
            {t.signedOutHomeBlurb}
          </Txt>
          <Button label={t.signIn} height={44} onPress={() => router.push('/sign-in?next=/chat')} />
        </View>
      ) : null}

      {loading && rooms.length === 0 ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {!loading && signedIn && rooms.length === 0 ? (
        <View style={{ gap: 6 }}>
          <Txt size={15} weight="semibold" color={onVoid.primary}>
            {t.noConversations}
          </Txt>
          <Txt size={12.5} lh={1.55} color={onVoid.muted}>
            {t.noConversationsBlurb}
          </Txt>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        {rooms.map((room) => (
          <Pressable
            key={room.conversationId}
            accessibilityRole="button"
            accessibilityLabel={
              room.unread > 0 ? `${room.title}, ${room.unread} unread` : room.title
            }
            onPress={() => router.push(`/chat/${room.conversationId}`)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 13,
              paddingHorizontal: 14,
              borderRadius: radius.control,
              backgroundColor: void_.surface,
              borderWidth: 1,
              borderColor: room.unread > 0 ? goldAlpha.edgeSoft : pressed ? goldAlpha.edge : onVoid.edgeFaint,
            })}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: radius.pill,
                backgroundColor: void_.inset,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt size={11} weight="bold" color={gold.base}>
                {room.title.slice(0, 2).toUpperCase()}
              </Txt>
            </View>

            <View style={{ flex: 1, gap: 3 }}>
              <Txt size={14} weight="semibold" color={onVoid.primary}>
                {room.title}
              </Txt>
              <Txt size={11.5} color={onVoid.faint} numberOfLines={1}>
                {room.lastBody ?? t.noMessages}
              </Txt>
            </View>

            <View style={{ alignItems: 'flex-end', gap: 5 }}>
              {room.lastAt ? (
                <Txt size={10.5} color={onVoid.dim}>
                  {sameDay(room.lastAt) ? hour(room.lastAt) : shortDate(room.lastAt)}
                </Txt>
              ) : null}
              {room.unread > 0 ? (
                <View
                  style={{
                    minWidth: 18,
                    height: 18,
                    paddingHorizontal: 5,
                    borderRadius: radius.pill,
                    backgroundColor: gold.base,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Txt size={10} weight="bold" color={void_.bg}>
                    {num(room.unread)}
                  </Txt>
                </View>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
