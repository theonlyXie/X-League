import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { ChevronRight } from '@/components/icons';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import { useBooking } from '@/state/booking';

/**
 * P-07 My bookings — active commitment and history (§4.2).
 */
export default function MyBookings() {
  const router = useRouter();
  const { activeBooking, bookingHistory } = useBooking();

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <Txt size={22} weight="bold" em={-0.02} color={onVoid.primary}>
        My bookings
      </Txt>

      <View style={{ gap: 10 }}>
        <Eyebrow>Active</Eyebrow>
        {activeBooking ? (
          <BookingRow
            code={activeBooking.code}
            title={`${activeBooking.venue} · ${activeBooking.pitch}`}
            detail={`Tonight · ${activeBooking.slot} PM · EGP ${activeBooking.deposit} cash at gate`}
            live
            onPress={() => router.push(`/bookings/${activeBooking.code}`)}
          />
        ) : (
          <View
            style={{
              padding: 16,
              borderRadius: radius.control,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: onVoid.hairline,
              gap: 10,
            }}
          >
            <Txt size={14} color={onVoid.secondary}>
              No active booking. Find a live slot and hold it before it goes.
            </Txt>
            <Button label="Find a pitch" onPress={() => router.push('/play')} />
          </View>
        )}
      </View>

      {bookingHistory.length ? (
        <View style={{ gap: 10 }}>
          <Eyebrow>History</Eyebrow>
          {bookingHistory.map((b) => (
            <BookingRow
              key={`${b.code}-${b.confirmedAt}`}
              code={b.code}
              title={`${b.venue} · ${b.pitch}`}
              detail={b.status === 'cancelled' ? 'Cancelled' : `${b.slot} PM · completed`}
              onPress={() => router.push(`/bookings/${b.code}`)}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function BookingRow({
  code,
  title,
  detail,
  live,
  onPress,
}: {
  code: string;
  title: string;
  detail: string;
  live?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => ({
        padding: 14,
        borderRadius: radius.control,
        backgroundColor: void_.surface,
        borderWidth: 1,
        borderColor: live ? goldAlpha.edge : pressed ? goldAlpha.edgeSoft : onVoid.edge,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      })}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Txt size={11} weight="semibold" color={gold.base} style={{ fontFamily: mono }}>
          {code}
        </Txt>
        <Txt size={15} weight="bold" color={onVoid.primary}>
          {title}
        </Txt>
        <Txt size={12} color={onVoid.faint}>
          {detail}
        </Txt>
      </View>
      <ChevronRight size={16} color={onVoid.dim} />
    </Pressable>
  );
}
