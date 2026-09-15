import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { ArrowLeft } from '@/components/icons';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import {
  markNotificationsRead,
  myNotifications,
  type Notification,
} from '@/data/social';
import { useI18n } from '@/i18n';
import { useRefreshTick } from '@/state/refresh';
import { useUnread } from '@/state/unread';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';

/**
 * What the player has been told.
 *
 * A notification is a row rather than a push, so this list is the record of
 * what was said whether or not a device was ever reachable. Each one carries a
 * payload naming where it goes, which is why tapping one lands somewhere useful
 * rather than just marking it read.
 */
export default function Notifications() {
  const { signedIn } = useSession();
  const router = useRouter();
  // A notification is written by the server, in English, and is the one piece
  // of server text somebody reads without having asked a question. `reason` is
  // the same table the refusals go through: anything with a mapping arrives
  // translated, and anything without falls back to the sentence itself rather
  // than to silence.
  const { t, hour, shortDate, reason: say } = useI18n();

  // The refresh button in the top bar.
  const tick = useRefreshTick();
  const { refreshUnread } = useUnread();
  const [rows, setRows] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(isLive);
  /** §4.7: a list we could not read is not an empty list. */
  const [unreachable, setUnreachable] = useState(false);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // Gated on being signed in, not only on being live. `my_notifications`
    // needs an account, so a signed-out visitor got a 401 — which the catch
    // below turned into "Could not reach X League", telling somebody with no
    // account that the network was down.
    if (!isLive || !signedIn) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await myNotifications(40);
        if (!cancelled) {
          setRows(list);
          setUnreachable(false);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setUnreachable(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce, signedIn, tick]);

  const open = (n: Notification) => {
    // The bell is on the screen behind this one. Without this it keeps the old
    // count until the next poll, up to a minute after the list says otherwise.
    void markNotificationsRead(n.notificationId).then(refreshUnread);
    const {
      screen,
      booking_id: bookingId,
      club_id: clubId,
      tournament_id: cupId,
      match_id: matchId,
    } = n.payload;
    if (screen === 'lobby' && bookingId) router.push(`/play/lobby?booking=${bookingId}`);
    else if (screen === 'result' && matchId) router.push(`/play/agree?match=${matchId}`);
    // A club invitation is answered on the clubs list, where the offer and the
    // two buttons are. It carried a `club_id` from the day invitations existed
    // and nothing here read it, so tapping one only marked it read.
    else if (screen === 'club' && clubId) router.push('/clubs');
    else if (screen === 'tournament' && cupId) router.push(`/cups/${cupId}`);
    // The opponent is not on the captain's booking, so neither the bookings
    // list nor the lobby will show it to them. Their own screen answers it.
    else if (screen === 'challenges') router.push('/play/challenges');
    else if (screen === 'booking' && bookingId) router.push('/bookings');
    else reload();
  };

  const sameDay = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

  return (
    <Screen
      contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}
      refreshControl={
        isLive ? (
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={gold.base} colors={[gold.base]} />
        ) : undefined
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
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
        <Txt size={19} weight="bold" em={-0.02} color={onVoid.primary} style={{ flex: 1 }}>
          {t.notifications}
        </Txt>
        {rows.some((n) => !n.read) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.markAllRead}
            hitSlop={10}
            onPress={async () => {
              await markNotificationsRead();
              refreshUnread();
              reload();
            }}
          >
            <Txt size={11.5} weight="semibold" color={gold.base}>
              {t.markAllRead}
            </Txt>
          </Pressable>
        ) : null}
      </View>

      {loading && rows.length === 0 ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {!loading && rows.length === 0 ? (
        <Txt size={13} color={onVoid.muted}>
          {unreachable ? t.listUnreachable : t.noNotifications}
        </Txt>
      ) : null}

      <View style={{ gap: 8 }}>
        {rows.map((n) => (
          <Pressable
            key={n.notificationId}
            accessibilityRole="button"
            accessibilityLabel={say(n.title) ?? n.title}
            onPress={() => open(n)}
            style={({ pressed }) => ({
              paddingVertical: 13,
              paddingHorizontal: 15,
              borderRadius: radius.control,
              backgroundColor: void_.surface,
              borderWidth: 1,
              borderColor: !n.read ? goldAlpha.edgeSoft : pressed ? goldAlpha.edge : onVoid.edgeFaint,
              gap: 4,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {!n.read ? (
                <View
                  style={{ width: 6, height: 6, borderRadius: radius.pill, backgroundColor: gold.base }}
                />
              ) : null}
              <Txt size={13.5} weight="semibold" color={onVoid.primary} style={{ flex: 1 }}>
                {say(n.title)}
              </Txt>
              <Txt size={10.5} color={onVoid.dim}>
                {sameDay(n.at) ? hour(n.at) : shortDate(n.at)}
              </Txt>
            </View>
            {n.body ? (
              <Txt size={12} lh={1.5} color={onVoid.muted}>
                {say(n.body)}
              </Txt>
            ) : null}
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
