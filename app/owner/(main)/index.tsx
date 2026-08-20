import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { hitSlopTo44 } from '@/components/ui';
import { Check } from '@/components/icons';
import { burgundy, gold, ink, onOperative, operative, radius, void_ } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import * as api from '@/data/api';
import { Arrival, ARRIVALS, OPEN_TONIGHT, OWNER_KPIS } from '@/data/owner';
import { BOOKING_DATE } from '@/data/venue';
import { cairoDate } from '@/lib/dates';
import { arrivalsWithLiveBooking } from '@/lib/ownerLive';
import { isLive } from '@/lib/supabase';
import { getDefaultVenueId } from '@/lib/venueConfig';
import { useI18n } from '@/i18n';
import { useBooking } from '@/state/booking';
import { useProfile } from '@/state/profile';
import { useSession } from '@/state/session';

/**
 * O-01 Today — run the current shift (§4.5).
 *
 * Cash only: the owner confirms the deposit was collected at the gate.
 * No in-app payments — check-in is the payment confirmation.
 */
export default function OwnerToday() {
  const { t } = useI18n();
  const { discountActive, toggleDiscount, activeBooking, checkedIn, confirmCashCollection } = useBooking();
  const { card } = useProfile();
  const { venues } = useSession();
  const [liveArrivals, setLiveArrivals] = useState<Arrival[] | null>(null);
  const [kpis, setKpis] = useState<{ label: string; value: string; sub: string; accent: boolean }[]>([
    ...OWNER_KPIS,
  ]);
  const [openTonight, setOpenTonight] = useState(OPEN_TONIGHT);
  const [loading, setLoading] = useState(isLive);
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const venueId = venues[0]?.venueId ?? getDefaultVenueId();

  const loadLive = useCallback(async () => {
    if (!isLive || !venueId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const date = cairoDate();
      let arrivals = await api.ownerArrivals(venueId, date);
      let summary = await api.ownerSummary(venueId, date);
      if (!arrivals.length) {
        arrivals = await api.ownerArrivals(venueId, BOOKING_DATE);
        summary = await api.ownerSummary(venueId, BOOKING_DATE);
      }
      setLiveArrivals(arrivals.map(mapApiArrival));
      setKpis([
        {
          label: 'OCCUPANCY',
          value: `${summary.occupancyPct}%`,
          sub: `${summary.openSlots} slots open`,
          accent: false,
        },
        {
          label: 'CASH DUE',
          value: String(summary.cashDueEgp),
          sub: `EGP · ${summary.cashGates} gates`,
          accent: true,
        },
        {
          label: 'CONFLICTS',
          value: String(summary.conflicts),
          sub: 'one calendar',
          accent: false,
        },
      ]);
      setOpenTonight({
        count: summary.openSlots,
        detail: summary.openSlots ? 'Open hours still saleable tonight' : 'Fully booked tonight',
      });
      setCheckedIds(new Set(arrivals.filter((a) => a.checkedIn).map((a) => a.bookingId)));
    } catch {
      setLiveArrivals(null);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    void loadLive();
  }, [loadLive]);

  const arrivals = useMemo(() => {
    if (liveArrivals) {
      if (!activeBooking || activeBooking.status === 'cancelled') return liveArrivals;
      const has = liveArrivals.some((a) => a.justBooked?.code === activeBooking.code);
      if (has) return liveArrivals;
      return [arrivalsWithLiveBooking(activeBooking, card.name, [])[0]!, ...liveArrivals];
    }
    return arrivalsWithLiveBooking(activeBooking, card.name, ARRIVALS);
  }, [liveArrivals, activeBooking, card.name]);

  const onCollect = async (arrival: Arrival) => {
    const id = arrival.bookingId;
    if (id && checkedIds.has(id)) return;
    if (!id && checkedIn && arrival.justBooked?.code === activeBooking?.code) return;

    setCollectingId(id ?? arrival.justBooked?.code ?? 'local');
    try {
      await confirmCashCollection(id);
      if (id) setCheckedIds((prev) => new Set(prev).add(id));
      if (isLive) await loadLive();
    } finally {
      setCollectingId(null);
    }
  };

  const isCollected = (arrival: Arrival) => {
    if (arrival.bookingId && checkedIds.has(arrival.bookingId)) return true;
    if (arrival.justBooked?.code === activeBooking?.code && checkedIn) return true;
    if (arrival.checkedIn) return true;
    return false;
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: operative.bg }}
      contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 24, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{
          padding: 12,
          borderRadius: radius.panel,
          backgroundColor: 'rgba(198,163,75,.1)',
          borderWidth: 1,
          borderColor: 'rgba(198,163,75,.35)',
          gap: 4,
        }}
      >
        <Txt size={12} weight="bold" color={gold.ink}>
          {t('owner.cashBannerTitle')}
        </Txt>
        <Txt size={11.5} color={onOperative.muted}>
          {t('owner.cashBannerBody')}
        </Txt>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {kpis.map((kpi) => (
          <View
            key={kpi.label}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: radius.panel,
              backgroundColor: operative.surface,
              borderWidth: 1,
              borderColor: kpi.accent ? 'rgba(198,163,75,.5)' : onOperative.hairline,
              gap: 6,
            }}
          >
            <Txt size={9.5} weight="semibold" em={0.14} color={onOperative.faint}>
              {kpi.label}
            </Txt>
            <Txt size={20} weight="bold" em={-0.02} color={kpi.accent ? gold.ink : ink}>
              {kpi.value}
            </Txt>
            <Txt size={10} color="rgba(20,18,16,.42)">
              {kpi.sub}
            </Txt>
          </View>
        ))}
      </View>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Txt size={10} weight="semibold" em={0.16} upper color={onOperative.faint}>
            {t('owner.nextArrivals')}
          </Txt>
          <Txt size={11} color={onOperative.dim}>
            {isLive ? t('owner.liveCash') : t('owner.demoCash')}
          </Txt>
        </View>

        {loading ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <ActivityIndicator color={gold.base} />
          </View>
        ) : (
          arrivals.map((arrival, i) => (
            <ArrivalCard
              key={`${arrival.time}-${arrival.justBooked?.code ?? arrival.bookingId ?? i}`}
              arrival={arrival}
              collected={isCollected(arrival)}
              busy={collectingId === (arrival.bookingId ?? arrival.justBooked?.code ?? 'local')}
              onCollect={() => void onCollect(arrival)}
              labels={{
                appCash: t('owner.appBookingCash'),
                checkIn: (amount) => t('owner.checkInCollect', { amount }),
                confirming: t('owner.confirming'),
                collected: t('owner.cashCollected'),
                collectedLine: (amount) => t('owner.cashCollectedLine', { amount }),
              }}
            />
          ))
        )}
      </View>

      <View
        style={{
          padding: 14,
          borderRadius: radius.panel,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: 'rgba(20,18,16,.22)',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Txt size={13} weight="semibold" color={ink}>
            {t('owner.openTonight', { count: openTonight.count })}
          </Txt>
          <Txt size={11.5} color={onOperative.muted}>
            {openTonight.detail}
          </Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('owner.discount')}
          onPress={toggleDiscount}
          hitSlop={hitSlopTo44(34)}
          style={({ pressed }) => ({
            height: 34,
            paddingHorizontal: 12,
            borderRadius: radius.dense,
            backgroundColor: discountActive ? gold.base : void_.bg,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Txt size={12} weight="semibold" color={discountActive ? ink : operative.bg}>
            {discountActive ? t('owner.discountLive') : t('owner.discount')}
          </Txt>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function mapApiArrival(a: api.Arrival): Arrival {
  const starts = new Date(a.startsAt);
  const hour = a.hour > 12 ? a.hour - 12 : a.hour;
  const source =
    a.source === 'app'
      ? 'app'
      : a.source === 'phone' || a.source === 'whatsapp'
        ? 'phone'
        : a.source === 'block'
          ? 'block'
          : 'walk';
  return {
    time: `${hour}:00`,
    meridiem: a.hour >= 12 ? 'PM' : 'AM',
    title: `${a.captainName ?? 'Guest'} · ${a.pitchLabel}`,
    source,
    badge: source === 'app' ? undefined : source === 'phone' ? 'PHONE' : source === 'walk' ? 'DESK' : 'BLOCK',
    detail: '5-a-side · 60 min',
    money:
      a.checkedIn || a.state === 'checked_in' || a.state === 'completed'
        ? { text: `EGP ${a.depositEgp} cash collected`, tone: 'due' }
        : a.depositEgp > 0
          ? { text: `EGP ${a.depositEgp} cash to collect at gate`, tone: 'due' }
          : undefined,
    justBooked: a.source === 'app' && a.code ? { code: a.code } : undefined,
    bookingId: a.bookingId,
    checkedIn: a.checkedIn,
    depositEgp: a.depositEgp,
  };
}

function ArrivalCard({
  arrival,
  collected,
  busy,
  onCollect,
  labels,
}: {
  arrival: Arrival;
  collected: boolean;
  busy: boolean;
  onCollect: () => void;
  labels: {
    appCash: string;
    checkIn: (amount: number) => string;
    confirming: string;
    collected: string;
    collectedLine: (amount: number) => string;
  };
}) {
  const highlighted = !!arrival.justBooked;
  const needsCash = !!arrival.money || highlighted || !!arrival.bookingId;
  const deposit = arrival.depositEgp ?? (arrival.money?.text.match(/\d+/)?.[0] ? Number(arrival.money.text.match(/\d+/)![0]) : 100);

  return (
    <View
      style={{
        borderRadius: radius.panel,
        backgroundColor: operative.surface,
        borderWidth: 1,
        borderColor: highlighted ? 'rgba(198,163,75,.6)' : onOperative.hairline,
        overflow: 'hidden',
      }}
    >
      {arrival.justBooked ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingVertical: 8,
            paddingHorizontal: 14,
            backgroundColor: 'rgba(198,163,75,.14)',
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(198,163,75,.3)',
          }}
        >
          <View style={{ width: 6, height: 6, borderRadius: radius.pill, backgroundColor: gold.base }} />
          <Txt size={10} weight="bold" em={0.14} color={gold.ink}>
            {labels.appCash}
          </Txt>
          <View style={{ flex: 1 }} />
          <Txt size={10.5} color={gold.ink} style={{ fontFamily: mono }}>
            {arrival.justBooked.code}
          </Txt>
        </View>
      ) : null}

      <View style={{ padding: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ width: 52, alignItems: 'center', gap: 2 }}>
            <Txt size={16} weight="bold" em={-0.02} color={ink}>
              {arrival.time}
            </Txt>
            <Txt size={10} color={onOperative.faint}>
              {arrival.meridiem}
            </Txt>
          </View>
          <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: onOperative.hairline }} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <Txt size={14} weight="bold" color={ink}>
                {arrival.title}
              </Txt>
              {arrival.badge ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: 'rgba(20,18,16,.2)',
                    borderRadius: 4,
                    paddingVertical: 2,
                    paddingHorizontal: 4,
                  }}
                >
                  <Txt size={9} weight="bold" em={0.1} color={onOperative.faint}>
                    {arrival.badge}
                  </Txt>
                </View>
              ) : null}
            </View>
            <Txt size={11.5} color={onOperative.muted}>
              {arrival.detail}
            </Txt>
            {arrival.money ? (
              <Txt
                size={11.5}
                weight="semibold"
                color={collected ? onOperative.muted : arrival.money.tone === 'due' ? gold.ink : burgundy.ink}
              >
                {collected ? labels.collectedLine(deposit) : arrival.money.text}
              </Txt>
            ) : null}
          </View>
        </View>

        {needsCash && arrival.source !== 'block' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ checked: collected, disabled: collected || busy }}
            accessibilityLabel={collected ? labels.collected : labels.checkIn(deposit)}
            disabled={collected || busy}
            onPress={onCollect}
            hitSlop={hitSlopTo44(38)}
            style={({ pressed }) => ({
              height: 40,
              borderRadius: radius.dense,
              backgroundColor: collected ? '#241f14' : void_.bg,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              opacity: pressed || busy ? 0.85 : 1,
            })}
          >
            <Txt size={12.5} weight="semibold" color={operative.bg}>
              {collected ? labels.collected : busy ? labels.confirming : labels.checkIn(deposit)}
            </Txt>
            {collected ? <Check size={13} color={gold.base} /> : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
