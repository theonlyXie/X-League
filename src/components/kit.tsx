import { ReactNode, useMemo, useRef, useEffect } from 'react';
import { Image, Modal, Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import { TextInput } from './TextField';
import { Txt } from './Txt';
import { hitSlopTo44 } from './ui';
import { ArrowLeft, CheckCircle, ChevronLeft, ChevronRight, Close, Search, Star } from './icons';
import { face } from '@/theme/typography';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { useI18n } from '@/i18n';

/**
 * The redesign's building blocks.
 *
 * The layouts, the hierarchy and the flow come from the SportEase community
 * file the redesign is based on; every colour, face and radius comes from
 * `tokens.ts`. Where the source draws blue on white, this draws gold on void —
 * the source's structure in X League's clothes, never the other way round.
 *
 * Nothing here fetches. Each piece is handed what it shows, so a screen that
 * could not reach the server can still say so in its own words.
 */

/* ------------------------------------------------------------------------ */
/* Pictures                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * A pitch, drawn. Stands in wherever a venue has no photograph yet — which
 * today is every venue — so a card has a picture without the product
 * inventing one. The mowing stripes and the lines are gold at a whisper on the
 * void, the same idiom as the turf swatch it replaces.
 */
export function PitchArt({ height, round = 0 }: { height: number; round?: number }) {
  const stripes = 12;
  return (
    <View style={{ height, borderRadius: round, overflow: 'hidden', backgroundColor: '#0C0B09' }}>
      <Svg width="100%" height="100%" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <SvgGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#080808" stopOpacity="0" />
            <Stop offset="1" stopColor="#080808" stopOpacity="0.7" />
          </SvgGradient>
          <SvgGradient id="glow" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#C6A34B" stopOpacity="0.10" />
            <Stop offset="0.6" stopColor="#C6A34B" stopOpacity="0" />
          </SvgGradient>
        </Defs>
        {Array.from({ length: stripes }).map((_, i) =>
          i % 2 ? (
            <Rect key={i} x={(400 / stripes) * i} y={0} width={400 / stripes} height={220} fill="rgba(198,163,75,.035)" />
          ) : null,
        )}
        <Rect x={0} y={0} width={400} height={220} fill="url(#glow)" />
        <Rect x={34} y={24} width={332} height={172} rx={2} stroke="rgba(198,163,75,.3)" strokeWidth={1.5} fill="none" />
        <Path d="M200 24v172" stroke="rgba(198,163,75,.3)" strokeWidth={1.5} />
        <Circle cx={200} cy={110} r={30} stroke="rgba(198,163,75,.3)" strokeWidth={1.5} fill="none" />
        <Circle cx={200} cy={110} r={2.5} fill="rgba(198,163,75,.45)" />
        <Rect x={34} y={70} width={48} height={80} stroke="rgba(198,163,75,.3)" strokeWidth={1.5} fill="none" />
        <Rect x={318} y={70} width={48} height={80} stroke="rgba(198,163,75,.3)" strokeWidth={1.5} fill="none" />
        <Rect x={26} y={96} width={8} height={28} stroke="rgba(198,163,75,.4)" strokeWidth={1.5} fill="none" />
        <Rect x={366} y={96} width={8} height={28} stroke="rgba(198,163,75,.4)" strokeWidth={1.5} fill="none" />
        <Rect x={0} y={0} width={400} height={220} fill="url(#fade)" />
      </Svg>
    </View>
  );
}

/** True for an address an Image can actually load. */
export const isPhoto = (uri?: string | null): uri is string => !!uri && /^https?:\/\//i.test(uri);

/** The venue's photograph when it has one, the drawn pitch when it does not. */
export function VenuePhoto({
  uri,
  height,
  round = 0,
  style,
}: {
  uri?: string | null;
  height: number;
  round?: number;
  style?: StyleProp<ViewStyle>;
}) {
  // Only a real address is a photograph. The seed data carries
  // `placeholder://pitch-0`, which an Image would draw as nothing at all.
  if (!isPhoto(uri)) {
    return (
      <View style={style}>
        <PitchArt height={height} round={round} />
      </View>
    );
  }
  return (
    <View style={[{ height, borderRadius: round, overflow: 'hidden', backgroundColor: void_.inset }, style]}>
      <Image source={{ uri: uri! }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
    </View>
  );
}

/* ------------------------------------------------------------------------ */
/* Headers                                                                   */
/* ------------------------------------------------------------------------ */

/** Back, a title, and room on the far side for an action. */
export function BackHeader({
  title,
  subtitle,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: onVoid.edgeFaint,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.back}
        hitSlop={8}
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
      >
        <ChevronLeft size={22} color={onVoid.primary} />
      </Pressable>
      <View style={{ flex: 1, gap: 1 }}>
        <Txt size={18} weight="bold" em={-0.01} color={onVoid.primary} numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt size={11.5} weight="semibold" color={gold.base} numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** A section's title, with an optional action on the far side. */
export function SectionTitle({
  title,
  action,
  onAction,
  right,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Txt size={17} weight="bold" em={-0.01} color={onVoid.primary} style={{ flexShrink: 1 }}>
        {title}
      </Txt>
      {right}
      {action && onAction ? (
        <Pressable accessibilityRole="link" accessibilityLabel={action} hitSlop={12} onPress={onAction}>
          <Txt size={12.5} weight="semibold" color={gold.base}>
            {action}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------------ */
/* Search and filters                                                        */
/* ------------------------------------------------------------------------ */

/**
 * The search field. Given `onPress` and no `onChangeText` it is a door —
 * Home's field opens the Search tab rather than pretending to search in place.
 */
export function SearchField({
  value,
  onChangeText,
  onPress,
  placeholder,
  autoFocus,
}: {
  value?: string;
  onChangeText?: (text: string) => void;
  onPress?: () => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const { t, rtl } = useI18n();
  const box: ViewStyle = {
    height: 48,
    borderRadius: radius.row,
    borderWidth: 1,
    borderColor: onVoid.line,
    backgroundColor: void_.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  };

  if (!onChangeText) {
    return (
      <Pressable
        accessibilityRole="search"
        accessibilityLabel={placeholder}
        onPress={onPress}
        style={({ pressed }) => [box, pressed ? { borderColor: goldAlpha.edge } : null]}
      >
        <Search size={18} color={onVoid.faint} />
        <Txt size={14.5} color={onVoid.disabled}>
          {placeholder}
        </Txt>
      </Pressable>
    );
  }

  return (
    <View style={box}>
      <Search size={18} color={value ? gold.base : onVoid.faint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={onVoid.disabled}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel={placeholder}
        style={{
          flex: 1,
          height: '100%',
          color: onVoid.primary,
          fontFamily: face.regular,
          fontSize: 15,
          textAlign: rtl ? 'right' : 'left',
        }}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.clearSearch}
          hitSlop={10}
          onPress={() => onChangeText('')}
        >
          <Close size={17} color={onVoid.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A rounded pill: the Filter / Sort / Rating row, and every chip like it. */
export function Pill({
  label,
  on,
  onPress,
  icon,
  size = 'md',
}: {
  label: string;
  on?: boolean;
  onPress?: () => void;
  icon?: ReactNode;
  size?: 'sm' | 'md';
}) {
  const h = size === 'sm' ? 30 : 36;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={on !== undefined ? { selected: on } : undefined}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={!onPress}
      hitSlop={hitSlopTo44(h)}
      style={({ pressed }) => ({
        height: h,
        paddingHorizontal: size === 'sm' ? 11 : 14,
        borderRadius: radius.pill,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: on ? goldAlpha.accent : pressed ? goldAlpha.edge : onVoid.line,
        backgroundColor: on ? goldAlpha.fill : 'transparent',
      })}
    >
      <Txt size={size === 'sm' ? 11.5 : 12.5} weight={on ? 'bold' : 'semibold'} color={on ? gold.base : onVoid.secondary}>
        {label}
      </Txt>
      {icon}
    </Pressable>
  );
}

/** A small label laid over a picture — "9 PM", "Verified". */
export function Tag({ label, tone = 'plain' }: { label: string; tone?: 'plain' | 'gold' }) {
  return (
    <View
      style={{
        paddingVertical: 4,
        paddingHorizontal: 9,
        borderRadius: radius.pill,
        backgroundColor: tone === 'gold' ? gold.base : 'rgba(8,8,8,.78)',
        borderWidth: tone === 'gold' ? 0 : 1,
        borderColor: onVoid.hairline,
      }}
    >
      <Txt size={10.5} weight="bold" em={0.02} color={tone === 'gold' ? void_.bg : onVoid.primary}>
        {label}
      </Txt>
    </View>
  );
}

/**
 * The filter sheet: categories down one side, the choices for the chosen one
 * on the other, Reset and Apply along the bottom.
 */
export type SheetGroup = {
  key: string;
  label: string;
  options: { key: string; label: string }[];
};

export function FilterSheet({
  open,
  onClose,
  groups,
  value,
  onChange,
  onReset,
  onApply,
  active,
  onActive,
}: {
  open: boolean;
  onClose: () => void;
  groups: SheetGroup[];
  value: Record<string, string>;
  onChange: (group: string, option: string) => void;
  onReset: () => void;
  onApply: () => void;
  active: string;
  onActive: (group: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const group = groups.find((g) => g.key === active) ?? groups[0];

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.close}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.6)' }}
      />
      <View
        style={{
          backgroundColor: void_.surface,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          borderTopWidth: 1,
          borderColor: onVoid.edge,
          paddingBottom: insets.bottom,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: onVoid.edgeFaint,
          }}
        >
          <Txt size={17} weight="bold" color={onVoid.primary}>
            {t.filterAndSort}
          </Txt>
          <Pressable accessibilityRole="button" accessibilityLabel={t.close} hitSlop={10} onPress={onClose}>
            <Close size={20} color={onVoid.muted} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', minHeight: 260 }}>
          <View style={{ width: 128, backgroundColor: void_.bg, borderRightWidth: 1, borderRightColor: onVoid.edgeFaint }}>
            {groups.map((g) => {
              const on = g.key === group.key;
              return (
                <Pressable
                  key={g.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={g.label}
                  onPress={() => onActive(g.key)}
                  style={{
                    paddingVertical: 16,
                    paddingHorizontal: 16,
                    borderLeftWidth: 3,
                    borderLeftColor: on ? gold.base : 'transparent',
                    backgroundColor: on ? void_.surface : 'transparent',
                  }}
                >
                  <Txt size={13} weight={on ? 'bold' : 'semibold'} color={on ? gold.base : onVoid.muted}>
                    {g.label}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flex: 1, paddingVertical: 6 }}>
            {group.options.map((o) => {
              const on = value[group.key] === o.key;
              return (
                <Pressable
                  key={o.key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={o.label}
                  onPress={() => onChange(group.key, o.key)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 14,
                    paddingHorizontal: 18,
                  }}
                >
                  <Radio on={on} />
                  <Txt size={14} color={on ? onVoid.primary : onVoid.secondary}>
                    {o.label}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: onVoid.edgeFaint,
          }}
        >
          <ActionButton label={t.reset} variant="ghost" onPress={onReset} flex />
          <ActionButton label={t.apply} onPress={onApply} flex />
        </View>
      </View>
    </Modal>
  );
}

export function Radio({ on }: { on: boolean }) {
  return (
    <View
      style={{
        width: 20,
        height: 20,
        borderRadius: radius.pill,
        borderWidth: 2,
        borderColor: on ? gold.base : onVoid.line,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {on ? <View style={{ width: 9, height: 9, borderRadius: radius.pill, backgroundColor: gold.base }} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------------------ */
/* Venue cards                                                               */
/* ------------------------------------------------------------------------ */

export type CardVenue = {
  venueId: string;
  name: string;
  area: string | null;
  distanceKm: number | null;
  ratingAvg: number | null;
  ratingCount: number;
  minPriceEgp: number;
  coverUrl: string | null;
  verified?: boolean;
  /** The next hour for sale, already formatted. */
  nextSlot?: string | null;
  openSlots?: number;
};

/**
 * The feed card: a picture with its tags on top, and the facts in a panel laid
 * over its lower edge — name and rating on one line, where and how much on the
 * next.
 */
export function VenueCard({ venue, onPress }: { venue: CardVenue; onPress?: () => void }) {
  const { t, num, money } = useI18n();
  const soldOut = venue.openSlots === 0;
  const where = [venue.area, venue.distanceKm != null ? t.kmAway(num(venue.distanceKm)) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[venue.name, where, venue.minPriceEgp > 0 ? t.fromPerHour(money(venue.minPriceEgp)) : null]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        borderRadius: radius.card,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: pressed ? goldAlpha.edge : onVoid.edge,
        backgroundColor: void_.surface,
        opacity: soldOut ? 0.6 : 1,
      })}
    >
      <VenuePhoto uri={venue.coverUrl} height={196} />
      <View style={{ position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', gap: 6 }}>
        {venue.nextSlot ? <Tag label={t.nextAt(venue.nextSlot)} tone="gold" /> : null}
        {venue.openSlots ? <Tag label={t.slotsCount(num(venue.openSlots))} /> : null}
        {soldOut ? <Tag label={t.fullTonight} /> : null}
        <View style={{ flex: 1 }} />
        {venue.verified ? <Tag label={t.verified} /> : null}
      </View>
      <View
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          bottom: 10,
          borderRadius: radius.row,
          backgroundColor: 'rgba(14,14,14,.94)',
          borderWidth: 1,
          borderColor: onVoid.edge,
          paddingVertical: 11,
          paddingHorizontal: 13,
          gap: 5,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <Txt size={15.5} weight="bold" color={onVoid.primary} numberOfLines={1} style={{ flexShrink: 1 }}>
            {venue.name}
          </Txt>
          {venue.ratingAvg != null ? <Rating value={venue.ratingAvg} count={venue.ratingCount} /> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <Txt size={11.5} color={onVoid.faint} numberOfLines={1} style={{ flexShrink: 1 }}>
            {where}
          </Txt>
          {venue.minPriceEgp > 0 ? (
            <Txt size={11} color={onVoid.faint}>
              <Txt size={13.5} weight="bold" color={onVoid.primary}>
                {money(venue.minPriceEgp)}
              </Txt>
              {` ${t.onwards}`}
            </Txt>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Book again: a smaller card, for a horizontal row. */
export function CompactVenueCard({
  name,
  area,
  coverUrl,
  detail,
  onPress,
}: {
  name: string;
  area: string | null;
  coverUrl: string | null;
  detail?: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[name, area].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 164,
        borderRadius: radius.cardInner,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: pressed ? goldAlpha.edge : onVoid.edge,
        backgroundColor: void_.surface,
      })}
    >
      <VenuePhoto uri={coverUrl} height={104} />
      <View style={{ padding: 12, gap: 4 }}>
        <Txt size={14} weight="bold" color={onVoid.primary} numberOfLines={1}>
          {name}
        </Txt>
        {area ? (
          <Txt size={11.5} color={onVoid.faint} numberOfLines={1}>
            {area}
          </Txt>
        ) : null}
        {detail ? (
          <Txt size={11} color={gold.base} numberOfLines={1}>
            {detail}
          </Txt>
        ) : null}
      </View>
    </Pressable>
  );
}

/** A result row: picture on one side, the facts on the other. */
export function VenueRow({ venue, onPress }: { venue: CardVenue; onPress?: () => void }) {
  const { t, num, money } = useI18n();
  const soldOut = venue.openSlots === 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[venue.name, venue.area].filter(Boolean).join(', ')}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 12,
        padding: 10,
        borderRadius: radius.cardInner,
        borderWidth: 1,
        borderColor: pressed ? goldAlpha.edge : onVoid.edgeFaint,
        backgroundColor: void_.surface,
        opacity: soldOut ? 0.6 : 1,
      })}
    >
      <VenuePhoto uri={venue.coverUrl} height={96} round={radius.row} style={{ width: 104 }} />
      <View style={{ flex: 1, gap: 4, paddingVertical: 2 }}>
        <Txt size={15} weight="bold" color={onVoid.primary} numberOfLines={1}>
          {venue.name}
        </Txt>
        {venue.ratingAvg != null ? <Rating value={venue.ratingAvg} count={venue.ratingCount} /> : null}
        <Txt size={11.5} color={onVoid.faint} numberOfLines={1}>
          {[venue.area, venue.distanceKm != null ? t.kmAway(num(venue.distanceKm)) : null].filter(Boolean).join(' · ')}
        </Txt>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {soldOut ? (
            <Txt size={11.5} color={burgundy.onVoid}>
              {t.fullTonight}
            </Txt>
          ) : venue.nextSlot ? (
            <Txt size={11.5} weight="bold" color={gold.base}>
              {t.nextAt(venue.nextSlot)}
            </Txt>
          ) : (
            <View />
          )}
          {venue.minPriceEgp > 0 ? (
            <Txt size={12.5} weight="bold" color={onVoid.primary}>
              {money(venue.minPriceEgp)}
              <Txt size={10.5} color={onVoid.faint}>{` ${t.onwards}`}</Txt>
            </Txt>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export function Rating({ value, count }: { value: number; count: number }) {
  const { num } = useI18n();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Star size={12} color={gold.base} />
      <Txt size={12} weight="semibold" color={onVoid.primary}>
        {num(value)}
      </Txt>
      <Txt size={11.5} color={onVoid.faint}>
        ({num(count)})
      </Txt>
    </View>
  );
}

/* ------------------------------------------------------------------------ */
/* Booking                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * The month over a row of day cards. Two weeks, because a slot further out
 * than that is not something anyone here books on a phone.
 */
export function DateStrip({
  value,
  days,
  onPick,
}: {
  /** `YYYY-MM-DD`. */
  value: string;
  /** `YYYY-MM-DD`, in order. */
  days: string[];
  onPick: (date: string) => void;
}) {
  const { locale, num } = useI18n();
  const scroller = useRef<ScrollView>(null);
  const index = Math.max(0, days.indexOf(value));
  const tag = locale === 'ar' ? 'ar-EG' : 'en-GB';

  // Noon UTC, so the day never slides across midnight in any zone.
  const at = (d: string) => new Date(`${d}T12:00:00Z`);
  const month = useMemo(
    () => at(value).toLocaleDateString(tag, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    [value, tag],
  );

  useEffect(() => {
    scroller.current?.scrollTo({ x: Math.max(0, index * 70 - 70), animated: true });
  }, [index]);

  const step = (by: number) => {
    const next = days[Math.min(days.length - 1, Math.max(0, index + by))];
    if (next && next !== value) onPick(next);
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="‹" hitSlop={10} onPress={() => step(-1)} disabled={index === 0}>
          <ChevronLeft size={18} color={index === 0 ? onVoid.disabled : gold.base} />
        </Pressable>
        <Txt size={15} weight="bold" color={gold.base}>
          {month}
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="›"
          hitSlop={10}
          onPress={() => step(1)}
          disabled={index === days.length - 1}
        >
          <ChevronRight size={18} color={index === days.length - 1 ? onVoid.disabled : gold.base} />
        </Pressable>
      </View>
      <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
        {days.map((d) => {
          const on = d === value;
          const date = at(d);
          const weekday = date.toLocaleDateString(tag, { weekday: 'short', timeZone: 'UTC' });
          return (
            <Pressable
              key={d}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={date.toLocaleDateString(tag, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
              onPress={() => onPick(d)}
              style={{
                width: 62,
                height: 68,
                borderRadius: radius.row,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                borderWidth: 1,
                borderColor: on ? gold.base : onVoid.line,
                backgroundColor: on ? gold.base : void_.surface,
              }}
            >
              <Txt size={19} weight="bold" color={on ? void_.bg : onVoid.primary}>
                {num(date.getUTCDate())}
              </Txt>
              <Txt size={11} weight="semibold" color={on ? void_.bg : onVoid.faint}>
                {weekday}
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** A label, then a row of choices: "Pitch  [A] [B]". */
export function Segmented<K extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { key: K; label: string; disabled?: boolean }[];
  value: K | null;
  onPick: (key: K) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Txt size={14} weight="semibold" color={onVoid.secondary} style={{ minWidth: 72 }}>
        {label}
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <Pressable
              key={o.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: o.disabled }}
              accessibilityLabel={o.label}
              disabled={o.disabled}
              onPress={() => onPick(o.key)}
              style={{
                height: 42,
                minWidth: 64,
                paddingHorizontal: 14,
                borderRadius: radius.chip,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: on ? gold.base : onVoid.line,
                backgroundColor: on ? gold.base : o.disabled ? void_.inset : 'transparent',
              }}
            >
              <Txt size={13} weight={on ? 'bold' : 'semibold'} color={on ? void_.bg : o.disabled ? onVoid.disabled : onVoid.secondary}>
                {o.label}
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** One hour for sale: the time, its price, and a tick when it is the one chosen. */
export function SlotRow({
  label,
  price,
  selected,
  taken,
  takenLabel,
  onPress,
}: {
  label: string;
  price?: string | null;
  selected: boolean;
  taken: boolean;
  takenLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: taken }}
      accessibilityLabel={taken ? `${label}, ${takenLabel}` : [label, price].filter(Boolean).join(', ')}
      disabled={taken}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        height: 56,
        paddingHorizontal: 18,
        borderRadius: radius.row,
        borderWidth: 1,
        borderColor: selected ? gold.base : pressed ? goldAlpha.edge : onVoid.line,
        backgroundColor: selected ? goldAlpha.fill : taken ? 'transparent' : void_.surface,
        opacity: taken ? 0.55 : 1,
      })}
    >
      <Txt
        size={14}
        weight={selected ? 'bold' : 'semibold'}
        color={taken ? onVoid.disabled : onVoid.primary}
        style={[{ flex: 1 }, taken ? { textDecorationLine: 'line-through' } : null]}
      >
        {label}
      </Txt>
      <Txt size={12.5} weight="semibold" color={taken ? onVoid.disabled : selected ? gold.base : onVoid.muted}>
        {taken ? takenLabel : price}
      </Txt>
      {taken ? null : <CheckCircle size={20} color={selected ? gold.base : onVoid.dim} filled={selected} />}
    </Pressable>
  );
}

/* ------------------------------------------------------------------------ */
/* Surfaces                                                                  */
/* ------------------------------------------------------------------------ */

/** The bar pinned to the foot of a screen, above the home indicator. */
export function StickyFooter({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: 12,
        paddingHorizontal: 20,
        paddingBottom: 12 + insets.bottom,
        borderTopWidth: 1,
        borderTopColor: onVoid.edgeFaint,
        backgroundColor: void_.chrome,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
      }}
    >
      {children}
    </View>
  );
}

/** A plain card. */
export function Card({ children, style, pad = 16 }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: number }) {
  return (
    <View
      style={[
        {
          borderRadius: radius.cardInner,
          borderWidth: 1,
          borderColor: onVoid.edge,
          backgroundColor: void_.surface,
          padding: pad,
          gap: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A label and a value, for summaries and price breakdowns. */
export function KeyValue({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <Txt size={strong ? 14.5 : 13} weight={strong ? 'bold' : 'regular'} color={strong ? onVoid.primary : onVoid.muted}>
        {label}
      </Txt>
      <Txt
        size={strong ? 16 : 13.5}
        weight={strong ? 'bold' : 'semibold'}
        color={strong ? gold.base : onVoid.primary}
        style={{ flexShrink: 1, textAlign: 'right' }}
      >
        {value}
      </Txt>
    </View>
  );
}

/** The account menu: rows in a card, divided by hairlines. */
export function MenuGroup({ children }: { children: ReactNode }) {
  const rows = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View
      style={{
        width: '100%',
        borderRadius: radius.cardInner,
        borderWidth: 1,
        borderColor: onVoid.edge,
        backgroundColor: void_.surface,
        overflow: 'hidden',
      }}
    >
      {rows.map((row, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: onVoid.edgeFaint } : null}>
          {row}
        </View>
      ))}
    </View>
  );
}

/** One row of the account menu: an icon in a tile, a title, a line under it. */
export function MenuRow({
  icon,
  title,
  detail,
  onPress,
  tone = 'plain',
  right,
}: {
  icon: ReactNode;
  title: string;
  detail?: string | null;
  onPress?: () => void;
  tone?: 'plain' | 'danger';
  right?: ReactNode;
}) {
  const danger = tone === 'danger';
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 13,
        paddingHorizontal: 14,
        backgroundColor: pressed ? goldAlpha.fillSoft : 'transparent',
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: radius.icon,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: danger ? 'rgba(101,21,37,.18)' : goldAlpha.fill,
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={14.5} weight="semibold" color={danger ? burgundy.action : onVoid.primary}>
          {title}
        </Txt>
        {detail ? (
          <Txt size={11.5} color={onVoid.faint} numberOfLines={2}>
            {detail}
          </Txt>
        ) : null}
      </View>
      {right ?? (onPress ? <ChevronRight size={16} color={onVoid.dim} /> : null)}
    </Pressable>
  );
}

/** The primary action, in the redesign's proportions: tall, full-width, 14 corners. */
export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  flex,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  flex?: boolean;
  icon?: ReactNode;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: flex ? 1 : undefined,
        height: 50,
        borderRadius: radius.row,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: primary ? (pressed ? gold.hover : gold.base) : 'transparent',
        borderWidth: primary ? 0 : 1,
        borderColor: variant === 'danger' ? 'rgba(196,120,138,.45)' : pressed ? goldAlpha.accent : goldAlpha.edge,
        opacity: disabled ? 0.45 : 1,
      })}
    >
      {icon}
      <Txt size={15} weight="bold" color={primary ? void_.bg : variant === 'danger' ? burgundy.action : gold.base}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** A thin back arrow in a disc, for laying over a picture. */
export function FloatingIcon({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={{
        width: 38,
        height: 38,
        borderRadius: radius.pill,
        backgroundColor: 'rgba(8,8,8,.72)',
        borderWidth: 1,
        borderColor: onVoid.hairline,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children ?? <ArrowLeft size={18} color={onVoid.primary} />}
    </Pressable>
  );
}

/** The error band every live screen uses when the server could not be reached. */
export function Unreachable({ label, onRetry }: { label: string; onRetry?: () => void }) {
  return (
    <Pressable
      accessibilityRole="alert"
      accessibilityLabel={label}
      onPress={onRetry}
      disabled={!onRetry}
      style={{
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: radius.chip,
        borderWidth: 1,
        borderColor: 'rgba(101,21,37,.5)',
        backgroundColor: 'rgba(101,21,37,.09)',
      }}
    >
      <Txt size={12.5} weight="semibold" color={burgundy.action}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** The status-bar inset, for a screen that draws its own header. */
export function SafeTop() {
  const insets = useSafeAreaInsets();
  return <View style={{ height: insets.top }} />;
}
