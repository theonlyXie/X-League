import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpNotice, OpTile } from '@/components/operative';
import { OpCard, OpEmpty, OpGroup, OpHeading, OpPage } from '@/components/kitOperative';
import { Star } from '@/components/icons';
import { gold, ink, onOperative, operative, radius } from '@/theme/tokens';
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
    <OpPage>
      <OpHeading title={t.ownTabReviews} />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <OpTile
          label={t.ownRating}
          value={summary?.ratingAvg != null ? summary.ratingAvg.toFixed(2) : '—'}
          sub={t.reviewCount(num(summary?.ratingCount ?? 0), summary?.ratingCount ?? 0)}
          accent
        />
        <OpTile
          label={t.ownFiveStar}
          value={num(summary?.histogram.find((h) => h.stars === 5)?.count ?? 0)}
          sub={t.ownOfAllReviews}
        />
        <OpTile
          label={t.ownOneStar}
          value={num(summary?.histogram.find((h) => h.stars === 1)?.count ?? 0)}
          sub={t.ownWorthReading}
        />
      </View>

      <OpNotice text={error} />
      {loading ? <ActivityIndicator color={ink} /> : null}

      {summary?.histogram.length ? (
        <OpGroup title={t.ownSpread}>
          <OpCard style={{ gap: 9 }}>
            {summary.histogram.map((h) => (
              <View key={h.stars} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 28, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Txt size={12} weight="semibold" color={onOperative.secondary}>
                    {num(h.stars)}
                  </Txt>
                  <Star size={10} color={gold.border} />
                </View>
                <View
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: radius.pill,
                    backgroundColor: 'rgba(20,18,16,.07)',
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: `${(h.count / max) * 100}%`,
                      height: '100%',
                      borderRadius: radius.pill,
                      backgroundColor: gold.border,
                    }}
                  />
                </View>
                <Txt size={12} color={onOperative.dim} style={{ width: 28, textAlign: 'right' }}>
                  {num(h.count)}
                </Txt>
              </View>
            ))}
          </OpCard>
        </OpGroup>
      ) : null}

      <OpGroup title={t.ownRecent}>
        {reviews.length === 0 && !loading ? <OpEmpty title={t.ownNoReviewsYet} /> : null}
        {reviews.map((r, i) => (
          <OpCard key={i} pad={14} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: radius.pill,
                  backgroundColor: operative.band,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Txt size={12} weight="bold" color={ink}>
                  {r.author.slice(0, 2).toUpperCase()}
                </Txt>
              </View>
              <Txt size={14} weight="semibold" color={ink} style={{ flex: 1 }} numberOfLines={1}>
                {r.author}
              </Txt>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {Array.from({ length: r.rating }).map((_, s) => (
                  <Star key={s} size={12} color={gold.border} />
                ))}
              </View>
            </View>
            {r.body ? (
              <Txt size={13} lh={1.5} color={onOperative.secondary}>
                {r.body}
              </Txt>
            ) : null}
          </OpCard>
        ))}
      </OpGroup>
    </OpPage>
  );
}
