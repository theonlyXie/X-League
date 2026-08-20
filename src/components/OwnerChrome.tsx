import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './Txt';
import { useI18n } from '@/i18n';
import { gold, ink, onOperative, operative, radius, void_ } from '@/theme/tokens';
import { VENUE } from '@/data/owner';
import { useMyVenueSubmission } from '@/state/venues';
import type { TabBarProps } from './tabBarTypes';

const ROUTES = ['index', 'calendar', 'bookings', 'customers', 'more'] as const;
const LABELS = [
  'ownerTabs.today',
  'ownerTabs.calendar',
  'ownerTabs.bookings',
  'ownerTabs.customers',
  'ownerTabs.more',
] as const;

export function OwnerTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
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
      {ROUTES.map((route, i) => {
        const label = t(LABELS[i]!);
        const active = route === activeRoute;
        const color = active ? ink : onOperative.dim;
        return (
          <Pressable
            key={route}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              navigation.navigate(route as never);
            }}
            style={{ flex: 1, alignItems: 'center', paddingTop: 11, gap: 7 }}
          >
            <View
              style={{ width: 16, height: 2, borderRadius: 2, backgroundColor: active ? ink : 'transparent' }}
            />
            <Txt size={10.5} weight="semibold" color={color}>
              {label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function OwnerHeader() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useI18n();
  const { mine } = useMyVenueSubmission();
  const venueName = mine?.status === 'approved' ? mine.name : VENUE.name;
  const shift =
    mine?.status === 'approved' ? t('owner.shiftOwner', { area: mine.area }) : VENUE.shift;

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
        <View style={{ gap: 2, flex: 1 }}>
          <Txt size={18} weight="bold" em={-0.02} color={ink}>
            {venueName}
          </Txt>
          <Txt size={11} color={onOperative.muted}>
            {shift}
          </Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('owner.leaveOwner')}
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
            {t('owner.switchPlayer')}
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}
