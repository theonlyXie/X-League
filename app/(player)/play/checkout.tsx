import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { ActionButton, BackHeader, Card, KeyValue, Radio, SafeTop, StickyFooter, VenuePhoto, isPhoto } from '@/components/kit';
import { Pencil, Trash } from '@/components/icons';
import { PulseDot } from '@/components/PulseDot';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import { BOOKING } from '@/data/player';
import { useBooking } from '@/state/booking';
import { venueDetail, myStanding, bookingTerms, type Standing } from '@/data/discovery';
import { venuePayAtVenue } from '@/data/api';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';

/**
 * P-05 Checkout — reserve without ambiguity (§4.2), in the redesign's layout:
 * what is being booked with a way to change it, who it is under, how it is
 * paid, the price line by line, the policy, and a pinned bar with the total.
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
  const formatName = (f: string) =>
    f === '5-a-side' ? t.amFiveASide : f === '7-a-side' ? t.amSevenASide : f === '11-a-side' ? t.amElevenASide : f;
  const { signedIn, displayName } = useSession();

  const [venueName, setVenueName] = useState<string | null>(null);
  const [pitchLabel, setPitchLabel] = useState<string | null>(null);
  const [venueFormat, setVenueFormat] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [cutoff, setCutoff] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // Null until the answer arrives. The button says "Confirm booking" in the
  // meantime rather than flickering from one promise to the other, and the
  // server decides the outcome either way — this only words the button.
  const [payAtVenue, setPayAtVenue] = useState<boolean | null>(null);

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
          setVenueName(detail.name);
          setPitchLabel(pitch?.label ?? null);
          setVenueFormat(pitch?.format ?? null);
          setCover(detail.photos.find((ph) => isPhoto(ph.url))?.url ?? null);
        }
        // Whether this venue takes money at the gate, which decides whether
        // the button below promises a booking or asks for one. Read before
        // sign-in is checked, because the promise is the same either way and
        // somebody weighing a venue deserves to know which it is.
        const gate = await venuePayAtVenue(venueId).catch(() => null);
        if (!cancelled && gate !== null) setPayAtVenue(gate);
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

  const pitchFormat = venueFormat ? formatName(venueFormat) : t.fiveASide;
  const fee = BOOKING.bookingFee;
  const removeAndBack = () => {
    releaseHold();
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: void_.bg }}>
      <SafeTop />
      <BackHeader
        title={t.checkout}
        right={
          <View
            accessibilityRole="alert"
            accessibilityLabel={expired ? t.holdExpired : `${t.slotHeld}, ${clock(holdText)}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              paddingVertical: 6,
              paddingHorizontal: 11,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: expired ? 'rgba(101,21,37,.5)' : 'rgba(198,163,75,.35)',
              backgroundColor: expired ? 'rgba(101,21,37,.09)' : goldAlpha.fillSoft,
            }}
          >
            {expired ? (
              <View style={{ width: 7, height: 7, borderRadius: radius.pill, backgroundColor: burgundy.action }} />
            ) : (
              <PulseDot color={gold.base} />
            )}
            <Txt size={13} weight="bold" color={expired ? burgundy.action : gold.base} style={{ fontFamily: mono }}>
              {clock(holdText)}
            </Txt>
          </View>
        }
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
        <Txt size={12.5} color={expired ? burgundy.action : onVoid.muted}>
          {expired ? t.holdExpired : t.slotHeld}
        </Txt>

        {/* What is being booked, with the two ways to change it: back to the
            hours to pick another, or give this one back. */}
        <Card pad={12}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <VenuePhoto uri={cover} height={112} round={radius.chip} style={{ width: 104 }} />
            <View style={{ flex: 1, gap: 5, paddingVertical: 2 }}>
              <Txt size={15} weight="bold" color={onVoid.primary} numberOfLines={2}>
                {venueName ?? (showcase ? BOOKING.venue : '—')}
              </Txt>
              <Txt size={12} color={onVoid.muted} numberOfLines={1}>
                {[pitchLabel ?? (showcase ? BOOKING.pitch : null), pitchFormat].filter(Boolean).join(' · ')}
              </Txt>
              <Txt size={12.5} weight="semibold" color={onVoid.primary}>
                {`${hourLabel(slotHour)} – ${hourLabel(slotEndHour)}`}
              </Txt>
              <Txt size={12} color={onVoid.muted}>
                {longDate(`${date}T18:00:00Z`)}
              </Txt>
              <Txt size={12} color={onVoid.muted}>
                {t.rateIs(money(price))}
              </Txt>
            </View>
            <View style={{ justifyContent: 'space-between', paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: onVoid.edgeFaint }}>
              <IconButton label={t.changeSlot} onPress={() => router.back()}>
                <Pencil size={17} color={gold.base} />
              </IconButton>
              {expired ? null : (
                <IconButton label={t.removeSlot} onPress={removeAndBack}>
                  <Trash size={17} color={burgundy.action} />
                </IconButton>
              )}
            </View>
          </View>
        </Card>

        {signedIn && displayName ? (
          <Card>
            <Txt size={15} weight="bold" color={onVoid.primary}>
              {t.bookingUnder}
            </Txt>
            <Txt size={13.5} color={onVoid.secondary}>
              {displayName}
            </Txt>
            <Txt size={11.5} lh={1.5} color={onVoid.faint}>
              {t.bookingUnderBlurb}
            </Txt>
          </Card>
        ) : null}

        {/* PAY: cash at the venue is the method, not a fallback — and the
            only moment money changes hands. There is nothing else to choose,
            so the redesign's payment page is this one card rather than a
            screen of options that do not exist. */}
        <Card>
          <Txt size={15} weight="bold" color={onVoid.primary}>
            {t.payment}
          </Txt>
          <View accessibilityRole="radio" accessibilityState={{ selected: true }} style={{ flexDirection: 'row', gap: 12 }}>
            <Radio on />
            <View style={{ flex: 1, gap: 4 }}>
              <Txt size={14} weight="semibold" color={onVoid.primary}>
                {t.payAtVenue}
              </Txt>
              <Txt size={12} lh={1.55} color={onVoid.muted}>
                {t.payAtVenueBlurb(money(total))}
              </Txt>
            </View>
          </View>
        </Card>

        <Card>
          <Txt size={15} weight="bold" color={onVoid.primary}>
            {t.priceDetails}
          </Txt>
          <KeyValue label={t.pitchHour} value={money(price)} />
          {fee > 0 ? <KeyValue label={t.bookingFee} value={money(fee)} /> : null}
          <View style={{ height: 1, backgroundColor: onVoid.edgeFaint }} />
          <KeyValue label={t.totalDue} value={money(total)} strong />
        </Card>

        <Card>
          <Txt size={15} weight="bold" color={onVoid.primary}>
            {t.cancellationPolicy}
          </Txt>
          <Txt size={12.5} lh={1.6} color={onVoid.muted}>
            {cutoff ? t.cancelFreeUntil(moment(cutoff)) : t.cancellationNoteFree}
          </Txt>
          {/* BKG-010: a restriction the player can see is one they can fix. It
              is enforced in hold_slot, so reaching checkout means it did not
              apply — this is a warning about the next booking. */}
          {standing && standing.noShows > 0 ? (
            <Txt size={11.5} lh={1.6} color={burgundy.action}>
              {standing.cashAllowed
                ? t.restrictedBlurb(num(standing.noShows))
                : `${t.restricted}. ${t.restrictedBlurb(num(standing.noShows))}`}
            </Txt>
          ) : null}
        </Card>

        {failed ? (
          <Txt size={12.5} weight="semibold" color={burgundy.action}>
            {failed}
          </Txt>
        ) : null}
      </ScrollView>

      <StickyFooter>
        {expired ? (
          <ActionButton label={t.findAnotherSlot} flex onPress={() => router.back()} />
        ) : (
          <>
            <View style={{ gap: 2 }}>
              <Txt size={17} weight="bold" color={onVoid.primary}>
                {money(total)}
              </Txt>
              <Txt size={10.5} color={onVoid.dim}>
                {t.atTheVenue}
              </Txt>
            </View>
            {/* Navigation is conditional on the booking having been made. It
                used to be unconditional, so a failed confirm still showed the
                full confirmation ceremony for a booking that does not exist. */}
            <ActionButton
              label={busy ? t.confirming : payAtVenue === false ? t.requestBooking : t.confirmBooking}
              flex
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                setFailed(null);
                const made = await confirmBooking();
                setBusy(false);
                // Compared against the state, not for truthiness: `if (made)`
                // on a string is true for 'expired' too.
                if (made === 'confirmed') router.push('/play/confirmation');
                else if (made === 'requested') router.push('/play/requested');
                else setFailed(t.confirmFailed);
              }}
            />
          </>
        )}
      </StickyFooter>
    </View>
  );
}

function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={{
        width: 36,
        height: 36,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: onVoid.edge,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </Pressable>
  );
}
