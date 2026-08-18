import { Link, useRouter } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { AvatarStack, Button, CornerVoid, Eyebrow, TurfSwatch } from '@/components/ui';
import { cssAngle } from '@/theme/gradient';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { BOOKING, INVITATION, PLAYER, PROGRESSION, VENUES } from '@/data/player';

/** P-02 Home — show immediate reasons to return (§4.2). */
export default function Home() {
  const router = useRouter();
  const xpPct = (PROGRESSION.xp / PROGRESSION.nextLevelXp) * 100;
  const xpToNext = PROGRESSION.nextLevelXp - PROGRESSION.xp;
  const nearby = VENUES.slice(0, 2);

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ gap: 3 }}>
          <Eyebrow>{PLAYER.today}</Eyebrow>
          <Txt size={22} weight="bold" em={-0.02} color={onVoid.primary}>
            {PLAYER.greeting}, {PLAYER.firstName}
          </Txt>
        </View>
        <Link href="/me" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Your card, level ${PROGRESSION.level}`}
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
                {PLAYER.initials}
              </Txt>
            </View>
            <Txt size={10} weight="bold" em={0.1} color={gold.base}>
              LVL {PROGRESSION.level}
            </Txt>
          </Pressable>
        </Link>
      </View>

      {/* The commitment-first opening: tonight's match before anything else. */}
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
            Tonight · 9:00 PM
          </Txt>
          <View style={{ gap: 5 }}>
            <Txt size={24} weight="bold" em={-0.02} color={onVoid.primary}>
              {BOOKING.venue}
            </Txt>
            <Txt size={13} color={onVoid.secondary}>
              {BOOKING.pitch} · 5-a-side · {BOOKING.area}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AvatarStack initials={['BE', 'OK', 'YA', 'MH']} openSlot />
            <Txt size={12} color={onVoid.muted}>
              4 of 5 · 2 sub slots open
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, paddingTop: 2 }}>
            <Button label="Match lobby" flex={1} onPress={() => router.push('/play/lobby')} />
            <Button
              label="Navigate"
              variant="ghost"
              flex={1}
              onPress={() =>
                Alert.alert('Stadium One', `${BOOKING.gateNote}\n${BOOKING.area}`)
              }
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 2 }}>
            <View style={{ width: 5, height: 5, borderRadius: radius.pill, backgroundColor: gold.base }} />
            <Txt size={11.5} color={onVoid.muted}>
              EGP {BOOKING.deposit} cash deposit due at the gate
            </Txt>
          </View>
        </View>
      </LinearGradient>

      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Eyebrow>Live near you</Eyebrow>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="See all 12 live slots"
            hitSlop={12}
            onPress={() => router.push('/play')}
          >
            <Txt size={11.5} weight="semibold" color={gold.base}>
              12 slots
            </Txt>
          </Pressable>
        </View>
        <View style={{ gap: 8 }}>
          {nearby.map((venue) => (
            <Pressable
              key={venue.name}
              accessibilityRole="button"
              accessibilityLabel={`${venue.name}, ${venue.distanceKm} km, next slot ${venue.nextSlot}, EGP ${venue.hourly} per hour`}
              onPress={() => router.push('/play/pitch')}
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
                  {venue.distanceKm} km · 5-a-side · EGP {venue.hourly}/hr
                </Txt>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Txt size={11} weight="bold" color={gold.base}>
                  {venue.nextSlot}
                </Txt>
                <Txt size={10} color={onVoid.dim}>
                  +{venue.moreSlots} slot{venue.moreSlots === 1 ? '' : 's'}
                </Txt>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {/* §5.5: a structured invitation carries the match facts, not just text. */}
      <View style={{ gap: 12 }}>
        <Eyebrow>Invitation</Eyebrow>
        <View
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
                {INVITATION.initials}
              </Txt>
            </View>
            <View style={{ gap: 2 }}>
              <Txt size={13.5} weight="semibold" color={onVoid.primary}>
                {INVITATION.from} needs a {INVITATION.need}
              </Txt>
              <Txt size={11.5} color={onVoid.faint}>
                {INVITATION.when}
              </Txt>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Accept" variant="accept" flex={1} height={38} round={radius.chip} size={13} onPress={() => router.push('/chat/ok-invite')} />
            <Button label="Decline" variant="decline" flex={1} height={38} round={radius.chip} size={13} onPress={() => router.push('/chat')} />
          </View>
        </View>
      </View>

      {/* §5.3: XP and level are activity, never ability. */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Eyebrow>Progression</Eyebrow>
          <Txt size={11.5} color={onVoid.faint}>
            {PROGRESSION.xp.toLocaleString()} / {PROGRESSION.nextLevelXp.toLocaleString()} XP
          </Txt>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: PROGRESSION.nextLevelXp, now: PROGRESSION.xp }}
          style={{ height: 3, backgroundColor: 'rgba(243,238,229,.1)', borderRadius: radius.pill, overflow: 'hidden' }}
        >
          <View style={{ width: `${xpPct}%`, height: '100%', backgroundColor: gold.base }} />
        </View>
        <Txt size={11.5} color={onVoid.faint}>
          Level {PROGRESSION.level} · {xpToNext} XP to Level {PROGRESSION.level + 1}
        </Txt>
      </View>
    </Screen>
  );
}
