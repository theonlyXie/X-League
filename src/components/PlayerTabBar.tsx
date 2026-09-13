import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './Txt';
import { gold, onVoid, radius, void_ } from '@/theme/tokens';
import type { TabBarProps } from './tabBarTypes';
import { usePathname } from 'expo-router';
import { useI18n } from '@/i18n';
import { useSession } from '@/state/session';
import { unreadNotifications } from '@/data/social';
import { isLive } from '@/lib/supabase';

/**
 * Labelled tabs with a gold tick on the active one, matching the spec's player
 * IA (§3.1).
 *
 * Four rather than five: Chat is gone, and with it the room this product used
 * to run its own messaging in. What is left of a conversation is a button that
 * opens WhatsApp, which belongs beside the person it reaches rather than in a
 * tab of its own.
 *
 * The unread count moved with it, onto Me — where Notifications actually
 * lives. It was on Chat because that was the tab with a badge, but it has
 * always counted notifications rather than messages, and now it sits on the
 * tab that opens them.
 */
const ITEMS: { label: string; route: string }[] = [
  { label: 'Home', route: 'index' },
  { label: 'Play', route: 'play' },
  { label: 'Cups', route: 'cups' },
  { label: 'Me', route: 'me' },
];

export function PlayerTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { t, num } = useI18n();
  const { signedIn } = useSession();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  // Polled rather than pushed: there is no realtime subscription yet, and a
  // count that is a minute stale is still better than no count at all.
  useEffect(() => {
    if (!isLive || !signedIn) {
      setUnread(0);
      return;
    }
    let cancelled = false;
    const read = () => {
      unreadNotifications()
        .then((n) => {
          if (!cancelled) setUnread(n);
        })
        .catch(() => {});
    };
    read();
    const timer = setInterval(read, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // Re-read on any navigation, not only a tab change: marking a
    // notification read happens inside the notifications stack, where the tab
    // index never moves, so the badge kept its old count until the tab bar
    // itself remounted.
  }, [signedIn, state.index, pathname]);

  const label: Record<string, string> = {
    Home: t.home, Play: t.play, Cups: t.cups, Me: t.me,
  };
  const activeRoute = state.routes[state.index]?.name;

  return (
    <View
      style={{
        height: 78 + insets.bottom,
        paddingBottom: insets.bottom,
        borderTopWidth: 1,
        borderTopColor: onVoid.edgeFaint,
        backgroundColor: void_.chrome,
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 6,
      }}
    >
      {ITEMS.map((item) => {
        const active = item.route === activeRoute;
        const color = active ? gold.base : onVoid.dim;
        const badge = item.label === 'Me' ? unread : 0;

        return (
          <Pressable
            key={item.label}
            accessibilityRole="tab"
            accessibilityLabel={
              badge > 0
                ? `${label[item.label] ?? item.label}, ${badge} unread`
                : (label[item.label] ?? item.label)
            }
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              navigation.navigate(item.route as never);
            }}
            style={{ flex: 1, alignItems: 'center', paddingTop: 11, gap: 7 }}
          >
            <View
              style={{
                width: 16,
                height: 2,
                borderRadius: 2,
                backgroundColor: active ? gold.base : 'transparent',
              }}
            />
            <View>
              <Txt size={10.5} weight="semibold" color={color}>
                {label[item.label] ?? item.label}
              </Txt>
              {badge > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -12,
                    minWidth: 15,
                    height: 15,
                    paddingHorizontal: 4,
                    borderRadius: radius.pill,
                    backgroundColor: gold.base,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Txt size={9} weight="bold" color={void_.bg}>
                    {num(Math.min(badge, 99))}
                  </Txt>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
