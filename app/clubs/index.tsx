import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Avatar } from '@/components/Avatar';
import { Reveal } from '@/components/motion';
import { ActionButton, Card, MenuGroup, SectionTitle, Unreachable } from '@/components/kit';
import { ChevronLeft, ChevronRight, Trophy } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { familyFor } from '@/theme/typography';
import {
  createClub,
  myBounties,
  myClubs,
  respondToClubInvite,
  type Bounty,
  type ClubSummary,
} from '@/data/clubs';
import { useI18n } from '@/i18n';
import { useRefreshTick } from '@/state/refresh';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';

/**
 * The clubs a player belongs to, and the form that founds one.
 *
 * The captain-plays switch is off by default and says why underneath. That is
 * the rule people get wrong — a club of a captain and six players looks like
 * seven and is six — and the moment to say it is while somebody is deciding,
 * not when the server refuses their entry a week later.
 *
 * In the redesign's list idiom: a crest on one side, the facts on the other,
 * the rows grouped in one card, and whatever needs an answer above them.
 */
export default function Clubs() {
  const { signedIn } = useSession();
  const router = useRouter();
  const { reason, t, num, money, rtl } = useI18n();

  // The refresh button in the top bar.
  const tick = useRefreshTick();
  const [clubs, setClubs] = useState<ClubSummary[]>([]);
  /**
   * What each share is actually worth, cup by cup. A percentage cannot be
   * weighed on its own, and the moment somebody needs to weigh it is before
   * they press Join — so this is loaded beside the clubs rather than on a
   * screen they would reach after accepting.
   */
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(isLive);
  /** §4.7: a list we could not read is not an empty list. */
  const [unreachable, setUnreachable] = useState(false);
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [captainPlays, setCaptainPlays] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!isLive || !signedIn) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [rows, shares] = await Promise.all([
          myClubs(),
          // A pot nobody has named yet is the ordinary case, and a failure
          // here must not make the club list itself unreadable.
          myBounties().catch(() => [] as Bounty[]),
        ]);
        if (!cancelled) {
          setClubs(rows);
          setBounties(shares);
          setUnreachable(false);
        }
      } catch {
        if (!cancelled) {
          setClubs([]);
          setBounties([]);
          setUnreachable(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce, signedIn, tick]);

  const invited = clubs.filter((c) => c.state === 'invited');
  const active = clubs.filter((c) => c.state === 'active');

  /** The cups a club is in that this share would be paid out of. */
  const sharesFor = (clubId: string) => bounties.filter((b) => b.clubId === clubId);

  async function found() {
    if (!name.trim() || creating) return;
    setCreating(true);
    setNotice(null);
    try {
      const res = await createClub(
        name.trim(),
        area.trim() || undefined,
        captainPlays ? 'starter' : null,
      );
      if (res.ok) {
        setName('');
        setArea('');
        setCaptainPlays(false);
        if (res.clubId) router.push(`/clubs/${res.clubId}`);
        else reload();
      } else {
        setNotice(reason(res.reason) ?? null);
      }
    } catch {
      setNotice(t.offline);
    } finally {
      setCreating(false);
    }
  }

  async function answer(clubId: string, accept: boolean) {
    try {
      const res = await respondToClubInvite(clubId, accept);
      if (!res.ok) setNotice(reason(res.reason) ?? null);
    } catch {
      setNotice(t.offline);
    } finally {
      reload();
    }
  }

  const field = {
    height: 48,
    borderRadius: radius.row,
    borderWidth: 1,
    borderColor: onVoid.line,
    backgroundColor: void_.bg,
    paddingHorizontal: 14,
    color: onVoid.primary,
    fontFamily: familyFor('regular', rtl),
    fontSize: 15,
  } as const;

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
          hitSlop={8}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}
        >
          <ChevronLeft size={22} color={onVoid.primary} />
        </Pressable>
        <View style={{ gap: 2, flex: 1 }}>
          <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary}>
            {t.clubs}
          </Txt>
          <Txt size={11.5} lh={1.5} color={onVoid.faint}>
            {t.clubsBlurb}
          </Txt>
        </View>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {unreachable ? <Unreachable label={t.offline} onRetry={reload} /> : null}

      {invited.length ? (
        <View style={{ gap: 12 }}>
          <SectionTitle title={t.clubInvitePending} />
          {invited.map((club) => (
            <Card key={club.clubId} style={{ borderColor: goldAlpha.edge }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar
                  name={club.name}
                  url={club.crestUrl}
                  size={46}
                  radius={radius.chip}
                  background={void_.raised}
                  border={goldAlpha.edge}
                  color={gold.base}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt size={15} weight="bold" color={onVoid.primary} numberOfLines={1}>
                    {club.name}
                  </Txt>
                  {club.homeArea ? (
                    <Txt size={12} color={onVoid.faint}>
                      {club.homeArea}
                    </Txt>
                  ) : null}
                </View>
              </View>
              {/* The offer, before the answer. A captain promising a cut of
                  a cup is how sides are actually assembled here, and the
                  argument afterwards is always about what was said — so it is
                  written down, and shown to the person being asked. */}
              {club.bountyPct != null ? (
                <View
                  style={{
                    borderRadius: radius.row,
                    borderWidth: 1,
                    borderColor: goldAlpha.frame,
                    backgroundColor: goldAlpha.fill,
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <Txt size={13} weight="bold" color={gold.base}>
                    {t.bountyOffered(num(club.bountyPct))}
                  </Txt>
                  {sharesFor(club.clubId).map((b) => (
                    <Txt key={b.tournamentId} size={12} lh={1.5} color={onVoid.secondary}>
                      {b.prizePoolEgp > 0
                        ? t.bountyWorth(b.tournamentName, money(b.shareEgp), money(b.prizePoolEgp))
                        : t.bountyNoPotYet(b.tournamentName)}
                    </Txt>
                  ))}
                  <Txt size={11.5} lh={1.5} color={onVoid.dim}>
                    {t.bountyPromiseNote}
                  </Txt>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <ActionButton label={t.joinClub} flex onPress={() => answer(club.clubId, true)} />
                <ActionButton label={t.declineClub} variant="ghost" flex onPress={() => answer(club.clubId, false)} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {/* And after accepting. A share somebody agreed to is a thing they
          should be able to look up, not a number they have to remember. */}
      {bounties.some((b) => b.membershipState === 'active') ? (
        <View style={{ gap: 12 }}>
          <SectionTitle title={t.bountyPlayingFor} />
          <MenuGroup>
            {bounties
              .filter((b) => b.membershipState === 'active')
              .map((b) => (
                <View
                  key={`${b.clubId}-${b.tournamentId}`}
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 13, paddingVertical: 13, paddingHorizontal: 14 }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: radius.icon,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: goldAlpha.fill,
                    }}
                  >
                    <Trophy size={19} color={gold.base} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Txt size={14} weight="semibold" color={onVoid.primary}>
                      {b.tournamentName}
                    </Txt>
                    <Txt size={11.5} color={onVoid.faint}>
                      {b.clubName}
                    </Txt>
                    <Txt size={12.5} lh={1.5} color={gold.base}>
                      {b.prizePoolEgp > 0
                        ? t.bountyWorth(b.tournamentName, money(b.shareEgp), money(b.prizePoolEgp))
                        : t.bountyNoPotYet(b.tournamentName)}
                    </Txt>
                  </View>
                </View>
              ))}
          </MenuGroup>
        </View>
      ) : null}

      <View style={{ gap: 12 }}>
        <SectionTitle title={t.myClubs} />
        {!loading && !unreachable && !active.length ? (
          <Txt size={13} color={onVoid.muted}>
            {t.noClubsYet}
          </Txt>
        ) : null}
        {active.length ? (
          <MenuGroup>
            {active.map((club, i) => (
              <Reveal key={club.clubId} index={Math.min(i, 7)}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={club.name}
                  onPress={() => router.push(`/clubs/${club.clubId}`)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor: pressed ? goldAlpha.fillSoft : 'transparent',
                  })}
                >
                  <Avatar
                    name={club.name}
                    url={club.crestUrl}
                    size={46}
                    radius={radius.chip}
                    background={void_.raised}
                    border={goldAlpha.edge}
                    color={gold.base}
                  />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Txt size={15} weight="semibold" color={onVoid.primary} numberOfLines={1}>
                      {club.name}
                    </Txt>
                    <Txt size={11.5} color={onVoid.faint}>
                      {club.isCaptain ? t.captain : club.slotKind ? t.clubSquad : t.doesNotPlay}
                      {club.trophies > 0 ? ` · ${t.trophyCount(num(club.trophies))}` : ''}
                    </Txt>
                  </View>
                  {/* Whether it can enter anything, as a badge on the far side —
                      the one fact a captain scans this list for. */}
                  <View
                    style={{
                      paddingVertical: 4,
                      paddingHorizontal: 9,
                      borderRadius: radius.pill,
                      backgroundColor: club.eligible ? goldAlpha.fill : 'rgba(243,238,229,.06)',
                    }}
                  >
                    <Txt size={10.5} weight="bold" color={club.eligible ? gold.base : onVoid.muted}>
                      {club.eligible ? t.readyToEnter : t.notReadyToEnter}
                    </Txt>
                  </View>
                  <ChevronRight size={16} color={onVoid.dim} />
                </Pressable>
              </Reveal>
            ))}
          </MenuGroup>
        ) : null}
      </View>

      <View style={{ gap: 12 }}>
        <SectionTitle title={t.newClub} />
        <Card>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t.clubName}
            placeholderTextColor={onVoid.disabled}
            accessibilityLabel={t.clubName}
            style={field}
          />
          <TextInput
            value={area}
            onChangeText={setArea}
            placeholder={t.clubHomePlaceholder}
            placeholderTextColor={onVoid.disabled}
            style={field}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Txt size={13.5} weight="semibold" color={onVoid.primary} style={{ flex: 1 }}>
              {t.captainPlays}
            </Txt>
            <Switch
              value={captainPlays}
              onValueChange={setCaptainPlays}
              trackColor={{ false: onVoid.edge, true: goldAlpha.fill }}
              thumbColor={captainPlays ? gold.base : onVoid.disabled}
              accessibilityLabel={t.captainPlays}
            />
          </View>
          <Txt size={12} lh={1.5} color={onVoid.dim}>
            {t.captainPlaysNote}
          </Txt>

          <ActionButton label={t.foundIt} disabled={!name.trim() || creating} onPress={found} />
          {notice ? (
            <Txt size={12} color={burgundy.action}>
              {notice}
            </Txt>
          ) : null}
        </Card>
      </View>
    </Screen>
  );
}
