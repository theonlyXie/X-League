import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Divider, Eyebrow } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { PulseDot } from '@/components/PulseDot';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import { BOOKING } from '@/data/player';
import { useBooking } from '@/state/booking';
import { venueDetail, myStanding, bookingTerms, type Standing } from '@/data/discovery';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';

/**
 * P-05 Checkout — reserve without ambiguity (§4.2).
 *
 * BKG-004: the complete price, cancellation deadline and
 * refund rule are all shown before confirmation, and the quote is the one
 * snapshotted when the hold was taken (§5.4).
 */
export default function Checkout() {
  const router = useRouter();
  const {
    slot,
    slotHour,
    slotEndHour,
    holdText,
    hold,
    releaseHold,
    confirmBooking,
    slotPrices,
    pitchId,
    venueId,
    date,
    bookingId,
  } = useBooking();
  const { t, money, clock, num, longDate, hourLabel, moment } = useI18n();
  const { signedIn } = useSession();

  const [venueLine, setVenueLine] = useState<string | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [cutoff, setCutoff] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // A signed-out visitor and the demo build are shown the design's booking.
  // A real player is never quoted a fixture price or sent to a fixture venue.
  const showcase = !isLive || !venueId;

  // `idle` counts as expired, and used not to.
  //
  // Reached cold — a deep link, a notification, or coming back to a process the
  // OS had killed — there is no hold, so the countdown rendered `0:00` under
  // "Slot held for you" and the screen still offered Confirm booking for an
  // hour nobody was holding. There is no useful difference between a hold that
  // ran out and one that never existed: in both cases this hour is on sale and
  // the only honest thing to offer is a way back to the grid. The showcase
  // build is exempt, because there the whole booking is the design's.
  const expired = hold === 'expired' || (!showcase && hold === 'idle');

  // AC-03: leaving checkout without confirming returns the slot to inventory.
  useEffect(() => () => releaseHold(), [releaseHold]);

  // The quote is the one the hold snapshotted (§5.4), so the price shown here
  // is the hour's own price rather than the venue's headline rate.
  const price = slotPrices[slot] ?? (showcase ? BOOKING.hourly : 0);
  // PAY: nothing is taken up front any more, so there is no deposit to split
  // the price by. The whole amount is settled at the venue on the day.
  const total = price + BOOKING.bookingFee;

  useEffect(() => {
    if (!isLive || !venueId) return;
    let cancelled = false;
    (async () => {
      try {
        // The venue the player actually chose, carried through the booking
        // spine rather than looked up from configuration.
        const detail = await venueDetail(venueId).catch(() => null);
        const pitch = detail?.pitches.find((p) => p.id === pitchId);
        if (!cancelled && detail) {
          setVenueLine(pitch ? `${detail.name} · ${pitch.label}` : detail.name);
        }
        // Both of these need an account. Firing them signed out produced a
        // 401 for nothing — the standing warning and the cutoff are only
        // meaningful to somebody who can actually book.
        if (!signedIn) return;
        const st = await myStanding().catch(() => null);
        if (!cancelled) setStanding(st);
        // BKG-004 asks for the cancellation deadline before confirmation.
        // `booking_terms` exists for exactly this and had one caller, in the
        // lobby — which is after the decision rather than before it.
        if (bookingId) {
          const terms = await bookingTerms(bookingId).catch(() => null);
          if (!cancelled && terms) setCutoff(terms.cutoffAt);
        }
      } catch {
        /* the panel below says what could not be read */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId, pitchId, bookingId, signedIn]);

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.backToPitch}
          onPress={() => router.back()}
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
        <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary}>
          {t.confirmYourSlot}
        </Txt>
      </View>

      <View
        accessibilityRole="alert"
        accessibilityLabel={
          expired
            ? t.holdExpired
            : `${t.slotHeld}, ${clock(holdText)}`
        }
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 13,
          paddingHorizontal: 16,
          borderRadius: radius.row,
          borderWidth: 1,
          borderColor: expired ? 'rgba(101,21,37,.5)' : 'rgba(198,163,75,.35)',
          backgroundColor: expired ? 'rgba(101,21,37,.09)' : goldAlpha.fillSoft,
        }}
      >
        {expired ? (
          <View style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: burgundy.action }} />
        ) : (
          <PulseDot color={gold.base} />
        )}
        <Txt size={12.5} color="rgba(243,238,229,.72)" style={{ flex: 1 }}>
          {expired ? t.holdExpired : t.slotHeld}
        </Txt>
        <Txt
          size={14}
          weight="bold"
          color={expired ? burgundy.action : gold.base}
          style={{ fontFamily: mono }}
        >
          {clock(holdText)}
        </Txt>
      </View>

      <View
        style={{
          borderRadius: radius.card,
          backgroundColor: void_.surface,
          borderWidth: 1,
          borderColor: onVoid.edge,
          padding: 18,
          gap: 14,
        }}
      >
        <DetailRow
          label={t.venue}
          value={venueLine ?? (showcase ? `${BOOKING.venue} · ${BOOKING.pitch}` : '—')}
        />
        <DetailRow label={t.date} value={longDate(`${date}T18:00:00Z`)} />
        <DetailRow label={t.time} value={`${hourLabel(slotHour)} – ${hourLabel(slotEndHour)}`} />
        <DetailRow label={t.format} value={t.fiveASide} />
      </View>

      <View style={{ gap: 10 }}>
        <Eyebrow>{t.payment}</Eyebrow>
        {/* Cash at the venue is the method, not a fallback — and now the only
            moment money changes hands. */}
        <View
          accessibilityRole="radio"
          accessibilityState={{ selected: true }}
          style={{
            flexDirection: 'row',
            gap: 12,
            padding: 16,
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: goldAlpha.accent,
            backgroundColor: 'rgba(198,163,75,.06)',
          }}
        >
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: radius.pill,
              borderWidth: 2,
              borderColor: gold.base,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 1,
            }}
          >
            <View style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: gold.base }} />
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            <Txt size={14} weight="semibold" color={onVoid.primary}>
              {t.payAtVenue}
            </Txt>
            <Txt size={12} lh={1.55} color={onVoid.muted}>
              {t.payAtVenueBlurb(money(total))}
            </Txt>
          </View>
        </View>
      </View>

      <View
        style={{
          gap: 11,
          padding: 16,
          borderRadius: radius.control,
          backgroundColor: void_.surface,
          borderWidth: 1,
          borderColor: onVoid.edge,
        }}
      >
        <PriceRow label={t.pitchHour} value={money(price)} />
        <PriceRow label={t.bookingFee} value={money(BOOKING.bookingFee)} />
        <Divider />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Txt size={13} weight="semibold" color={gold.base}>
            {t.totalDue}
          </Txt>
          <Txt size={16} weight="bold" color={gold.base}>
            {money(total)}
          </Txt>
        </View>
      </View>

      <Txt size={11.5} lh={1.6} color={onVoid.faint}>
        {cutoff ? t.cancelFreeUntil(moment(cutoff)) : t.cancellationNoteFree}
      </Txt>

      {/* BKG-010: a restriction the player can see is one they can fix. It is
          enforced in hold_slot, so reaching checkout means it did not apply —
          this is a warning about the next booking, not a block on this one. */}
      {standing && standing.noShows > 0 ? (
        <Txt size={11.5} lh={1.6} color={burgundy.action}>
          {standing.cashAllowed
            ? t.restrictedBlurb(num(standing.noShows))
            : `${t.restricted}. ${t.restrictedBlurb(num(standing.noShows))}`}
        </Txt>
      ) : null}

      {expired ? (
        <Button
          label={t.findAnotherSlot}
          height={52}
          round={radius.control}
          size={15}
          onPress={() => router.back()}
        />
      ) : (
        <>
          {failed ? (
            <Txt size={12} weight="semibold" color={burgundy.action}>
              {failed}
            </Txt>
          ) : null}
          {/* Navigation is conditional on the booking having been made. It
              used to be unconditional, so a failed confirm still showed the
              full confirmation ceremony — VoidMark, "YOU'RE PLAYING", a
              booking code — for a booking that does not exist. */}
          <Button
            label={busy ? t.confirming : t.confirmBooking}
            height={52}
            round={radius.control}
            size={15}
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              setFailed(null);
              const made = await confirmBooking();
              setBusy(false);
              if (made) router.push('/play/confirmation');
              else setFailed(t.confirmFailed);
            }}
          />
        </>
      )}
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Txt size={12.5} color={onVoid.faint}>
        {label}
      </Txt>
      <Txt size={13.5} weight="semibold" color={onVoid.primary}>
        {value}
      </Txt>
    </View>
  );
}

function PriceRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Txt size={12.5} color={onVoid.muted}>
        {label}
      </Txt>
      <Txt size={12.5} color={onVoid.primary}>
        {value}
      </Txt>
    </View>
  );
}
