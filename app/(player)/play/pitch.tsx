import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from '@/components/Txt';
import { Button, Divider, Eyebrow } from '@/components/ui';
import { Star } from '@/components/icons';
import { SlotGrid } from '@/components/SlotGrid';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import { BOOKING, HOUSE_RULES, PITCH_AMENITIES } from '@/data/player';
import { amenityKey } from '@/data/amenities';
import { DEMO_VENUE_ID, today } from '@/data/venue';
import { venueDetail, venueReviews, type Review, type VenueDetail } from '@/data/discovery';
import { useBooking } from '@/state/booking';
import { useSession } from '@/state/session';
import { ReportSheet } from '@/components/ReportSheet';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * P-04 Pitch detail — build confidence before purchase (§4.2). VEN-005: media,
 * format, facilities, rules, price, cancellation, rating breakdown and the live
 * slots, all on one page.
 *
 * The venue comes from the search result the player tapped. A pitch with more
 * than one surface gets a selector, because "Pitch A is free at 9" and "Pitch B
 * is free at 9" are different things to sell and the grid can only show one.
 */
export default function PitchDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ venue?: string; date?: string }>();
  const venueId = params.venue ?? DEMO_VENUE_ID;
  const date = params.date ?? today();

  const {
    slot,
    selectSlot,
    slotHour,
    beginHold,
    taken,
    times,
    loading,
    unreachable,
    conflict,
    clearConflict,
    setTarget,
    pitchId,
  } = useBooking();
  const { signedIn } = useSession();
  const { reason, t, num, hourLabel } = useI18n();

  const [venue, setVenue] = useState<VenueDetail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingVenue, setLoadingVenue] = useState(isLive);

  useEffect(() => {
    if (!isLive || !venueId) {
      setLoadingVenue(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingVenue(true);
      try {
        const [detail, revs] = await Promise.all([
          venueDetail(venueId),
          venueReviews(venueId, 5).catch(() => []),
        ]);
        if (cancelled) return;
        setVenue(detail);
        setReviews(revs);
        // Point the booking spine at this venue's first operational pitch.
        const first = detail?.pitches[0];
        if (first) setTarget(first.id, date, venueId);
      } catch {
        // The spine's own `unreachable` covers the slot grid; the header simply
        // stays empty rather than showing another venue's name.
      } finally {
        if (!cancelled) setLoadingVenue(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId, date, setTarget]);

  const name = venue?.name ?? '';
  // A real venue that has configured no amenities has none. Showing the
  // design's five made the screen fabricate the facilities it exists to build
  // confidence about — and the fixture house rules were worse: they named a
  // cash deposit the product no longer takes, a six-hour cancellation window
  // that is not the policy, and another venue's gate.
  const showcase = !isLive || !venueId;
  const [reporting, setReporting] = useState(false);
  const amenities = venue?.amenities.length ? venue.amenities : showcase ? PITCH_AMENITIES : [];
  const rules = venue?.houseRules ?? (showcase ? HOUSE_RULES : null);
  const verified = venue?.verification === 'verified';
  const activePitch = venue?.pitches.find((p) => p.id === pitchId) ?? venue?.pitches[0];

  return (
    <View style={{ flex: 1, backgroundColor: void_.bg, paddingTop: insets.top }}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <PhotoPlaceholder />

        <View style={{ paddingTop: 20, paddingHorizontal: 20, paddingBottom: 12, gap: 16 }}>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt size={24} weight="bold" em={-0.02} color={onVoid.primary}>
                {/* A bare em dash where the venue's name goes reads as a
                    rendering fault rather than as an answer. In the showcase
                    build the name is the design's, like the amenities and the
                    house rules beside it; on a live build that could not read
                    the venue, the line below says so. */}
                {name || (showcase ? BOOKING.venue : '')}
              </Txt>
              {verified ? (
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
                    {t.verified}
                  </Txt>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              {venue?.ratingAvg != null ? <Star size={12} color={gold.base} /> : null}
              <Txt size={12.5} color={onVoid.muted}>
                {venue?.ratingAvg != null
                  ? `${num(venue.ratingAvg)} · ${t.reviewCount(num(venue.ratingCount), venue.ratingCount)} · ${venue.area ?? ''}`
                  : (venue?.area ?? '')}
              </Txt>
            </View>
            {/* A live build that could not read the venue used to draw a bare
                em dash where its name goes, which reads as a rendering fault
                rather than as an answer. */}
            {!showcase && !loadingVenue && !venue ? (
              <Txt size={12.5} color={onVoid.muted}>
                {t.ownVenueUnreadable}
              </Txt>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {amenities.map((a) => (
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
                  {/* Recognised amenities are shown in the reader's language;
                      anything a venue typed that this does not know is shown
                      exactly as typed, because dropping it would hide something
                      true about the ground. */}
                  {(() => {
                    const k = amenityKey(a);
                    return k ? (t[k] as string) : a;
                  })()}
                </Txt>
              </View>
            ))}
          </View>

          {/* More than one pitch is a real choice, not a detail. */}
          {venue && venue.pitches.length > 1 ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {venue.pitches.map((p) => {
                const on = p.id === pitchId;
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={p.label}
                    onPress={() => setTarget(p.id, date, venueId)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: radius.chip,
                      ...(on
                        ? { backgroundColor: 'rgba(198,163,75,.14)', borderWidth: 1, borderColor: goldAlpha.accent }
                        : { borderWidth: 1, borderColor: onVoid.hairline }),
                    }}
                  >
                    <Txt size={12.5} weight={on ? 'bold' : 'regular'} color={on ? gold.base : onVoid.muted}>
                      {p.label}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Eyebrow>{t.availableTonight}</Eyebrow>
              <Txt size={11} color="rgba(243,238,229,.3)">
                {activePitch?.label ?? ''}
              </Txt>
            </View>
            <SlotGrid times={times} taken={taken} selected={slot} onSelect={selectSlot} />

            {/* BKG-011: losing the slot is a real outcome, so it gets said. */}
            {conflict ? (
              <Pressable
                accessibilityRole="alert"
                accessibilityLabel={reason(conflict.reason) ?? undefined}
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
                  {reason(conflict.reason)}
                </Txt>
                {conflict.alternatives.length ? (
                  <Txt size={11.5} color={onVoid.muted}>
                    {/* Each alternative is an hour, formatted as one. Joining
                        the raw identities and appending "PM" once produced
                        "21 · 22 PM" the moment the identity stopped being a
                        display label. */}
                    {t.stillFree(conflict.alternatives.map((a) => hourLabel(Number(a))).join(' · '))}
                  </Txt>
                ) : null}
              </Pressable>
            ) : null}

            {/* §5.4: one canonical timeline, every channel included. */}
            <Txt size={11.5} color={onVoid.dim}>
              {loading ? t.calendarChecking : unreachable ? t.calendarUnreachable : t.calendarNote}
            </Txt>
          </View>

          {rules ? (
            <>
              <Divider />
              <View style={{ gap: 10 }}>
                <Eyebrow>{t.houseRules}</Eyebrow>
                <Txt size={12.5} lh={1.6} color={onVoid.muted}>
                  {rules}
                </Txt>
              </View>
            </>
          ) : null}

          {/* The board for this ground existed and had no way in: nothing in the
              app ever passed a venue to it, so the only leaderboard anybody
              could open was the global one, from a row on the account screen.
              Who scores most at the pitch you are looking at belongs on the
              page for that pitch. */}
          {venue ? (
            <>
              <Divider />
              <Button
                label={t.topScorersHere}
                variant="ghost"
                height={44}
                onPress={() =>
                  router.push(
                    `/leaderboard?venue=${venue.venueId}&name=${encodeURIComponent(venue.name)}`,
                  )
                }
              />
            </>
          ) : null}

          {/* VEN-008: the reviews sit under the rating they produced. */}
          {reviews.length ? (
            <>
              <Divider />
              <View style={{ gap: 12 }}>
                <Eyebrow>{t.reviewTitle}</Eyebrow>
                {reviews.map((r, i) => (
                  <View key={i} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Txt size={12.5} weight="semibold" color={onVoid.primary}>
                        {r.author}
                      </Txt>
                      <View style={{ flexDirection: 'row', gap: 2 }}>
                        {Array.from({ length: r.rating }).map((_, s) => (
                          <Star key={s} size={10} color={gold.base} />
                        ))}
                      </View>
                    </View>
                    {r.body ? (
                      <Txt size={12} lh={1.55} color={onVoid.muted}>
                        {r.body}
                      </Txt>
                    ) : null}
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* MSG-005. The moderation queue in both consoles is fed from here
              and from the lobby; before this there was no way to file a report
              at all, so the queue could only ever say "Nothing reported." */}
          {signedIn && venue ? (
            <>
              <Divider />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t.reportThis} ${venue.name}`}
                onPress={() => setReporting(true)}
                hitSlop={8}
                style={{ paddingVertical: 8 }}
              >
                <Txt size={12} color={onVoid.faint}>
                  {t.reportThis}
                </Txt>
              </Pressable>
            </>
          ) : null}
        </View>
      </ScrollView>

      {venue ? (
        <ReportSheet
          kind="venue"
          subjectId={venue.venueId}
          subjectName={venue.name}
          open={reporting}
          onClose={() => setReporting(false)}
        />
      ) : null}

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
        <PriceForSlot />
        <Button
          label={
            isLive && !signedIn ? t.signInToHold(hourLabel(slotHour)) : t.hold(hourLabel(slotHour))
          }
          flex={1}
          height={50}
          round={radius.control}
          size={15}
          onPress={async () => {
            // AUTH-001: holding inventory is for signed-in people. The server
            // refuses an anonymous hold regardless; asking here just saves the
            // player a pointless round trip and a confusing error.
            if (isLive && !signedIn) {
              router.push(`/sign-in?next=/play/pitch?venue=${venueId}`);
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

/**
 * The price of the hour actually selected, read off the availability the spine
 * already fetched. A pitch can be priced differently by hour (OWN-007), so one
 * number for the whole evening would misquote it.
 */
function PriceForSlot() {
  const { reason, t, money } = useI18n();
  const { slot, slotPrices } = useBooking();
  return (
    <View style={{ gap: 2 }}>
      <Txt size={17} weight="bold" color={onVoid.primary}>
        {money(slotPrices[slot] ?? 0)}
      </Txt>
      <Txt size={10.5} color={onVoid.dim}>
        {t.perHourLabel}
      </Txt>
    </View>
  );
}

/** Where verified venue media goes (VEN-005); marked as a placeholder, not faked. */
function PhotoPlaceholder() {
  const { t } = useI18n();
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
        {t.venuePhotoSlot}
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
