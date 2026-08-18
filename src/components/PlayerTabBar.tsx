import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './Txt';
import { gold, onVoid, radius, void_ } from '@/theme/tokens';
import type { TabBarProps } from './tabBarTypes';

/**
 * The five-tab bar from option 1h, model one — labelled tabs with a gold tick
 * on the active one, matching the spec's player IA (§3.1) one-to-one.
 *
 * Cups and Chat are drawn but inert: the design ships no screens behind them,
 * and inventing some would be inventing product.
 */
const ITEMS: { label: string; route?: string }[] = [
  { label: 'Home', route: 'index' },
  { label: 'Play', route: 'play' },
  { label: 'Cups' },
  { label: 'Chat' },
  { label: 'Me', route: 'me' },
];

export function PlayerTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
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
        const active = !!item.route && item.route === activeRoute;
        const color = active ? gold.base : onVoid.dim;
        const enabled = !!item.route;

        return (
          <Pressable
            key={item.label}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active, disabled: !enabled }}
            disabled={!enabled}
            onPress={() => {
              if (!item.route || active) return;
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
              {item.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
