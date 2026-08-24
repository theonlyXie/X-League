import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { hitSlopTo44 } from '@/components/ui';
import { Check, MoreHorizontal } from '@/components/icons';
import { burgundy, gold, ink, onOperative, operative, radius, void_ } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import { Arrival, ARRIVALS, OPEN_TONIGHT, OWNER_KPIS } from '@/data/owner';
import { useOwnerToday } from '@/state/ownerToday';
import * as api from '@/data/api';
import { useBooking } from '@/state/booking';
import { useI18n } from '@/i18n';

/**
 * O-01 Today — run the current shift (§4.5).
 *
 * The app booking that just landed is the one highlighted item: OWN-003 puts
 * every channel in the same calendar, so the operator's job is knowing which
 * arrival needs what, not reconciling three sources.
 */
export default function OwnerToday() {
  const { t } = useI18n();
  const { arrivals, summary, loading, error, live, venueName, reload } = useOwnerToday();

  // The tiles and the arrival list come from the same timeline as the calendar;
  // when there is no venue to read, the design's sample shift stands in and the
  // screen says so rather than passing it off as tonight.
  const tiles = summary
    ? [
        { label: 'OCCUPANCY', value: `${summary.occupancyPct}%`, sub: `${summary.openSlots} slots open`, accent: false },
        { label: 'CASH DUE', value: `${summary.cashDueEgp}`, sub: `EGP · ${summary.cashGates} gates`, accent: true },
        { label: 'CONFLICTS', value: `${summary.conflicts}`, sub: 'one calendar', accent: false },
      ]
    : OWNER_KPIS;

  const rows: Arrival[] = arrivals ? arrivals.map((a) => toArrival(a, t.ownWalkIn)) : ARRIVALS;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: operative.bg }}
      contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 24, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
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
            <Txt size={10} color="rgba(20,18,16,.42)">
              {kpi.sub}
            </Txt>
          </View>
        ))}
      </View>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Txt size={10} weight="semibold" em={0.16} upper color={onOperative.faint}>
            Next arrivals
          </Txt>
          <Txt size={11} color={onOperative.dim}>
            live
          </Txt>
        </View>

        {rows.map((arrival, i) => (
          <ArrivalCard key={`${arrival.time}-${i}`} arrival={arrival} onChanged={reload} />
        ))}

        <Txt size={11} color={error ? burgundy.ink : onOperative.faint}>
          {loading
            ? t.ownReadingCalendar
            : error
              ? error
              : live
                ? `Live from ${venueName}'s calendar`
                : t.ownSampleShift}
        </Txt>
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
            {OPEN_TONIGHT.count} slots open tonight
          </Txt>
          <Txt size={11.5} color={onOperative.muted}>
            {OPEN_TONIGHT.detail}
          </Txt>
        </View>
        {/* OWN-007: a price lever the owner can pull without phoning captains. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.ownDiscountOpen}
          hitSlop={hitSlopTo44(34)}
          style={({ pressed }) => ({
            height: 34,
            paddingHorizontal: 12,
            borderRadius: radius.dense,
            backgroundColor: void_.bg,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Txt size={12} weight="semibold" color={operative.bg}>
            Discount
          </Txt>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ArrivalCard({ arrival, onChanged }: { arrival: Arrival; onChanged?: () => void }) {
  const { t } = useI18n();
  const { checkedIn: demoCheckedIn, toggleCheckIn } = useBooking();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const highlighted = !!arrival.justBooked;

  // A real arrival carries its own booking id and its own check-in state; the
  // fixture falls back to the demo toggle.
  const checkedIn = arrival.bookingId ? !!arrival.checkedIn : demoCheckedIn;

  const check = async () => {
    if (!arrival.bookingId) {
      toggleCheckIn();
      return;
    }
    setBusy(true);
    setFailed(null);
    const result = await api.checkInBooking(arrival.bookingId).catch(() => ({ ok: false, reason: t.ownCalendarUnreachable }));
    setBusy(false);
    if (!result.ok) setFailed(result.reason ?? t.ownCheckInRefused);
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
            JUST BOOKED IN THE APP
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

        {highlighted ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {/* BKG-009: the venue-authorised user checks in and takes the cash. */}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ checked: checkedIn }}
              accessibilityLabel={checkedIn ? t.ownCheckedIn : 'Check in and collect EGP 100'}
              onPress={check}
              disabled={busy}
              hitSlop={hitSlopTo44(38)}
              style={({ pressed }) => ({
                flex: 1,
                height: 38,
                borderRadius: radius.dense,
                backgroundColor: checkedIn ? '#241f14' : void_.bg,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Txt size={12.5} weight="semibold" color={operative.bg}>
                {busy ? t.ownCheckingIn : checkedIn ? t.ownCheckedIn : t.ownCheckIn}
              </Txt>
              {checkedIn ? <Check size={13} color={gold.base} /> : null}
            </Pressable>
            <OwnerGhostButton label={t.ownMove} width={80} />
            <OwnerGhostButton label={t.ownMoreActions} width={44} icon />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function OwnerGhostButton({ label, width, icon }: { label: string; width: number; icon?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={hitSlopTo44(38)}
      style={({ pressed }) => ({
        width,
        height: 38,
        borderRadius: radius.dense,
        borderWidth: 1,
        borderColor: onOperative.line,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon ? (
        <MoreHorizontal size={16} color={onOperative.muted} />
      ) : (
        <Txt size={12.5} weight="semibold" color={ink}>
          {label}
        </Txt>
      )}
    </Pressable>
  );
}

/** Turn a live arrival into the row shape this screen already draws. */
function toArrival(a: api.Arrival, walkIn: string): Arrival {
  const hour12 = a.hour > 12 ? a.hour - 12 : a.hour;
  const app = a.source === 'app';
  return {
    time: `${hour12}:00`,
    meridiem: a.hour >= 12 ? 'PM' : 'AM',
    title: `${a.captainName ?? walkIn} · ${a.pitchLabel}`,
    source: a.source === 'walk_in' ? 'walk' : a.source === 'block' ? 'block' : app ? 'app' : 'phone',
    badge: app ? undefined : a.source === 'walk_in' ? 'DESK' : a.source.toUpperCase(),
    detail: '5-a-side · 5 + 2 subs · 60 min',
    money:
      app && !a.checkedIn && a.depositEgp > 0
        ? { text: `EGP ${a.depositEgp} cash to collect at gate`, tone: 'due' as const }
        : undefined,
    justBooked: app && a.code ? { code: a.code } : undefined,
    bookingId: a.bookingId,
    checkedIn: a.checkedIn,
    depositEgp: a.depositEgp,
  };
}
