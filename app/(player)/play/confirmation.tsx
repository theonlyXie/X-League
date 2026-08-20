import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/ui';
import { VoidMark } from '@/components/VoidMark';
import { gold, onVoid, radius, void_ } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import { BOOKING } from '@/data/player';
import { openVenueNavigation } from '@/lib/maps';
import { useBooking } from '@/state/booking';
import { useVenues } from '@/state/venues';

/**
 * P-06 Confirmation — make arrival effortless (§4.2).
 *
 * BKG-006: the confirmed booking carries its reference, pitch, time, venue pin
 * and entry instructions. This is the Ceremony surface — the one moment the
 * X-to-void mark is drawn at full size.
 */
export default function Confirmation() {
  const router = useRouter();
  const { slotLabel, slotEndLabel, activeBooking } = useBooking();
  const { playerVenues } = useVenues();
  const booking = activeBooking;
  const venue = playerVenues.find((v) => v.name === (booking?.venue ?? BOOKING.venue)) ?? playerVenues[0];

  return (
    <Screen
      contentStyle={{
        paddingTop: 20,
        paddingHorizontal: 20,
        paddingBottom: 28,
        alignItems: 'center',
        gap: 22,
      }}
    >
      <VoidMark size={190} glow />

      <View style={{ alignItems: 'center', gap: 8 }}>
        <Txt size={11} weight="bold" em={0.26} upper color={gold.base}>
          You're playing
        </Txt>
        <Txt size={26} weight="bold" em={-0.02} color={onVoid.primary}>
          Tonight, {slotLabel}
        </Txt>
      </View>

      <View
        style={{
          width: '100%',
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: 'rgba(243,238,229,.1)',
          backgroundColor: void_.surface,
          padding: 18,
          gap: 16,
        }}
      >
        <View style={{ gap: 4 }}>
          <Txt size={17} weight="bold" color={onVoid.primary}>
            {booking?.venue ?? BOOKING.venue} · {booking?.pitch ?? BOOKING.pitch}
          </Txt>
          <Txt size={12.5} color={onVoid.muted}>
            {BOOKING.date} · {slotLabel}–{slotEndLabel} · 5-a-side
          </Txt>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            padding: 14,
            borderRadius: radius.row,
            backgroundColor: void_.bg,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: 'rgba(198,163,75,.35)',
          }}
        >
          <View style={{ gap: 4 }} accessibilityLabel={`Booking code ${booking?.code ?? BOOKING.code}`}>
            <Txt size={9.5} em={0.2} upper color={onVoid.dim}>
              Booking code
            </Txt>
            <Txt size={21} weight="bold" em={0.14} color={gold.base} style={{ fontFamily: mono }}>
              {booking?.code ?? BOOKING.code}
            </Txt>
          </View>
          <View style={{ flex: 1 }} />
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Txt size={9.5} em={0.2} upper color={onVoid.dim}>
              Cash at gate
            </Txt>
            <Txt size={15} weight="bold" color={onVoid.primary}>
              EGP {booking?.deposit ?? BOOKING.deposit}
            </Txt>
          </View>
        </View>

        <Txt size={12} color={onVoid.faint}>
          {BOOKING.gateNote}
        </Txt>
      </View>

      <View style={{ width: '100%', gap: 10 }}>
        {/* VEN-009: navigation deep-links out to an installed maps app. */}
        <Button
          label="Navigate to venue"
          height={50}
          round={radius.control}
          size={15}
          onPress={() => openVenueNavigation(venue.name, venue.lat, venue.lng)}
        />
        <Button
          label="Match lobby"
          variant="ghost"
          height={50}
          round={radius.control}
          size={15}
          style={{ borderColor: onVoid.line }}
          onPress={() => router.replace('/play/lobby')}
        />
      </View>
    </Screen>
  );
}
