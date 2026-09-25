import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { MenuGroup } from '@/components/kit';
import { Bell, Calendar, CheckCircle, ChevronLeft, Megaphone, Shield, Swords, Trophy, Users, Whistle } from '@/components/icons';
import { gold, goldAlpha, onVoid, radius } from '@/theme/tokens';
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={8}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}
        >
          <ChevronLeft size={22} color={onVoid.primary} />
        </Pressable>
        <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary} style={{ flex: 1 }}>
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
            <Txt size={12.5} weight="semibold" color={gold.base}>
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

      {rows.length ? (
        <MenuGroup>
          {rows.map((n) => {
            const Icon = iconFor(n);
            return (
              <Pressable
                key={n.notificationId}
                accessibilityRole="button"
                accessibilityLabel={say(n.title) ?? n.title}
                onPress={() => open(n)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 13,
                  paddingVertical: 13,
                  paddingHorizontal: 14,
                  // Unread is the one thing this list has to say at a glance,
                  // so it is the row that carries the gold, not a badge beside it.
                  backgroundColor: pressed ? goldAlpha.fill : !n.read ? goldAlpha.fillSoft : 'transparent',
                })}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: radius.icon,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: !n.read ? goldAlpha.fill : 'rgba(243,238,229,.05)',
                  }}
                >
                  <Icon size={18} color={!n.read ? gold.base : onVoid.muted} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Txt
                      size={14}
                      weight={!n.read ? 'bold' : 'semibold'}
                      color={onVoid.primary}
                      style={{ flex: 1 }}
                    >
                      {say(n.title)}
                    </Txt>
                    <Txt size={10.5} weight={!n.read ? 'semibold' : 'regular'} color={!n.read ? gold.base : onVoid.dim}>
                      {sameDay(n.at) ? hour(n.at) : shortDate(n.at)}
                    </Txt>
                    {!n.read ? (
                      <View style={{ width: 7, height: 7, borderRadius: radius.pill, backgroundColor: gold.base }} />
                    ) : null}
                  </View>
                  {n.body ? (
                    <Txt size={12} lh={1.5} color={!n.read ? onVoid.secondary : onVoid.faint}>
                      {say(n.body)}
                    </Txt>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </MenuGroup>
      ) : null}
    </Screen>
  );
}

/**
 * The icon a notification wears. The server's `kind` is the better witness,
 * the payload's `screen` the fallback, and anything neither names gets the
 * bell rather than a guess.
 */
function iconFor(n: Notification): typeof Bell {
  const k = n.kind ?? '';
  const screen = n.payload?.screen;
  if (k.startsWith('challenge') || screen === 'challenges') return Swords;
  if (k.startsWith('club') || screen === 'club') return Shield;
  if (k.startsWith('tournament') || screen === 'tournament') return Trophy;
  if (k.startsWith('result') || screen === 'result') return Whistle;
  if (k.startsWith('payment')) return CheckCircle;
  if (k === 'squad_invite' || k.startsWith('call') || screen === 'lobby') return Users;
  if (k === 'message') return Megaphone;
  if (k.startsWith('booking') || screen === 'booking') return Calendar;
  return Bell;
}
