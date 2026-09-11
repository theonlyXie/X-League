import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Txt } from '@/components/Txt';
import {
  OpButton,
  OpField,
  OpHeader,
  OpNotice,
  OpRow,
  OpScreen,
  OpSection,
} from '@/components/operative';
import { ink, onOperative, radius } from '@/theme/tokens';
import { closeSlot, reopenSlot, venueClosures, type Closure } from '@/data/manage';
import { venueDetail, type VenuePitch } from '@/data/discovery';
import { searchAvailability, type Slot } from '@/data/api';
import { today } from '@/data/venue';
import { useSession } from '@/state/session';
import { isLive } from '@/lib/supabase';
import { useI18n } from '@/i18n';
import type { TextKey } from '@/i18n/strings';

/**
 * The four reasons an hour comes off sale, and the key each is written with.
 *
 * The enum value is what the database stores and what an owner used to be
 * shown — so an Arabic manager picked between `maintenance`, `private`,
 * `holiday` and `closure`, in English, on an otherwise translated screen.
 */
const KINDS: { kind: Closure['kind']; label: TextKey }[] = [
  { kind: 'maintenance', label: 'ownKindMaintenance' },
  { kind: 'private', label: 'ownKindPrivate' },
  { kind: 'holiday', label: 'ownKindHoliday' },
  { kind: 'closure', label: 'ownKindClosure' },
];

/**
 * O-04 — taking hours off sale.
 *
 * Hours are chosen from the same availability grid a player sees, so a venue
 * cannot close a slot by typing a timestamp that does not correspond to any
 * real pitch-hour. Closing an hour somebody has already bought is refused by
 * the server: the venue has to speak to them, and cancelling is the honest way.
 */
export default function Closures() {
  const { reason, t, hourLabel } = useI18n();
  const router = useRouter();
  const { activeVenue } = useSession();
  const venue = activeVenue;

  const [rows, setRows] = useState<Closure[]>([]);
  const [pitches, setPitches] = useState<VenuePitch[]>([]);
  const [pitchId, setPitchId] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [kind, setKind] = useState<Closure['kind']>('maintenance');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(isLive);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLive || !venue) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [list, detail] = await Promise.all([
        venueClosures(venue.venueId, today()),
        venueDetail(venue.venueId),
      ]);
      setRows(list);
      setPitches(detail?.pitches ?? []);
      setPitchId((current) => current ?? detail?.pitches[0]?.id ?? null);
      setNotice(null);
    } catch {
      setNotice(t.ownClosuresUnreadable);
    } finally {
      setLoading(false);
    }
  }, [venue?.venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isLive || !pitchId) return;
    let cancelled = false;
    searchAvailability(pitchId, date)
      .then((s) => {
        if (!cancelled) setSlots(s);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pitchId, date, rows]);

  return (
    <OpScreen>
      <OpHeader title={t.ownClosures} onBack={() => router.back()} />

      <OpNotice text={notice} />
      {loading ? <ActivityIndicator color={ink} /> : null}

      <OpSection title={t.ownBookedOff}>
        {rows.length === 0 && !loading ? (
          <Txt size={12.5} color={onOperative.dim}>
            {t.ownNothingClosed}
          </Txt>
        ) : null}
        <View style={{ gap: 8 }}>
          {rows.map((c) => (
            <OpRow key={c.exceptionId}>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={13} weight="semibold" color={ink}>
                  {c.pitchLabel} · {new Date(c.startsAt).toLocaleString('en-GB', {
                    timeZone: 'Africa/Cairo',
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Txt>
                <Txt size={10.5} color="rgba(20,18,16,.45)">
                  {c.kind}
                  {c.note ? ` · ${c.note}` : ''}
                </Txt>
              </View>
              <OpButton
                label={t.ownReopen}
                tone="quiet"
                onPress={async () => {
                  const res = await reopenSlot(c.exceptionId);
                  if (!res.ok) setNotice(reason(res.reason) ?? null);
                  void load();
                }}
              />
            </OpRow>
          ))}
        </View>
      </OpSection>

      <OpSection title={t.ownCloseHour} hint={t.ownCloseHourHint}>
        {pitches.length > 1 ? (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {pitches.map((p) => {
              const on = p.id === pitchId;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={p.label}
                  onPress={() => setPitchId(p.id)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 13,
                    borderRadius: radius.chip,
                    borderWidth: 1,
                    borderColor: on ? ink : onOperative.hairline,
                    backgroundColor: on ? ink : 'transparent',
                  }}
                >
                  <Txt size={12} weight="semibold" color={on ? '#FFFDF9' : ink}>
                    {p.label}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <OpField label={t.ownDate} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" width={140} />

        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {KINDS.map(({ kind: k, label }) => {
            const on = k === kind;
            return (
              <Pressable
                key={k}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t[label]}
                onPress={() => setKind(k)}
                style={{
                  paddingVertical: 7,
                  paddingHorizontal: 12,
                  borderRadius: radius.chip,
                  borderWidth: 1,
                  borderColor: on ? ink : onOperative.hairline,
                }}
              >
                <Txt size={11.5} weight={on ? 'semibold' : 'regular'} color={ink}>
                  {t[label]}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        <OpField label={t.ownNote} value={note} onChangeText={setNote} placeholder={t.ownEgExample} />

        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {slots.map((s) => (
            <Pressable
              key={s.startsAt}
              accessibilityRole="button"
              accessibilityLabel={t.ownCloseHourAt(hourLabel(s.hour))}
              disabled={!s.available}
              onPress={async () => {
                if (!pitchId) return;
                const res = await closeSlot(pitchId, s.startsAt, { kind, note: note || undefined });
                if (!res.ok) setNotice(reason(res.reason) ?? null);
                else setNotice(null);
                void load();
              }}
              style={{
                width: 62,
                height: 40,
                borderRadius: radius.chip,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: onOperative.hairline,
                backgroundColor: s.available ? 'transparent' : 'rgba(20,18,16,.05)',
                opacity: s.available ? 1 : 0.45,
              }}
            >
              <Txt size={12} weight={s.available ? 'semibold' : 'regular'} color={ink}>
                {s.hour}:00
              </Txt>
            </Pressable>
          ))}
          {slots.length === 0 ? (
            <Txt size={12} color={onOperative.dim}>
              {t.ownNothingOpenThatDate}
            </Txt>
          ) : null}
        </View>
      </OpSection>
    </OpScreen>
  );
}
