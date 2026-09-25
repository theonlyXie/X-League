import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Linking, Pressable, Share as NativeShare, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { ActionButton, Card } from '@/components/kit';
import { Calendar, CheckCircle, Share } from '@/components/icons';
import { VoidMark } from '@/components/VoidMark';
import { gold, onVoid, radius, void_ } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import { BOOKING } from '@/data/player';
import { useBooking } from '@/state/booking';
import { venueDetail, type VenueDetail } from '@/data/discovery';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * P-06 Confirmation — make arrival effortless (§4.2).
 *
 * BKG-006: the confirmed booking carries its reference, pitch, time, venue pin
 * and entry instructions. This is the Ceremony surface — the one moment the
 * X-to-void mark is drawn at full size.
 */
export default function Confirmation() {
  const router = useRouter();
  const { slot, slotHour, slotEndHour, code, bookingId, venueId, pitchId, slotPrices, date } =
    useBooking();
  const { t, money, hourLabel, shortDate } = useI18n();

  // A signed-out visitor and the demo build are shown the design's booking.
  // A real player is never quoted a fixture price or sent to a fixture gate.
  const showcase = !isLive || !venueId;

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
  const mapsUrl =
    venue?.mapUrl ??
    (venue?.lat != null ? `https://maps.google.com/?q=${venue.lat},${venue.lon}` : null);
  // Nothing was taken up front; the whole price is settled at the venue.
  const total = (slotPrices[slot] ?? (showcase ? BOOKING.hourly : 0)) + BOOKING.bookingFee;

  const when = t.bookingWhen(shortDate(`${date}T12:00:00Z`), hourLabel(slotHour), hourLabel(slotEndHour));
  const venueName = venue ? [venue.name, pitchLabel].filter(Boolean).join(' · ') : showcase ? `${BOOKING.venue} · ${BOOKING.pitch}` : '';
  const entry = venue?.entryNote ?? (showcase ? t.gateNote : null);

  const share = () => {
    NativeShare.share({
      message: t.shareBookingMessage(venueName, when, code, mapsUrl ?? ''),
    }).catch(() => {});
  };

  return (
    <Screen contentStyle={{ paddingTop: 24, paddingHorizontal: 20, paddingBottom: 32, gap: 22 }}>
      {/* The Ceremony surface — the one moment the X-to-void mark is drawn at
          full size, with the redesign's tick at its heart. */}
      <View style={{ alignItems: 'center', gap: 16 }}>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <VoidMark size={170} glow />
          <View style={{ position: 'absolute' }}>
            <CheckCircle size={64} color={gold.base} filled />
          </View>
        </View>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Txt size={11} weight="bold" em={0.26} upper color={gold.base}>
            {t.yourePlaying}
          </Txt>
          <Txt size={26} weight="bold" em={-0.02} align="center" color={onVoid.primary}>
            {t.bookingConfirmed}
          </Txt>
          <Txt size={13} lh={1.55} align="center" color={onVoid.muted}>
            {venueName ? t.confirmedBlurb(venueName, when) : when}
          </Txt>
        </View>
      </View>

      <Card>
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
          accessibilityLabel={t.bookingCodeIs(code)}
        >
          <View style={{ gap: 4 }}>
            <Txt size={9.5} em={0.2} upper color={onVoid.dim}>
              {t.bookingCode}
            </Txt>
            <Txt size={21} weight="bold" em={0.14} color={gold.base} style={{ fontFamily: mono }}>
              {code}
            </Txt>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 }}>
          <Fact label={t.venue} value={venueName} />
          <Fact label={t.cashAtGate} value={money(total)} />
          <Fact label={t.paymentMethod} value={t.payAtVenue} />
          <Fact label={t.time} value={when} />
        </View>

        {/* The venue's own entry note, or nothing — never a fixture gate. */}
        {entry ? (
          <Txt size={12} lh={1.5} color={onVoid.faint}>
            {entry}
          </Txt>
        ) : null}

        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: onVoid.edgeFaint, paddingTop: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.share}
            onPress={share}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6 }}
          >
            <Share size={17} color={gold.base} />
            <Txt size={13} weight="semibold" color={onVoid.primary}>
              {t.share}
            </Txt>
          </Pressable>
          <View style={{ width: 1, backgroundColor: onVoid.edgeFaint }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.viewBookings}
            onPress={() => router.push('/bookings')}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6 }}
          >
            <Calendar size={17} color={gold.base} />
            <Txt size={13} weight="semibold" color={onVoid.primary}>
              {t.viewBookings}
            </Txt>
          </Pressable>
        </View>
      </Card>

      <View style={{ gap: 10 }}>
        {/* VEN-009: only when there is somewhere to deep-link to. */}
        {mapsUrl ? (
          <ActionButton
            label={t.navigateToVenue}
            onPress={() => {
              Linking.openURL(mapsUrl).catch(() => {});
            }}
          />
        ) : null}
        <ActionButton
          label={t.inviteYourSquad}
          variant="ghost"
          onPress={() => router.replace(bookingId ? `/play/lobby?booking=${bookingId}` : '/play/lobby')}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.backToHome}
          onPress={() => router.replace('/')}
          style={{ paddingVertical: 12, alignItems: 'center' }}
        >
          <Txt size={13.5} weight="semibold" color={onVoid.muted}>
            {t.backToHome}
          </Txt>
        </Pressable>
      </View>
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '50%', gap: 4, paddingRight: 10 }}>
      <Txt size={11} color={onVoid.faint}>
        {label}
      </Txt>
      <Txt size={13} weight="semibold" color={onVoid.primary}>
        {value}
      </Txt>
    </View>
  );
}
