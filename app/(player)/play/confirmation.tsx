import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Linking, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/ui';
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
          {t.yourePlaying}
        </Txt>
        <Txt size={26} weight="bold" em={-0.02} color={onVoid.primary}>
          {t.tonightAtTime(hourLabel(slotHour))}
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
            {venue
              ? [venue.name, pitchLabel].filter(Boolean).join(' · ')
              : showcase
                ? `${BOOKING.venue} · ${BOOKING.pitch}`
                : ''}
          </Txt>
          <Txt size={12.5} color={onVoid.muted}>
            {/* The day this booking is actually for. This was the string
                literal 'Tue 18 Aug' in the source, so every confirmation on
                every date said the same Tuesday in August. */}
            {t.bookingWhen(
              shortDate(`${date}T12:00:00Z`),
              hourLabel(slotHour),
              hourLabel(slotEndHour),
            )}
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
          <View style={{ gap: 4 }} accessibilityLabel={t.bookingCodeIs(code)}>
            <Txt size={9.5} em={0.2} upper color={onVoid.dim}>
              {t.bookingCode}
            </Txt>
            <Txt size={21} weight="bold" em={0.14} color={gold.base} style={{ fontFamily: mono }}>
              {code}
            </Txt>
          </View>
          <View style={{ flex: 1 }} />
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Txt size={9.5} em={0.2} upper color={onVoid.dim}>
              {t.cashAtGate}
            </Txt>
            <Txt size={15} weight="bold" color={onVoid.primary}>
              {money(total)}
            </Txt>
          </View>
        </View>

        {/* The venue's own entry note, or nothing. `t.gateNote` reads
            "Gate 2 · ask for Pitch A · arrive 10 minutes early" — a fixture
            that lives in the strings file rather than the fixtures file, and
            so did not read as one. It was sending players to a gate that may
            not exist at the venue they booked. */}
        {venue?.entryNote ?? (showcase ? t.gateNote : null) ? (
          <Txt size={12} color={onVoid.faint}>
            {venue?.entryNote ?? t.gateNote}
          </Txt>
        ) : null}
      </View>

      <View style={{ width: '100%', gap: 10 }}>
        {/* VEN-009: navigation deep-links out to an installed maps app —
            when there is somewhere to deep-link to. The button used to be
            drawn unconditionally and did nothing at all, silently, for any
            venue with no pin or map link on file. */}
        {mapsUrl ? (
          <Button
            label={t.navigateToVenue}
            height={50}
            round={radius.control}
            size={15}
            onPress={() => {
              Linking.openURL(mapsUrl).catch(() => {});
            }}
          />
        ) : null}
        <Button
          label={t.inviteYourSquad}
          variant="ghost"
          height={50}
          round={radius.control}
          size={15}
          style={{ borderColor: onVoid.line }}
          onPress={() =>
            router.replace(bookingId ? `/play/lobby?booking=${bookingId}` : '/play/lobby')
          }
        />
      </View>
    </Screen>
  );
}
