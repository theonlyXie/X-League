import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { ActionButton, Card } from '@/components/kit';
import { ChevronLeft, Clock, Pin, Swords } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius } from '@/theme/tokens';
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/play'))}
          hitSlop={8}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}
        >
          <ChevronLeft size={22} color={onVoid.primary} />
        </Pressable>
        <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary} style={{ flex: 1 }}>
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

      <View style={{ gap: 12 }}>
        {rows.map((c) => (
          <Card key={c.challengeId} style={{ borderColor: goldAlpha.edgeSoft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: radius.icon,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: goldAlpha.fill,
                }}
              >
                <Swords size={20} color={gold.base} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt size={15} weight="bold" color={onVoid.primary}>
                  {t.wantsToPlayYou(c.fromName)}
                </Txt>
                {/* Sent to a club they captain rather than to them personally.
                    Worth saying: they are answering on somebody else's behalf. */}
                {c.asClub ? (
                  <Txt size={11.5} weight="semibold" color={gold.base}>
                    {t.challengeOnBehalfOf(c.asClub)}
                  </Txt>
                ) : null}
              </View>
            </View>

            <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: onVoid.edgeFaint, paddingTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pin size={15} color={onVoid.faint} />
                <Txt size={12.5} color={onVoid.secondary} style={{ flex: 1 }}>
                  {[c.venueName, c.pitchLabel].filter(Boolean).join(' · ')}
                </Txt>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Clock size={15} color={onVoid.faint} />
                <Txt size={12.5} color={onVoid.secondary} style={{ flex: 1 }}>
                  {moment(c.startsAt)}
                </Txt>
              </View>
              {c.note ? (
                <Txt size={12} lh={1.5} color={onVoid.faint}>
                  {c.note}
                </Txt>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <ActionButton
                label={t.accept}
                flex
                disabled={busy === c.challengeId}
                onPress={() => void answer(c, true)}
              />
              <ActionButton
                label={t.decline}
                variant="ghost"
                flex
                disabled={busy === c.challengeId}
                onPress={() => void answer(c, false)}
              />
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
