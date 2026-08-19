import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Divider, Eyebrow } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, onVoid, radius, void_ } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import { BOOKING } from '@/data/player';
import { openVenueNavigation } from '@/lib/maps';
import { useBooking } from '@/state/booking';
import { useVenues } from '@/state/venues';

/**
 * P-07 Booking detail — reference, gate, deposit and actions (§4.2).
 */
export default function BookingDetail() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { activeBooking, bookingHistory, cancelBooking } = useBooking();
  const { playerVenues } = useVenues();

  const booking =
    activeBooking?.code === code
      ? activeBooking
      : bookingHistory.find((b) => b.code === code) ?? activeBooking;

  if (!booking) {
    return (
      <Screen contentStyle={{ padding: 20, gap: 12 }}>
        <Txt size={18} weight="bold" color={onVoid.primary}>
          Booking not found
        </Txt>
        <Button label="Back to bookings" onPress={() => router.replace('/bookings')} />
      </Screen>
    );
  }

  const endHour = parseInt(booking.slot, 10) + 1;
  const slotLabel = `${booking.slot} PM`;
  const slotEndLabel = `${endHour}:00 PM`;

  const venue = playerVenues.find((v) => v.name === booking.venue) ?? playerVenues[0];
  const cancelled = booking.status === 'cancelled';
  const active = activeBooking?.code === booking.code;

  const onCancel = () => {
    Alert.alert('Cancel booking', BOOKING.cancellation, [
      { text: 'Keep booking', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: () => {
          cancelBooking();
          router.replace('/bookings');
        },
      },
    ]);
  };

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/bookings'))}
          hitSlop={8}
          style={{
            width: 34,
            height: 34,
            borderRadius: radius.icon,
            borderWidth: 1,
            borderColor: 'rgba(243,238,229,.14)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={16} color={onVoid.secondary} />
        </Pressable>
        <View style={{ gap: 2 }}>
          <Txt size={19} weight="bold" em={-0.02} color={onVoid.primary}>
            Booking detail
          </Txt>
          <Txt size={11.5} color={onVoid.faint} style={{ fontFamily: mono }}>
            {booking.code}
          </Txt>
        </View>
      </View>

      <View
        style={{
          padding: 18,
          borderRadius: radius.card,
          backgroundColor: void_.surface,
          borderWidth: 1,
          borderColor: cancelled ? 'rgba(101,21,37,.35)' : onVoid.edge,
          gap: 14,
        }}
      >
        <Txt size={18} weight="bold" color={cancelled ? burgundy.onVoid : onVoid.primary}>
          {booking.venue} · {booking.pitch}
        </Txt>
        <Txt size={13} color={onVoid.muted}>
          {BOOKING.date} · {slotLabel}–{slotEndLabel} · {BOOKING.format}
        </Txt>
        <Divider />
        <Row label="Deposit" value={`EGP ${booking.deposit} cash at gate`} />
        <Row label="Balance" value={`EGP ${BOOKING.balance} at pitch`} />
        <Row label="Gate" value={BOOKING.gateNote} />
        <Row label="Status" value={cancelled ? 'Cancelled' : active ? 'Confirmed' : 'Past'} gold={active && !cancelled} />
        <Txt size={12} color={onVoid.dim}>
          {BOOKING.cancellation}
        </Txt>
      </View>

      {active && !cancelled ? (
        <View style={{ gap: 10 }}>
          <Button
            label="Navigate to venue"
            onPress={() => openVenueNavigation(venue.name, venue.lat, venue.lng)}
          />
          <Button label="Match lobby" variant="ghost" onPress={() => router.push('/play/lobby')} />
          <Button label="Message squad" variant="ghost" onPress={() => router.push('/chat/xl-7k42')} />
          <Button label="Cancel booking" variant="danger" onPress={onCancel} />
        </View>
      ) : (
        <Button label="Book again" onPress={() => router.push('/play')} />
      )}
    </Screen>
  );
}

function Row({ label, value, gold: isGold }: { label: string; value: string; gold?: boolean }) {
  return (
    <View style={{ gap: 3 }}>
      <Eyebrow>{label}</Eyebrow>
      <Txt size={14} weight="semibold" color={isGold ? gold.base : onVoid.primary}>
        {value}
      </Txt>
    </View>
  );
}
