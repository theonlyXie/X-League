import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpNotice, OpRow, OpScreen, OpSection, OpTile } from '@/components/operative';
import { Star } from '@/components/icons';
import { gold, ink, onOperative, radius } from '@/theme/tokens';
import { venueReviewSummary, type ReviewSummary } from '@/data/manage';
import { venueReviews, type Review } from '@/data/discovery';
import { useSession } from '@/state/session';
import { isLive } from '@/lib/supabase';
import { useI18n } from '@/i18n';

/**
 * O-08 — what players said.
 *
 * The histogram is the point rather than the average: a 4.2 made of fours and a
 * 4.2 made of fives and ones are different venues, and only one of them has a
 * problem to fix.
 */
export default function OwnerReviews() {
  const { t, num } = useI18n();
  const { activeVenue } = useSession();
  const venue = activeVenue;

  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLive || !venue) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        venueReviewSummary(venue.venueId),
        venueReviews(venue.venueId, 25),
      ]);
      setSummary(s);
      setReviews(r);
      setError(null);
    } catch {
      setError(t.ownReviewsUnreadable);
    } finally {
      setLoading(false);
    }
  }, [venue?.venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const max = Math.max(1, ...(summary?.histogram.map((h) => h.count) ?? [1]));

  return (
    <OpScreen>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <OpTile
          label={t.ownRating}
          value={summary?.ratingAvg != null ? summary.ratingAvg.toFixed(2) : '—'}
          sub={t.reviewCount(num(summary?.ratingCount ?? 0), summary?.ratingCount ?? 0)}
          accent
        />
        <OpTile
          label={t.ownFiveStar}
          value={`${summary?.histogram.find((h) => h.stars === 5)?.count ?? 0}`}
          sub={t.ownOfAllReviews}
        />
        <OpTile
          label={t.ownOneStar}
          value={`${summary?.histogram.find((h) => h.stars === 1)?.count ?? 0}`}
          sub={t.ownWorthReading}
        />
      </View>

      <OpNotice text={error} />
      {loading ? <ActivityIndicator color={ink} /> : null}

      <OpSection title={t.ownSpread}>
        <View style={{ gap: 6 }}>
          {(summary?.histogram ?? []).map((h) => (
            <View key={h.stars} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt size={11} color={onOperative.dim} style={{ width: 14 }}>
                {h.stars}
              </Txt>
              <View
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: radius.pill,
                  backgroundColor: 'rgba(20,18,16,.07)',
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${(h.count / max) * 100}%`,
                    height: '100%',
                    backgroundColor: gold.border,
                  }}
                />
              </View>
              <Txt size={11} color={onOperative.dim} style={{ width: 24, textAlign: 'right' }}>
                {h.count}
              </Txt>
            </View>
          ))}
        </View>
      </OpSection>

      <OpSection title={t.ownRecent}>
        {reviews.length === 0 && !loading ? (
          <Txt size={12.5} color={onOperative.dim}>
            {t.ownNoReviewsYet}
          </Txt>
        ) : null}
        <View style={{ gap: 8 }}>
          {reviews.map((r, i) => (
            <OpRow key={i}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Txt size={12.5} weight="semibold" color={ink}>
                    {r.author}
                  </Txt>
                  <View style={{ flexDirection: 'row', gap: 2 }}>
                    {Array.from({ length: r.rating }).map((_, s) => (
                      <Star key={s} size={10} color={gold.border} />
                    ))}
                  </View>
                </View>
                {r.body ? (
                  <Txt size={12} lh={1.5} color="rgba(20,18,16,.62)">
                    {r.body}
                  </Txt>
                ) : null}
              </View>
            </OpRow>
          ))}
        </View>
      </OpSection>
    </OpScreen>
  );
}
