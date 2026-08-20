import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { hitSlopTo44 } from '@/components/ui';
import { ChevronLeft, ChevronRight } from '@/components/icons';
import { burgundy, ink, onOperative, operative, radius, void_ } from '@/theme/tokens';
import { BookingSource, CALENDAR_LEGEND, Cell, VENUE } from '@/data/owner';
import { calendarWithLiveBooking } from '@/lib/ownerLive';
import { useBooking } from '@/state/booking';
import { useProfile } from '@/state/profile';

/**
 * O-02 Calendar — control inventory (§4.5).
 *
 * OWN-006 is the whole point of this screen: the calendar prevents overlaps and
 * identifies the source and state of every occupancy item, so an app booking,
 * a phone booking and a walk-in are visibly different things in one grid.
 */
const SOURCE: Record<BookingSource, { bg: string; border: string; dashed: boolean; fg: string; sub: string }> = {
  app: { bg: 'rgba(198,163,75,.9)', border: '#B08F35', dashed: false, fg: ink, sub: 'rgba(20,18,16,.65)' },
  phone: { bg: void_.bg, border: void_.bg, dashed: false, fg: operative.bg, sub: 'rgba(243,238,229,.55)' },
  walk: { bg: operative.walkIn, border: operative.walkInBorder, dashed: false, fg: ink, sub: 'rgba(20,18,16,.6)' },
  open: { bg: 'transparent', border: 'rgba(20,18,16,.18)', dashed: true, fg: 'rgba(20,18,16,.35)', sub: 'rgba(20,18,16,.28)' },
  block: { bg: 'rgba(101,21,37,.1)', border: 'rgba(101,21,37,.35)', dashed: false, fg: burgundy.ink, sub: 'rgba(139,33,53,.65)' },
};

export default function OwnerCalendar() {
  const [range, setRange] = useState<'Day' | 'Week'>('Day');
  const { activeBooking } = useBooking();
  const { card } = useProfile();
  const calendar = calendarWithLiveBooking(activeBooking, card.name);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: operative.bg }}
      contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 24, gap: 14 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(['Day', 'Week'] as const).map((r) => {
            const on = r === range;
            return (
              <Pressable
                key={r}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${r} view`}
                onPress={() => setRange(r)}
                hitSlop={hitSlopTo44(28)}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: radius.denseChip,
                  ...(on ? { backgroundColor: void_.bg } : { borderWidth: 1, borderColor: 'rgba(20,18,16,.16)' }),
                }}
              >
                <Txt size={11.5} weight="semibold" color={on ? operative.bg : onOperative.secondary}>
                  {r}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous day" hitSlop={12}>
            <ChevronLeft size={16} color={onOperative.faint} />
          </Pressable>
          <Txt size={12} weight="semibold" color={ink}>
            Tue 18 Aug
          </Txt>
          <Pressable accessibilityRole="button" accessibilityLabel="Next day" hitSlop={12}>
            <ChevronRight size={16} color={onOperative.faint} />
          </Pressable>
        </View>
      </View>

      <View
        style={{
          borderRadius: radius.panel,
          backgroundColor: operative.surface,
          borderWidth: 1,
          borderColor: onOperative.hairline,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            borderBottomWidth: 1,
            borderBottomColor: onOperative.hairline,
            backgroundColor: operative.band,
          }}
        >
          <View style={{ width: 44 }} />
          {VENUE.pitches.map((p, i) => (
            <View
              key={p}
              style={{
                flex: 1,
                paddingVertical: 8,
                paddingHorizontal: 6,
                alignItems: 'center',
                ...(i > 0 ? { borderLeftWidth: 1, borderLeftColor: 'rgba(20,18,16,.08)' } : null),
              }}
            >
              <Txt size={10.5} weight="bold" em={0.08} color={ink}>
                PITCH {p}
              </Txt>
            </View>
          ))}
        </View>

        {calendar.map((row) => (
          <View key={row.time} style={{ flexDirection: 'row' }}>
            <View
              style={{
                width: 44,
                height: 56,
                paddingVertical: 5,
                paddingHorizontal: 6,
                alignItems: 'flex-end',
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(20,18,16,.07)',
              }}
            >
              <Txt size={10.5} color={onOperative.faint}>
                {row.time}
              </Txt>
            </View>
            {[row.a, row.b, row.c].map((cell, i) => (
              <CalendarCell key={i} cell={cell} first={i === 0} time={row.time} pitch={VENUE.pitches[i]} />
            ))}
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {CALENDAR_LEGEND.map((entry) => {
          const spec = SOURCE[entry.source];
          return (
            <View key={entry.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  backgroundColor: spec.bg,
                  ...(spec.dashed
                    ? { borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(20,18,16,.3)' }
                    : null),
                }}
              />
              <Txt size={11} color="rgba(20,18,16,.55)">
                {entry.label}
              </Txt>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {/* OWN-003 / OWN-005: staff enter every channel here, and block inventory. */}
        <OwnerAction label="Add booking" filled onPress={() => Alert.alert('Add booking', 'Phone and walk-in entry ships with the live API.')} />
        <OwnerAction label="Block slot" onPress={() => Alert.alert('Block slot', 'Inventory blocks sync with the venue calendar API.')} />
      </View>
    </ScrollView>
  );
}

function CalendarCell({ cell, first, time, pitch }: { cell: Cell; first: boolean; time: string; pitch: string }) {
  const spec = SOURCE[cell.source];
  return (
    <View
      style={{
        flex: 1,
        height: 56,
        padding: 4,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(20,18,16,.07)',
        ...(first ? null : { borderLeftWidth: 1, borderLeftColor: 'rgba(20,18,16,.08)' }),
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${time}, Pitch ${pitch}: ${cell.title}, ${cell.detail}`}
        style={({ pressed }) => ({
          height: '100%',
          borderRadius: radius.cell,
          justifyContent: 'center',
          paddingHorizontal: 8,
          gap: 2,
          backgroundColor: spec.bg,
          borderWidth: 1,
          borderStyle: spec.dashed ? 'dashed' : 'solid',
          borderColor: spec.border,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Txt size={10.5} weight="bold" color={spec.fg} numberOfLines={1}>
          {cell.title}
        </Txt>
        <Txt size={9.5} color={spec.sub} numberOfLines={1}>
          {cell.detail}
        </Txt>
      </Pressable>
    </View>
  );
}

function OwnerAction({ label, filled, onPress }: { label: string; filled?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        height: 42,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        ...(filled
          ? { backgroundColor: void_.bg }
          : { borderWidth: 1, borderColor: onOperative.line }),
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Txt size={13} weight="semibold" color={filled ? operative.bg : ink}>
        {label}
      </Txt>
    </Pressable>
  );
}
