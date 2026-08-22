import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Divider, Eyebrow } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import { registerTeam, tournamentDetail, type TournamentDetail } from '@/data/cups';
import { myTeams, type Team } from '@/data/squad';
import { useSession } from '@/state/session';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * P-16 – P-18 — one cup: who is in it, what is being played, and the table.
 *
 * Standings, fixtures and entrants arrive together in one call, because all
 * three are one page and fetching them separately would let a player see a
 * table that disagrees with the results above it.
 */
export default function CupDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const tournamentId = params.id ?? null;
  const { signedIn } = useSession();
  const { t, num, money, shortDate } = useI18n();

  const [cup, setCup] = useState<TournamentDetail | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [tab, setTab] = useState<'standings' | 'fixtures'>('standings');
  const [notice, setNotice] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!isLive || !tournamentId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [detail, mine] = await Promise.all([
          tournamentDetail(tournamentId),
          signedIn ? myTeams().catch(() => [] as Team[]) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setCup(detail);
        // Only teams this player captains can be entered (TRN-003), so only
        // those are offered.
        setTeams(mine.filter((team) => team.role === 'captain' && team.state === 'active'));
      } catch {
        if (!cancelled) setCup(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentId, signedIn, nonce]);

  const enteredTeamIds = new Set(cup?.teams.map((e) => e.team_id) ?? []);
  const enterable = teams.filter((team) => !enteredTeamIds.has(team.teamId));
  const rounds = [...new Set((cup?.fixtures ?? []).map((f) => f.round))].sort((a, b) => a - b);

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/cups'))}
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
            {cup?.name ?? t.cupsTitle}
          </Txt>
          {cup ? (
            <Txt size={11.5} color={onVoid.faint}>
              {cup.venueName}
              {cup.startsOn ? ` · ${shortDate(`${cup.startsOn}T18:00:00Z`)}` : ''}
            </Txt>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {!loading && !cup ? (
        <Txt size={13} color={onVoid.muted}>
          {t.noCups}
        </Txt>
      ) : null}

      {cup ? (
        <>
          {cup.description ? (
            <Txt size={13} lh={1.6} color={onVoid.muted}>
              {cup.description}
            </Txt>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Txt size={11.5} color={onVoid.faint}>
              {t.teamsEntered(num(cup.teams.length), num(cup.maxTeams))}
            </Txt>
            {cup.entryFeeEgp > 0 ? (
              <Txt size={11.5} color={onVoid.faint}>
                {t.entryFee(money(cup.entryFeeEgp))}
              </Txt>
            ) : null}
          </View>

          {/* TRN-003: a team enters, and only its captain may enter it. */}
          {cup.state === 'open' && signedIn ? (
            <View style={{ gap: 10 }}>
              <Eyebrow>{t.enterTeam}</Eyebrow>
              {enterable.length === 0 ? (
                <Txt size={12.5} color={onVoid.dim}>
                  {teams.length === 0 ? t.noTeamsBlurb : t.inSquad}
                </Txt>
              ) : (
                <View style={{ gap: 8 }}>
                  {enterable.map((team) => (
                    <View
                      key={team.teamId}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: 11,
                        paddingHorizontal: 14,
                        borderRadius: radius.control,
                        backgroundColor: void_.surface,
                        borderWidth: 1,
                        borderColor: onVoid.edgeFaint,
                      }}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Txt size={13.5} weight="semibold" color={onVoid.primary}>
                          {team.name}
                        </Txt>
                        <Txt size={11} color={onVoid.faint}>
                          {t.members(num(team.members))}
                        </Txt>
                      </View>
                      <Button
                        label={t.enterTeam}
                        height={34}
                        round={radius.chip}
                        size={12}
                        onPress={async () => {
                          if (!tournamentId) return;
                          const res = await registerTeam(tournamentId, team.teamId);
                          if (res.ok) {
                            setNotice(null);
                            reload();
                          } else {
                            setNotice(res.reason ?? null);
                          }
                        }}
                      />
                    </View>
                  ))}
                </View>
              )}
              {notice ? (
                <Txt size={12} color={burgundy.action}>
                  {notice}
                </Txt>
              ) : null}
            </View>
          ) : null}

          <Divider />

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['standings', 'fixtures'] as const).map((k) => {
              const on = k === tab;
              return (
                <Pressable
                  key={k}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={k === 'standings' ? t.standings : t.fixtures}
                  onPress={() => setTab(k)}
                  style={{
                    flex: 1,
                    height: 38,
                    borderRadius: radius.chip,
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...(on
                      ? { backgroundColor: 'rgba(198,163,75,.14)', borderWidth: 1, borderColor: goldAlpha.accent }
                      : { borderWidth: 1, borderColor: onVoid.hairline }),
                  }}
                >
                  <Txt size={12.5} weight={on ? 'bold' : 'regular'} color={on ? gold.base : onVoid.muted}>
                    {k === 'standings' ? t.standings : t.fixtures}
                  </Txt>
                </Pressable>
              );
            })}
          </View>

          {tab === 'standings' ? (
            <StandingsTable rows={cup.standings} />
          ) : (
            <View style={{ gap: 18 }}>
              {rounds.map((round) => (
                <View key={round} style={{ gap: 8 }}>
                  <Eyebrow>{t.roundN(num(round))}</Eyebrow>
                  {cup.fixtures
                    .filter((f) => f.round === round)
                    .map((f) => (
                      <View
                        key={f.fixture_id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          paddingVertical: 11,
                          paddingHorizontal: 14,
                          borderRadius: radius.control,
                          backgroundColor: void_.surface,
                          borderWidth: 1,
                          borderColor: onVoid.edgeFaint,
                        }}
                      >
                        <Txt
                          size={13}
                          weight="semibold"
                          color={onVoid.primary}
                          style={{ flex: 1, textAlign: 'right' }}
                        >
                          {f.home ?? t.bye}
                        </Txt>
                        <View
                          style={{
                            minWidth: 52,
                            alignItems: 'center',
                            paddingVertical: 3,
                            paddingHorizontal: 8,
                            borderRadius: radius.badge,
                            borderWidth: 1,
                            borderColor:
                              f.state === 'played' ? goldAlpha.accent : onVoid.hairline,
                          }}
                        >
                          <Txt
                            size={12}
                            weight="bold"
                            color={f.state === 'played' ? gold.base : onVoid.dim}
                            style={{ fontFamily: mono }}
                          >
                            {f.state === 'played'
                              ? `${num(f.score_home ?? 0)}–${num(f.score_away ?? 0)}`
                              : f.state === 'walkover'
                                ? '—'
                                : 'v'}
                          </Txt>
                        </View>
                        <Txt size={13} weight="semibold" color={onVoid.primary} style={{ flex: 1 }}>
                          {f.away ?? t.bye}
                        </Txt>
                      </View>
                    ))}
                </View>
              ))}
            </View>
          )}
        </>
      ) : null}
    </Screen>
  );
}

/** P-17's table. Horizontal scroll rather than squeezing eight columns. */
function StandingsTable({ rows }: { rows: TournamentDetail['standings'] }) {
  const { t, num } = useI18n();

  if (rows.length === 0) {
    return (
      <Txt size={12.5} color={onVoid.dim}>
        {t.noCups}
      </Txt>
    );
  }

  const Cell = ({ children, w = 26 }: { children: React.ReactNode; w?: number }) => (
    <Txt
      size={11.5}
      color={onVoid.muted}
      style={{ width: w, textAlign: 'center', fontFamily: mono }}
    >
      {children}
    </Txt>
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ gap: 6, minWidth: '100%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 }}>
          <Txt size={10} em={0.1} upper color={onVoid.dim} style={{ width: 130 }}>
            {t.standings}
          </Txt>
          <Cell>{t.played}</Cell>
          <Cell>{t.won}</Cell>
          <Cell>{t.drawn}</Cell>
          <Cell>{t.lost}</Cell>
          <Cell w={34}>{t.goalDiff}</Cell>
          <Cell w={34}>{t.points}</Cell>
        </View>

        {rows.map((r, i) => (
          <View
            key={r.team_id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: radius.chip,
              backgroundColor: i === 0 ? 'rgba(198,163,75,.08)' : void_.surface,
              borderWidth: 1,
              borderColor: i === 0 ? goldAlpha.edgeSoft : onVoid.edgeFaint,
            }}
          >
            <Txt
              size={13}
              weight="semibold"
              color={onVoid.primary}
              numberOfLines={1}
              style={{ width: 130 }}
            >
              {num(i + 1)}. {r.team_name}
            </Txt>
            <Cell>{num(r.played)}</Cell>
            <Cell>{num(r.won)}</Cell>
            <Cell>{num(r.drawn)}</Cell>
            <Cell>{num(r.lost)}</Cell>
            <Cell w={34}>{r.gd > 0 ? `+${num(r.gd)}` : num(r.gd)}</Cell>
            <Txt
              size={13}
              weight="bold"
              color={gold.base}
              style={{ width: 34, textAlign: 'center', fontFamily: mono }}
            >
              {num(r.points)}
            </Txt>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
