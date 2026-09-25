import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { ActionButton, BackHeader, DateStrip, SafeTop, Segmented, SlotRow, StickyFooter } from '@/components/kit';
import { Clock } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { BOOKING } from '@/data/player';
import { DEMO_VENUE_ID, dateFromToday, today } from '@/data/venue';
import { venueDetail, type VenueDetail } from '@/data/discovery';
import { useBooking } from '@/state/booking';
import { useSession } from '@/state/session';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * P-04b Select your slot — the hour, after the place (§4.2).
 *
 * The redesign's slot screen: a month over a strip of days, the pitch, the
 * duration, and the hours as a list with a tick on the one chosen. Selecting
 * one and pressing Proceed creates the server-side hold (BKG-002); nothing
 * before that claims anything.
 *
 * Duration is shown and not offered. The booking spine sells one hour at a
 * time, and a stepper that could only ever say "1 hour" would be a control
 * that does nothing. Two hours is two bookings, which is what it is at the
 * venue's end too.
 *
 * A pitch with more than one surface is a real choice: "Pitch A is free at 9"
 * and "Pitch B is free at 9" are different things to sell, and the list can
 * only show one.
 *
 * Everything the old pitch page said about the place — photos, amenities,
 * rules, reviews, top scorers, reporting — is on the venue page before this.
 */

/** How far ahead the strip reaches. Further than this nobody books on a phone. */
const DAYS_AHEAD = 14;

export default function SelectSlot() {
  const router = useRouter();
  const params = useLocalSearchParams<{ venue?: string; date?: string }>();
  const venueId = params.venue ?? DEMO_VENUE_ID;

  const {
    slot,
    selectSlot,
    slotHour,
    slotPrices,
    beginHold,
    taken,
    times,
    loading,
    unreachable,
    conflict,
    clearConflict,
    setTarget,
    pitchId,
    date: spineDate,
  } = useBooking();
  const { signedIn } = useSession();
  const { reason, t, money, hourLabel } = useI18n();

  const [venue, setVenue] = useState<VenueDetail | null>(null);
  const [loadingVenue, setLoadingVenue] = useState(isLive);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(params.date ?? today());

  const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => dateFromToday(i)), []);

  useEffect(() => {
    if (!isLive || !venueId) {
      setLoadingVenue(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingVenue(true);
      try {
        const detail = await venueDetail(venueId);
        if (cancelled) return;
        setVenue(detail);
        // Keep the pitch the venue page already pointed the spine at, if it
        // belongs to this venue; otherwise the venue's first.
        const keep = detail?.pitches.find((p) => p.id === pitchId);
        const first = keep ?? detail?.pitches[0];
        if (first) setTarget(first.id, date, venueId);
      } catch {
        // The spine's own `unreachable` covers the list below.
      } finally {
        if (!cancelled) setLoadingVenue(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `pitchId` and `date` deliberately left out: choosing either below must
    // not refetch the venue and snap the choice back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, setTarget]);

  const pickDate = (d: string) => {
    setDate(d);
    if (pitchId) setTarget(pitchId, d, venueId);
  };

  const formatName = (f: string) =>
    f === '5-a-side' ? t.amFiveASide : f === '7-a-side' ? t.amSevenASide : f === '11-a-side' ? t.amElevenASide : f;

  const showcase = !isLive || !venueId;
  const selectable = times.includes(slot) && !taken.includes(slot) && (showcase || spineDate === date);
  const activePitch = venue?.pitches.find((p) => p.id === pitchId) ?? venue?.pitches[0];

  const proceed = async () => {
    // AUTH-001: holding inventory is for signed-in people. The server refuses
    // an anonymous hold regardless; asking here saves a pointless round trip.
    if (isLive && !signedIn) {
      router.push(`/sign-in?next=/play/pitch?venue=${venueId}`);
      return;
    }
    setBusy(true);
    // Only move on if the slot is actually ours now.
    const held = await beginHold();
    setBusy(false);
    if (held) router.push('/play/checkout');
  };

  return (
    <View style={{ flex: 1, backgroundColor: void_.bg }}>
      <SafeTop />
      <BackHeader title={t.selectYourSlot} subtitle={venue?.name ?? (showcase ? BOOKING.venue : null)} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 18, paddingBottom: 24, gap: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <DateStrip value={date} days={days} onPick={pickDate} />

        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Txt size={14} weight="semibold" color={onVoid.secondary} style={{ minWidth: 72 }}>
              {t.duration}
            </Txt>
            <View
              accessibilityLabel={`${t.duration}: ${t.oneHour}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                height: 42,
                paddingHorizontal: 14,
                borderRadius: radius.chip,
                borderWidth: 1,
                borderColor: goldAlpha.edge,
              }}
            >
              <Clock size={16} color={gold.base} />
              <Txt size={13.5} weight="bold" color={onVoid.primary}>
                {t.oneHour}
              </Txt>
            </View>
          </View>

          {venue && venue.pitches.length ? (
            <Segmented
              label={t.pitch}
              value={pitchId}
              onPick={(id) => setTarget(id, date, venueId)}
              options={venue.pitches.map((p) => ({ key: p.id, label: p.label }))}
            />
          ) : null}
          {activePitch ? (
            <Txt size={11.5} color={onVoid.faint}>
              {[formatName(activePitch.format), activePitch.indoor ? t.indoor : null].filter(Boolean).join(' · ')}
            </Txt>
          ) : null}
        </View>

        <View style={{ height: 1, backgroundColor: onVoid.edgeFaint }} />

        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Txt size={17} weight="bold" color={onVoid.primary}>
              {t.availableSlots}
            </Txt>
            {loading || loadingVenue ? <ActivityIndicator color={gold.base} /> : null}
          </View>

          {/* BKG-011: losing the slot is a real outcome, so it gets said. */}
          {conflict ? (
            <Pressable
              accessibilityRole="alert"
              accessibilityLabel={reason(conflict.reason) ?? undefined}
              onPress={clearConflict}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: radius.chip,
                borderWidth: 1,
                borderColor: 'rgba(101,21,37,.5)',
                backgroundColor: 'rgba(101,21,37,.09)',
                gap: 4,
              }}
            >
              <Txt size={12.5} weight="semibold" color={burgundy.action}>
                {reason(conflict.reason)}
              </Txt>
              {conflict.alternatives.length ? (
                <Txt size={11.5} color={onVoid.muted}>
                  {/* Each alternative is an hour, formatted as one. */}
                  {t.stillFree(conflict.alternatives.map((a) => hourLabel(Number(a))).join(' · '))}
                </Txt>
              ) : null}
            </Pressable>
          ) : null}

          {!loading && times.length === 0 ? (
            <View style={{ paddingVertical: 36, alignItems: 'center' }}>
              <Txt size={13} align="center" color={onVoid.muted}>
                {unreachable ? t.calendarUnreachable : t.noHoursThisDay}
              </Txt>
            </View>
          ) : null}

          <View style={{ gap: 10 }}>
            {times.map((h) => {
              const hr = Number(h);
              const sold = taken.includes(h);
              return (
                <SlotRow
                  key={h}
                  label={`${hourLabel(hr)} – ${hourLabel((hr + 1) % 24)}`}
                  price={slotPrices[h] ? money(slotPrices[h]) : null}
                  selected={h === slot && !sold}
                  taken={sold}
                  takenLabel={t.booked}
                  onPress={() => selectSlot(h)}
                />
              );
            })}
          </View>

          {/* §5.4: one canonical timeline, every channel included. */}
          {times.length ? (
            <Txt size={11.5} lh={1.5} color={onVoid.dim}>
              {unreachable ? t.calendarUnreachable : t.calendarNote}
            </Txt>
          ) : null}
        </View>
      </ScrollView>

      <StickyFooter>
        {selectable ? (
          <View style={{ gap: 2 }}>
            <Txt size={17} weight="bold" color={onVoid.primary}>
              {money(slotPrices[slot] ?? (showcase ? BOOKING.hourly : 0))}
            </Txt>
            <Txt size={10.5} color={onVoid.dim}>
              {hourLabel(slotHour)}
            </Txt>
          </View>
        ) : null}
        <ActionButton
          label={busy ? t.checking : isLive && !signedIn ? t.signInToHold(hourLabel(slotHour)) : t.proceed}
          flex
          disabled={!selectable || busy}
          onPress={proceed}
        />
      </StickyFooter>
    </View>
  );
}
