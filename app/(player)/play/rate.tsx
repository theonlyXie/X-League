import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Txt } from '@/components/Txt';
import {
  ActionButton,
  BackHeader,
  Card,
  MenuGroup,
  SafeTop,
  StickyFooter,
  Unreachable,
} from '@/components/kit';
import { CheckCircle, ChevronRight } from '@/components/icons';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
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
import type { TextKey } from '@/i18n/strings';
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

/**
 * Five steps rather than a free slider: nobody means 63 rather than 65. The
 * words are keys, not English — they were drawn untranslated on the Arabic
 * screen, and read out in English to its screen reader.
 */
const STEPS = [
  { value: 35, label: 'matchStepBelow' },
  { value: 50, label: 'matchStepAverage' },
  { value: 65, label: 'matchStepGood' },
  { value: 80, label: 'matchStepStrong' },
  { value: 92, label: 'matchStepElite' },
] as const;

export default function RateMatch() {
  const router = useRouter();
  const params = useLocalSearchParams<{ match?: string }>();
  const matchId = params.match ?? null;
  const { reason, t, num } = useI18n();
  // The attribute names in the reader's language. `ATTRIBUTE_LABEL` is English
  // only, and was being drawn — and read aloud — as English on the Arabic screen.
  const attributeName = (key: string) => {
    const k = ATTRIBUTE_KEY[key];
    return k ? t[k] : (ATTRIBUTE_LABEL[key] ?? key);
  };
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

  // Its own header rather than `Screen`'s, so saving a rating sits in a
  // pinned bar, the way every other flow's main action now does.
  return (
    <View style={{ flex: 1, backgroundColor: void_.bg }}>
      <SafeTop />
      <BackHeader
        title={t.rateTitle}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
        <Txt size={12.5} lh={1.55} color={onVoid.muted}>
          {t.rateBlurb}
        </Txt>

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={gold.base} />
          </View>
        ) : null}

        {error ? <Unreachable label={error} /> : null}

        {/* `targets.length > 0` meant a match with nobody to rate — a booking
            played solo, or one whose squad has all been rated — rendered a
            header and then nothing at all, with no explanation. */}
        {!loading && !subject ? (
          remaining.length === 0 ? (
            <Card>
              <Txt size={13.5} color={onVoid.muted}>
                {t.rateNobody}
              </Txt>
            </Card>
          ) : (
            <MenuGroup>
              {targets.map((p) => (
                <Pressable
                  key={p.playerId}
                  accessibilityRole="button"
                  accessibilityLabel={p.displayName}
                  accessibilityState={{ disabled: p.rated }}
                  disabled={p.rated}
                  onPress={() => {
                    setActive(p.playerId);
                    setValues({});
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor: pressed ? goldAlpha.fillSoft : 'transparent',
                    opacity: p.rated ? 0.5 : 1,
                  })}
                >
                  <Initials name={p.displayName} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt size={14} weight="semibold" color={onVoid.primary} numberOfLines={1}>
                      {p.displayName}
                    </Txt>
                    {p.position ? (
                      <Txt size={11.5} color={onVoid.faint}>
                        {p.position}
                      </Txt>
                    ) : null}
                  </View>
                  {p.rated ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <CheckCircle size={15} color={gold.base} />
                      <Txt size={11.5} weight="semibold" color={gold.base}>
                        {t.rated}
                      </Txt>
                    </View>
                  ) : (
                    <ChevronRight size={16} color={onVoid.dim} />
                  )}
                </Pressable>
              ))}
            </MenuGroup>
          )
        ) : null}

        {subject ? (
          <>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Initials name={subject.displayName} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt size={17} weight="bold" em={-0.01} color={onVoid.primary} numberOfLines={1}>
                    {subject.displayName}
                  </Txt>
                  {subject.position ? (
                    <Txt size={11.5} weight="semibold" color={gold.base}>
                      {subject.position}
                    </Txt>
                  ) : null}
                </View>
              </View>
            </Card>

            <Card style={{ gap: 18 }}>
              {keys.map((key) => (
                <View key={key} style={{ gap: 8 }}>
                  <View
                    style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
                  >
                    <Txt size={14} weight="semibold" color={onVoid.primary}>
                      {attributeName(key)}
                    </Txt>
                    <Txt size={13} weight="bold" color={values[key] ? gold.base : onVoid.dim}>
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
                          accessibilityLabel={`${attributeName(key)}: ${t[step.label]}`}
                          onPress={() => setValues((v) => ({ ...v, [key]: step.value }))}
                          style={{
                            flex: 1,
                            height: 36,
                            borderRadius: radius.pill,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor: on ? goldAlpha.accent : onVoid.line,
                            backgroundColor: on ? goldAlpha.fill : 'transparent',
                          }}
                        >
                          <Txt
                            size={11}
                            weight={on ? 'bold' : 'semibold'}
                            color={on ? gold.base : onVoid.faint}
                            numberOfLines={1}
                          >
                            {t[step.label]}
                          </Txt>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>

      {subject ? (
        <StickyFooter>
          <ActionButton
            label={t.matchRatePickAnother}
            variant="ghost"
            flex
            onPress={() => {
              setActive(null);
              setValues({});
            }}
          />
          <ActionButton label={t.saveRating} flex disabled={!complete || saving} onPress={save} />
        </StickyFooter>
      ) : null}
    </View>
  );
}

/** The two letters every squad row in the app draws in place of a photo. */
function Initials({ name }: { name: string }) {
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        backgroundColor: void_.inset,
        borderWidth: 1,
        borderColor: onVoid.edgeFaint,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt size={12} weight="bold" color={gold.base}>
        {name.slice(0, 2).toUpperCase()}
      </Txt>
    </View>
  );
}

/** The same names the assessment uses, keyed by the attribute's code. */
const ATTRIBUTE_KEY: Record<string, TextKey> = {
  SPD: 'asOutSpdName',
  SHO: 'asOutShoName',
  PAS: 'asOutPasName',
  DRI: 'asOutDriName',
  DEF: 'asOutDefName',
  PHY: 'asOutPhyName',
  DIV: 'asGkDivName',
  HAN: 'asGkHanName',
  KIC: 'asGkKicName',
  REF: 'asGkRefName',
  POS: 'asGkPosName',
};
