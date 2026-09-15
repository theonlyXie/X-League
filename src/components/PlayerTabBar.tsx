import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './Txt';
import { gold, onVoid, void_ } from '@/theme/tokens';
import type { TabBarProps } from './tabBarTypes';
import { useI18n } from '@/i18n';

/**
 * Labelled tabs with a gold tick on the active one, matching the spec's player
 * IA (§3.1).
 *
 * Four rather than five: Chat is gone, and with it the room this product used
 * to run its own messaging in. What is left of a conversation is a button that
 * opens WhatsApp, which belongs beside the person it reaches rather than in a
 * tab of its own.
 *
 * No badge here any more. The count used to sit on Me, one tab away from a
 * Notifications row buried in that screen — so being told something had
 * arrived and being able to read it were two different gestures. It is now on
 * a bell on the screen you are already looking at, which is both the telling
 * and the way in.
 */
const ITEMS: { label: string; route: string }[] = [
  { label: 'Home', route: 'index' },
  { label: 'Play', route: 'play' },
  { label: 'Cups', route: 'cups' },
  { label: 'Me', route: 'me' },
];

export function PlayerTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

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
            <Txt size={10.5} weight="semibold" color={color}>
              {label[item.label] ?? item.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
