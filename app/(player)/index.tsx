import { Link, useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, RefreshControl, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { AvatarStack, Button, CornerVoid, Divider, Eyebrow, TurfSwatch } from '@/components/ui';
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
  const { t, num, money, hour, longDate } = useI18n();
  const { signedIn, displayName } = useSession();
  const home = useHome();

  const firstName = (displayName ?? PLAYER.firstName).split(' ')[0];
  const initials = firstName.slice(0, 2).toUpperCase();
  const level = home.evidence?.level ?? 1;

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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ gap: 3 }}>
          <Eyebrow>{longDate(new Date().toISOString())}</Eyebrow>
          <Txt size={22} weight="bold" em={-0.02} color={onVoid.primary}>
            {t.greetingEvening}, {firstName}
          </Txt>
        </View>
        <Link href="/me" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Your card, level ${level}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingVertical: 6,
              paddingRight: 10,
              paddingLeft: 6,
              borderWidth: 1,
              borderColor: 'rgba(198,163,75,.3)',
              borderRadius: radius.pill,
            }}
          >
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: radius.pill,
                backgroundColor: void_.inset,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt size={11} weight="bold" color={gold.base}>
                {initials}
              </Txt>
            </View>
            <Txt size={10} weight="bold" em={0.1} color={gold.base}>
              LVL {num(level)}
            </Txt>
          </Pressable>
        </Link>
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
              <Button
                label={t.navigate}
                variant="ghost"
                flex={1}
                onPress={() => {
                  const url =
                    home.next?.mapUrl ??
                    (home.next?.lat != null
                      ? `https://maps.google.com/?q=${home.next.lat},${home.next.lon}`
                      : null);
                  if (url) Linking.openURL(url).catch(() => {});
                }}
              />
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

      {/* VEN-003: real venues, with the slot counts the timeline actually has. */}
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Eyebrow>{t.liveNearYou}</Eyebrow>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`See all ${home.liveSlots} live slots`}
            hitSlop={12}
            onPress={() => router.push('/play')}
          >
            <Txt size={11.5} weight="semibold" color={gold.base}>
              {t.slotsCount(num(home.liveSlots))}
            </Txt>
          </Pressable>
        </View>

        {home.nearby.length === 0 && !home.loading ? (
          <Txt size={12.5} color={onVoid.dim}>
            {t.noVenues}
          </Txt>
        ) : null}

        <View style={{ gap: 8 }}>
          {home.nearby.slice(0, 3).map((venue) => (
            <Pressable
              key={venue.venueId}
              accessibilityRole="button"
              accessibilityLabel={`${venue.name}, ${venue.openSlots} slots`}
              onPress={() => router.push(`/play/pitch?venue=${venue.venueId}`)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: radius.control,
                backgroundColor: void_.surface,
                borderWidth: 1,
                borderColor: pressed ? goldAlpha.edge : onVoid.edgeFaint,
              })}
            >
              <TurfSwatch size={42} round={radius.chip} />
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={14.5} weight="semibold" color={onVoid.primary}>
                  {venue.name}
                </Txt>
                <Txt size={11.5} color={onVoid.faint}>
                  {venue.distanceKm != null
                    ? t.venueMeta(num(venue.distanceKm), money(venue.minPriceEgp))
                    : `${venue.area ?? ''} · ${money(venue.minPriceEgp)}/hr`}
                </Txt>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {venue.nextSlot ? (
                  <>
                    <Txt size={11} weight="bold" color={gold.base}>
                      {hour(venue.nextSlot)}
                    </Txt>
                    <Txt size={10} color={onVoid.dim}>
                      {t.slotsCount(num(venue.openSlots))}
                    </Txt>
                  </>
                ) : (
                  <Txt size={10} color={onVoid.dim}>
                    {t.fullyBooked}
                  </Txt>
                )}
              </View>
            </Pressable>
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
                  onPress={async () => {
                    await respondToInvitation(invite.participantId, true);
                    home.reload();
                  }}
                />
                <Button
                  label={t.decline}
                  variant="decline"
                  flex={1}
                  height={38}
                  round={radius.chip}
                  size={13}
                  onPress={async () => {
                    await respondToInvitation(invite.participantId, false);
                    home.reload();
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* §5.3: XP and level are activity, never ability. */}
      {home.evidence ? (
        <View style={{ gap: 10 }}>
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
        </View>
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
