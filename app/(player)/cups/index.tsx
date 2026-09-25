import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { NotificationBell } from '@/components/NotificationBell';
import { Avatar } from '@/components/Avatar';
import { CapacityBar, PressScale, Reveal } from '@/components/motion';
import { MenuGroup, MenuRow, PitchArt, Pill, SectionTitle, Tag } from '@/components/kit';
import { Podium, Trophy } from '@/components/icons';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import {
  listTournaments,
  myCupFixtures,
  myTournaments,
  type MyCupFixture,
  type MyTournament,
  type TournamentSummary,
} from '@/data/cups';
import { featuredClubs, tournamentRegions, type FeaturedClub, type Region } from '@/data/board';
import { useSession } from '@/state/session';
import { useI18n } from '@/i18n';
import { useRefreshTick } from '@/state/refresh';
import { isLive } from '@/lib/supabase';

/**
 * P-15 — what is on.
 *
 * Open to guests, because a cup nobody can see is a cup nobody enters. The
 * player's own entries sit above the public list: "am I in this" is the first
 * question anybody opens this tab with.
 *
 * In the redesign's feed idiom: a title row, headed sections, and each cup as
 * a picture-led card like the venue feed's — the drawn pitch with the cup's
 * state laid over it, and the facts in a panel along its lower edge.
 */
export default function Cups() {
  const router = useRouter();
  const { signedIn } = useSession();
  const { t, num, moment } = useI18n();

  // The refresh button in the top bar.
  const tick = useRefreshTick();
  const [all, setAll] = useState<TournamentSummary[]>([]);
  const [mine, setMine] = useState<MyTournament[]>([]);
  const [matches, setMatches] = useState<MyCupFixture[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [place, setPlace] = useState<string | null>(null);
  const [holders, setHolders] = useState<FeaturedClub[]>([]);
  const [loading, setLoading] = useState(isLive);
  /** §4.7: a list we could not read is not an empty list. */
  const [unreachable, setUnreachable] = useState(false);
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
        const [rows, ours, ties, places, won] = await Promise.all([
          listTournaments(25, place),
          signedIn ? myTournaments().catch(() => [] as MyTournament[]) : Promise.resolve([]),
          signedIn ? myCupFixtures(8).catch(() => [] as MyCupFixture[]) : Promise.resolve([]),
          tournamentRegions().catch(() => [] as Region[]),
          featuredClubs().catch(() => [] as FeaturedClub[]),
        ]);
        if (cancelled) return;
        setAll(rows);
        setMine(ours);
        setMatches(ties);
        setRegions(places);
        setHolders(won);
        setUnreachable(false);
      } catch {
        if (!cancelled) {
          setAll([]);
          setUnreachable(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, nonce, place, tick]);

  // A cancelled cup used to fall through to "Running", which is the one thing
  // it certainly is not. The list no longer carries them, but a cup opened by
  // its own link still can, and it should say what it is.
  const stateLabel = (s: TournamentSummary['state']) =>
    s === 'open'
      ? t.openForEntries
      : s === 'complete'
        ? t.cupComplete
        : s === 'cancelled'
          ? t.cupCancelled
          : t.cupRunning;

  return (
    <Screen
      contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 22 }}
      refreshControl={
        isLive ? (
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={gold.base} colors={[gold.base]} />
        ) : undefined
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt size={22} weight="bold" em={-0.02} color={onVoid.primary}>
          {t.cupsTitle}
        </Txt>
        <NotificationBell />
      </View>

      {loading && all.length === 0 ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {/* Where and when, first. A cup now runs across several grounds, and each
          match may be at a different one, so "the venue" stopped being an
          answer to the only question a player opens this tab with. */}
      {matches.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionTitle title={t.yourMatches} />
          <View style={{ gap: 10 }}>
            {matches.map((m, i) => (
              <Reveal key={m.fixtureId} index={i}>
                <View
                  style={{
                    borderRadius: radius.cardInner,
                    backgroundColor: void_.surface,
                    borderWidth: 1,
                    borderColor: goldAlpha.edge,
                    overflow: 'hidden',
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${m.cupName}. ${
                      m.opponent ? t.againstName(m.opponent) : t.bye
                    }. ${
                      m.venueName
                        ? m.pitchLabel
                          ? t.groundAndPitch(m.venueName, m.pitchLabel)
                          : m.venueName
                        : t.whereTbc
                    }. ${m.kicksOffAt ? moment(m.kicksOffAt) : t.whenTbc}`}
                    onPress={() => router.push(`/cups/${m.tournamentId}`)}
                    style={({ pressed }) => ({
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      gap: 6,
                      backgroundColor: pressed ? goldAlpha.fillSoft : 'transparent',
                    })}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Txt size={15} weight="bold" color={onVoid.primary} style={{ flex: 1 }}>
                        {m.opponent ? t.againstName(m.opponent) : t.bye}
                      </Txt>
                      <Tag label={m.mySide === 'home' ? t.matchAtHome : t.matchAway} />
                    </View>
                    <Txt size={12} color={onVoid.secondary}>
                      {m.venueName
                        ? m.pitchLabel
                          ? t.groundAndPitch(m.venueName, m.pitchLabel)
                          : m.venueName
                        : t.whereTbc}
                    </Txt>
                    <Txt size={12} weight="semibold" color={m.kicksOffAt ? gold.base : onVoid.faint}>
                      {m.kicksOffAt ? moment(m.kicksOffAt) : t.whenTbc}
                    </Txt>
                    <Txt size={11} color={onVoid.faint}>
                      {t.cupAndRound(m.cupName, t.roundN(num(m.round)))}
                    </Txt>
                  </Pressable>
                  {/* A cup match is now the only kind that becomes evidence, and
                      it only becomes evidence once the people in it rate each
                      other. This is the one route to that from the Cups tab. */}
                  {m.canRate && m.matchId ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t.rateThisMatch}
                      onPress={() => router.push(`/play/rate?match=${m.matchId}`)}
                      style={{
                        paddingVertical: 11,
                        alignItems: 'center',
                        borderTopWidth: 1,
                        borderTopColor: onVoid.edgeFaint,
                      }}
                    >
                      <Txt size={12.5} weight="semibold" color={gold.base}>
                        {t.rateThisMatch}
                      </Txt>
                    </Pressable>
                  ) : null}
                </View>
              </Reveal>
            ))}
          </View>
        </View>
      ) : null}

      {mine.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionTitle title={t.yourCups} />
          <MenuGroup>
            {mine.map((cup) => (
              <MenuRow
                key={cup.tournamentId}
                icon={<Trophy size={19} color={gold.base} />}
                title={cup.name}
                detail={`${cup.teamName} · ${cup.registrationState === 'pending' ? t.invited : stateLabel(cup.state)}`}
                onPress={() => router.push(`/cups/${cup.tournamentId}`)}
              />
            ))}
          </MenuGroup>
        </View>
      ) : null}

      {regions.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -20 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
        >
          {[null, ...regions.map((r) => r.region)].map((option) => (
            <Pill
              key={option ?? '*'}
              label={option ?? t.allRegions}
              on={place === option}
              onPress={() => {
                setPlace(option);
                void Haptics.selectionAsync();
              }}
            />
          ))}
        </ScrollView>
      ) : null}

      {holders.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionTitle title={t.featuredClubs} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -20 }}
            contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}
          >
            {holders.map((club) => (
              <PressScale
                key={club.clubId}
                accessibilityRole="button"
                accessibilityLabel={club.name}
                onPress={() => router.push(`/clubs/${club.clubId}`)}
                style={{
                  width: 136,
                  padding: 12,
                  borderRadius: radius.cardInner,
                  borderWidth: 1,
                  borderColor: onVoid.edge,
                  backgroundColor: void_.surface,
                  gap: 8,
                }}
              >
                <Avatar
                  name={club.name}
                  url={club.crestUrl}
                  size={40}
                  radius={radius.chip}
                  background={void_.raised}
                  border={goldAlpha.edge}
                  color={gold.base}
                />
                <Txt size={13.5} weight="bold" color={onVoid.primary} numberOfLines={2}>
                  {club.name}
                </Txt>
                <Txt size={11.5} weight="semibold" color={gold.base}>
                  {t.trophyCount(num(club.trophies))}
                </Txt>
              </PressScale>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* The record belongs on the competitive tab, not only in a row on the
          account screen. Somebody looking for who is scoring looks here. */}
      <MenuGroup>
        <MenuRow
          icon={<Podium size={19} color={gold.base} />}
          title={t.topScorersEverywhere}
          onPress={() => router.push('/leaderboard')}
        />
      </MenuGroup>

      {!loading && all.length === 0 ? (
        <View style={{ gap: 6 }}>
          <Txt size={15} weight="semibold" color={onVoid.primary}>
            {unreachable ? t.listUnreachable : t.noCups}
          </Txt>
          <Txt size={12.5} lh={1.55} color={onVoid.muted}>
            {unreachable ? t.listUnreachableBlurb : t.noCupsBlurb}
          </Txt>
        </View>
      ) : null}

      <View style={{ gap: 12 }}>
        {all.length > 0 ? <SectionTitle title={t.allCups} /> : null}
        <View style={{ gap: 14 }}>
          {all.map((cup) => (
            <CupCard
              key={cup.tournamentId}
              cup={cup}
              stateLabel={stateLabel(cup.state)}
              onPress={() => router.push(`/cups/${cup.tournamentId}`)}
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}

/** What kind of competition it is, in the reader's language. */
function cupFormatLabel(format: TournamentSummary['format'], t: ReturnType<typeof useI18n>['t']): string {
  return format === 'knockout' ? t.cupsFormatKnockout : format === 'group_knockout' ? t.cupsFormatGroups : t.cupsFormatLeague;
}

/**
 * One cup in the feed, shaped like the venue feed's card: the drawn pitch with
 * its state, format and prize over it, and the facts in a panel on its lower
 * edge — name and start date on one line, where and what it costs on the next,
 * and how full it is under both.
 */
function CupCard({
  cup,
  stateLabel,
  onPress,
}: {
  cup: TournamentSummary;
  stateLabel: string;
  onPress: () => void;
}) {
  const { t, num, money, shortDate } = useI18n();
  const open = cup.state === 'open';
  const where = [cup.venueName, cup.region].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[cup.name, where, stateLabel, cup.entryFeeEgp > 0 ? t.entryFee(money(cup.entryFeeEgp)) : null]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: radius.card,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: pressed ? goldAlpha.edge : onVoid.edge,
        backgroundColor: void_.surface,
      })}
    >
      <PitchArt height={212} />
      <View style={{ position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', gap: 6 }}>
        <Tag label={stateLabel} tone={open ? 'gold' : 'plain'} />
        <Tag label={cupFormatLabel(cup.format, t)} />
        <View style={{ flex: 1 }} />
        {cup.prizePoolEgp > 0 ? <Tag label={`${t.prizePool} ${money(cup.prizePoolEgp)}`} /> : null}
      </View>
      <View
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          bottom: 10,
          borderRadius: radius.row,
          backgroundColor: 'rgba(14,14,14,.94)',
          borderWidth: 1,
          borderColor: onVoid.edge,
          paddingVertical: 11,
          paddingHorizontal: 13,
          gap: 6,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <Txt size={15.5} weight="bold" color={onVoid.primary} numberOfLines={1} style={{ flexShrink: 1 }}>
            {cup.name}
          </Txt>
          {cup.startsOn ? (
            <Txt size={12} weight="semibold" color={gold.base}>
              {shortDate(`${cup.startsOn}T18:00:00Z`)}
            </Txt>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <Txt size={11.5} color={onVoid.faint} numberOfLines={1} style={{ flexShrink: 1 }}>
            {where}
          </Txt>
          {cup.entryFeeEgp > 0 ? (
            <Txt size={12} weight="semibold" color={onVoid.primary}>
              {t.entryFee(money(cup.entryFeeEgp))}
            </Txt>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <CapacityBar
              filled={cup.entered}
              capacity={cup.maxTeams}
              height={4}
              track={onVoid.edge}
              fill={gold.base}
              full={onVoid.line}
            />
          </View>
          <Txt size={11} color={onVoid.muted}>
            {t.teamsEntered(num(cup.entered), num(cup.maxTeams))}
          </Txt>
        </View>
      </View>
    </Pressable>
  );
}
