import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Divider } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, onVoid, radius } from '@/theme/tokens';
import { myPoints, type PointEntry } from '@/data/progress';
import { useI18n } from '@/i18n';
import { useRefreshTick } from '@/state/refresh';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';

/**
 * PTS-002 — the total, explainable line by line.
 *
 * `my_points` was granted and tested and had no caller, so Home showed an XP
 * total and a level with no way to ask what earned them. A number a player
 * cannot account for is a number they have to take on trust, which is the
 * opposite of what §5.3 is for: XP is activity, and activity is a list of
 * things that actually happened.
 */
export default function Points() {
  const router = useRouter();
  const { t, num, shortDate } = useI18n();
  const { signedIn } = useSession();

  // The refresh button in the top bar.
  const tick = useRefreshTick();
  const [rows, setRows] = useState<PointEntry[]>([]);
  const [loading, setLoading] = useState(isLive && signedIn);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    if (!isLive || !signedIn) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await myPoints(100);
        if (!cancelled) {
          setRows(list);
          setUnreachable(false);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setUnreachable(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, tick]);

  const label = (kind: PointEntry['kind']) =>
    ({
      match_played: t.ptsMatchPlayed,
      match_won: t.ptsMatchWon,
      match_drawn: t.ptsMatchDrawn,
      rating_given: t.ptsRatingGiven,
      match_verified: t.ptsMatchVerified,
      no_show: t.ptsNoShow,
      adjustment: t.ptsAdjustment,
    })[kind];

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={8}
          style={{
            width: 34,
            height: 34,
            borderRadius: radius.icon,
            borderWidth: 1,
            borderColor: onVoid.line,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={16} color={onVoid.secondary} />
        </Pressable>
        <View style={{ gap: 2, flex: 1 }}>
          <Txt size={19} weight="bold" em={-0.02} color={onVoid.primary}>
            {t.pointsTitle}
          </Txt>
          <Txt size={11.5} color={onVoid.faint}>
            {t.pointsBlurb}
          </Txt>
        </View>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {!loading && rows.length === 0 ? (
        <View style={{ gap: 6 }}>
          <Txt size={15} weight="semibold" color={onVoid.primary}>
            {unreachable ? t.listUnreachable : t.pointsEmpty}
          </Txt>
          <Txt size={12.5} lh={1.55} color={onVoid.muted}>
            {unreachable ? t.listUnreachableBlurb : t.pointsEmptyBlurb}
          </Txt>
        </View>
      ) : null}

      <View style={{ gap: 0 }}>
        {rows.map((r, i) => (
          <View key={`${r.at}-${i}`}>
            {i > 0 ? <Divider /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={13.5} weight="semibold" color={onVoid.primary}>
                  {label(r.kind)}
                </Txt>
                <Txt size={11.5} color={onVoid.faint}>
                  {[shortDate(r.at), r.venueName].filter(Boolean).join(' · ')}
                </Txt>
              </View>
              {/* A negative line is the no-show penalty, and it is shown as
                  plainly as the rest — a ledger that hides its debits is not
                  one. */}
              <Txt
                size={14}
                weight="bold"
                color={r.points < 0 ? burgundy.action : gold.base}
              >
                {r.points < 0 ? `−${num(Math.abs(r.points))}` : `+${num(r.points)}`}
              </Txt>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}
