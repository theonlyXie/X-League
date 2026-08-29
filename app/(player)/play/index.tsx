import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Eyebrow, TurfSwatch, hitSlopTo44 } from '@/components/ui';
import { Star } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { searchVenues, type VenueSummary } from '@/data/discovery';
import { useI18n } from '@/i18n';
import { dateFromToday } from '@/data/venue';
import { isLive } from '@/lib/supabase';

/**
 * P-03 Play — availability first (§1.3). The player states date and time before
 * results are returned, and results only ever show slots that are saleable at
 * query time (VEN-001, VEN-002).
 *
 * The filters are part of the query rather than applied to a list afterwards:
 * "how many slots does this venue have between 8 and 10" is a different number
 * from "how many does it have", and showing the second under the first filter
 * would be a lie the player only discovers on the next screen.
 */

type DayKey = 'tonight' | 'tomorrow' | 'later';
type WindowKey = 'early' | 'prime' | 'late';

const WINDOWS: Record<WindowKey, { from: number; to: number; label: string }> = {
  early: { from: 18, to: 20, label: '6–8 PM' },
  prime: { from: 20, to: 22, label: '8–10 PM' },
  late: { from: 22, to: 24, label: '10–12' },
};

/**
 * The search date, in the venue's zone.
 *
 * This was `new Date(...).toISOString().slice(0, 10)` — UTC. Cairo runs two
 * or three hours ahead, so after about 9 PM local "Tonight" resolved to
 * *yesterday*, and the server correctly refuses to sell yesterday: the screen
 * returned nothing for exactly the people browsing at peak booking hour.
 */
const isoDate = (offset: number) => dateFromToday(offset);

export default function PlaySearch() {
  const router = useRouter();
  const { t, num, money, hour } = useI18n();

  const [day, setDay] = useState<DayKey>('tonight');
  const [window_, setWindow] = useState<WindowKey>('prime');
  const [venues, setVenues] = useState<VenueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [nonce, setNonce] = useState(0);

  const dayLabels: Record<DayKey, string> = {
    tonight: t.tonight,
    tomorrow: t.tomorrow,
    // Two days out, said plainly. The chip used to be labelled "Pick date",
    // which promises a picker this screen does not have.
    later: t.dayAfter,
  };
  const dayOffset: Record<DayKey, number> = { tonight: 0, tomorrow: 1, later: 2 };

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
          date: isoDate(dayOffset[day]),
          fromHour: WINDOWS[window_].from,
          toHour: WINDOWS[window_].to,
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
  }, [day, window_, nonce]);

  const liveSlots = venues.reduce((sum, v) => sum + v.openSlots, 0);
  const secondsAgo = checkedAt ? Math.max(0, Math.round((Date.now() - checkedAt.getTime()) / 1000)) : 0;

  return (
    <Screen
      contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 20 }}
      refreshControl={
        isLive ? (
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={gold.base} colors={[gold.base]} />
        ) : undefined
      }
    >
      <Txt size={22} weight="bold" em={-0.02} color={onVoid.primary}>
        {t.whenPlay}
      </Txt>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(Object.keys(dayLabels) as DayKey[]).map((d) => {
            const on = d === day;
            return (
              <Pressable
                key={d}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={dayLabels[d]}
                onPress={() => setDay(d)}
                hitSlop={hitSlopTo44(40)}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: radius.chip,
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...(on
                    ? { backgroundColor: gold.base }
                    : { borderWidth: 1, borderColor: 'rgba(243,238,229,.14)' }),
                }}
              >
                <Txt
                  size={13}
                  weight={on ? 'bold' : 'semibold'}
                  color={on ? void_.bg : 'rgba(243,238,229,.65)'}
                >
                  {dayLabels[d]}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(Object.keys(WINDOWS) as WindowKey[]).map((w) => {
            const on = w === window_;
            return (
              <Pressable
                key={w}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${WINDOWS[w].label} kick-off window`}
                onPress={() => setWindow(w)}
                hitSlop={hitSlopTo44(36)}
                style={{
                  flex: 1,
                  height: 36,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: on ? 'rgba(198,163,75,.45)' : 'rgba(243,238,229,.14)',
                  ...(on ? { backgroundColor: 'rgba(198,163,75,.12)' } : null),
                }}
              >
                <Txt
                  size={12}
                  weight={on ? 'bold' : 'regular'}
                  color={on ? gold.base : 'rgba(243,238,229,.55)'}
                >
                  {WINDOWS[w].label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Eyebrow>{t.liveSlots(num(liveSlots))}</Eyebrow>
        {/* VEN-002: results must say when availability was last confirmed. */}
        <Txt size={11} color="rgba(243,238,229,.3)">
          {loading ? t.checking : t.updatedAgo(num(secondsAgo))}
        </Txt>
      </View>

      {unreachable ? (
        <Pressable
          accessibilityRole="alert"
          accessibilityLabel={t.offline}
          onPress={reload}
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
            {t.offline}
          </Txt>
        </Pressable>
      ) : null}

      {loading && venues.length === 0 ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {!loading && venues.length === 0 && !unreachable ? (
        <Txt size={13} color={onVoid.muted}>
          {t.noVenues}
        </Txt>
      ) : null}

      <View style={{ gap: 12 }}>
        {venues.map((venue) => (
          <VenueCard
            key={venue.venueId}
            venue={venue}
            onPress={() => router.push(`/play/pitch?venue=${venue.venueId}&date=${isoDate(dayOffset[day])}`)}
            t={t}
            num={num}
            money={money}
            hour={hour}
          />
        ))}
      </View>
    </Screen>
  );
}

function VenueCard({
  venue,
  onPress,
  t,
  num,
  money,
  hour,
}: {
  venue: VenueSummary;
  onPress: () => void;
  t: ReturnType<typeof useI18n>['t'];
  num: (v: number) => string;
  money: (v: number) => string;
  hour: (iso: string) => string;
}) {
  const soldOut = venue.openSlots === 0;
  const verified = venue.verification === 'verified';

  const meta = [
    venue.distanceKm != null ? `${num(venue.distanceKm)} km` : venue.area,
    ...venue.amenities.slice(0, 1),
  ]
    .filter(Boolean)
    .join(' · ');

  const body = (
    <>
      <View style={{ flexDirection: 'row', gap: 12, padding: 14 }}>
        <TurfSwatch size={56} round={radius.row} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Txt size={15.5} weight="bold" color={onVoid.primary}>
              {venue.name}
            </Txt>
            {/* VEN-006: verification status is always visible. */}
            {verified ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: goldAlpha.accent,
                  borderRadius: radius.badge,
                  paddingVertical: 2,
                  paddingHorizontal: 5,
                }}
              >
                <Txt size={10} weight="bold" em={0.08} color={gold.base}>
                  {t.verified}
                </Txt>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {venue.ratingAvg != null ? <Star size={11} color={gold.base} /> : null}
            <Txt size={11.5} color={onVoid.faint}>
              {venue.ratingAvg != null
                ? `${num(venue.ratingAvg)} (${num(venue.ratingCount)}) · ${meta}`
                : meta}
            </Txt>
          </View>
          {soldOut ? (
            <Txt size={11.5} color={burgundy.onVoid}>
              {t.fullyBooked}
            </Txt>
          ) : (
            <Txt size={12} weight="semibold" color={onVoid.primary}>
              {t.perHour(money(venue.minPriceEgp))}
            </Txt>
          )}
        </View>
      </View>

      {soldOut ? null : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 14,
            paddingBottom: 14,
          }}
        >
          {venue.nextSlot ? (
            <View
              style={{
                height: 34,
                paddingHorizontal: 14,
                borderRadius: 10,
                backgroundColor: gold.base,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt size={12} weight="bold" color={void_.bg}>
                {hour(venue.nextSlot)}
              </Txt>
            </View>
          ) : null}
          <Txt size={11.5} color={onVoid.faint}>
            {t.slotsLeftTonight(num(venue.openSlots))}
          </Txt>
        </View>
      )}
    </>
  );

  if (soldOut) {
    return (
      <View
        style={{
          borderRadius: radius.cardInner,
          backgroundColor: void_.surface,
          borderWidth: 1,
          borderColor: onVoid.edgeFaint,
          opacity: 0.55,
        }}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${venue.name}, ${venue.openSlots} slots, from ${money(venue.minPriceEgp)} per hour`}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: radius.cardInner,
        backgroundColor: void_.surface,
        borderWidth: 1,
        borderColor: verified || pressed ? 'rgba(198,163,75,.28)' : onVoid.edgeFaint,
        overflow: 'hidden',
      })}
    >
      {body}
    </Pressable>
  );
}
