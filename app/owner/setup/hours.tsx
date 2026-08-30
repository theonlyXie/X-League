import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpButton, OpField, OpHeader, OpNotice, OpRow, OpScreen, OpSection } from '@/components/operative';
import { ink, onOperative, operative, radius } from '@/theme/tokens';
import {
  addPitch,
  setVenueHours,
  updatePitch,
  venueHours,
  type VenueHour,
} from '@/data/manage';
import { venueDetail, type VenuePitch } from '@/data/discovery';
import { useSession } from '@/state/session';
import { isLive } from '@/lib/supabase';
import { useI18n } from '@/i18n';

/**
 * O-02 — when the venue opens, and what it opens.
 *
 * This screen did not exist, and neither did anything behind it.
 * `availability_rule` is what every sellable slot in the product is built
 * from; across every migration it was read in five places and written in none
 * outside the seed. Nothing anywhere created a `pitch` either. So a venue that
 * registered through the product had exactly one pitch called "Pitch 1", zero
 * sellable hours, and no way to change either — structurally unbookable, on a
 * sign-up screen that promises "you can set your pitches, hours and prices
 * straight away".
 *
 * Setting the same day twice replaces rather than appends. Two rules for one
 * day would generate every hour in the overlap twice, and the booking grid
 * would show it twice.
 */
export default function Hours() {
  const { reason, t } = useI18n();
  const router = useRouter();
  const { activeVenue } = useSession();
  const venue = activeVenue;

  const [hours, setHours] = useState<VenueHour[]>([]);
  const [pitches, setPitches] = useState<VenuePitch[]>([]);
  const [pitchId, setPitchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(isLive);
  const [notice, setNotice] = useState<string | null>(null);
  const [newPitch, setNewPitch] = useState('');

  const load = useCallback(async () => {
    if (!isLive || !venue) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [rows, detail] = await Promise.all([venueHours(venue.venueId), venueDetail(venue.venueId)]);
      setHours(rows);
      setPitches(detail?.pitches ?? []);
      setPitchId((current) => current ?? detail?.pitches[0]?.id ?? rows[0]?.pitchId ?? null);
      setNotice(null);
    } catch {
      setNotice(t.ownHoursUnreadable);
    } finally {
      setLoading(false);
    }
  }, [venue?.venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** The seven days for the selected pitch, with the closed ones as gaps. */
  const week = useMemo(() => {
    const mine = hours.filter((h) => h.pitchId === pitchId);
    return [0, 1, 2, 3, 4, 5, 6].map((day) => {
      const rule = mine.find((h) => h.dayOfWeek === day && h.openHour !== null);
      return { day, openHour: rule?.openHour ?? null, closeHour: rule?.closeHour ?? null };
    });
  }, [hours, pitchId]);

  const dayName = (day: number) =>
    [t.ownDay0, t.ownDay1, t.ownDay2, t.ownDay3, t.ownDay4, t.ownDay5, t.ownDay6][day];

  const save = async (day: number, open: number, close: number) => {
    if (!pitchId) return;
    const res = await setVenueHours(pitchId, day, open, close).catch(() => ({
      ok: false,
      reason: t.ownCalendarUnreachable,
    }));
    setNotice(res.ok ? null : (reason(res.reason) ?? null));
    if (res.ok) void load();
  };

  const add = async () => {
    if (!venue || newPitch.trim().length === 0) return;
    const res = await addPitch(venue.venueId, newPitch.trim()).catch(() => ({
      ok: false,
      reason: t.ownCalendarUnreachable,
    }));
    if (res.ok) {
      setNewPitch('');
      setNotice(null);
      void load();
    } else {
      setNotice(reason(res.reason) ?? null);
    }
  };

  const setOperational = async (id: string, operational: boolean) => {
    const res = await updatePitch(id, { operational }).catch(() => ({
      ok: false,
      reason: t.ownCalendarUnreachable,
    }));
    setNotice(res.ok ? null : (reason(res.reason) ?? null));
    if (res.ok) void load();
  };

  return (
    <OpScreen>
      <OpHeader title={t.ownHours} onBack={() => router.back()} />

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
                <Txt size={12} weight="semibold" color={on ? operative.surface : ink}>
                  {p.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <OpNotice text={notice} />

      {loading ? (
        <View style={{ paddingVertical: 30, alignItems: 'center' }}>
          <ActivityIndicator color={ink} />
        </View>
      ) : null}

      <OpSection title={t.ownWeek2} hint={t.ownHoursBlurb}>
        <View style={{ gap: 8 }}>
          {week.map((d) => (
            <DayRow
              key={d.day}
              name={dayName(d.day)}
              openHour={d.openHour}
              closeHour={d.closeHour}
              onSave={(open, close) => save(d.day, open, close)}
            />
          ))}
        </View>
      </OpSection>

      <OpSection title={t.ownPitches} hint={t.ownNewPitchInherits}>
        <View style={{ gap: 8 }}>
          {pitches.map((p) => (
            <OpRow key={p.id}>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={13.5} weight="semibold" color={ink}>
                  {p.label}
                </Txt>
                <Txt size={10.5} color={onOperative.dim}>
                  {p.format}
                </Txt>
              </View>
              <OpButton label={t.ownRetirePitch} tone="danger" onPress={() => setOperational(p.id, false)} />
            </OpRow>
          ))}

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <OpField
                label={t.ownPitchName}
                value={newPitch}
                onChangeText={setNewPitch}
                placeholder={t.ownEgPitchName}
              />
            </View>
            <OpButton label={t.ownAddAPitch} onPress={add} disabled={newPitch.trim().length === 0} />
          </View>
        </View>
      </OpSection>
    </OpScreen>
  );
}

/**
 * One day of the week. Equal hours is how a venue says it does not open that
 * day, so "Closed" is a save of `0, 0` rather than a separate verb.
 */
function DayRow({
  name,
  openHour,
  closeHour,
  onSave,
}: {
  name: string;
  openHour: number | null;
  closeHour: number | null;
  onSave: (open: number, close: number) => void;
}) {
  const { reason, t } = useI18n();
  const [open, setOpen] = useState(String(openHour ?? 10));
  const [close, setClose] = useState(String(closeHour ?? 24));

  // Re-sync when the day is reloaded from the server, so a save that was
  // clamped or refused does not leave the field showing what was asked for.
  useEffect(() => {
    setOpen(String(openHour ?? 10));
    setClose(String(closeHour ?? 24));
  }, [openHour, closeHour]);

  const closed = openHour === null;

  return (
    <OpRow>
      <View style={{ width: 78, gap: 2 }}>
        <Txt size={12.5} weight="semibold" color={ink}>
          {name}
        </Txt>
        {closed ? (
          <Txt size={10} color={onOperative.dim}>
            {t.ownClosedDay}
          </Txt>
        ) : null}
      </View>
      <OpField label={t.ownOpens} value={open} onChangeText={setOpen} keyboardType="number-pad" width={62} />
      <OpField label={t.ownCloses} value={close} onChangeText={setClose} keyboardType="number-pad" width={62} />
      <OpButton label={t.ownSetDay} onPress={() => onSave(Number(open), Number(close))} />
    </OpRow>
  );
}
