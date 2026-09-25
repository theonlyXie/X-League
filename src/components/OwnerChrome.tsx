import { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './Txt';
import { Calendar, ChevronDown, Gear, Home, StarLine, Wallet } from './icons';
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
/**
 * Keys, not labels. These read from the string table like everything else —
 * all five had Arabic sitting in it, unused, while the bar rendered English
 * on every Owner Mode screen in both languages. Key parity could never catch
 * that: a hardcoded label has no missing key to report.
 */
type OwnerTabKey = 'ownTabToday' | 'ownTabCalendar' | 'ownTabMoney' | 'ownTabReviews' | 'ownTabSetup';

/**
 * Each tab carries an icon over its label, as the redesign's bar does — a
 * manager glancing down mid-shift finds a shape faster than a word.
 */
const ITEMS: { key: OwnerTabKey; route: string; Icon: (p: { size?: number; color: string }) => ReactNode }[] = [
  { key: 'ownTabToday', route: 'index', Icon: Home },
  { key: 'ownTabCalendar', route: 'calendar', Icon: Calendar },
  { key: 'ownTabMoney', route: 'money', Icon: Wallet },
  { key: 'ownTabReviews', route: 'reviews', Icon: StarLine },
  { key: 'ownTabSetup', route: 'setup', Icon: Gear },
];

export function OwnerTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const activeRoute = state.routes[state.index]?.name;

  return (
    <View
      style={{
        height: 64 + insets.bottom,
        paddingBottom: insets.bottom,
        borderTopWidth: 1,
        borderTopColor: onOperative.hairline,
        backgroundColor: operative.surface,
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 6,
      }}
    >
      {ITEMS.map((item) => {
        const active = item.route === activeRoute;
        const color = active ? ink : onOperative.dim;
        const label = t[item.key];
        return (
          <Pressable
            key={item.route}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              navigation.navigate(item.route as never);
            }}
            style={{ flex: 1, alignItems: 'center', gap: 4 }}
          >
            {/* The bar across the top of the active tab, kept from before: ink,
                not gold, on shift software. */}
            <View
              style={{ width: 22, height: 2, borderRadius: 2, backgroundColor: active ? ink : 'transparent' }}
            />
            <View style={{ paddingTop: 5 }}>
              <item.Icon size={21} color={color} />
            </View>
            <Txt size={10.5} weight={active ? 'bold' : 'semibold'} color={color} numberOfLines={1}>
              {label}
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
  const { venues, activeVenue, setActiveVenue } = useSession();
  const venue = activeVenue;

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
          {/* A manager of two venues could only ever operate the first: every
              owner screen read `venues[0]` and no picker existed anywhere, so
              the second venue was invisible from every screen in the product. */}
          {venues.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${venue?.name ?? ''}. ${t.ownSwitchVenue}`}
              onPress={() => {
                const i = venues.findIndex((v) => v.venueId === venue?.venueId);
                setActiveVenue(venues[(i + 1) % venues.length].venueId);
              }}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Txt size={18} weight="bold" em={-0.02} color={ink} numberOfLines={1}>
                {venue?.name ?? VENUE.name}
              </Txt>
              <ChevronDown size={14} color={onOperative.muted} />
            </Pressable>
          ) : (
            <Txt size={18} weight="bold" em={-0.02} color={ink} numberOfLines={1}>
              {venue?.name ?? VENUE.name}
            </Txt>
          )}
          <Txt size={11} color={onOperative.muted}>
            {venue ? longDate(new Date().toISOString()) : t.shShift}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <LanguageSwitch />
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
            {t.ownerBadge}
          </Txt>
        </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * The language switch, in Operative.
 *
 * Owner Mode is fully translated and had no way to change language from inside
 * it: the switch lives on the player top bar, which owner screens do not draw,
 * so a manager who opened the app in the wrong language had to go back to
 * Player Mode to fix it. Same control as the top bar's, in ink on bone rather
 * than gold on void, because on this surface gold means money.
 */
function LanguageSwitch() {
  const { locale, setLocale } = useI18n();

  return (
    <View
      style={{
        flexDirection: 'row',
        padding: 2,
        borderRadius: radius.pill,
        backgroundColor: operative.band,
        borderWidth: 1,
        borderColor: onOperative.edge,
      }}
    >
      {(['ar', 'en'] as const).map((code) => {
        const on = code === locale;
        return (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={code === 'ar' ? 'العربية' : 'English'}
            hitSlop={8}
            onPress={() => {
              if (!on) void setLocale(code);
            }}
            style={{
              paddingVertical: 3,
              paddingHorizontal: 9,
              borderRadius: radius.pill,
              backgroundColor: on ? operative.surface : 'transparent',
            }}
          >
            <Txt size={10.5} weight={on ? 'bold' : 'semibold'} color={on ? ink : onOperative.dim}>
              {code === 'ar' ? 'ع' : 'EN'}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
