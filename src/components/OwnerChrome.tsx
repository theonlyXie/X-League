import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './Txt';
import { gold, ink, onOperative, operative, radius, void_ } from '@/theme/tokens';
import { VENUE } from '@/data/owner';
import { useSession } from '@/state/session';
import type { TabBarProps } from './tabBarTypes';
import { useI18n } from '@/i18n';

/**
 * Owner mode runs in Operative: bone surfaces, denser type, 8–12 px corners.
 * It is shift software, so the active tab is ink rather than gold — gold stays
 * reserved for money and for the app-sourced booking.
 *
 * The last three tabs were drawn but inert. They now carry the rest of §4.5:
 * what the venue is owed (O-06), what players said (O-08), and the
 * configuration behind both (O-03, O-04, O-05, O-07).
 */
const ITEMS: { label: string; route: string }[] = [
  { label: 'Today', route: 'index' },
  { label: 'Calendar', route: 'calendar' },
  { label: 'Money', route: 'money' },
  { label: 'Reviews', route: 'reviews' },
  { label: 'Setup', route: 'setup' },
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
        const active = item.route === activeRoute;
        const color = active ? ink : onOperative.dim;
        return (
          <Pressable
            key={item.label}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
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
  const { t, longDate } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { venues } = useSession();
  const venue = venues[0] ?? null;

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
          {/* The venue this person actually works at. Every owner screen used
              to be headed "Stadium One · Tue 18 Aug · evening shift" whoever
              was signed in and whatever the date — a fixture in the one place
              a header is meant to tell you where you are. */}
          <Txt size={18} weight="bold" em={-0.02} color={ink} numberOfLines={1}>
            {venue?.name ?? VENUE.name}
          </Txt>
          <Txt size={11} color={onOperative.muted}>
            {venue ? longDate(new Date().toISOString()) : VENUE.shift}
          </Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.ownSwitchBack}
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
