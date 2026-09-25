import { ReactNode, useState } from 'react';
import { Modal, Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from '@/components/Txt';
import { OpField } from '@/components/operative';
import { OpActionButton, OpCard, OpEmpty, OpPage, OpPill, OpPills } from '@/components/kitOperative';
import { Ban, ChevronLeft, ChevronRight, Clock, Close } from '@/components/icons';
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
  const { reason, t, longDate, slot } = useI18n();
  const router = useRouter();
  const [date, setDate] = useState(today());
  const { pitches, rows, live, loading, error, showcase, venueName, reload } = useOwnerDay(date);
  const [booking, setBooking] = useState<Cell | null>(null);

  const isToday = date === today();

  return (
    <OpPage
      gap={16}
      // E-3: the screen whose job is showing live occupancy had no way to
      // re-read it short of leaving and coming back.
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={ink} />}
    >
      {/* The Day/Week toggle that used to sit here wrote a state variable no
          other line in the file read, so tapping "Week" changed nothing. There
          is no week query behind it; a control that promises one and does
          nothing is worse than its absence. The day it does show is now the
          day you are looking at, and can be changed. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <DayStep label={t.ownPrevDay} onPress={() => setDate((d) => addDays(d, -1))}>
          <ChevronLeft size={18} color={ink} />
        </DayStep>
        <View style={{ flex: 1, alignItems: 'center', gap: 1 }}>
          <Txt size={17} weight="bold" em={-0.01} color={ink} numberOfLines={1}>
            {isToday ? t.ownToday : longDate(`${date}T12:00:00Z`)}
          </Txt>
          {isToday ? (
            <Txt size={11.5} color={onOperative.muted} numberOfLines={1}>
              {longDate(`${date}T12:00:00Z`)}
            </Txt>
          ) : null}
        </View>
        <DayStep label={t.ownNextDay} onPress={() => setDate((d) => addDays(d, 1))}>
          <ChevronRight size={18} color={ink} />
        </DayStep>
      </View>

      {pitches.length === 0 ? (
        <OpEmpty
          title={live ? t.ownNoPitches : t.ownNoVenue}
          blurb={live ? t.ownNoPitchesBlurb : t.ownNoVenueBlurb}
        />
      ) : rows.length === 0 ? (
        <OpEmpty title={t.ownCalendarEmpty} blurb={t.ownCalendarEmptyBlurb} />
      ) : (
        // The grid keeps its density: an hour is 56 tall and a pitch is a
        // column, so a whole evening across every pitch fits one screen. Only
        // the frame around it took the redesign's corners.
        <View
          style={{
            borderRadius: radius.cardInner,
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
                  paddingVertical: 10,
                  paddingHorizontal: 6,
                  alignItems: 'center',
                  ...(i > 0 ? { borderLeftWidth: 1, borderLeftColor: 'rgba(20,18,16,.08)' } : null),
                }}
              >
                <Txt size={11} weight="bold" em={0.08} color={ink} numberOfLines={1}>
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
      <Txt size={11.5} color={error ? burgundy.ink : onOperative.faint}>
        {loading
          ? t.ownReadingCalendar
          : error
            ? error
            : live
              ? t.ownLiveFrom(venueName ?? '')
              : showcase
                ? t.ownSampleDay
                : ''}
      </Txt>

      <OpCard pad={14}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 8 }}>
          {CALENDAR_LEGEND.map((entry) => {
            const spec = SOURCE[entry.source];
            return (
              <View key={entry.source} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 4,
                    backgroundColor: spec.bg,
                    ...(spec.dashed
                      ? { borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(20,18,16,.3)' }
                      : null),
                  }}
                />
                <Txt size={12} color={onOperative.secondary}>
                  {t[entry.label]}
                </Txt>
              </View>
            );
          })}
        </View>
        <View style={{ height: 1, backgroundColor: onOperative.edgeFaint }} />
        <Txt size={12} lh={1.45} color={onOperative.faint}>
          {t.ownPickAnOpenHour}
        </Txt>
      </OpCard>

      {/* OWN-005: closures already have a screen; this is the door to it
          rather than a second, dead copy of the same control. */}
      <OpActionButton
        label={t.ownBlockSlot}
        variant="ghost"
        icon={<Ban size={18} color={ink} />}
        onPress={() => router.push('/owner/setup/closures')}
      />

      <RecordBookingSheet
        cell={booking}
        date={date}
        onClose={() => setBooking(null)}
        onRecorded={() => {
          setBooking(null);
          void reload();
        }}
      />
    </OpPage>
  );
}

/** One step through the days, in a round button either side of the date. */
function DayStep({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: onOperative.line,
        backgroundColor: pressed ? operative.band : operative.surface,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      {children}
    </Pressable>
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
  const { reason, t, hour } = useI18n();
  const insets = useSafeAreaInsets();
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
    if (!result.ok) setFailed(reason(result.reason) ?? t.ownRecordFailed);
    else {
      setName('');
      onRecorded();
    }
  };

  return (
    <Modal visible={cell !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.close}
        style={{ flex: 1, backgroundColor: 'rgba(8,8,8,.45)' }}
        onPress={onClose}
      />
      <View
        style={{
          backgroundColor: operative.surface,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          paddingTop: 10,
          paddingHorizontal: 20,
          paddingBottom: 20 + insets.bottom,
          gap: 16,
        }}
      >
        {/* The grabber, so the sheet reads as something that slides away. */}
        <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: onOperative.line }} />

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt size={18} weight="bold" color={ink}>
              {t.ownRecordBooking}
            </Txt>
            <Txt size={12} lh={1.45} color={onOperative.muted}>
              {t.ownRecordBlurb}
            </Txt>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t.close} hitSlop={10} onPress={onClose}>
            <Close size={20} color={onOperative.muted} />
          </Pressable>
        </View>

        {cell?.startsAt ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: radius.row,
              backgroundColor: operative.bg,
            }}
          >
            <Clock size={18} color={ink} />
            <Txt size={14} weight="semibold" color={ink} style={{ flex: 1 }}>
              {t.ownHourAt(hour(cell.startsAt), cell.pitchLabel ?? '')}
            </Txt>
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <Txt size={12.5} weight="semibold" color={onOperative.secondary}>
            {t.ownChannel}
          </Txt>
          <OpPills>
            {(['phone', 'walk_in'] as const).map((c) => (
              <OpPill
                key={c}
                label={c === 'phone' ? t.ownChannelPhone : t.ownChannelWalkIn}
                on={c === channel}
                onPress={() => setChannel(c)}
              />
            ))}
          </OpPills>
        </View>

        <OpField label={t.ownWhoFor} value={name} onChangeText={setName} placeholder={t.ownWhoForHint} />

        {failed ? (
          <Txt size={12} weight="semibold" color={burgundy.ink}>
            {failed}
          </Txt>
        ) : null}

        <OpActionButton
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
  const { t } = useI18n();
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
        accessibilityLabel={t.ownCellAt(time, pitch, cell.title, cell.detail)}
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
