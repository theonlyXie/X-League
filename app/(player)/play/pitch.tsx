import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from '@/components/Txt';
import { Button, Divider, Eyebrow } from '@/components/ui';
import { Star } from '@/components/icons';
import { SlotGrid } from '@/components/SlotGrid';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import { BOOKING, HOUSE_RULES, PITCH_AMENITIES, SLOT_TIMES, VENUES } from '@/data/player';
import { useBooking } from '@/state/booking';
import { useSession } from '@/state/session';
import { isLive } from '@/lib/supabase';

/**
 * P-04 Pitch detail — build confidence before purchase (§4.2). VEN-005: media,
 * format, facilities, rules, price, cancellation, rating breakdown and the live
 * slots, all on one page.
 */
export default function PitchDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { slot, selectSlot, slotLabel, beginHold, taken, loading, unreachable, conflict, clearConflict } =
    useBooking();
  const { signedIn } = useSession();
  const venue = VENUES[0];

  return (
    <View style={{ flex: 1, backgroundColor: void_.bg, paddingTop: insets.top }}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <PhotoPlaceholder />

        <View style={{ paddingTop: 20, paddingHorizontal: 20, paddingBottom: 12, gap: 16 }}>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt size={24} weight="bold" em={-0.02} color={onVoid.primary}>
                {venue.name}
              </Txt>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: goldAlpha.accent,
                  borderRadius: radius.badge,
                  paddingVertical: 2,
                  paddingHorizontal: 5,
                }}
              >
                <Txt size={10} weight="bold" em={0.08} color={gold.base}>
                  VERIFIED
                </Txt>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Star size={12} color={gold.base} />
              <Txt size={12.5} color={onVoid.muted}>
                {venue.rating} · {venue.reviews} reviews · {BOOKING.area} · {venue.distanceKm} km
              </Txt>
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {PITCH_AMENITIES.map((a) => (
              <View
                key={a}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 11,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: onVoid.hairline,
                }}
              >
                <Txt size={11.5} color="rgba(243,238,229,.65)">
                  {a}
                </Txt>
              </View>
            ))}
          </View>

          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Eyebrow>Available tonight</Eyebrow>
              <Txt size={11} color="rgba(243,238,229,.3)">
                {BOOKING.pitch}
              </Txt>
            </View>
            <SlotGrid times={SLOT_TIMES} taken={taken} selected={slot} onSelect={selectSlot} />

            {/* BKG-011: losing the slot is a real outcome, so it gets said. */}
            {conflict ? (
              <Pressable
                accessibilityRole="alert"
                accessibilityLabel={conflict.reason}
                onPress={clearConflict}
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
                  {conflict.reason}
                </Txt>
                {conflict.alternatives.length ? (
                  <Txt size={11.5} color={onVoid.muted}>
                    Still free: {conflict.alternatives.join(' · ')} PM
                  </Txt>
                ) : null}
              </Pressable>
            ) : null}

            {/* §5.4: one canonical timeline, every channel included. */}
            <Txt size={11.5} color={onVoid.dim}>
              {loading
                ? 'Checking the venue calendar…'
                : unreachable
                  ? 'Could not reach the venue calendar — these times may be out of date.'
                  : 'Slots update live from the venue calendar — phone and walk-in bookings included.'}
            </Txt>
          </View>

          <Divider />

          <View style={{ gap: 10 }}>
            <Eyebrow>House rules</Eyebrow>
            <Txt size={12.5} lh={1.6} color="rgba(243,238,229,.55)">
              {HOUSE_RULES}
            </Txt>
          </View>
        </View>
      </ScrollView>

      {/* BKG-002: selecting a slot creates the server-side hold. */}
      <LinearGradient
        colors={['rgba(8,8,8,0)', void_.bg]}
        locations={[0, 0.45]}
        style={{
          paddingTop: 14,
          paddingHorizontal: 20,
          paddingBottom: 18 + insets.bottom,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <View style={{ gap: 2 }}>
          <Txt size={17} weight="bold" color={onVoid.primary}>
            EGP {BOOKING.hourly}
          </Txt>
          <Txt size={10.5} color={onVoid.dim}>
            per hour
          </Txt>
        </View>
        <Button
          label={isLive && !signedIn ? `Sign in to hold ${slotLabel}` : `Hold ${slotLabel}`}
          flex={1}
          height={50}
          round={radius.control}
          size={15}
          onPress={async () => {
            // AUTH-001: holding inventory is for signed-in people. The server
            // refuses an anonymous hold regardless; asking here just saves the
            // player a pointless round trip and a confusing error.
            if (isLive && !signedIn) {
              router.push('/sign-in?next=/play/pitch');
              return;
            }
            // Only move on if the slot is actually ours now.
            if (await beginHold()) router.push('/play/checkout');
          }}
        />
      </LinearGradient>
    </View>
  );
}

/** Where verified venue media goes (VEN-005); marked as a placeholder, not faked. */
function PhotoPlaceholder() {
  return (
    <View
      style={{
        height: 210,
        marginHorizontal: 20,
        borderRadius: radius.card,
        backgroundColor: '#0D0C0A',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {Array.from({ length: 40 }).map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: -210,
            left: i * 20 - 210,
            width: 10,
            height: 630,
            backgroundColor: '#141310',
            transform: [{ rotate: '45deg' }],
          }}
        />
      ))}
      <Txt size={10.5} em={0.12} color="rgba(243,238,229,.3)" style={{ fontFamily: mono }}>
        venue photo · 16:9
      </Txt>
      <View style={{ position: 'absolute', bottom: 12, left: 12, flexDirection: 'row', gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              width: 18,
              height: 3,
              borderRadius: 2,
              backgroundColor: i === 0 ? gold.base : 'rgba(243,238,229,.25)',
            }}
          />
        ))}
      </View>
    </View>
  );
}
