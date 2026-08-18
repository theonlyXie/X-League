import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './Txt';
import { gold, ink, onOperative, operative, radius, void_ } from '@/theme/tokens';
import { VENUE } from '@/data/owner';
import type { TabBarProps } from './tabBarTypes';

/**
 * Owner mode runs in Operative: bone surfaces, denser type, 8–12 px corners.
 * It is shift software, so the active tab is ink rather than gold — gold stays
 * reserved for money and for the app-sourced booking.
 */
const ITEMS: { label: string; route?: string }[] = [
  { label: 'Today', route: 'index' },
  { label: 'Calendar', route: 'calendar' },
  { label: 'Bookings' },
  { label: 'Customers' },
  { label: 'More' },
];

export function OwnerTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const activeRoute = state.routes[state.index]?.name;

  return (
    <View
      style={{
        height: 78 + insets.bottom,
        paddingBottom: insets.bottom,
        borderTopWidth: 1,
        borderTopColor: onOperative.hairline,
        backgroundColor: operative.band,
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 6,
      }}
    >
      {ITEMS.map((item) => {
        const active = !!item.route && item.route === activeRoute;
        const color = active ? ink : onOperative.dim;
        return (
          <Pressable
            key={item.label}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active, disabled: !item.route }}
            disabled={!item.route}
            onPress={() => {
              if (!item.route || active) return;
              navigation.navigate(item.route as never);
            }}
            style={{ flex: 1, alignItems: 'center', paddingTop: 11, gap: 7 }}
          >
            <View
              style={{ width: 16, height: 2, borderRadius: 2, backgroundColor: active ? ink : 'transparent' }}
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

/**
 * The venue header. Its OWNER chip is the workspace switch back to Player Mode
 * — RBAC-005: more than one role under one identity, no sign-out.
 */
export function OwnerHeader() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ backgroundColor: operative.bg, paddingTop: insets.top }}>
      <View
        style={{
          paddingTop: 4,
          paddingHorizontal: 18,
          paddingBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottomWidth: 1,
          borderBottomColor: onOperative.edge,
        }}
      >
        <View style={{ gap: 2 }}>
          <Txt size={18} weight="bold" em={-0.02} color={ink}>
            {VENUE.name}
          </Txt>
          <Txt size={11} color={onOperative.muted}>
            {VENUE.shift}
          </Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Owner workspace. Switch back to player mode"
          hitSlop={12}
          onPress={() => router.replace('/')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            paddingVertical: 5,
            paddingHorizontal: 10,
            borderRadius: radius.denseChip,
            backgroundColor: void_.bg,
          }}
        >
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: 'rgba(198,163,75,.8)',
              backgroundColor: void_.disc,
            }}
          />
          <Txt size={10} weight="bold" em={0.12} color={gold.base}>
            OWNER
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}
