import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { AreaHeader } from '@/components/AreaHeader';
import { AvatarStack, Button, CornerVoid, Eyebrow } from '@/components/ui';
import { CompactVenueCard, Pill, SearchField, SectionTitle, VenueCard } from '@/components/kit';
import { Ball, ChevronRight, Trophy } from '@/components/icons';
import { sortVenues } from '@/data/discovery';
import type { TextKey } from '@/i18n/strings';
import { cssAngle } from '@/theme/gradient';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { PLAYER } from '@/data/player';
import { useI18n } from '@/i18n';
import { useSession } from '@/state/session';
import { useHome } from '@/state/home';
import { respondToInvitation } from '@/data/squad';
import { isLive } from '@/lib/supabase';

/**
 * P-02 Home — show immediate reasons to return (§4.2).
 *
 * Every section here reads live. The interesting work is not the fetching, it
 * is that each block has a real empty state: a player with no booking, no
 * invitations and no card is a normal person on their first evening, not an
 * error, and the screen has to be worth opening for them too.
 */
export default function Home() {
  const router = useRouter();
  const { reason, t, num, money, hour, shortDate } = useI18n();
  const { signedIn, displayName } = useSession();
  const home = useHome();

  // A signed-in player is greeted by their own name or not at all. The
  // fallback used to be ungated, so any failure to read the profile — which
  // for a while was every sign-in, on a 403 nobody could see — greeted a real
  // person as "Basel", who is a character in the design file.
  const firstName = (displayName ?? (signedIn ? null : PLAYER.firstName))?.split(' ')[0] ?? null;
  const initials = firstName ? firstName.slice(0, 2).toUpperCase() : '';
  const level = home.evidence?.level ?? 1;

  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [order, setOrder] = useState<'near' | 'price' | 'rating'>('near');
  const recommended = useMemo(() => sortVenues(home.nearby, order), [home.nearby, order]);

  const nextMapUrl =
    home.next?.mapUrl ??
    (home.next?.lat != null ? `https://maps.google.com/?q=${home.next.lat},${home.next.lon}` : null);

  /**
   * Accepting or declining used to discard `{ ok, reason }` entirely, so a
   * refusal — the squad already full, the invitation already answered —
   * re-rendered the same list with the invitation still on it and said
   * nothing at all. The canonical "nothing happened" bug.
   */
  const respond = async (participantId: string, accept: boolean) => {
    setInviteNotice(null);
    const result = await respondToInvitation(participantId, accept).catch(() => ({
      ok: false,
      reason: t.offline,
    }));
    if (!result.ok) setInviteNotice(reason(result.reason) ?? t.offline);
    home.reload();
  };

  return (
    <Screen
      contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 22 }}
      refreshControl={
        isLive ? (
          <RefreshControl
            refreshing={home.loading}
            onRefresh={home.reload}
            tintColor={gold.base}
            colors={[gold.base]}
          />
        ) : undefined
      }
    >
      {/* The redesign's opening: where the feed is for, the bell, and a way
          to look for somewhere. The greeting moved under it, smaller, because
          the place is what changes what this screen shows and the name is not. */}
      <View style={{ gap: 14 }}>
        <AreaHeader />
        <SearchField placeholder={t.searchForAPitch} onPress={() => router.push('/play')} />
        {/* Only for somebody who has a card to open. A guest on a live build
            used to be greeted as the design's sample player. */}
        {firstName && (signedIn || !isLive) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.yourCardAtLevel(num(level))}
            onPress={() => router.push('/me')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: radius.pill,
                backgroundColor: void_.inset,
                borderWidth: 1,
                borderColor: 'rgba(198,163,75,.3)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt size={11} weight="bold" color={gold.base}>
                {initials}
              </Txt>
            </View>
            <Txt size={14} weight="semibold" color={onVoid.secondary} style={{ flex: 1 }}>
              {`${t.greetingEvening}, ${firstName}`}
            </Txt>
            <Txt size={10} weight="bold" em={0.1} color={gold.base}>
              LVL {num(level)}
            </Txt>
          </Pressable>
        ) : null}
      </View>

      {home.unreachable ? <Unreachable label={t.offline} onRetry={home.reload} retry={t.retry} /> : null}

      {/* The commitment-first opening: tonight's match before anything else. */}
      {home.next ? (
        <LinearGradient
          colors={[void_.raised, void_.bg]}
          locations={[0, 0.6]}
          {...cssAngle(160)}
          style={{
            borderWidth: 1,
            borderColor: goldAlpha.edge,
            borderRadius: radius.signature,
            overflow: 'hidden',
            padding: 20,
          }}
        >
          <CornerVoid />
          <View style={{ gap: 14 }}>
            <Txt size={10} weight="bold" em={0.2} upper color={gold.base}>
              {t.tonightAt} · {hour(home.next.startsAt)}
            </Txt>
            <View style={{ gap: 5 }}>
              <Txt size={24} weight="bold" em={-0.02} color={onVoid.primary}>
                {home.next.venueName}
              </Txt>
              <Txt size={13} color={onVoid.secondary}>
                {home.next.pitchLabel} · 5-a-side{home.next.area ? ` · ${home.next.area}` : ''}
              </Txt>
            </View>

            {home.counts ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <AvatarStack
                  initials={Array.from({ length: home.counts.acceptedStarters }, (_, i) =>
                    i === 0 ? initials : '··',
                  )}
                  openSlot={home.counts.acceptedStarters < home.counts.starterCapacity}
                />
                <Txt size={12} color={onVoid.muted}>
                  {t.confirmedOf(
                    num(home.counts.acceptedStarters),
                    num(home.counts.starterCapacity),
                    num(Math.max(0, home.counts.subCapacity - home.counts.acceptedSubs)),
                  )}
                </Txt>
              </View>
            ) : null}

            {home.guestOfCaptain ? (
              <Txt size={11.5} color={onVoid.faint}>
                {t.playingWith(home.next.venueName)}
              </Txt>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 10, paddingTop: 2 }}>
              <Button
                label={t.matchLobby}
                flex={1}
                onPress={() => router.push(`/play/lobby?booking=${home.next!.bookingId}`)}
              />
              {/* Only when there is somewhere to go. The button used to be
                  drawn for every booking and did nothing, silently, for any
                  venue with no pin and no map link — which until the venue
                  profile screen could set one was every venue. */}
              {nextMapUrl ? (
                <Button
                  label={t.navigate}
                  variant="ghost"
                  flex={1}
                  onPress={() => {
                    Linking.openURL(nextMapUrl).catch(() => {});
                  }}
                />
              ) : null}
            </View>

            {home.next.depositEgp > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 2 }}>
                <View
                  style={{ width: 5, height: 5, borderRadius: radius.pill, backgroundColor: gold.base }}
                />
                <Txt size={11.5} color={onVoid.muted}>
                  {t.cashDepositAtGate(money(home.next.depositEgp))}
                </Txt>
              </View>
            ) : null}
          </View>
        </LinearGradient>
      ) : (
        <EmptyTonight
          loading={home.loading}
          signedIn={signedIn || !isLive}
          onFind={() => router.push('/play')}
          onSignIn={() => router.push('/sign-in?next=/')}
          t={t}
        />
      )}

      {/* Where this player has played before, one card per ground. */}
      {home.bookAgain.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionTitle title={t.bookAgain} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -20 }}
            contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}
          >
            {home.bookAgain.map((b) => (
              <CompactVenueCard
                key={b.venueId!}
                name={b.venueName}
                area={b.area}
                coverUrl={b.coverUrl}
                detail={t.lastPlayed(shortDate(b.startsAt))}
                onPress={() => router.push(`/play/venue?venue=${b.venueId}`)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* The redesign's "Choose your sport", for a product that is football
          only: the choice here is the size of the game. */}
      <View style={{ gap: 12 }}>
        <SectionTitle title={t.pickYourFormat} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {FORMATS.map((f) => (
            <Pressable
              key={f.key}
              accessibilityRole="button"
              accessibilityLabel={t[f.label]}
              onPress={() => router.push(`/play?format=${encodeURIComponent(f.key)}`)}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: 'center',
                gap: 8,
                paddingVertical: 14,
                borderRadius: radius.cardInner,
                borderWidth: 1,
                borderColor: pressed ? goldAlpha.edge : onVoid.edge,
                backgroundColor: void_.surface,
              })}
            >
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: radius.pill,
                  backgroundColor: goldAlpha.fill,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ball size={26} color={gold.base} />
              </View>
              <Txt size={12.5} weight="semibold" color={onVoid.secondary}>
                {t[f.label]}
              </Txt>
            </Pressable>
          ))}
        </View>
      </View>

      {/* The redesign's promotional banner, pointed at the one thing X League
          has to promote that is its own: the cups. */}
      <Pressable accessibilityRole="button" accessibilityLabel={t.promoTitle} onPress={() => router.push('/cups')}>
        <LinearGradient
          colors={['#1A160C', void_.surface]}
          {...cssAngle(120)}
          style={{
            borderRadius: radius.signature,
            borderWidth: 1,
            borderColor: goldAlpha.edge,
            padding: 20,
            overflow: 'hidden',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <View style={{ flex: 1, gap: 6 }}>
            <Txt size={21} weight="bold" em={-0.02} color={onVoid.primary}>
              {t.promoTitle}
            </Txt>
            <Txt size={12.5} lh={1.5} color={onVoid.muted}>
              {t.promoBody}
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 4 }}>
              <Txt size={13} weight="bold" color={gold.base}>
                {t.promoCta}
              </Txt>
              <ChevronRight size={15} color={gold.base} />
            </View>
          </View>
          <Trophy size={54} color={gold.base} />
        </LinearGradient>
      </Pressable>

      {/* VEN-003: real venues, with the slot counts the timeline actually has. */}
      <View style={{ gap: 12 }}>
        <SectionTitle
          title={t.recommended}
          action={home.liveSlots > 0 ? t.slotsCount(num(home.liveSlots)) : undefined}
          onAction={() => router.push('/play')}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -20 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
        >
          {(['near', 'price', 'rating'] as const).map((k) => (
            <Pill
              key={k}
              label={k === 'near' ? t.sortNearest : k === 'price' ? t.sortCheapest : t.sortTopRated}
              on={order === k}
              onPress={() => setOrder(k)}
            />
          ))}
        </ScrollView>

        {home.nearby.length === 0 && !home.loading ? (
          <Txt size={12.5} color={onVoid.dim}>
            {t.noVenues}
          </Txt>
        ) : null}

        <View style={{ gap: 14 }}>
          {recommended.slice(0, 6).map((venue) => (
            <VenueCard
              key={venue.venueId}
              venue={{
                ...venue,
                verified: venue.verification === 'verified',
                nextSlot: venue.nextSlot ? hour(venue.nextSlot) : null,
              }}
              onPress={() => router.push(`/play/venue?venue=${venue.venueId}`)}
            />
          ))}
        </View>
      </View>

      {/* MCH-001: a played match with no result reported credits nobody, so
          this is the one thing Home asks for rather than merely offers. */}
      {home.awaitingResult ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.resultAwaiting}
          onPress={() => router.push(`/play/result?booking=${home.awaitingResult!.bookingId}`)}
          style={{
            padding: 16,
            borderRadius: radius.cardInner,
            backgroundColor: void_.surface,
            borderWidth: 1,
            borderColor: goldAlpha.edgeSoft,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View style={{ gap: 3, flex: 1 }}>
            <Txt size={13.5} weight="semibold" color={onVoid.primary}>
              {t.resultAwaiting}
            </Txt>
            <Txt size={11.5} color={onVoid.faint}>
              {home.awaitingResult.venueName} · {hour(home.awaitingResult.startsAt)}
            </Txt>
          </View>
          <Txt size={12} weight="semibold" color={gold.base}>
            {t.resultGoTo}
          </Txt>
        </Pressable>
      ) : null}

      {/* §5.5: a structured invitation carries the match facts, not just text. */}
      {home.invitations.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Eyebrow>{t.invitation}</Eyebrow>
          {home.invitations.map((invite) => (
            <View
              key={invite.participantId}
              style={{
                padding: 16,
                borderRadius: radius.cardInner,
                backgroundColor: void_.surface,
                borderWidth: 1,
                borderColor: goldAlpha.edgeSoft,
                gap: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: radius.pill,
                    backgroundColor: void_.inset,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Txt size={11} weight="bold" color={gold.base}>
                    {invite.fromName.slice(0, 2).toUpperCase()}
                  </Txt>
                </View>
                <View style={{ gap: 2, flex: 1 }}>
                  <Txt size={13.5} weight="semibold" color={onVoid.primary}>
                    {t.needsA(invite.fromName, invite.position ?? t.starter)}
                  </Txt>
                  <Txt size={11.5} color={onVoid.faint}>
                    {invite.venueName} · {hour(invite.startsAt)}
                  </Txt>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  label={t.accept}
                  variant="accept"
                  flex={1}
                  height={38}
                  round={radius.chip}
                  size={13}
                  onPress={() => respond(invite.participantId, true)}
                />
                <Button
                  label={t.decline}
                  variant="decline"
                  flex={1}
                  height={38}
                  round={radius.chip}
                  size={13}
                  onPress={() => respond(invite.participantId, false)}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {inviteNotice ? (
        <Txt size={12} weight="semibold" color={burgundy.action}>
          {inviteNotice}
        </Txt>
      ) : null}

      {/* §5.3: XP and level are activity, never ability — and PTS-002 says the
          total is explainable line by line, which until now it was not: the
          ledger behind it had no screen. */}
      {home.evidence ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.pointsTitle}
          onPress={() => router.push('/points')}
          style={{ gap: 10 }}
        >
          <View
            style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
          >
            <Eyebrow>{t.progression}</Eyebrow>
            <Txt size={11.5} color={onVoid.faint}>
              {t.xpOf(num(home.evidence.xp), num(home.evidence.xp + home.evidence.toNext))}
            </Txt>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 0,
              max: home.evidence.intoLevel + home.evidence.toNext,
              now: home.evidence.intoLevel,
            }}
            style={{
              height: 3,
              backgroundColor: 'rgba(243,238,229,.1)',
              borderRadius: radius.pill,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${
                  (home.evidence.intoLevel /
                    Math.max(1, home.evidence.intoLevel + home.evidence.toNext)) *
                  100
                }%`,
                height: '100%',
                backgroundColor: gold.base,
              }}
            />
          </View>
          <Txt size={11.5} color={onVoid.faint}>
            {t.levelToNext(
              num(home.evidence.level),
              num(home.evidence.toNext),
              num(home.evidence.level + 1),
            )}
          </Txt>
        </Pressable>
      ) : null}
    </Screen>
  );
}

/**
 * §4.7. Distinguishing "still loading" from "there is nothing" matters: the
 * second is a screen with something to do on it, the first must not pretend to
 * be.
 */
function EmptyTonight({
  loading,
  signedIn,
  onFind,
  onSignIn,
  t,
}: {
  loading: boolean;
  signedIn: boolean;
  onFind: () => void;
  onSignIn: () => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: onVoid.edgeFaint,
        borderRadius: radius.signature,
        padding: 24,
        gap: 14,
        alignItems: 'flex-start',
      }}
    >
      {loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ActivityIndicator color={gold.base} />
          <Txt size={13} color={onVoid.muted}>
            {t.checking}
          </Txt>
        </View>
      ) : (
        <>
          <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary}>
            {signedIn ? t.nothingTonight : t.signedOutHome}
          </Txt>
          <Txt size={13} lh={1.55} color={onVoid.muted}>
            {signedIn ? t.nothingTonightBlurb : t.signedOutHomeBlurb}
          </Txt>
          <Button
            label={signedIn ? t.findAPitch : t.signIn}
            onPress={signedIn ? onFind : onSignIn}
            height={44}
          />
        </>
      )}
    </View>
  );
}

function Unreachable({
  label,
  onRetry,
  retry,
}: {
  label: string;
  onRetry: () => void;
  retry: string;
}) {
  return (
    <Pressable
      accessibilityRole="alert"
      accessibilityLabel={label}
      onPress={onRetry}
      style={{
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: radius.chip,
        borderWidth: 1,
        borderColor: 'rgba(101,21,37,.5)',
        backgroundColor: 'rgba(101,21,37,.09)',
        gap: 4,
      }}
    >
      <Txt size={12.5} weight="semibold" color={burgundy.action}>
        {label}
      </Txt>
      <Txt size={11.5} color={onVoid.muted}>
        {retry}
      </Txt>
    </Pressable>
  );
}

const FORMATS: { key: string; label: TextKey }[] = [
  { key: '5-a-side', label: 'amFiveASide' },
  { key: '7-a-side', label: 'amSevenASide' },
  { key: '11-a-side', label: 'amElevenASide' },
];
