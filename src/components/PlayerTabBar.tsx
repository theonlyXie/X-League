import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './Txt';
import { gold, onVoid, void_ } from '@/theme/tokens';
import type { TabBarProps } from './tabBarTypes';
import { useI18n } from '@/i18n';
import { Home, Search, Trophy, User } from './icons';

/**
 * Labelled tabs with a gold tick on the active one, matching the spec's player
 * IA (§3.1).
 *
 * Four rather than five: Chat is gone, and with it the room this product used
 * to run its own messaging in. What is left of a conversation is a button that
 * opens WhatsApp, which belongs beside the person it reaches rather than in a
 * tab of its own.
 *
 * Icon over label, as the redesign draws it. The second tab is Search now:
 * it is still the availability-first Play screen underneath, but what the
 * player comes to it for is to look for somewhere, so that is what it says.
 *
 * No badge here any more. The count used to sit on Me, one tab away from a
 * Notifications row buried in that screen — so being told something had
 * arrived and being able to read it were two different gestures. It is now on
 * a bell on the screen you are already looking at, which is both the telling
 * and the way in.
 */
const ITEMS: { label: string; route: string; Icon: typeof Home }[] = [
  { label: 'Home', route: 'index', Icon: Home },
  { label: 'Play', route: 'play', Icon: Search },
  { label: 'Cups', route: 'cups', Icon: Trophy },
  { label: 'Me', route: 'me', Icon: User },
];

export function PlayerTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  const label: Record<string, string> = {
    Home: t.home, Play: t.search, Cups: t.cups, Me: t.me,
  };
  const activeRoute = state.routes[state.index]?.name;

  return (
    <View
      style={{
        height: 66 + insets.bottom,
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

        return (
          <Pressable
            key={item.label}
            accessibilityRole="tab"
            accessibilityLabel={label[item.label] ?? item.label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              navigation.navigate(item.route as never);
            }}
            style={{ flex: 1, alignItems: 'center', paddingTop: 10, gap: 4 }}
          >
            <View
              style={{
                width: 20,
                height: 2,
                borderRadius: 2,
                marginBottom: 4,
                backgroundColor: active ? gold.base : 'transparent',
              }}
            />
            <item.Icon size={21} color={color} />
            <Txt size={10.5} weight="semibold" color={color}>
              {label[item.label] ?? item.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
