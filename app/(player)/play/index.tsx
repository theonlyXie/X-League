import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Eyebrow, TurfSwatch, hitSlopTo44 } from '@/components/ui';
import { Star } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { VENUES, Venue } from '@/data/player';
import { useBooking } from '@/state/booking';
import { useI18n } from '@/i18n';

const DAYS = ['Tonight', 'Tomorrow', 'Pick date'];
const WINDOWS = ['6–8 PM', '8–10 PM', '10–12'];

/**
 * P-03 Play — availability first (§1.3). The player states area, date and time
 * before results are returned, and results only ever show slots that are
 * saleable at query time (VEN-001, VEN-002).
 */
export default function PlaySearch() {
  const router = useRouter();
  const [day, setDay] = useState('Tonight');
  const [window_, setWindow] = useState('8–10 PM');
  const [view, setView] = useState<'List' | 'Map'>('List');
  const { t, num } = useI18n();
  const dayLabels: Record<string, string> = { Tonight: t.tonight, Tomorrow: t.tomorrow, 'Pick date': t.pickDate };
  const viewLabels: Record<string, string> = { List: t.list, Map: t.map };

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 20 }}>
      <Txt size={22} weight="bold" em={-0.02} color={onVoid.primary}>
        {t.whenPlay}
      </Txt>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {DAYS.map((d) => {
            const on = d === day;
            return (
              <Pressable
                key={d}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={d}
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
                <Txt size={13} weight={on ? 'bold' : 'semibold'} color={on ? void_.bg : 'rgba(243,238,229,.65)'}>
                  {dayLabels[d] ?? d}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {WINDOWS.map((w) => {
            const on = w === window_;
            return (
              <Pressable
                key={w}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${w} kick-off window`}
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
                <Txt size={12} weight={on ? 'bold' : 'regular'} color={on ? gold.base : 'rgba(243,238,229,.55)'}>
                  {w}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search area: Nasr City within 5 kilometres"
          hitSlop={hitSlopTo44(32)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            paddingVertical: 7,
            paddingHorizontal: 12,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: 'rgba(243,238,229,.14)',
          }}
        >
          <View style={{ width: 5, height: 5, borderRadius: radius.pill, backgroundColor: gold.base }} />
          <Txt size={12} color={onVoid.primary}>
            Nasr City · 5 km
          </Txt>
        </Pressable>

        <View
          style={{
            flexDirection: 'row',
            padding: 3,
            borderRadius: radius.pill,
            backgroundColor: void_.surface,
            borderWidth: 1,
            borderColor: onVoid.edge,
          }}
        >
          {(['List', 'Map'] as const).map((v) => {
            const on = v === view;
            return (
              <Pressable
                key={v}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${v} view`}
                onPress={() => setView(v)}
                hitSlop={hitSlopTo44(26)}
                style={{
                  paddingVertical: 5,
                  paddingHorizontal: 12,
                  borderRadius: radius.pill,
                  ...(on ? { backgroundColor: 'rgba(198,163,75,.16)' } : null),
                }}
              >
                <Txt size={11.5} weight={on ? 'bold' : 'semibold'} color={on ? gold.base : onVoid.faint}>
                  {viewLabels[v] ?? v}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Eyebrow>{t.liveSlots(num(12))}</Eyebrow>
        {/* VEN-002: results must say when availability was last confirmed. */}
        <Txt size={11} color="rgba(243,238,229,.3)">
          {t.updatedAgo(num(9))}
        </Txt>
      </View>

      <View style={{ gap: 12 }}>
        {VENUES.map((venue) => (
          <VenueCard key={venue.name} venue={venue} onPress={() => router.push('/play/pitch')} />
        ))}
      </View>
    </Screen>
  );
}

function VenueCard({ venue, onPress }: { venue: Venue; onPress: () => void }) {
  const { slot } = useBooking();
  const soldOut = venue.open.length === 0;

  const meta = [
    `${venue.distanceKm} km`,
    ...(venue.surface ? [venue.surface] : []),
  ].join(' · ');

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
            {venue.verified ? (
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
                  VERIFIED
                </Txt>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Star size={11} color={gold.base} />
            <Txt size={11.5} color={onVoid.faint}>
              {venue.rating} ({venue.reviews}) · {meta}
            </Txt>
          </View>
          {soldOut ? (
            <Txt size={11.5} color={burgundy.onVoid}>
              {venue.note}
            </Txt>
          ) : (
            <Txt size={12} weight="semibold" color={onVoid.primary}>
              EGP {venue.hourly} / hour
            </Txt>
          )}
        </View>
      </View>

      {soldOut ? null : (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 14 }}>
          {(venue.gone ?? []).map((t) => (
            <View
              key={t}
              style={{
                flex: 1,
                height: 34,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: onVoid.edge,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt size={12} color={onVoid.disabled} style={{ textDecorationLine: 'line-through' }}>
                {t}
              </Txt>
            </View>
          ))}
          {venue.open.map((t) => {
            const on = venue.verified && t === slot;
            return (
              <View
                key={t}
                style={{
                  flex: 1,
                  height: 34,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...(on
                    ? { backgroundColor: gold.base }
                    : { borderWidth: 1, borderColor: onVoid.hairline }),
                }}
              >
                <Txt size={12} weight={on ? 'bold' : 'regular'} color={on ? void_.bg : onVoid.secondary}>
                  {t}
                </Txt>
              </View>
            );
          })}
          {venue.note ? (
            <View style={{ flex: 2, height: 34, justifyContent: 'center', paddingLeft: 8 }}>
              <Txt size={11} color="rgba(243,238,229,.3)">
                {venue.note}
              </Txt>
            </View>
          ) : null}
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
      accessibilityLabel={`${venue.name}, rated ${venue.rating}, EGP ${venue.hourly} per hour`}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: radius.cardInner,
        backgroundColor: void_.surface,
        borderWidth: 1,
        borderColor: venue.verified || pressed ? 'rgba(198,163,75,.28)' : onVoid.edgeFaint,
        overflow: 'hidden',
      })}
    >
      {body}
    </Pressable>
  );
}
