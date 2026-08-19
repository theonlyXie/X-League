import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { ink, onOperative, operative, radius, gold, burgundy, void_ } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import { DESK_BOOKINGS, DeskBooking } from '@/data/ownerOps';
import { useBooking } from '@/state/booking';
import { useProfile } from '@/state/profile';

/**
 * O-03 Bookings desk — every channel, one list (§4.5).
 */
const FILTERS = ['All', 'App', 'Phone', 'Walk-in'] as const;

export default function OwnerBookings() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const { activeBooking } = useBooking();
  const { card } = useProfile();

  const rows = useMemo(() => {
    const live: DeskBooking[] =
      activeBooking && activeBooking.status === 'confirmed'
        ? [
            {
              code: activeBooking.code,
              when: `${activeBooking.slot} PM`,
              who: card.name,
              pitch: activeBooking.pitch.replace('Pitch ', ''),
              source: 'app',
              deposit: 'due',
              status: 'Confirmed',
            },
          ]
        : [];
    const merged = [...live, ...DESK_BOOKINGS.filter((b) => !live.some((l) => l.code === b.code))];
    return merged.filter((b) => {
      if (filter === 'All') return true;
      if (filter === 'App') return b.source === 'app';
      if (filter === 'Phone') return b.source === 'phone';
      return b.source === 'walk';
    });
  }, [activeBooking, card.name, filter]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: operative.bg }}
      contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 24, gap: 14 }}
      showsVerticalScrollIndicator={false}
    >
      <Txt size={10} weight="semibold" em={0.16} upper color={onOperative.faint}>
        Tonight · all channels
      </Txt>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {FILTERS.map((f) => {
          const on = f === filter;
          return (
            <Pressable
              key={f}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={f}
              onPress={() => setFilter(f)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: radius.denseChip,
                ...(on ? { backgroundColor: void_.bg } : { borderWidth: 1, borderColor: 'rgba(20,18,16,.16)' }),
              }}
            >
              <Txt size={11.5} weight="semibold" color={on ? operative.bg : onOperative.secondary}>
                {f}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      {rows.map((row) => (
        <BookingRow key={row.code} row={row} />
      ))}
    </ScrollView>
  );
}

function BookingRow({ row }: { row: DeskBooking }) {
  const depositColor = row.deposit === 'unpaid' ? burgundy.ink : row.deposit === 'due' ? gold.ink : onOperative.muted;
  return (
    <View
      style={{
        padding: 14,
        borderRadius: radius.panel,
        backgroundColor: operative.surface,
        borderWidth: 1,
        borderColor: row.source === 'app' ? 'rgba(198,163,75,.45)' : onOperative.hairline,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt size={11} weight="semibold" color={gold.ink} style={{ fontFamily: mono }}>
          {row.code}
        </Txt>
        <Txt size={11} weight="bold" em={0.08} color={onOperative.faint}>
          {row.source.toUpperCase()}
        </Txt>
      </View>
      <Txt size={15} weight="bold" color={ink}>
        {row.who} · Pitch {row.pitch}
      </Txt>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt size={12} color={onOperative.muted}>
          {row.when} · {row.status}
        </Txt>
        <Txt size={12} weight="semibold" color={depositColor}>
          {row.deposit === 'due' ? 'Cash due' : row.deposit === 'unpaid' ? 'Unpaid' : 'Paid'}
        </Txt>
      </View>
    </View>
  );
}
