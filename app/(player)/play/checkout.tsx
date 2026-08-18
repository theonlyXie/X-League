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
import { useI18n } from '@/i18n';

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
  const { t, money, clock } = useI18n();
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
        <DetailRow label={t.venue} value={`${BOOKING.venue} · ${BOOKING.pitch}`} />
        <DetailRow label={t.date} value={BOOKING.date} />
        <DetailRow label={t.time} value={`${slotLabel} – ${slotEndLabel}`} />
        <DetailRow label={t.format} value={t.fiveASide} />
      </View>

      <View style={{ gap: 10 }}>
        <Eyebrow>{t.payment}</Eyebrow>
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
              {t.cashAtVenue}
            </Txt>
            <Txt size={12} lh={1.55} color={onVoid.muted}>
              {t.cashExplainer(money(BOOKING.deposit), money(BOOKING.balance))}
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
        <PriceRow label={t.pitchHour} value={money(BOOKING.hourly)} />
        <PriceRow label={t.bookingFee} value={money(BOOKING.bookingFee)} />
        <Divider />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Txt size={13} weight="semibold" color={gold.base}>
            {t.cashAtGate}
          </Txt>
          <Txt size={16} weight="bold" color={gold.base}>
            {money(BOOKING.deposit)}
          </Txt>
        </View>
        <PriceRow label={t.balanceAfter} value={money(BOOKING.balance)} />
      </View>

      <Txt size={11.5} lh={1.6} color="rgba(243,238,229,.38)">
        {t.cancellationNote}
      </Txt>

      {expired ? (
        <Button
          label={t.findAnotherSlot}
          height={52}
          round={radius.control}
          size={15}
          onPress={() => router.back()}
        />
      ) : (
        <Button
          label={t.confirmBooking}
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
