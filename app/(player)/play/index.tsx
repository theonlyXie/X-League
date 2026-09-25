import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { NotificationBell } from '@/components/NotificationBell';
import { FilterSheet, Pill, SearchField, Unreachable, VenueRow, type SheetGroup } from '@/components/kit';
import { ChevronDown, Sliders, Star } from '@/components/icons';
import { gold, onVoid } from '@/theme/tokens';
import { searchVenues, sortVenues, type VenueOrder, type VenueSummary } from '@/data/discovery';
import { useI18n } from '@/i18n';
import { dateFromToday } from '@/data/venue';
import { isLive } from '@/lib/supabase';
import { useArea } from '@/state/area';

/**
 * P-03 Search — availability first (§1.3), in the redesign's clothes.
 *
 * The redesign's Search is a text field over a list. X League's was a day and
 * a kick-off window over a list, because results only ever show slots that are
 * saleable at query time (VEN-001, VEN-002). This is both: the field narrows
 * what the availability query returned, and the day, the window, the format
 * and the order live in the filter sheet, where the redesign keeps them.
 *
 * The filters that change the question — day, window, format — are part of
 * the query rather than applied afterwards: "how many slots does this venue
 * have between 8 and 10" is a different number from "how many does it have".
 * The ones that only change the answer — the text, the order, the rating —
 * work on what came back.
 */

type DayKey = 'tonight' | 'tomorrow' | 'later';
type WindowKey = 'early' | 'prime' | 'late' | 'any';
type FormatKey = 'any' | '5-a-side' | '7-a-side' | '11-a-side';
type RatingKey = 'any' | '4';

const WINDOWS: Record<WindowKey, { from: number; to: number; label: string }> = {
  early: { from: 18, to: 20, label: '6–8 PM' },
  prime: { from: 20, to: 22, label: '8–10 PM' },
  late: { from: 22, to: 24, label: '10–12' },
  any: { from: 0, to: 24, label: '' },
};

const DAY_OFFSET: Record<DayKey, number> = { tonight: 0, tomorrow: 1, later: 2 };

/**
 * The search date, in the venue's zone.
 *
 * This was `new Date(...).toISOString().slice(0, 10)` — UTC. Cairo runs two
 * or three hours ahead, so after about 9 PM local "Tonight" resolved to
 * *yesterday*, and the server correctly refuses to sell yesterday: the screen
 * returned nothing for exactly the people browsing at peak booking hour.
 */
const isoDate = (offset: number) => dateFromToday(offset);

const RECENT_KEY = 'xl.recentSearches';

type Filters = { day: DayKey; window: WindowKey; format: FormatKey; order: VenueOrder; rating: RatingKey };
const DEFAULTS: Filters = { day: 'tonight', window: 'prime', format: 'any', order: 'near', rating: 'any' };

export default function PlaySearch() {
  const router = useRouter();
  const params = useLocalSearchParams<{ format?: string }>();
  const { t, num } = useI18n();
  const { hour } = useI18n();
  const { area } = useArea();

  const initialFormat = (['5-a-side', '7-a-side', '11-a-side'] as const).find((f) => f === params.format) ?? 'any';
  const [filters, setFilters] = useState<Filters>({ ...DEFAULTS, format: initialFormat });
  // What the sheet is editing, applied on Apply rather than on every tap, so
  // the list does not reload three times while somebody is still choosing.
  const [draft, setDraft] = useState<Filters>(filters);
  const [sheet, setSheet] = useState(false);
  const [sheetTab, setSheetTab] = useState('day');

  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [venues, setVenues] = useState<VenueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [nonce, setNonce] = useState(0);

  // Home's format tiles land here with `?format=`; follow them if the tab is
  // already mounted rather than keeping whatever it was set to last time.
  useEffect(() => {
    if (initialFormat !== 'any') setFilters((f) => ({ ...f, format: initialFormat }));
  }, [initialFormat]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => {
        const list = raw ? (JSON.parse(raw) as unknown) : [];
        if (Array.isArray(list)) setRecent(list.filter((x): x is string => typeof x === 'string').slice(0, 6));
      })
      .catch(() => {});
  }, []);

  const remember = useCallback((text: string) => {
    const q = text.trim();
    if (q.length < 2) return;
    setRecent((list) => {
      const next = [q, ...list.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const dayLabels: Record<DayKey, string> = { tonight: t.tonight, tomorrow: t.tomorrow, later: t.dayAfter };
  const windowLabel = (w: WindowKey) => (w === 'any' ? t.anyTime : WINDOWS[w].label);
  const formatLabel = (f: FormatKey) =>
    f === 'any' ? t.anyFormat : f === '5-a-side' ? t.amFiveASide : f === '7-a-side' ? t.amSevenASide : t.amElevenASide;
  const orderLabel = (o: VenueOrder) => (o === 'near' ? t.sortNearest : o === 'price' ? t.sortCheapest : t.sortTopRated);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!isLive) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setUnreachable(false);
      try {
        const rows = await searchVenues({
          date: isoDate(DAY_OFFSET[filters.day]),
          fromHour: WINDOWS[filters.window].from,
          toHour: WINDOWS[filters.window].to,
          format: filters.format === 'any' ? null : filters.format,
          governorate: area,
        });
        if (cancelled) return;
        setVenues(rows);
        setCheckedAt(new Date());
      } catch {
        if (!cancelled) setUnreachable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.day, filters.window, filters.format, area, nonce]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = venues.filter(
      (v) =>
        (!q || v.name.toLowerCase().includes(q) || (v.area ?? '').toLowerCase().includes(q)) &&
        (filters.rating === 'any' || (v.ratingAvg ?? 0) >= 4),
    );
    return sortVenues(matched, filters.order);
  }, [venues, query, filters.order, filters.rating]);

  const liveSlots = shown.reduce((sum, v) => sum + v.openSlots, 0);
  const secondsAgo = checkedAt ? Math.max(0, Math.round((Date.now() - checkedAt.getTime()) / 1000)) : 0;

  const groups: SheetGroup[] = [
    { key: 'day', label: t.filterDay, options: (Object.keys(dayLabels) as DayKey[]).map((k) => ({ key: k, label: dayLabels[k] })) },
    {
      key: 'window',
      label: t.filterKickOff,
      options: (['early', 'prime', 'late', 'any'] as WindowKey[]).map((k) => ({ key: k, label: windowLabel(k) })),
    },
    {
      key: 'format',
      label: t.format,
      options: (['any', '5-a-side', '7-a-side', '11-a-side'] as FormatKey[]).map((k) => ({ key: k, label: formatLabel(k) })),
    },
    { key: 'order', label: t.sortBy, options: (['near', 'price', 'rating'] as VenueOrder[]).map((k) => ({ key: k, label: orderLabel(k) })) },
    { key: 'rating', label: t.filterRating, options: [{ key: 'any', label: t.anyRating }, { key: '4', label: t.ratingFourPlus }] },
  ];

  const openSheet = (tab: string) => {
    setDraft(filters);
    setSheetTab(tab);
    setSheet(true);
  };

  const date = isoDate(DAY_OFFSET[filters.day]);

  return (
    <Screen
      contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 16 }}
      refreshControl={
        isLive ? <RefreshControl refreshing={loading} onRefresh={reload} tintColor={gold.base} colors={[gold.base]} /> : undefined
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt size={22} weight="bold" em={-0.02} color={onVoid.primary}>
          {t.search}
        </Txt>
        <NotificationBell />
      </View>

      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder={t.searchPitchOrArea}
      />

      {recent.length > 0 && !query ? (
        <View style={{ gap: 10 }}>
          <Txt size={13} weight="semibold" color={onVoid.muted}>
            {t.recentSearches}
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {recent.map((r) => (
              <Pill key={r} label={r} size="sm" onPress={() => setQuery(r)} />
            ))}
          </View>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -20 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
      >
        <Pill label={t.filter} icon={<Sliders size={15} color={onVoid.secondary} />} onPress={() => openSheet('day')} />
        <Pill
          label={dayLabels[filters.day]}
          on
          icon={<ChevronDown size={14} color={gold.base} />}
          onPress={() => openSheet('day')}
        />
        <Pill
          label={windowLabel(filters.window)}
          on={filters.window !== 'any'}
          icon={<ChevronDown size={14} color={filters.window !== 'any' ? gold.base : onVoid.secondary} />}
          onPress={() => openSheet('window')}
        />
        {filters.format !== 'any' ? (
          <Pill label={formatLabel(filters.format)} on onPress={() => openSheet('format')} />
        ) : null}
        <Pill
          label={orderLabel(filters.order)}
          on={filters.order !== 'near'}
          icon={<ChevronDown size={14} color={filters.order !== 'near' ? gold.base : onVoid.secondary} />}
          onPress={() => openSheet('order')}
        />
        <Pill
          label={t.ratingFourPlus}
          on={filters.rating === '4'}
          icon={<Star size={11} color={filters.rating === '4' ? gold.base : onVoid.secondary} />}
          onPress={() => setFilters((f) => ({ ...f, rating: f.rating === '4' ? 'any' : '4' }))}
        />
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Txt size={13} weight="semibold" color={onVoid.secondary}>
          {t.liveSlots(num(liveSlots))}
        </Txt>
        {/* VEN-002: results must say when availability was last confirmed. */}
        <Txt size={11} color={onVoid.disabled}>
          {loading ? t.checking : t.updatedAgo(num(secondsAgo))}
        </Txt>
      </View>

      {unreachable ? <Unreachable label={t.offline} onRetry={reload} /> : null}

      {loading && venues.length === 0 ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {!loading && shown.length === 0 && !unreachable ? (
        <Txt size={13} color={onVoid.muted}>
          {query ? t.noMatchesFor(query.trim()) : t.noVenues}
        </Txt>
      ) : null}

      <View style={{ gap: 10 }}>
        {shown.map((venue) => (
          <VenueRow
            key={venue.venueId}
            venue={{
              ...venue,
              verified: venue.verification === 'verified',
              nextSlot: venue.nextSlot ? hour(venue.nextSlot) : null,
            }}
            onPress={() => {
              remember(query);
              router.push(`/play/venue?venue=${venue.venueId}&date=${date}`);
            }}
          />
        ))}
      </View>

      <FilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        groups={groups}
        value={draft as unknown as Record<string, string>}
        onChange={(g, o) => setDraft((d) => ({ ...d, [g]: o }))}
        onReset={() => setDraft(DEFAULTS)}
        onApply={() => {
          setFilters(draft);
          setSheet(false);
        }}
        active={sheetTab}
        onActive={setSheetTab}
      />
    </Screen>
  );
}
