import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Eyebrow } from '@/components/ui';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { listTournaments, myTournaments, type MyTournament, type TournamentSummary } from '@/data/cups';
import { useSession } from '@/state/session';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * P-15 — what is on.
 *
 * Open to guests, because a cup nobody can see is a cup nobody enters. The
 * player's own entries sit above the public list: "am I in this" is the first
 * question anybody opens this tab with.
 */
export default function Cups() {
  const router = useRouter();
  const { signedIn } = useSession();
  const { t, num, money, shortDate } = useI18n();

  const [all, setAll] = useState<TournamentSummary[]>([]);
  const [mine, setMine] = useState<MyTournament[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!isLive) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [rows, ours] = await Promise.all([
          listTournaments(),
          signedIn ? myTournaments().catch(() => [] as MyTournament[]) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setAll(rows);
        setMine(ours);
      } catch {
        if (!cancelled) setAll([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, nonce]);

  const stateLabel = (s: TournamentSummary['state']) =>
    s === 'open' ? t.openForEntries : s === 'complete' ? t.cupComplete : t.cupRunning;

  return (
    <Screen
      contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 20 }}
      refreshControl={
        isLive ? (
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={gold.base} colors={[gold.base]} />
        ) : undefined
      }
    >
      <Txt size={22} weight="bold" em={-0.02} color={onVoid.primary}>
        {t.cupsTitle}
      </Txt>

      {loading && all.length === 0 ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {mine.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Eyebrow>{t.yourCups}</Eyebrow>
          <View style={{ gap: 8 }}>
            {mine.map((cup) => (
              <Pressable
                key={cup.tournamentId}
                accessibilityRole="button"
                accessibilityLabel={`${cup.name}, ${cup.teamName}`}
                onPress={() => router.push(`/cups/${cup.tournamentId}`)}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderRadius: radius.control,
                  backgroundColor: void_.surface,
                  borderWidth: 1,
                  borderColor: goldAlpha.edgeSoft,
                  gap: 4,
                }}
              >
                <Txt size={14.5} weight="semibold" color={onVoid.primary}>
                  {cup.name}
                </Txt>
                <Txt size={11.5} color={onVoid.faint}>
                  {cup.teamName} · {cup.registrationState === 'pending' ? t.invited : stateLabel(cup.state)}
                </Txt>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {!loading && all.length === 0 ? (
        <View style={{ gap: 6 }}>
          <Txt size={15} weight="semibold" color={onVoid.primary}>
            {t.noCups}
          </Txt>
          <Txt size={12.5} lh={1.55} color={onVoid.muted}>
            {t.noCupsBlurb}
          </Txt>
        </View>
      ) : null}

      <View style={{ gap: 12 }}>
        {all.length > 0 ? <Eyebrow>{t.allCups}</Eyebrow> : null}
        <View style={{ gap: 10 }}>
          {all.map((cup) => (
            <Pressable
              key={cup.tournamentId}
              accessibilityRole="button"
              accessibilityLabel={`${cup.name} at ${cup.venueName}`}
              onPress={() => router.push(`/cups/${cup.tournamentId}`)}
              style={({ pressed }) => ({
                padding: 16,
                borderRadius: radius.cardInner,
                backgroundColor: void_.surface,
                borderWidth: 1,
                borderColor: pressed ? goldAlpha.edge : onVoid.edgeFaint,
                gap: 10,
              })}
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt size={16} weight="bold" em={-0.015} color={onVoid.primary}>
                    {cup.name}
                  </Txt>
                  <Txt size={11.5} color={onVoid.faint}>
                    {cup.venueName}
                    {cup.area ? ` · ${cup.area}` : ''}
                  </Txt>
                </View>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: cup.state === 'open' ? goldAlpha.accent : onVoid.hairline,
                    borderRadius: radius.badge,
                    paddingVertical: 3,
                    paddingHorizontal: 7,
                  }}
                >
                  <Txt
                    size={9.5}
                    weight="bold"
                    em={0.08}
                    color={cup.state === 'open' ? gold.base : onVoid.dim}
                  >
                    {stateLabel(cup.state).toUpperCase()}
                  </Txt>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Txt size={11.5} color={onVoid.muted}>
                  {t.teamsEntered(num(cup.entered), num(cup.maxTeams))}
                </Txt>
                {cup.entryFeeEgp > 0 ? (
                  <Txt size={11.5} color={onVoid.muted}>
                    {t.entryFee(money(cup.entryFeeEgp))}
                  </Txt>
                ) : null}
                {cup.startsOn ? (
                  <Txt size={11.5} color={onVoid.muted}>
                    {shortDate(`${cup.startsOn}T18:00:00Z`)}
                  </Txt>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}
