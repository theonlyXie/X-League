import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Divider, Eyebrow } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, onVoid, radius, void_ } from '@/theme/tokens';
import {
  ATTRIBUTE_LABEL,
  RATEABLE,
  RATEABLE_GK,
  rateTargets,
  submitPeerRating,
  type RateTarget,
} from '@/data/progress';
import { useCard } from '@/state/card';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * P-09's rating flow (PRO-008).
 *
 * This is the loop the whole card depends on: an attribute only stops being
 * self-reported when the people who were on the pitch say otherwise. It pays XP
 * for exactly that reason.
 *
 * Every rule about who may rate whom lives on the server, so this screen shows
 * whatever reason comes back rather than pre-judging a call it cannot decide.
 */

/** Five steps rather than a free slider: nobody means 63 rather than 65. */
const STEPS = [
  { value: 35, label: 'Below' },
  { value: 50, label: 'Average' },
  { value: 65, label: 'Good' },
  { value: 80, label: 'Strong' },
  { value: 92, label: 'Elite' },
];

export default function RateMatch() {
  const router = useRouter();
  const params = useLocalSearchParams<{ match?: string }>();
  const matchId = params.match ?? null;
  const { reason, t, num } = useI18n();
  const { reload: reloadCard } = useCard();

  const [targets, setTargets] = useState<RateTarget[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLive || !matchId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await rateTargets(matchId);
        if (!cancelled) setTargets(rows);
      } catch (e: unknown) {
        if (!cancelled) {
          const message = (e as { message?: string })?.message ?? '';
          setError(
            message.includes('did not play')
              ? t.errNotInMatch
              : t.errMatchUnreadable,
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const subject = targets.find((p) => p.playerId === active) ?? null;
  const keys = subject?.position === 'GK' ? RATEABLE_GK : RATEABLE;
  const complete = keys.every((k) => values[k] !== undefined);
  const remaining = targets.filter((p) => !p.rated);

  const save = async () => {
    if (!matchId || !subject) return;
    setSaving(true);
    const res = await submitPeerRating(matchId, subject.playerId, values);
    setSaving(false);
    if (!res.ok) {
      setError(reason(res.reason) ?? null);
      return;
    }
    setError(null);
    setTargets((rows) =>
      rows.map((r) => (r.playerId === subject.playerId ? { ...r, rated: true } : r)),
    );
    setActive(null);
    setValues({});
    // A rating moves somebody else's card, and may move this player's own
    // ledger, so the card this app is holding is now stale.
    void reloadCard();
  };

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
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
        <View style={{ gap: 2, flex: 1 }}>
          <Txt size={19} weight="bold" em={-0.02} color={onVoid.primary}>
            {t.rateTitle}
          </Txt>
          <Txt size={11.5} color={onVoid.faint}>
            {t.rateBlurb}
          </Txt>
        </View>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {error ? (
        <View
          style={{
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: radius.chip,
            borderWidth: 1,
            borderColor: 'rgba(101,21,37,.5)',
            backgroundColor: 'rgba(101,21,37,.09)',
          }}
        >
          <Txt size={12.5} weight="semibold" color={burgundy.action}>
            {error}
          </Txt>
        </View>
      ) : null}

      {/* `targets.length > 0` meant a match with nobody to rate — a booking
          played solo, or one whose squad has all been rated — rendered a
          header and then nothing at all, with no explanation. */}
      {!loading && !subject ? (
        remaining.length === 0 ? (
          <Txt size={13} color={onVoid.muted}>
            {t.rateNobody}
          </Txt>
        ) : (
          <View style={{ gap: 8 }}>
            {targets.map((p) => (
              <Pressable
                key={p.playerId}
                accessibilityRole="button"
                accessibilityLabel={p.displayName}
                disabled={p.rated}
                onPress={() => {
                  setActive(p.playerId);
                  setValues({});
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 13,
                  paddingHorizontal: 14,
                  borderRadius: radius.control,
                  backgroundColor: void_.surface,
                  borderWidth: 1,
                  borderColor: onVoid.edgeFaint,
                  opacity: p.rated ? 0.5 : 1,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: radius.pill,
                    backgroundColor: void_.inset,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Txt size={11} weight="bold" color={gold.base}>
                    {p.displayName.slice(0, 2).toUpperCase()}
                  </Txt>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt size={13.5} weight="semibold" color={onVoid.primary}>
                    {p.displayName}
                  </Txt>
                  {p.position ? (
                    <Txt size={11} color={onVoid.faint}>
                      {p.position}
                    </Txt>
                  ) : null}
                </View>
                <Txt size={11.5} color={p.rated ? gold.base : onVoid.dim}>
                  {p.rated ? t.rated : '›'}
                </Txt>
              </Pressable>
            ))}
          </View>
        )
      ) : null}

      {subject ? (
        <View style={{ gap: 18 }}>
          <View style={{ gap: 3 }}>
            <Eyebrow>{subject.displayName}</Eyebrow>
            <Txt size={11.5} color={onVoid.dim}>
              {subject.position ?? ''}
            </Txt>
          </View>

          {keys.map((key) => (
            <View key={key} style={{ gap: 8 }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
              >
                <Txt size={13} weight="semibold" color={onVoid.primary}>
                  {ATTRIBUTE_LABEL[key] ?? key}
                </Txt>
                <Txt size={12} color={values[key] ? gold.base : onVoid.dim}>
                  {values[key] ? num(values[key]) : '—'}
                </Txt>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {STEPS.map((step) => {
                  const on = values[key] === step.value;
                  return (
                    <Pressable
                      key={step.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${ATTRIBUTE_LABEL[key] ?? key}: ${step.label}`}
                      onPress={() => setValues((v) => ({ ...v, [key]: step.value }))}
                      style={{
                        flex: 1,
                        height: 38,
                        borderRadius: radius.chip,
                        alignItems: 'center',
                        justifyContent: 'center',
                        ...(on
                          ? { backgroundColor: 'rgba(198,163,75,.16)', borderWidth: 1, borderColor: gold.base }
                          : { borderWidth: 1, borderColor: onVoid.hairline }),
                      }}
                    >
                      <Txt size={11} weight={on ? 'bold' : 'regular'} color={on ? gold.base : onVoid.faint}>
                        {step.label}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          <Divider />

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label={t.saveRating}
              flex={1}
              height={46}
              disabled={!complete || saving}
              onPress={save}
            />
            <Button
              label={t.keepBooking}
              variant="ghost"
              flex={1}
              height={46}
              onPress={() => {
                setActive(null);
                setValues({});
              }}
            />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
