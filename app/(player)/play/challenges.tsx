import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { myChallenges, respondToChallenge, type Challenge } from '@/data/opponent';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * Matches somebody wants to play against you.
 *
 * This screen exists because the opponent has nowhere else to stand. They are
 * not on the captain's booking, so the bookings list does not contain it and
 * the match lobby refuses them — a challenge notification pointed at either
 * would land on a screen that cannot show the thing it is about. `my_challenges`
 * is the one call that answers "what have I been asked", and this is the one
 * place to answer it.
 *
 * Declining is not a lesser action and is not hidden behind anything. Somebody
 * who cannot play on Thursday needs to say so in one tap, and a captain waiting
 * on an answer is better served by a quick no than by a slow maybe.
 */
export default function Challenges() {
  const router = useRouter();
  const { reason, t, moment } = useI18n();

  const [rows, setRows] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLive) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await myChallenges());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const answer = async (c: Challenge, accept: boolean) => {
    setBusy(c.challengeId);
    setNotice(null);
    try {
      const res = await respondToChallenge(c.challengeId, accept);
      if (!res.ok) setNotice(reason(res.reason) ?? t.errVenueCalendarRetry);
      await load();
    } catch {
      setNotice(t.errVenueCalendarRetry);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/play'))}
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
          <ArrowLeft size={16} color={onVoid.muted} />
        </Pressable>
        <Txt size={19} weight="bold" em={-0.01} color={onVoid.primary}>
          {t.challenges}
        </Txt>
      </View>

      {notice ? (
        <Txt size={12.5} color={burgundy.action}>
          {notice}
        </Txt>
      ) : null}

      {loading ? <ActivityIndicator color={gold.base} /> : null}

      {!loading && rows.length === 0 ? (
        <Txt size={12.5} color={onVoid.dim}>
          {t.noChallenges}
        </Txt>
      ) : null}

      <View style={{ gap: 10 }}>
        {rows.map((c) => (
          <View
            key={c.challengeId}
            style={{
              gap: 12,
              paddingVertical: 14,
              paddingHorizontal: 15,
              borderRadius: radius.control,
              backgroundColor: void_.surface,
              borderWidth: 1,
              borderColor: goldAlpha.edgeSoft,
            }}
          >
            <View style={{ gap: 3 }}>
              <Txt size={14.5} weight="semibold" color={onVoid.primary}>
                {t.wantsToPlayYou(c.fromName)}
              </Txt>
              <Txt size={12} color={onVoid.muted}>
                {c.venueName} · {c.pitchLabel} · {moment(c.startsAt)}
              </Txt>
              {/* Sent to a club they captain rather than to them personally.
                  Worth saying: they are answering on somebody else's behalf. */}
              {c.asClub ? (
                <Txt size={11.5} color={gold.base}>
                  {t.challengeOnBehalfOf(c.asClub)}
                </Txt>
              ) : null}
              {c.note ? (
                <Txt size={12} color={onVoid.faint}>
                  {c.note}
                </Txt>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                label={t.accept}
                height={44}
                round={radius.control}
                size={14}
                disabled={busy === c.challengeId}
                style={{ flex: 1 }}
                onPress={() => void answer(c, true)}
              />
              <Button
                label={t.decline}
                variant="ghost"
                height={44}
                round={radius.control}
                size={14}
                disabled={busy === c.challengeId}
                style={{ flex: 1, borderColor: onVoid.line }}
                onPress={() => void answer(c, false)}
              />
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}
