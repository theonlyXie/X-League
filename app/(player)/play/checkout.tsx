import { useEffect } from 'react';
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

/**
 * P-05 Checkout — reserve without ambiguity (§4.2).
 *
 * BKG-004: the complete price, deposit, balance, cancellation deadline and
 * refund rule are all shown before confirmation, and the quote is the one
 * snapshotted when the hold was taken (§5.4).
 */
export default function Checkout() {
  const router = useRouter();
  const { slotLabel, slotEndLabel, holdText, hold, releaseHold, confirmBooking } = useBooking();
  const expired = hold === 'expired';

  // AC-03: leaving checkout without confirming returns the slot to inventory.
  useEffect(() => () => releaseHold(), [releaseHold]);

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to pitch"
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
          Confirm your slot
        </Txt>
      </View>

      <View
        accessibilityRole="alert"
        accessibilityLabel={
          expired
            ? 'Your hold expired. The slot is back on sale'
            : `Slot held for you, ${holdText} remaining`
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
          {expired ? 'Your hold expired — the slot is back on sale' : 'Slot held for you'}
        </Txt>
        <Txt
          size={14}
          weight="bold"
          color={expired ? burgundy.action : gold.base}
          style={{ fontFamily: mono }}
        >
          {holdText}
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
        <DetailRow label="Venue" value={`${BOOKING.venue} · ${BOOKING.pitch}`} />
        <DetailRow label="Date" value={BOOKING.date} />
        <DetailRow label="Time" value={`${slotLabel} – ${slotEndLabel}`} />
        <DetailRow label="Format" value={BOOKING.format} />
      </View>

      <View style={{ gap: 10 }}>
        <Eyebrow>Payment</Eyebrow>
        {/* The deposit is cash at the gate — a first-class method, not a fallback. */}
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
              Cash deposit at the venue
            </Txt>
            <Txt size={12} lh={1.55} color={onVoid.muted}>
              Pay EGP {BOOKING.deposit} at the gate to hold the pitch. The remaining EGP {BOOKING.balance} is
              settled at the venue after the match.
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
        <PriceRow label="Pitch hour" value={`EGP ${BOOKING.hourly}`} />
        <PriceRow label="Booking fee" value={`EGP ${BOOKING.bookingFee}`} />
        <Divider />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Txt size={13} weight="semibold" color={gold.base}>
            Cash at gate
          </Txt>
          <Txt size={16} weight="bold" color={gold.base}>
            EGP {BOOKING.deposit}
          </Txt>
        </View>
        <PriceRow label="Balance after match" value={`EGP ${BOOKING.balance}`} />
      </View>

      <Txt size={11.5} lh={1.6} color="rgba(243,238,229,.38)">
        {BOOKING.cancellation} Two unexcused no-shows in a season restrict cash-deposit bookings.
      </Txt>

      {expired ? (
        <Button
          label="Find another slot"
          height={52}
          round={radius.control}
          size={15}
          onPress={() => router.back()}
        />
      ) : (
        <Button
          label="Confirm booking"
          height={52}
          round={radius.control}
          size={15}
          onPress={async () => {
            await confirmBooking();
            router.push('/play/confirmation');
          }}
        />
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
