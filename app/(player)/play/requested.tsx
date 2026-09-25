import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { ActionButton } from '@/components/kit';
import { Clock } from '@/components/icons';
import { gold, onVoid, radius, void_ } from '@/theme/tokens';
import { useBooking } from '@/state/booking';
import { venueDetail, type VenueDetail } from '@/data/discovery';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * Asked for, not booked.
 *
 * The other end of checkout, for a venue that has not agreed to take money at
 * the gate. The hour is held — nobody else can take it while the venue decides
 * — but there is no booking and no code, and this screen exists so that the
 * difference is impossible to miss.
 *
 * Deliberately not the Ceremony surface. `confirmation.tsx` draws the VoidMark
 * at full size, says "YOU'RE PLAYING", and prints a reference in gold. Every
 * one of those is a promise, and reusing them here with the code blanked out
 * would be the same screen with a hole in it: a player would read the ceremony
 * and turn up. So the mark is not drawn, the headline says what is actually
 * true, and there is nothing on this screen that looks like a thing to quote
 * at a gate.
 */
export default function Requested() {
  const router = useRouter();
  const { slot, slotHour, slotEndHour, venueId, pitchId, date } = useBooking();
  const { t, hourLabel, shortDate } = useI18n();

  const [venue, setVenue] = useState<VenueDetail | null>(null);

  useEffect(() => {
    if (!isLive || !venueId) return;
    let cancelled = false;
    venueDetail(venueId)
      .then((d) => !cancelled && setVenue(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  const pitchLabel = venue?.pitches.find((p) => p.id === pitchId)?.label;

  return (
    <Screen
      contentStyle={{
        paddingTop: 32,
        paddingHorizontal: 20,
        paddingBottom: 28,
        alignItems: 'center',
        gap: 22,
      }}
    >
      <View style={{ alignItems: 'center', gap: 10 }}>
        {/* A clock, not a tick: nothing is confirmed yet. */}
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: 'rgba(198,163,75,.35)',
            backgroundColor: 'rgba(198,163,75,.07)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
          }}
        >
          <Clock size={46} color={gold.base} />
        </View>
        <Txt size={11} weight="bold" em={0.26} upper color={gold.base}>
          {t.requestSent}
        </Txt>
        <Txt size={24} weight="bold" em={-0.02} align="center" color={onVoid.primary}>
          {t.waitingOnTheVenue}
        </Txt>
        <Txt size={13} align="center" color={onVoid.muted} lh={1.5}>
          {t.requestHeldForYou}
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
          gap: 4,
        }}
      >
        <Txt size={17} weight="bold" color={onVoid.primary}>
          {venue ? [venue.name, pitchLabel].filter(Boolean).join(' · ') : ''}
        </Txt>
        <Txt size={12.5} color={onVoid.muted}>
          {t.bookingWhen(
            shortDate(`${date}T12:00:00Z`),
            hourLabel(slotHour),
            hourLabel(slotEndHour),
          )}
        </Txt>
      </View>

      {/* No "invite your squad" here. Calling people to a match the venue has
          not agreed to is how somebody ends up telling eleven friends about an
          hour that gets declined an hour later. */}
      <View style={{ width: '100%', gap: 10 }}>
        <ActionButton label={t.done} onPress={() => router.replace('/play')} />
        <ActionButton label={t.viewBookings} variant="ghost" onPress={() => router.push('/bookings')} />
      </View>
    </Screen>
  );
}
