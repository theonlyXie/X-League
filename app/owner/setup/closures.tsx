import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpButton, OpField, OpNotice } from '@/components/operative';
import {
  OpCard,
  OpEmpty,
  OpGroup,
  OpMenuGroup,
  OpMenuRow,
  OpPage,
  OpPill,
  OpPills,
} from '@/components/kitOperative';
import { Ban } from '@/components/icons';
import { burgundy, ink, onOperative, operative, radius } from '@/theme/tokens';
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
  const { reason, t, hourLabel, moment } = useI18n();
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

  const kindName = (k: Closure['kind']) => {
    const key = KINDS.find((entry) => entry.kind === k)?.label;
    return key ? t[key] : k;
  };

  return (
    <OpPage title={t.ownClosures} subtitle={venue?.name}>
      <OpNotice text={notice} />
      {loading ? <ActivityIndicator color={ink} /> : null}

      <OpGroup title={t.ownBookedOff}>
        {rows.length === 0 && !loading ? <OpEmpty title={t.ownNothingClosed} /> : null}
        {rows.length > 0 ? (
          <OpMenuGroup>
            {rows.map((c) => (
              <OpMenuRow
                key={c.exceptionId}
                // Burgundy, as a blocked hour is in the calendar's legend.
                icon={<Ban size={19} color={burgundy.ink} />}
                // The pitch and the hour in the reader's language and digits,
                // and the reason as a word rather than its enum value — this
                // row printed `maintenance` in English on the Arabic screen
                // that had just offered it as صيانة, and the time in en-GB.
                title={`${c.pitchLabel} · ${moment(c.startsAt)}`}
                detail={c.note ? `${kindName(c.kind)} · ${c.note}` : kindName(c.kind)}
                right={
                  <OpButton
                    label={t.ownReopen}
                    tone="quiet"
                    onPress={async () => {
                      const res = await reopenSlot(c.exceptionId);
                      if (!res.ok) setNotice(reason(res.reason) ?? null);
                      void load();
                    }}
                  />
                }
              />
            ))}
          </OpMenuGroup>
        ) : null}
      </OpGroup>

      <OpGroup title={t.ownCloseHour} hint={t.ownCloseHourHint}>
        <OpCard>
          {pitches.length > 1 ? (
            <OpPills>
              {pitches.map((p) => (
                <OpPill key={p.id} label={p.label} on={p.id === pitchId} onPress={() => setPitchId(p.id)} />
              ))}
            </OpPills>
          ) : null}

          <OpField label={t.ownDate} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" width={160} />

          <OpPills>
            {KINDS.map(({ kind: k, label }) => (
              <OpPill key={k} size="sm" label={t[label]} on={k === kind} onPress={() => setKind(k)} />
            ))}
          </OpPills>

          <OpField label={t.ownNote} value={note} onChangeText={setNote} placeholder={t.ownEgExample} />
        </OpCard>

        {/* The hours themselves, dense on purpose: a venue closing an evening
            taps five of these in a row. */}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {slots.map((s) => (
            <Pressable
              key={s.startsAt}
              accessibilityRole="button"
              accessibilityLabel={t.ownCloseHourAt(hourLabel(s.hour))}
              accessibilityState={{ disabled: !s.available }}
              disabled={!s.available}
              onPress={async () => {
                if (!pitchId) return;
                const res = await closeSlot(pitchId, s.startsAt, { kind, note: note || undefined });
                if (!res.ok) setNotice(reason(res.reason) ?? null);
                else setNotice(null);
                void load();
              }}
              style={({ pressed }) => ({
                width: 66,
                height: 44,
                borderRadius: radius.row,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: pressed ? ink : onOperative.line,
                backgroundColor: s.available ? operative.surface : 'rgba(20,18,16,.05)',
                opacity: s.available ? 1 : 0.45,
              })}
            >
              <Txt size={12.5} weight={s.available ? 'semibold' : 'regular'} color={ink}>
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
      </OpGroup>
    </OpPage>
  );
}
