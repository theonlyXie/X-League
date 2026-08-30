import { useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Txt } from '@/components/Txt';
import { hitSlopTo44 } from '@/components/ui';
import { ChevronLeft, ChevronRight } from '@/components/icons';
import { burgundy, ink, onOperative, operative, radius, void_ } from '@/theme/tokens';
import { BookingSource, CALENDAR_LEGEND, Cell } from '@/data/owner';
import { useOwnerDay } from '@/state/ownerDay';
import { addDays, today } from '@/data/venue';
import { recordOfflineBooking } from '@/data/api';
import { useI18n } from '@/i18n';

/**
 * O-02 Calendar — control inventory (§4.5).
 *
 * OWN-006 is the whole point of this screen: the calendar prevents overlaps and
 * identifies the source and state of every occupancy item, so an app booking,
 * a phone booking and a walk-in are visibly different things in one grid.
 *
 * OWN-003 is the other half, and it used to be missing. The grid showed every
 * channel and offered no way to *enter* one — "Add booking" had no handler, so
 * a venue taking a booking by phone had nowhere in the product to put it and
 * the calendar was authoritative about everything except the half of the
 * business it could not see. Tapping an open hour records one now.
 */
const SOURCE: Record<BookingSource, { bg: string; border: string; dashed: boolean; fg: string; sub: string }> = {
  app: { bg: 'rgba(198,163,75,.9)', border: '#B08F35', dashed: false, fg: ink, sub: 'rgba(20,18,16,.65)' },
  phone: { bg: void_.bg, border: void_.bg, dashed: false, fg: operative.bg, sub: 'rgba(243,238,229,.62)' },
  walk: { bg: operative.walkIn, border: operative.walkInBorder, dashed: false, fg: ink, sub: 'rgba(20,18,16,.6)' },
  open: { bg: 'transparent', border: 'rgba(20,18,16,.18)', dashed: true, fg: onOperative.dim, sub: onOperative.disabled },
  block: { bg: 'rgba(101,21,37,.1)', border: 'rgba(101,21,37,.35)', dashed: false, fg: burgundy.ink, sub: 'rgba(139,33,53,.75)' },
};

export default function OwnerCalendar() {
  const { t, longDate, slot } = useI18n();
  const router = useRouter();
  const [date, setDate] = useState(today());
  const { pitches, rows, live, loading, error, showcase, venueName, reload } = useOwnerDay(date);
  const [booking, setBooking] = useState<Cell | null>(null);

  const isToday = date === today();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: operative.bg }}
      contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 24, gap: 14 }}
      showsVerticalScrollIndicator={false}
      // E-3: the screen whose job is showing live occupancy had no way to
      // re-read it short of leaving and coming back.
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={ink} />}
    >
      {/* The Day/Week toggle that used to sit here wrote a state variable no
          other line in the file read, so tapping "Week" changed nothing. There
          is no week query behind it; a control that promises one and does
          nothing is worse than its absence. The day it does show is now the
          day you are looking at, and can be changed. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.ownPrevDay}
          onPress={() => setDate((d) => addDays(d, -1))}
          hitSlop={12}
        >
          <ChevronLeft size={16} color={onOperative.muted} />
        </Pressable>
        <Txt size={12} weight="semibold" color={ink}>
          {isToday ? t.ownToday : longDate(`${date}T12:00:00Z`)}
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.ownNextDay}
          onPress={() => setDate((d) => addDays(d, 1))}
          hitSlop={12}
        >
          <ChevronRight size={16} color={onOperative.muted} />
        </Pressable>
      </View>

      {pitches.length === 0 ? (
        <Panel
          title={live ? t.ownNoPitches : t.ownNoVenue}
          blurb={live ? t.ownNoPitchesBlurb : t.ownNoVenueBlurb}
        />
      ) : rows.length === 0 ? (
        <Panel title={t.ownCalendarEmpty} blurb={t.ownCalendarEmptyBlurb} />
      ) : (
        <View
          style={{
            borderRadius: radius.panel,
            backgroundColor: operative.surface,
            borderWidth: 1,
            borderColor: onOperative.hairline,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              borderBottomWidth: 1,
              borderBottomColor: onOperative.hairline,
              backgroundColor: operative.band,
            }}
          >
            <View style={{ width: 44 }} />
            {/* Columns come from the venue's own pitches. This used to be the
                fixture's `['A','B','C']` with the rows destructured `[a,b,c]`,
                so a fourth pitch was silently deleted from the screen. */}
            {pitches.map((p, i) => (
              <View
                key={p}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  paddingHorizontal: 6,
                  alignItems: 'center',
                  ...(i > 0 ? { borderLeftWidth: 1, borderLeftColor: 'rgba(20,18,16,.08)' } : null),
                }}
              >
                <Txt size={10.5} weight="bold" em={0.08} color={ink} numberOfLines={1}>
                  {p.toUpperCase()}
                </Txt>
              </View>
            ))}
          </View>

          {rows.map((row) => (
            <View key={row.hour} style={{ flexDirection: 'row' }}>
              <View
                style={{
                  width: 44,
                  height: 56,
                  paddingVertical: 5,
                  paddingHorizontal: 6,
                  alignItems: 'flex-end',
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(20,18,16,.07)',
                }}
              >
                <Txt size={10.5} color={onOperative.faint}>
                  {slot(row.time)}
                </Txt>
              </View>
              {row.cells.map((cell, i) => (
                <CalendarCell
                  key={i}
                  cell={cell}
                  first={i === 0}
                  time={row.time}
                  pitch={pitches[i]}
                  onPress={cell.source === 'open' && cell.pitchId ? () => setBooking(cell) : undefined}
                />
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Say where the grid came from, rather than letting fixtures pass as
          this evening's real occupancy (§4.7). */}
      <Txt size={11} color={error ? burgundy.ink : onOperative.faint}>
        {loading
          ? t.ownReadingCalendar
          : error
            ? error
            : live
              ? `Live from ${venueName}'s calendar`
              : showcase
                ? t.ownSampleDay
                : ''}
      </Txt>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {CALENDAR_LEGEND.map((entry) => {
          const spec = SOURCE[entry.source];
          return (
            <View key={entry.source} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  backgroundColor: spec.bg,
                  ...(spec.dashed
                    ? { borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(20,18,16,.3)' }
                    : null),
                }}
              />
              <Txt size={11} color={onOperative.muted}>
                {t[entry.label]}
              </Txt>
            </View>
          );
        })}
      </View>

      <Txt size={11} color={onOperative.faint}>
        {t.ownPickAnOpenHour}
      </Txt>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {/* OWN-005: closures already have a screen; this is the door to it
            rather than a second, dead copy of the same control. */}
        <OwnerAction label={t.ownBlockSlot} onPress={() => router.push('/owner/setup/closures')} />
      </View>

      <RecordBookingSheet
        cell={booking}
        date={date}
        onClose={() => setBooking(null)}
        onRecorded={() => {
          setBooking(null);
          void reload();
        }}
      />
    </ScrollView>
  );
}

function Panel({ title, blurb }: { title: string; blurb: string }) {
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

/**
 * OWN-003 / AC-05: a booking taken by phone or at the desk, into the same
 * timeline as everything else. `record_offline_booking` has existed and been
 * tested since the operations migration; this is its first caller.
 */
function RecordBookingSheet({
  cell,
  date,
  onClose,
  onRecorded,
}: {
  cell: Cell | null;
  date: string;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const { t, hour } = useI18n();
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<'phone' | 'walk_in'>('phone');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const submit = async () => {
    if (!cell?.pitchId || !cell.startsAt) return;
    setBusy(true);
    setFailed(null);
    const result = await recordOfflineBooking(cell.pitchId, cell.startsAt, channel, name.trim()).catch(() => ({
      ok: false,
      reason: t.ownCalendarUnreachable,
    }));
    setBusy(false);
    if (!result.ok) setFailed(result.reason ?? t.ownRecordFailed);
    else {
      setName('');
      onRecorded();
    }
  };

  return (
    <Modal visible={cell !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(8,8,8,.45)' }} onPress={onClose} />
      <View
        style={{
          backgroundColor: operative.surface,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          padding: 20,
          paddingBottom: 34,
          gap: 14,
        }}
      >
        <View style={{ gap: 4 }}>
          <Txt size={17} weight="bold" color={ink}>
            {t.ownRecordBooking}
          </Txt>
          <Txt size={12} color={onOperative.muted}>
            {t.ownRecordBlurb}
          </Txt>
        </View>

        {cell?.startsAt ? (
          <Txt size={13} weight="semibold" color={ink}>
            {t.ownHourAt(hour(cell.startsAt), cell.pitchLabel ?? '')}
          </Txt>
        ) : null}

        <View style={{ gap: 6 }}>
          <Txt size={10} weight="semibold" em={0.14} upper color={onOperative.faint}>
            {t.ownChannel}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['phone', 'walk_in'] as const).map((c) => {
              const on = c === channel;
              return (
                <Pressable
                  key={c}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={c === 'phone' ? t.ownChannelPhone : t.ownChannelWalkIn}
                  onPress={() => setChannel(c)}
                  hitSlop={hitSlopTo44(34)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: radius.denseChip,
                    ...(on
                      ? { backgroundColor: void_.bg }
                      : { borderWidth: 1, borderColor: onOperative.line }),
                  }}
                >
                  <Txt size={12.5} weight="semibold" color={on ? operative.bg : ink}>
                    {c === 'phone' ? t.ownChannelPhone : t.ownChannelWalkIn}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Txt size={10} weight="semibold" em={0.14} upper color={onOperative.faint}>
            {t.ownWhoFor}
          </Txt>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t.ownWhoForHint}
            placeholderTextColor={onOperative.disabled}
            accessibilityLabel={t.ownWhoFor}
            style={{
              height: 44,
              borderRadius: radius.dense,
              borderWidth: 1,
              borderColor: onOperative.line,
              paddingHorizontal: 12,
              color: ink,
              fontSize: 14,
            }}
          />
        </View>

        {failed ? (
          <Txt size={12} weight="semibold" color={burgundy.ink}>
            {failed}
          </Txt>
        ) : null}

        <OwnerAction
          filled
          label={busy ? t.ownRecording : t.ownRecordIt}
          onPress={name.trim().length > 0 && !busy ? submit : undefined}
        />
      </View>
    </Modal>
  );
}

function CalendarCell({
  cell,
  first,
  time,
  pitch,
  onPress,
}: {
  cell: Cell;
  first: boolean;
  time: string;
  pitch: string;
  onPress?: () => void;
}) {
  const spec = SOURCE[cell.source];
  return (
    <View
      style={{
        flex: 1,
        height: 56,
        padding: 4,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(20,18,16,.07)',
        ...(first ? null : { borderLeftWidth: 1, borderLeftColor: 'rgba(20,18,16,.08)' }),
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${time}, Pitch ${pitch}: ${cell.title}, ${cell.detail}`}
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => ({
          height: '100%',
          borderRadius: radius.cell,
          justifyContent: 'center',
          paddingHorizontal: 8,
          gap: 2,
          backgroundColor: spec.bg,
          borderWidth: 1,
          borderStyle: spec.dashed ? 'dashed' : 'solid',
          borderColor: spec.border,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Txt size={10.5} weight="bold" color={spec.fg} numberOfLines={1}>
          {cell.title}
        </Txt>
        <Txt size={9.5} color={spec.sub} numberOfLines={1}>
          {cell.detail}
        </Txt>
      </Pressable>
    </View>
  );
}

function OwnerAction({ label, filled, onPress }: { label: string; filled?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !onPress }}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flex: 1,
        height: 42,
        paddingHorizontal: 16,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        ...(filled
          ? { backgroundColor: void_.bg }
          : { borderWidth: 1, borderColor: onOperative.line }),
        opacity: !onPress ? 0.45 : pressed ? 0.85 : 1,
      })}
    >
      <Txt size={13} weight="semibold" color={filled ? operative.bg : ink}>
        {label}
      </Txt>
    </Pressable>
  );
}
