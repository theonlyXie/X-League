import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, AppState, Pressable, RefreshControl, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { myConversations, type ConversationSummary } from '@/data/social';
import { useSession } from '@/state/session';
import { useI18n } from '@/i18n';
import { useRefreshTick } from '@/state/refresh';
import { isLive } from '@/lib/supabase';

/**
 * P-12 — every room this player is in.
 *
 * Most rooms are derived from relationships that already exist: a squad, a
 * team, a club, the venue you owe money to. Those still appear on their own.
 * What was missing was the other direction — finding one person and saying
 * something to them — so there is now a way to start one, and `/chat/new` is
 * where the searching happens.
 *
 * The list keeps itself current for the same reason a thread does: an unread
 * badge that only updates when you pull it down is a badge that lies for as
 * long as you leave it alone. The beat here is slower than a thread's, because
 * this screen answers "is there anything new" and not "what did they say".
 */

/** How often the list asks whether any room has moved. */
const BEAT_MS = 12000;
export default function ChatList() {
  const router = useRouter();
  const { signedIn } = useSession();
  const { t, num, hour, shortDate } = useI18n();

  // The refresh button in the top bar.
  const tick = useRefreshTick();
  const [rooms, setRooms] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(isLive);
  /** §4.7: a list we could not read is not an empty list. */
  const [unreachable, setUnreachable] = useState(false);
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
        if (!cancelled) {
          setRooms(rows);
          setUnreachable(false);
        }
      } catch {
        // "You have no conversations" and "we could not read them" are
        // different sentences, and only one of them is ever true here.
        if (!cancelled) {
          setRooms([]);
          setUnreachable(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, nonce, tick]);

  /**
   * Refreshed while somebody is looking at it, and not otherwise.
   *
   * Coming back to this screen is the moment the list is most likely to be
   * wrong, so focus reloads before the first beat rather than after it.
   */
  useFocusEffect(
    useCallback(() => {
      if (!isLive || !signedIn) return;
      reload();
      const beat = setInterval(() => {
        if (AppState.currentState === 'active') reload();
      }, BEAT_MS);
      return () => clearInterval(beat);
    }, [signedIn, reload]),
  );

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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Txt size={22} weight="bold" em={-0.02} color={onVoid.primary} style={{ flex: 1 }}>
          {t.chatTitle}
        </Txt>
        {isLive && signedIn ? (
          <Button
            label={t.newMessage}
            height={38}
            size={12.5}
            variant="ghost"
            onPress={() => router.push('/chat/new')}
          />
        ) : null}
      </View>

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
            {unreachable ? t.listUnreachable : t.noConversations}
          </Txt>
          <Txt size={12.5} lh={1.55} color={onVoid.muted}>
            {unreachable ? t.listUnreachableBlurb : t.noConversationsBlurb}
          </Txt>
          {/* An empty list that only explains itself is still a dead end. */}
          {!unreachable ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
              <Button label={t.newMessage} height={42} onPress={() => router.push('/chat/new')} />
              <Button label={t.clubs} height={42} variant="ghost" onPress={() => router.push('/clubs')} />
              <Button label={t.teamsTitle} height={42} variant="ghost" onPress={() => router.push('/teams')} />
            </View>
          ) : null}
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
