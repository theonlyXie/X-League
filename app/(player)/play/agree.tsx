import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Divider, Eyebrow } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import {
  matchAgreement,
  matchSheet,
  reportSideResult,
  setMatchScorers,
  type Agreement,
  type SheetLine,
} from '@/data/progress';
import { useCard } from '@/state/card';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * MCH-004 — a cup tie counts when both captains say the same thing.
 *
 * One captain's word used to pay both squads, and the other club found out by
 * watching the table move. Here each side says what it saw; the scores are
 * compared; agreement pays everybody and disagreement pays nobody until the
 * organiser settles it.
 *
 * The score is always entered from this captain's own side — "us" and "them" —
 * because a captain who has just lost 1–3 should not have to work out which end
 * of "3–1" they are before they can answer.
 */
export default function AgreeResult() {
  const router = useRouter();
  const params = useLocalSearchParams<{ match?: string }>();
  const matchId = params.match ?? null;
  const { t, num, reason } = useI18n();
  const { reload: reloadCard } = useCard();

  const [state, setState] = useState<Agreement | null>(null);
  const [lines, setLines] = useState<SheetLine[]>([]);
  const [scoreHome, setScoreHome] = useState<number | null>(null);
  const [scoreAway, setScoreAway] = useState<number | null>(null);
  const [us, setUs] = useState('');
  const [them, setThem] = useState('');
  const [sheet, setSheet] = useState<Record<string, { goals: string; assists: string }>>({});
  const [loading, setLoading] = useState(isLive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    if (!isLive || !matchId) {
      setLoading(false);
      return;
    }
    try {
      const [agree, cards] = await Promise.all([
        matchAgreement(matchId),
        matchSheet(matchId).catch(() => ({ lines: [] as SheetLine[], scoreHome: null, scoreAway: null })),
      ]);
      setState(agree);
      setLines(cards.lines);
      setScoreHome(cards.scoreHome);
      setScoreAway(cards.scoreAway);
      setSheet(
        Object.fromEntries(
          cards.lines.map((l) => [l.playerId, { goals: String(l.goals), assists: String(l.assists) }]),
        ),
      );
      setError(null);
    } catch (e) {
      setError((e as { message?: string }).message ?? null);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load, nonce]);

  const mine = state?.mySide ?? null;

  /** The two claims, read from this captain's end rather than the sheet's. */
  const asMine = (claim: { home: number; away: number } | null) =>
    claim === null ? null : mine === 'away' ? { us: claim.away, them: claim.home } : { us: claim.home, them: claim.away };

  const ourClaim = asMine(mine === 'away' ? (state?.awaySays ?? null) : (state?.homeSays ?? null));
  const theirClaim = asMine(mine === 'away' ? (state?.homeSays ?? null) : (state?.awaySays ?? null));

  const numeric = (v: string) => (/^\d+$/.test(v) ? Number(v) : null);

  const send = async () => {
    if (!matchId || !mine) return;
    const u = numeric(us);
    const th = numeric(them);
    if (u === null || th === null) return;
    setSaving(true);
    const res = await reportSideResult(
      matchId,
      mine === 'home' ? u : th,
      mine === 'home' ? th : u,
    );
    setSaving(false);
    if (!res.ok) {
      setError(reason(res.reason) ?? null);
      return;
    }
    setError(null);
    // Points may have just landed, which makes the card this app holds stale.
    if (res.state === 'agreed') void reloadCard();
    setNonce((n) => n + 1);
  };

  const ourLines = lines.filter((l) => l.side === mine);
  const ourScore = mine === 'away' ? scoreAway : scoreHome;
  const claimed = ourLines.reduce(
    (sum, l) => sum + (numeric(sheet[l.playerId]?.goals ?? '0') ?? 0),
    0,
  );
  const left = (ourScore ?? 0) - claimed;

  const saveScorers = async () => {
    if (!matchId) return;
    setSaving(true);
    const res = await setMatchScorers(
      matchId,
      ourLines.map((l) => ({
        playerId: l.playerId,
        goals: numeric(sheet[l.playerId]?.goals ?? '0') ?? 0,
        assists: numeric(sheet[l.playerId]?.assists ?? '0') ?? 0,
      })),
    );
    setSaving(false);
    if (!res.ok) {
      setError(reason(res.reason) ?? null);
      return;
    }
    setError(null);
    setNonce((n) => n + 1);
  };

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 32, gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          hitSlop={12}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
        >
          <ArrowLeft size={20} color={onVoid.secondary} />
        </Pressable>
        <Txt size={19} weight="bold" em={-0.02} color={onVoid.primary}>
          {t.agreeTitle}
        </Txt>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {error ? (
        <Txt size={12.5} color={gold.base}>
          {error}
        </Txt>
      ) : null}

      {!loading && state && !mine ? (
        <Txt size={13} color={onVoid.muted}>
          {t.agreeNotACaptain}
        </Txt>
      ) : null}

      {!loading && state && mine ? (
        <>
          <Txt size={12.5} lh={1.5} color={onVoid.muted}>
            {t.agreeBlurb}
          </Txt>

          {/* What each side has said so far, side by side. */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              { label: t.agreeYouSaid, claim: ourClaim },
              { label: t.agreeTheySaid, claim: theirClaim },
            ].map((box) => (
              <View
                key={box.label}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: radius.control,
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: void_.surface,
                  borderWidth: 1,
                  borderColor: box.claim ? goldAlpha.edge : onVoid.edgeFaint,
                }}
              >
                <Txt size={10.5} weight="semibold" em={0.06} color={onVoid.dim}>
                  {box.label}
                </Txt>
                <Txt
                  size={20}
                  weight="bold"
                  color={box.claim ? onVoid.primary : onVoid.disabled}
                  style={{ fontFamily: mono }}
                >
                  {box.claim ? `${num(box.claim.us)}–${num(box.claim.them)}` : '—'}
                </Txt>
              </View>
            ))}
          </View>

          <Txt size={12.5} color={state.state === 'disputed' ? gold.base : onVoid.secondary}>
            {state.state === 'agreed'
              ? t.agreeDone
              : state.state === 'disputed'
                ? t.agreeDisputed
                : theirClaim
                  ? t.agreeWaitingYou
                  : t.agreeWaitingThem}
          </Txt>

          {state.state !== 'agreed' ? (
            <Txt size={11.5} color={onVoid.dim}>
              {t.agreeNothingYet}
            </Txt>
          ) : null}

          <Divider />

          {/* Entered from this captain's own end, always. */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            {[
              { label: t.agreeScoreUs, value: us, set: setUs },
              { label: t.agreeScoreThem, value: them, set: setThem },
            ].map((f) => (
              <View key={f.label} style={{ flex: 1, gap: 6 }}>
                <Txt size={11} weight="semibold" em={0.06} color={onVoid.dim}>
                  {f.label}
                </Txt>
                <TextInput
                  value={f.value}
                  onChangeText={f.set}
                  keyboardType="number-pad"
                  accessibilityLabel={f.label}
                  placeholderTextColor={onVoid.disabled}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: radius.control,
                    borderWidth: 1,
                    borderColor: onVoid.line,
                    backgroundColor: void_.inset,
                    color: onVoid.primary,
                    fontSize: 18,
                    fontFamily: mono,
                    textAlign: 'center',
                  }}
                />
              </View>
            ))}
          </View>

          <Button
            label={t.agreeSubmit}
            onPress={send}
            disabled={saving || numeric(us) === null || numeric(them) === null}
          />

          {/* Scorers, this side only — the other captain writes theirs. */}
          {ourLines.length > 0 && ourScore !== null ? (
            <>
              <Divider />
              <View style={{ gap: 4 }}>
                <Eyebrow>{t.scorersTitle}</Eyebrow>
                <Txt size={11.5} lh={1.5} color={onVoid.dim}>
                  {t.scorersBlurb}
                </Txt>
                <Txt size={11.5} color={left === 0 ? onVoid.muted : gold.base}>
                  {left > 0 ? t.scorersLeft(num(left)) : t.scorersAllIn}
                </Txt>
              </View>

              <View style={{ gap: 8 }}>
                {ourLines.map((l) => (
                  <View
                    key={l.playerId}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: radius.control,
                      backgroundColor: void_.surface,
                      borderWidth: 1,
                      borderColor: onVoid.edgeFaint,
                    }}
                  >
                    <Txt size={13} weight="medium" color={onVoid.primary} style={{ flex: 1 }}>
                      {l.displayName}
                    </Txt>
                    {(
                      [
                        { key: 'goals' as const, label: t.scorersGoals },
                        { key: 'assists' as const, label: t.scorersAssists },
                      ]
                    ).map((f) => (
                      <View key={f.key} style={{ alignItems: 'center', gap: 3 }}>
                        <Txt size={9.5} color={onVoid.dim}>
                          {f.label}
                        </Txt>
                        <TextInput
                          value={sheet[l.playerId]?.[f.key] ?? '0'}
                          onChangeText={(v) =>
                            setSheet((cur) => ({
                              ...cur,
                              [l.playerId]: {
                                goals: f.key === 'goals' ? v : (cur[l.playerId]?.goals ?? '0'),
                                assists: f.key === 'assists' ? v : (cur[l.playerId]?.assists ?? '0'),
                              },
                            }))
                          }
                          keyboardType="number-pad"
                          accessibilityLabel={`${l.displayName}. ${f.label}`}
                          style={{
                            width: 46,
                            paddingVertical: 7,
                            borderRadius: radius.badge,
                            borderWidth: 1,
                            borderColor: onVoid.line,
                            backgroundColor: void_.inset,
                            color: onVoid.primary,
                            fontFamily: mono,
                            textAlign: 'center',
                          }}
                        />
                      </View>
                    ))}
                  </View>
                ))}
              </View>

              <Button label={t.scorersSave} onPress={saveScorers} disabled={saving || left < 0} />
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
