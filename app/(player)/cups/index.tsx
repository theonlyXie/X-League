import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Eyebrow } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { CapacityBar, PressScale, Reveal } from '@/components/motion';
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
  const { t, num, money, shortDate, moment } = useI18n();

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
  }, [signedIn, nonce, place]);

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

      {/* Where and when, first. A cup now runs across several grounds, and each
          match may be at a different one, so "the venue" stopped being an
          answer to the only question a player opens this tab with. */}
      {matches.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Eyebrow>{t.yourMatches}</Eyebrow>
          <View style={{ gap: 8 }}>
            {matches.map((m, i) => (
              <Reveal key={m.fixtureId} index={i}>
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
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: radius.control,
                    backgroundColor: void_.surface,
                    borderWidth: 1,
                    borderColor: goldAlpha.edge,
                    gap: 6,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Txt size={14.5} weight="semibold" color={onVoid.primary} style={{ flex: 1 }}>
                      {m.opponent ? t.againstName(m.opponent) : t.bye}
                    </Txt>
                    <Txt size={10.5} weight="semibold" em={0.06} color={gold.base}>
                      {m.mySide === 'home' ? t.matchAtHome : t.matchAway}
                    </Txt>
                  </View>
                  <Txt size={11.5} color={onVoid.secondary}>
                    {m.venueName
                      ? m.pitchLabel
                        ? t.groundAndPitch(m.venueName, m.pitchLabel)
                        : m.venueName
                      : t.whereTbc}
                  </Txt>
                  <Txt size={11.5} color={m.kicksOffAt ? onVoid.secondary : onVoid.faint}>
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
                    style={{ paddingVertical: 8, alignItems: 'center' }}
                  >
                    <Txt size={12} weight="semibold" color={gold.base}>
                      {t.rateThisMatch}
                    </Txt>
                  </Pressable>
                ) : null}
              </Reveal>
            ))}
          </View>
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

      {regions.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 20 }}
        >
          {[null, ...regions.map((r) => r.region)].map((option) => {
            const on = place === option;
            return (
              <PressScale
                key={option ?? '*'}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={option ?? t.allRegions}
                onPress={() => {
                  setPlace(option);
                  void Haptics.selectionAsync();
                }}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: radius.chip,
                  borderWidth: 1,
                  borderColor: on ? goldAlpha.frame : onVoid.line,
                  backgroundColor: on ? goldAlpha.fill : 'transparent',
                }}
              >
                <Txt size={12} weight="medium" color={on ? gold.base : onVoid.secondary}>
                  {option ?? t.allRegions}
                </Txt>
              </PressScale>
            );
          })}
        </ScrollView>
      ) : null}

      {holders.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Eyebrow>{t.featuredClubs}</Eyebrow>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingRight: 20 }}
          >
            {holders.map((club) => (
              <PressScale
                key={club.clubId}
                accessibilityRole="button"
                accessibilityLabel={club.name}
                onPress={() => router.push(`/clubs/${club.clubId}`)}
                style={{
                  width: 132,
                  padding: 12,
                  borderRadius: radius.control,
                  borderWidth: 1,
                  borderColor: goldAlpha.edge,
                  backgroundColor: void_.inset,
                  gap: 8,
                }}
              >
                <Avatar
                  name={club.name}
                  url={club.crestUrl}
                  size={38}
                  radius={radius.chip}
                  background={void_.raised}
                  border={goldAlpha.edge}
                  color={gold.base}
                />
                <Txt size={13} weight="semibold" color={onVoid.primary} numberOfLines={2}>
                  {club.name}
                </Txt>
                <Txt size={11} color={gold.base}>
                  {t.trophyCount(num(club.trophies))}
                </Txt>
              </PressScale>
            ))}
          </ScrollView>
        </View>
      ) : null}

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
                    {cup.region ? ` · ${cup.region}` : ''}
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

              <CapacityBar
                filled={cup.entered}
                capacity={cup.maxTeams}
                track={onVoid.edge}
                fill={gold.base}
                full={onVoid.line}
              />
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}
