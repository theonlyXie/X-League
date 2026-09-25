import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Dimensions, Linking, Pressable, ScrollView, Share as NativeShare, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from '@/components/Txt';
import { ActionButton, FloatingIcon, Pill, StickyFooter, VenuePhoto, isPhoto } from '@/components/kit';
import { Ball, ChevronDown, ChevronRight, External, Pin, Podium, Share, Star } from '@/components/icons';
import { ReportSheet } from '@/components/ReportSheet';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { BOOKING, HOUSE_RULES, PITCH_AMENITIES } from '@/data/player';
import { amenityKey } from '@/data/amenities';
import { DEMO_VENUE_ID, today } from '@/data/venue';
import { venueDetail, venueReviews, type Review, type VenueDetail } from '@/data/discovery';
import { useBooking } from '@/state/booking';
import { useSession } from '@/state/session';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * P-04a The venue — build confidence before choosing an hour (§4.2, VEN-005).
 *
 * The redesign splits what used to be one long pitch page in two: this, which
 * is about the place — pictures, where it is, what it has, its rules, what
 * people said — and "Select your slot", which is about the hour. Everything
 * the old page carried is still here or there; nothing was dropped.
 *
 * The price in the header is the cheapest hour the venue calendar has for
 * sale on the day being looked at, read from the same availability the slot
 * screen sells from, not a headline rate somebody typed once.
 */
export default function VenuePage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ venue?: string; date?: string }>();
  const venueId = params.venue ?? DEMO_VENUE_ID;
  const date = params.date ?? today();

  const { setTarget, slotPrices, taken, times, loading: calendarLoading } = useBooking();
  const { signedIn } = useSession();
  const { t, num, money } = useI18n();

  const [venue, setVenue] = useState<VenueDetail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingVenue, setLoadingVenue] = useState(isLive);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [photo, setPhoto] = useState(0);

  useEffect(() => {
    if (!isLive || !venueId) {
      setLoadingVenue(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingVenue(true);
      try {
        const [detail, revs] = await Promise.all([venueDetail(venueId), venueReviews(venueId, 5).catch(() => [])]);
        if (cancelled) return;
        setVenue(detail);
        setReviews(revs);
        // Read the calendar for the first pitch now, so the header can quote
        // a real price and the slot screen opens already knowing its hours.
        const first = detail?.pitches[0];
        if (first) setTarget(first.id, date, venueId);
      } catch {
        /* the line under the name says it could not be read */
      } finally {
        if (!cancelled) setLoadingVenue(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId, date, setTarget]);

  // A real venue that has configured no amenities has none — the showcase's
  // are the design's, and only ever shown where there is no database.
  const showcase = !isLive || !venueId;
  const name = venue?.name ?? (showcase ? BOOKING.venue : '');
  const amenities = venue?.amenities.length ? venue.amenities : showcase ? PITCH_AMENITIES : [];
  const rules = venue?.houseRules ?? (showcase ? HOUSE_RULES : null);
  const verified = venue?.verification === 'verified';
  const mapsUrl = venue?.mapUrl ?? (venue?.lat != null ? `https://maps.google.com/?q=${venue.lat},${venue.lon}` : null);

  const cheapest = useMemo(() => {
    const open = times.filter((h) => !taken.includes(h)).map((h) => slotPrices[h]).filter((p): p is number => p > 0);
    return open.length ? Math.min(...open) : null;
  }, [times, taken, slotPrices]);

  // Pitches grouped by format, so a venue with three five-a-side pitches and
  // one seven shows two tiles rather than four.
  const formats = useMemo(() => {
    const by = new Map<string, string[]>();
    for (const p of venue?.pitches ?? []) by.set(p.format, [...(by.get(p.format) ?? []), p.label]);
    return [...by.entries()];
  }, [venue]);

  const formatName = (f: string) =>
    f === '5-a-side' ? t.amFiveASide : f === '7-a-side' ? t.amSevenASide : f === '11-a-side' ? t.amElevenASide : f;

  const photos = (venue?.photos ?? []).filter((p) => isPhoto(p.url));
  const width = Dimensions.get('window').width;

  const share = () => {
    const lines = [name, venue?.area, mapsUrl].filter(Boolean).join('\n');
    NativeShare.share({ message: t.shareVenueMessage(lines) }).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: void_.bg }}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View>
          {photos.length > 1 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setPhoto(Math.round(e.nativeEvent.contentOffset.x / width))}
            >
              {photos.map((p) => (
                <VenuePhoto key={p.url} uri={p.url} height={300 + insets.top} style={{ width }} />
              ))}
            </ScrollView>
          ) : (
            <VenuePhoto uri={photos[0]?.url} height={300 + insets.top} />
          )}

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
            <FloatingIcon label={t.back} onPress={() => (router.canGoBack() ? router.back() : router.replace('/play'))} />
            {name ? (
              <FloatingIcon label={t.share} onPress={share}>
                <Share size={18} color={onVoid.primary} />
              </FloatingIcon>
            ) : null}
          </View>

          {photos.length > 1 ? (
            <View
              style={{
                position: 'absolute',
                bottom: 34,
                right: 16,
                paddingVertical: 3,
                paddingHorizontal: 9,
                borderRadius: radius.pill,
                backgroundColor: 'rgba(8,8,8,.72)',
              }}
            >
              <Txt size={11} weight="semibold" color={onVoid.primary}>
                {`${num(photo + 1)}/${num(photos.length)}`}
              </Txt>
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
            paddingBottom: 24,
            gap: 22,
          }}
        >
          {/* Name, price, rating. */}
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Txt size={24} weight="bold" em={-0.02} color={onVoid.primary}>
                  {name}
                </Txt>
                {/* VEN-006: verification status is always visible. */}
                {verified ? (
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      borderWidth: 1,
                      borderColor: goldAlpha.accent,
                      borderRadius: radius.badge,
                      paddingVertical: 2,
                      paddingHorizontal: 6,
                    }}
                  >
                    <Txt size={10} weight="bold" em={0.08} color={gold.base}>
                      {t.verified}
                    </Txt>
                  </View>
                ) : null}
              </View>
              {cheapest != null ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt size={18} weight="bold" color={onVoid.primary}>
                    {money(cheapest)}
                  </Txt>
                  <Txt size={11} color={onVoid.faint}>
                    {t.onwardsPerHour}
                  </Txt>
                </View>
              ) : calendarLoading ? (
                <ActivityIndicator color={gold.base} />
              ) : null}
            </View>
            {venue?.ratingAvg != null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Star size={14} color={gold.base} />
                <Txt size={13.5} weight="semibold" color={onVoid.primary}>
                  {num(venue.ratingAvg)}
                </Txt>
                <Txt size={13} color={onVoid.muted} style={{ textDecorationLine: 'underline' }}>
                  {t.reviewCount(num(venue.ratingCount), venue.ratingCount)}
                </Txt>
              </View>
            ) : null}
            {!showcase && !loadingVenue && !venue ? (
              <Txt size={12.5} color={onVoid.muted}>
                {t.ownVenueUnreadable}
              </Txt>
            ) : null}
          </View>

          {/* Where it is. VEN-009: the maps app, when there is somewhere to send it. */}
          {venue?.area || mapsUrl ? (
            <Pressable
              accessibilityRole={mapsUrl ? 'link' : undefined}
              accessibilityLabel={[venue?.area, mapsUrl ? t.viewOnMap : null].filter(Boolean).join(', ')}
              disabled={!mapsUrl}
              onPress={() => mapsUrl && Linking.openURL(mapsUrl).catch(() => {})}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: radius.row,
                borderWidth: 1,
                borderColor: pressed ? goldAlpha.edge : onVoid.edge,
                backgroundColor: void_.surface,
              })}
            >
              <Pin size={22} color={gold.base} />
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={14} weight="semibold" color={onVoid.primary} numberOfLines={1}>
                  {venue?.area ?? name}
                </Txt>
                {mapsUrl ? (
                  <Txt size={12} color={gold.base}>
                    {t.viewOnMap}
                  </Txt>
                ) : null}
              </View>
              {mapsUrl ? <External size={17} color={onVoid.muted} /> : null}
            </Pressable>
          ) : null}

          {/* The redesign's "Sports available", for a football-only product:
              which sizes of game the venue has pitches for. */}
          {formats.length ? (
            <View style={{ gap: 12 }}>
              <Txt size={17} weight="bold" color={onVoid.primary}>
                {t.formatsAvailable}
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {formats.map(([f, labels]) => (
                  <View
                    key={f}
                    style={{
                      width: 132,
                      padding: 12,
                      gap: 8,
                      borderRadius: radius.row,
                      borderWidth: 1,
                      borderColor: onVoid.edge,
                      backgroundColor: void_.surface,
                    }}
                  >
                    <Txt size={13.5} weight="bold" color={onVoid.primary}>
                      {formatName(f)}
                    </Txt>
                    <Txt size={11} color={onVoid.faint} numberOfLines={2}>
                      {labels.join(' · ')}
                    </Txt>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Ball size={26} color={gold.base} />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {amenities.length ? (
            <View style={{ gap: 12 }}>
              <Txt size={17} weight="bold" color={onVoid.primary}>
                {t.amenities}
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {amenities.map((a) => {
                  // Recognised amenities in the reader's language; anything
                  // else exactly as the venue typed it.
                  const k = amenityKey(a);
                  return <Pill key={a} label={k ? (t[k] as string) : a} size="sm" />;
                })}
              </View>
            </View>
          ) : null}

          {rules ? (
            <View
              style={{
                borderRadius: radius.row,
                borderWidth: 1,
                borderColor: onVoid.edge,
                backgroundColor: void_.surface,
                overflow: 'hidden',
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: rulesOpen }}
                accessibilityLabel={t.houseRules}
                onPress={() => setRulesOpen((o) => !o)}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}
              >
                <Txt size={15} weight="bold" color={onVoid.primary} style={{ flex: 1 }}>
                  {t.houseRules}
                </Txt>
                {rulesOpen ? <ChevronDown size={18} color={onVoid.muted} /> : <ChevronRight size={18} color={onVoid.muted} />}
              </Pressable>
              {rulesOpen ? (
                <Txt size={13} lh={1.6} color={onVoid.muted} style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                  {rules}
                </Txt>
              ) : null}
            </View>
          ) : null}

          {/* Who scores most at the pitch you are looking at belongs on the
              page for that pitch. */}
          {venue ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.topScorersHere}
              onPress={() => router.push(`/leaderboard?venue=${venue.venueId}&name=${encodeURIComponent(venue.name)}`)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 16,
                borderRadius: radius.row,
                borderWidth: 1,
                borderColor: pressed ? goldAlpha.edge : onVoid.edge,
                backgroundColor: void_.surface,
              })}
            >
              <Podium size={20} color={gold.base} />
              <Txt size={15} weight="bold" color={onVoid.primary} style={{ flex: 1 }}>
                {t.topScorersHere}
              </Txt>
              <ChevronRight size={18} color={onVoid.muted} />
            </Pressable>
          ) : null}

          {/* VEN-008: the reviews sit under the rating they produced. */}
          {reviews.length ? (
            <View style={{ gap: 12 }}>
              <Txt size={17} weight="bold" color={onVoid.primary}>
                {t.playerReviews}
              </Txt>
              {reviews.map((r, i) => (
                <View
                  key={i}
                  style={{
                    gap: 8,
                    paddingBottom: 12,
                    borderBottomWidth: i < reviews.length - 1 ? 1 : 0,
                    borderBottomColor: onVoid.edgeFaint,
                  }}
                >
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingVertical: 3,
                      paddingHorizontal: 7,
                      borderRadius: radius.badge,
                      backgroundColor: goldAlpha.fill,
                    }}
                  >
                    <Txt size={11.5} weight="bold" color={gold.base}>
                      {num(r.rating)}
                    </Txt>
                    <Star size={10} color={gold.base} />
                  </View>
                  {r.body ? (
                    <Txt size={13} lh={1.55} color={onVoid.secondary}>
                      {r.body}
                    </Txt>
                  ) : null}
                  <Txt size={12} weight="semibold" color={onVoid.faint}>
                    {r.author}
                  </Txt>
                </View>
              ))}
            </View>
          ) : null}

          {/* MSG-005: the moderation queue is fed from here and from the lobby. */}
          {signedIn && venue ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t.reportThis} ${venue.name}`}
              onPress={() => setReporting(true)}
              hitSlop={8}
              style={{ paddingVertical: 4 }}
            >
              <Txt size={12} color={onVoid.faint}>
                {t.reportThis}
              </Txt>
            </Pressable>
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

      <StickyFooter>
        <ActionButton
          label={t.checkAvailability}
          flex
          disabled={isLive && !venue && !loadingVenue}
          onPress={() => router.push(`/play/pitch?venue=${venueId}&date=${date}`)}
        />
      </StickyFooter>
    </View>
  );
}
