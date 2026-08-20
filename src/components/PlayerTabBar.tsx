import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './Txt';
import { useI18n } from '@/i18n';
import { useMessages } from '@/state/messages';
import { gold, onVoid, void_ } from '@/theme/tokens';
import type { TabBarProps } from './tabBarTypes';

const ROUTES = ['index', 'play', 'cups', 'chat', 'me'] as const;
const LABELS = ['tabs.home', 'tabs.play', 'tabs.cups', 'tabs.chat', 'tabs.me'] as const;

export function PlayerTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { unreadTotal } = useMessages();
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
      {ROUTES.map((route, i) => {
        const label = t(LABELS[i]!);
        const active = route === activeRoute;
        const color = active ? gold.base : onVoid.dim;
        const badge = route === 'chat' && unreadTotal > 0 ? unreadTotal : 0;

        return (
          <Pressable
            key={route}
            accessibilityRole="tab"
            accessibilityLabel={badge ? `${label}, ${badge}` : label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              navigation.navigate(route as never);
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Txt size={10.5} weight="semibold" color={color}>
                {label}
              </Txt>
              {badge ? (
                <View
                  style={{
                    minWidth: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: gold.base,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 3,
                  }}
                >
                  <Txt size={8} weight="bold" color={void_.bg}>
                    {badge > 9 ? '9+' : badge}
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
