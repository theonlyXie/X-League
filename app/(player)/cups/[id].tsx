import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Share as NativeShare, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { CapacityBar, Reveal } from '@/components/motion';
import {
  ActionButton,
  Card,
  FloatingIcon,
  KeyValue,
  MenuGroup,
  MenuRow,
  PitchArt,
  Pill,
  SectionTitle,
  StickyFooter,
  Tag,
} from '@/components/kit';
import { Pin, Podium, Share } from '@/components/icons';
import { tournamentAwards, type Award } from '@/data/board';
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
 *
 * Laid out like the venue page: a picture with back and share over it, the
 * name and the facts that decide whether to enter, a card for each thing a
 * captain weighs, and the one action the cup is asking for pinned at the foot.
 */
export default function CupDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const tournamentId = params.id ?? null;
  const { signedIn } = useSession();
  const { reason, t, num, money, shortDate, moment } = useI18n();

  const [cup, setCup] = useState<TournamentDetail | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [tab, setTab] = useState<'standings' | 'fixtures'>('standings');
  const [awards, setAwards] = useState<Award[]>([]);
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
        const [detail, mine, won] = await Promise.all([
          tournamentDetail(tournamentId),
          signedIn ? myTeams().catch(() => [] as Team[]) : Promise.resolve([]),
          // Its own call, and its own failure: a cup nobody has settled has no
          // awards, which is an answer rather than an error.
          tournamentAwards(tournamentId).catch(() => [] as Award[]),
        ]);
        if (cancelled) return;
        setCup(detail);
        setAwards(won);
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

  const day = (d: string) => shortDate(`${d}T18:00:00Z`);
  const stateLabel = (s: TournamentDetail['state']) =>
    s === 'open'
      ? t.openForEntries
      : s === 'complete'
        ? t.cupComplete
        : s === 'cancelled'
          ? t.cupCancelled
          : t.cupRunning;
  const formatLabel = (f: TournamentDetail['format']) =>
    f === 'knockout' ? t.cupsFormatKnockout : f === 'group_knockout' ? t.cupsFormatGroups : t.cupsFormatLeague;

  // The page's one action. Entering while entries are open; once the draw has
  // been made, watching it. A cup that is neither has nothing to ask for.
  const canEnter = cup?.state === 'open' && signedIn;
  const canWatch = !!cup && cup.fixtures.length > 0;

  const share = () => {
    if (!cup) return;
    const lines = [cup.name, cup.venueName, cup.startsOn ? day(cup.startsOn) : null].filter(Boolean).join('\n');
    NativeShare.share({ message: t.cupsShareMessage(lines) }).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: void_.bg }}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View>
          {/* A cup has no photograph of its own; the drawn pitch stands in, as
              it does for every venue without one. */}
          <PitchArt height={250 + insets.top} />

          <View
            style={{
              position: 'absolute',
              top: insets.top + 10,
              left: 16,
              right: 16,
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            <FloatingIcon label={t.back} onPress={() => (router.canGoBack() ? router.back() : router.replace('/cups'))} />
            {cup ? (
              <FloatingIcon label={t.share} onPress={share}>
                <Share size={18} color={onVoid.primary} />
              </FloatingIcon>
            ) : null}
          </View>

          {cup ? (
            <View style={{ position: 'absolute', bottom: 36, left: 16, right: 16, flexDirection: 'row', gap: 6 }}>
              <Tag label={stateLabel(cup.state)} tone={cup.state === 'open' ? 'gold' : 'plain'} />
              <Tag label={formatLabel(cup.format)} />
              <View style={{ flex: 1 }} />
              {cup.prizePoolEgp > 0 ? <Tag label={`${t.prizePool} ${money(cup.prizePoolEgp)}`} /> : null}
            </View>
          ) : null}
        </View>

        <View
          style={{
            marginTop: -22,
            borderTopLeftRadius: radius.signature,
            borderTopRightRadius: radius.signature,
            backgroundColor: void_.bg,
            paddingTop: 22,
            paddingHorizontal: 20,
            paddingBottom: 28,
            gap: 20,
          }}
        >
          {/* Name, where, when. */}
          <View style={{ gap: 6 }}>
            <Txt size={24} weight="bold" em={-0.02} color={onVoid.primary}>
              {cup?.name ?? t.cupsTitle}
            </Txt>
            {cup ? (
              <>
                <Txt size={13} color={onVoid.muted}>
                  {[cup.venueName, cup.area].filter(Boolean).join(' · ')}
                </Txt>
                {cup.startsOn ? (
                  <Txt size={13} weight="semibold" color={gold.base}>
                    {cup.endsOn && cup.endsOn !== cup.startsOn
                      ? `${day(cup.startsOn)} – ${day(cup.endsOn)}`
                      : day(cup.startsOn)}
                  </Txt>
                ) : null}
              </>
            ) : null}
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
                <Card>
                  <Txt size={15} weight="bold" color={onVoid.primary}>
                    {t.cupsAbout}
                  </Txt>
                  <Txt size={13} lh={1.6} color={onVoid.muted}>
                    {cup.description}
                  </Txt>
                </Card>
              ) : null}

              <Card>
                <Txt size={15} weight="bold" color={onVoid.primary}>
                  {t.cupsFacts}
                </Txt>
                <KeyValue label={t.format} value={formatLabel(cup.format)} />
                {cup.startsOn ? <KeyValue label={t.cupsStarts} value={day(cup.startsOn)} /> : null}
                {cup.endsOn ? <KeyValue label={t.cupsEnds} value={day(cup.endsOn)} /> : null}
                {cup.entryFeeEgp > 0 ? <KeyValue label={t.entryFeeLabel} value={money(cup.entryFeeEgp)} /> : null}
                {/* What the winner takes. A player weighing a share promised on
                    a club invitation is weighing it against this number. */}
                {cup.prizePoolEgp > 0 ? <KeyValue label={t.prizePool} value={money(cup.prizePoolEgp)} /> : null}
                <View style={{ height: 1, backgroundColor: onVoid.edgeFaint }} />
                <KeyValue
                  label={t.cupsPlaces}
                  value={
                    cup.teams.length >= cup.maxTeams
                      ? t.cupFull
                      : t.placesTaken(num(cup.teams.length), num(cup.maxTeams))
                  }
                />
                <CapacityBar
                  filled={cup.teams.length}
                  capacity={cup.maxTeams}
                  track={onVoid.edge}
                  fill={gold.base}
                  full={onVoid.line}
                />
              </Card>

              {/* Every ground it is played across, the host first. A cup across
                  a city is not "at" one venue, so the page says which. */}
              {cup.venues.length > 0 ? (
                <Card>
                  <Txt size={15} weight="bold" color={onVoid.primary}>
                    {t.cupsWherePlayed}
                  </Txt>
                  {cup.venues.length > 1 ? (
                    <Txt size={12} color={onVoid.faint}>
                      {t.playedAcross(num(cup.venues.length))}
                    </Txt>
                  ) : null}
                  {cup.venues.map((v) => (
                    <View key={v.venue_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Pin size={18} color={gold.base} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Txt size={13.5} weight="semibold" color={onVoid.primary} numberOfLines={1}>
                          {v.name}
                        </Txt>
                        {v.area ? (
                          <Txt size={11.5} color={onVoid.faint} numberOfLines={1}>
                            {v.area}
                          </Txt>
                        ) : null}
                      </View>
                      {v.is_host && cup.venues.length > 1 ? (
                        <Txt size={11} weight="bold" color={gold.base}>
                          {t.hostGround}
                        </Txt>
                      ) : null}
                    </View>
                  ))}
                </Card>
              ) : null}

              {awards.length ? (
                <View style={{ gap: 12 }}>
                  <SectionTitle title={t.roll} />
                  {awards.map((award, i) => (
                    <Reveal key={award.kind} index={i}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          borderRadius: radius.cardInner,
                          borderWidth: 1,
                          borderColor: award.kind === 'champion' ? goldAlpha.frame : onVoid.edge,
                          backgroundColor: award.kind === 'champion' ? 'rgba(198,163,75,.08)' : void_.surface,
                          padding: 14,
                        }}
                      >
                        <Avatar
                          name={award.displayName}
                          url={award.crestUrl ?? award.photoUrl}
                          size={40}
                          radius={award.clubId ? radius.chip : undefined}
                          background={void_.raised}
                          border={goldAlpha.edge}
                          color={gold.base}
                        />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Txt size={11.5} weight="semibold" color={gold.base}>
                            {awardLabel(award.kind, t)}
                          </Txt>
                          <Txt size={14.5} weight="bold" color={onVoid.primary}>
                            {award.displayName}
                          </Txt>
                          {award.note ? (
                            <Txt size={11.5} color={onVoid.faint}>
                              {award.note}
                            </Txt>
                          ) : null}
                        </View>
                        {award.value != null ? (
                          <Txt size={18} weight="bold" color={gold.base}>
                            {num(award.value)}
                          </Txt>
                        ) : null}
                      </View>
                    </Reveal>
                  ))}
                </View>
              ) : null}

              {/* TRN-003: a team enters, and only its captain may enter it. */}
              {canEnter ? (
                <Card>
                  <Txt size={15} weight="bold" color={onVoid.primary}>
                    {t.enterTeam}
                  </Txt>
                  {enterable.length === 0 ? (
                    <Txt size={12.5} color={onVoid.dim}>
                      {teams.length === 0 ? t.noTeamsBlurb : t.inSquad}
                    </Txt>
                  ) : (
                    enterable.map((team, i) => (
                      <View
                        key={team.teamId}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          paddingTop: i > 0 ? 12 : 0,
                          borderTopWidth: i > 0 ? 1 : 0,
                          borderTopColor: onVoid.edgeFaint,
                        }}
                      >
                        <View style={{ flex: 1, gap: 2 }}>
                          <Txt size={13.5} weight="semibold" color={onVoid.primary}>
                            {team.name}
                          </Txt>
                          <Txt size={11.5} color={onVoid.faint}>
                            {t.members(num(team.members))}
                          </Txt>
                        </View>
                        <Button
                          label={t.enterTeam}
                          height={36}
                          round={radius.chip}
                          size={12}
                          onPress={async () => {
                            if (!tournamentId) return;
                            const res = await registerTeam(tournamentId, team.teamId);
                            if (res.ok) {
                              setNotice(null);
                              reload();
                            } else {
                              setNotice(reason(res.reason) ?? null);
                            }
                          }}
                        />
                      </View>
                    ))
                  )}
                  {notice ? (
                    <Txt size={12} color={burgundy.action}>
                      {notice}
                    </Txt>
                  ) : null}
                </Card>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['standings', 'fixtures'] as const).map((k) => (
                  <Pill
                    key={k}
                    label={k === 'standings' ? t.standings : t.fixtures}
                    on={k === tab}
                    onPress={() => setTab(k)}
                  />
                ))}
              </View>

              {tab === 'standings' ? (
                <StandingsTable rows={cup.standings} />
              ) : (
                <View style={{ gap: 18 }}>
                  {/* The pairings were drawn at random the moment entries closed.
                      The list below is the record; the draw plays it back — from
                      the foot of the page, or from here when the foot is busy
                      with entering. */}
                  {canWatch && canEnter ? (
                    <ActionButton
                      label={t.watchTheDraw}
                      variant="ghost"
                      onPress={() => router.push(`/cups/draw/${cup.tournamentId}`)}
                    />
                  ) : null}

                  {rounds.map((round) => (
                    <View key={round} style={{ gap: 10 }}>
                      <Txt size={15} weight="bold" color={onVoid.primary}>
                        {t.roundN(num(round))}
                      </Txt>
                      {cup.fixtures
                        .filter((f) => f.round === round)
                        .map((f) => (
                          <View
                            key={f.fixture_id}
                            style={{
                              gap: 8,
                              paddingVertical: 12,
                              paddingHorizontal: 14,
                              borderRadius: radius.row,
                              backgroundColor: void_.surface,
                              borderWidth: 1,
                              borderColor: onVoid.edge,
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <Txt
                                size={13.5}
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
                                  borderColor: f.state === 'played' ? goldAlpha.accent : onVoid.hairline,
                                  backgroundColor: f.state === 'played' ? goldAlpha.fill : 'transparent',
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
                              <Txt size={13.5} weight="semibold" color={onVoid.primary} style={{ flex: 1 }}>
                                {f.away ?? t.bye}
                              </Txt>
                            </View>

                            {/* A cup across a city means each match has its own
                                ground and hour. A match nobody has placed yet says
                                so — it is a real state, not a blank. */}
                            {f.state !== 'walkover' ? (
                              <Txt
                                size={11}
                                color={f.venue_name || f.kicks_off_at ? onVoid.secondary : onVoid.faint}
                                style={{ textAlign: 'center' }}
                              >
                                {f.venue_name || f.kicks_off_at
                                  ? t.whereAndWhen(
                                      f.venue_name
                                        ? f.pitch_label
                                          ? t.groundAndPitch(f.venue_name, f.pitch_label)
                                          : f.venue_name
                                        : t.whereTbc,
                                      f.kicks_off_at ? moment(f.kicks_off_at) : t.whenTbc,
                                    )
                                  : t.whereWhenTbc}
                              </Txt>
                            ) : null}
                          </View>
                        ))}
                    </View>
                  ))}
                </View>
              )}

              {/* Who is scoring at the ground this cup is played on. A cup across
                  several grounds has no single board to point at, so that one goes
                  to the whole record rather than picking a ground and implying the
                  goals were all scored there. */}
              <MenuGroup>
                <MenuRow
                  icon={<Podium size={19} color={gold.base} />}
                  title={cup.venues.length === 1 ? t.topScorersAt(cup.venues[0].name) : t.topScorersEverywhere}
                  onPress={() =>
                    router.push(
                      cup.venues.length === 1
                        ? `/leaderboard?venue=${cup.venues[0].venue_id}&name=${encodeURIComponent(cup.venues[0].name)}`
                        : '/leaderboard',
                    )
                  }
                />
              </MenuGroup>
            </>
          ) : null}
        </View>
      </ScrollView>

      {cup && canEnter ? (
        <StickyFooter>
          {cup.entryFeeEgp > 0 ? (
            <View style={{ gap: 2 }}>
              <Txt size={17} weight="bold" color={onVoid.primary}>
                {money(cup.entryFeeEgp)}
              </Txt>
              <Txt size={10.5} color={onVoid.dim}>
                {t.entryFeeLabel}
              </Txt>
            </View>
          ) : null}
          <ActionButton label={t.enterCup} flex onPress={() => router.push(`/cups/enter/${tournamentId}`)} />
        </StickyFooter>
      ) : cup && canWatch ? (
        <StickyFooter>
          <ActionButton label={t.watchTheDraw} flex onPress={() => router.push(`/cups/draw/${cup.tournamentId}`)} />
        </StickyFooter>
      ) : null}
    </View>
  );
}

/** The five award kinds, named the way the app names them. */
function awardLabel(kind: Award['kind'], t: ReturnType<typeof useI18n>['t']): string {
  switch (kind) {
    case 'champion':
      return t.champion;
    case 'runner_up':
      return t.runnerUp;
    case 'top_scorer':
      return t.topScorer;
    case 'best_player':
      return t.bestPlayer;
    default:
      return t.bestGoalkeeper;
  }
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
    <Txt size={11.5} color={onVoid.muted} style={{ width: w, textAlign: 'center', fontFamily: mono }}>
      {children}
    </Txt>
  );

  return (
    <View
      style={{
        borderRadius: radius.cardInner,
        borderWidth: 1,
        borderColor: onVoid.edge,
        backgroundColor: void_.surface,
        overflow: 'hidden',
      }}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ minWidth: '100%' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderBottomWidth: 1,
              borderBottomColor: onVoid.edgeFaint,
            }}
          >
            <Txt size={11.5} weight="semibold" color={onVoid.dim} style={{ width: 130 }}>
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
              key={r.entrant_id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 11,
                paddingHorizontal: 14,
                backgroundColor: i === 0 ? 'rgba(198,163,75,.08)' : 'transparent',
                borderTopWidth: i > 0 ? 1 : 0,
                borderTopColor: onVoid.edgeFaint,
              }}
            >
              <Txt size={13} weight="semibold" color={onVoid.primary} numberOfLines={1} style={{ width: 130 }}>
                {num(i + 1)}. {r.entrant_name}
              </Txt>
              <Cell>{num(r.played)}</Cell>
              <Cell>{num(r.won)}</Cell>
              <Cell>{num(r.drawn)}</Cell>
              <Cell>{num(r.lost)}</Cell>
              <Cell w={34}>{r.gd > 0 ? `+${num(r.gd)}` : num(r.gd)}</Cell>
              <Txt size={13} weight="bold" color={gold.base} style={{ width: 34, textAlign: 'center', fontFamily: mono }}>
                {num(r.points)}
              </Txt>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
