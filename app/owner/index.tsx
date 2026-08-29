import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { hitSlopTo44 } from '@/components/ui';
import { Check } from '@/components/icons';
import { burgundy, gold, ink, onOperative, operative, radius, void_ } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import { Arrival, ARRIVALS, OPEN_TONIGHT, OWNER_KPIS } from '@/data/owner';
import { useOwnerToday } from '@/state/ownerToday';
import * as api from '@/data/api';
import { markNoShow, recordPayment } from '@/data/manage';
import { useBooking } from '@/state/booking';
import { useI18n } from '@/i18n';

/**
 * O-01 Today — run the current shift (§4.5).
 *
 * OWN-003 puts every channel in the same calendar, so the operator's job is
 * knowing which arrival needs what, not reconciling three sources. That is why
 * the gate controls below are drawn against every arrival rather than only the
 * app bookings: a phone booking that cannot be checked in is a booking the
 * venue has to work around the product to serve.
 *
 * The fixtures on this screen are for the demo build and the signed-out
 * visitor only. An operator whose calendar cannot be read is told so and shown
 * nothing else — being shown somebody else's evening is worse than being shown
 * none of your own.
 */
export default function OwnerToday() {
  const { t, money, num } = useI18n();
  const { arrivals, summary, loading, error, live, showcase, venueName, reload } = useOwnerToday();

  const tiles = summary
    ? [
        {
          label: 'OCCUPANCY',
          value: `${num(summary.occupancyPct)}%`,
          sub: t.ownSlotsOpenToday(num(summary.openSlots)),
          accent: false,
        },
        {
          label: 'CASH DUE',
          value: money(summary.cashDueEgp),
          sub: `${num(summary.cashGates)} · ${t.ownAtTheGate}`,
          accent: true,
        },
        { label: 'CONFLICTS', value: num(summary.conflicts), sub: 'one calendar', accent: false },
      ]
    : showcase
      ? OWNER_KPIS
      : null;

  const rows: Arrival[] | null = arrivals
    ? arrivals.map((a) => toArrival(a, t.ownWalkIn, money, t.ownDueAtGate, t.ownPaidInFull))
    : showcase
      ? ARRIVALS
      : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: operative.bg }}
      contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 24, gap: 18 }}
      showsVerticalScrollIndicator={false}
      // E-2: an operator works a whole shift off this screen. Without this the
      // 7 PM numbers were still on it at 11 PM.
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={ink} />}
    >
      {tiles ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {tiles.map((kpi) => (
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
              <Txt size={10} color={onOperative.dim}>
                {kpi.sub}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Txt size={10} weight="semibold" em={0.16} upper color={onOperative.faint}>
            Next arrivals
          </Txt>
        </View>

        {rows?.map((arrival, i) => (
          <ArrivalCard key={arrival.bookingId ?? `${arrival.time}-${i}`} arrival={arrival} onChanged={reload} />
        ))}

        {rows && rows.length === 0 ? (
          <Empty title={t.ownNoArrivals} blurb={t.ownNoArrivalsBlurb} />
        ) : null}

        {rows === null && !loading && !error ? (
          <Empty title={t.ownNoVenue} blurb={t.ownNoVenueBlurb} />
        ) : null}

        <Txt size={11} color={error ? burgundy.ink : onOperative.faint}>
          {loading
            ? t.ownReadingCalendar
            : error
              ? error
              : live
                ? `Live from ${venueName}'s calendar`
                : showcase
                  ? t.ownSampleShift
                  : ''}
        </Txt>
      </View>

      {/* OWN-007: the open hours, and the lever that fills them. The count is
          the venue's own when there is one; the fixture only stands in for the
          showcase, and never beside a live tile saying something different. */}
      {summary || showcase ? (
        <View
          style={{
            padding: 14,
            borderRadius: radius.panel,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: 'rgba(20,18,16,.22)',
            gap: 3,
          }}
        >
          <Txt size={13} weight="semibold" color={ink}>
            {summary ? t.ownSlotsOpenToday(num(summary.openSlots)) : `${OPEN_TONIGHT.count} slots open tonight`}
          </Txt>
          <Txt size={11.5} color={onOperative.muted}>
            {summary ? t.ownDiscountSoon : OPEN_TONIGHT.detail}
          </Txt>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Empty({ title, blurb }: { title: string; blurb: string }) {
  return (
    <View
      style={{
        padding: 18,
        borderRadius: radius.panel,
        backgroundColor: operative.surface,
        borderWidth: 1,
        borderColor: onOperative.hairline,
        gap: 5,
      }}
    >
      <Txt size={14} weight="semibold" color={ink}>
        {title}
      </Txt>
      <Txt size={12} color={onOperative.muted}>
        {blurb}
      </Txt>
    </View>
  );
}

function ArrivalCard({ arrival, onChanged }: { arrival: Arrival; onChanged?: () => void }) {
  const { t } = useI18n();
  const { checkedIn: demoCheckedIn, toggleCheckIn } = useBooking();
  const [busy, setBusy] = useState<'check' | 'collect' | 'noshow' | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const highlighted = !!arrival.justBooked;

  // A real arrival carries its own booking id and its own state; the fixture
  // falls back to the demo toggle.
  const bookingId = arrival.bookingId;
  const checkedIn = bookingId ? !!arrival.checkedIn : demoCheckedIn;
  const owed = arrival.dueEgp ?? 0;
  const noShow = arrival.state === 'no_show';

  /** Every gate action is the same three lines; only the verb differs. */
  const run = async (
    kind: 'check' | 'collect' | 'noshow',
    call: (id: string) => Promise<{ ok: boolean; reason?: string }>,
    refusal: string,
  ) => {
    if (!bookingId) {
      toggleCheckIn();
      return;
    }
    setBusy(kind);
    setFailed(null);
    const result = await call(bookingId).catch(() => ({ ok: false, reason: t.ownCalendarUnreachable }));
    setBusy(null);
    if (!result.ok) setFailed(result.reason ?? refusal);
    else onChanged?.();
  };

  return (
    <View
      style={{
        borderRadius: radius.panel,
        backgroundColor: operative.surface,
        borderWidth: 1,
        borderColor: highlighted ? 'rgba(198,163,75,.6)' : onOperative.hairline,
        overflow: 'hidden',
        ...(highlighted
          ? {
              shadowColor: '#C6A34B',
              shadowOpacity: 0.14,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }
          : null),
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
            BOOKED IN THE APP
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
              {/* OWN-006: every occupancy item names its source. */}
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
                color={arrival.money.tone === 'due' ? gold.ink : burgundy.ink}
              >
                {arrival.money.text}
              </Txt>
            ) : null}
          </View>
        </View>

        {failed ? (
          <Txt size={11.5} weight="semibold" color={burgundy.ink}>
            {failed}
          </Txt>
        ) : null}

        {/* BKG-009: the venue-authorised user checks in and takes the cash.
            Drawn for every arrival with a booking behind it — this used to be
            gated on `justBooked`, so a venue physically could not check in the
            phone booking sitting in the next row. */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
            <GateButton
              filled
              label={busy === 'check' ? t.ownCheckingIn : checkedIn ? t.ownCheckedIn : t.ownCheckIn}
              accessibilityLabel={
                checkedIn ? t.ownCheckedIn : owed > 0 ? t.ownCollectLabel(arrival.money?.amount ?? '') : t.ownCheckIn
              }
              checked={checkedIn}
              disabled={busy !== null || checkedIn || noShow}
              onPress={() => run('check', api.checkInBooking, t.ownCheckInRefused)}
              trailing={checkedIn ? <Check size={13} color={gold.base} /> : null}
            />
            {owed > 0 ? (
              <GateButton
                label={busy === 'collect' ? t.ownCollecting : t.ownCollect}
                disabled={busy !== null || noShow}
                onPress={() => run('collect', (id) => recordPayment(id), t.ownCollectRefused)}
              />
            ) : null}
            {/* BKG-010. Nothing anywhere could reach this, so a venue's
                no-show count was permanently zero and the booking restriction
                it feeds could never fire. */}
            {!checkedIn ? (
              <GateButton
                label={busy === 'noshow' ? t.ownMarkingNoShow : noShow ? t.ownDidNotArrive : t.ownNoShow}
                disabled={busy !== null || noShow}
                onPress={() => run('noshow', markNoShow, t.ownNoShowRefused)}
              />
            ) : null}
        </View>
      </View>
    </View>
  );
}

function GateButton({
  label,
  accessibilityLabel,
  onPress,
  disabled,
  filled,
  checked,
  trailing,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress?: () => void;
  disabled?: boolean;
  filled?: boolean;
  checked?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, ...(checked !== undefined ? { checked } : null) }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlopTo44(38)}
      style={({ pressed }) => ({
        flex: 1,
        height: 38,
        paddingHorizontal: 10,
        borderRadius: radius.dense,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        ...(filled
          ? { backgroundColor: checked ? '#241f14' : void_.bg }
          : { borderWidth: 1, borderColor: onOperative.line }),
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
      })}
    >
      <Txt size={12.5} weight="semibold" color={filled ? operative.bg : ink} numberOfLines={1}>
        {label}
      </Txt>
      {trailing}
    </Pressable>
  );
}

/** Turn a live arrival into the row shape this screen already draws. */
function toArrival(
  a: api.Arrival,
  walkIn: string,
  money: (n: number) => string,
  dueAtGate: (amount: string) => string,
  paidInFull: string,
): Arrival {
  const hour12 = a.hour > 12 ? a.hour - 12 : a.hour === 0 ? 12 : a.hour;
  const app = a.source === 'app';
  const amount = money(a.dueEgp);
  return {
    time: `${hour12}:00`,
    meridiem: a.hour >= 12 ? 'PM' : 'AM',
    title: `${a.captainName ?? walkIn} · ${a.pitchLabel}`,
    source: a.source === 'walk_in' ? 'walk' : a.source === 'block' ? 'block' : app ? 'app' : 'phone',
    badge: app ? undefined : a.source === 'walk_in' ? 'DESK' : a.source.toUpperCase(),
    // What this booking actually is, rather than a sentence about a format and
    // a squad size that came from the design fixture and was true of nothing.
    detail: a.pitchLabel,
    money:
      a.dueEgp > 0
        ? { text: dueAtGate(amount), amount, tone: 'due' as const }
        : a.paid
          ? { text: paidInFull, amount, tone: 'due' as const }
          : undefined,
    justBooked: app && a.code ? { code: a.code } : undefined,
    bookingId: a.bookingId,
    checkedIn: a.checkedIn,
    dueEgp: a.dueEgp,
    state: a.state,
  };
}
