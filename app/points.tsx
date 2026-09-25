import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, MenuGroup, SectionTitle } from '@/components/kit';
import { Ball, Ban, CheckCircle, ChevronLeft, Pencil, Star, Trophy, TrendUp } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius } from '@/theme/tokens';
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

  // Summed from the lines on screen, and labelled as exactly that. The list is
  // the latest hundred entries, so for a long-serving player this is not the
  // lifetime total Home shows — and calling it one would be the unexplained
  // number this screen exists to get rid of.
  const earned = rows.reduce((a, r) => (r.points > 0 ? a + r.points : a), 0);
  const lost = rows.reduce((a, r) => (r.points < 0 ? a - r.points : a), 0);
  const net = earned - lost;
  const signed = (n: number) => (n < 0 ? `−${num(Math.abs(n))}` : `+${num(n)}`);

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={8}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}
        >
          <ChevronLeft size={22} color={onVoid.primary} />
        </Pressable>
        <View style={{ gap: 2, flex: 1 }}>
          <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary}>
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

      {!loading && rows.length > 0 ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: radius.row,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: goldAlpha.fill,
              }}
            >
              <TrendUp size={22} color={gold.base} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt size={11.5} color={onVoid.faint}>
                {t.callsPtsNetInList}
              </Txt>
              <Txt size={26} weight="bold" em={-0.02} color={net < 0 ? burgundy.action : gold.base}>
                {signed(net)}
              </Txt>
            </View>
          </View>
          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: onVoid.edgeFaint, paddingTop: 12 }}>
            <Stat label={t.callsPtsEarned} value={`+${num(earned)}`} />
            <Stat label={t.callsPtsLost} value={lost ? `−${num(lost)}` : num(0)} tone={lost ? 'debit' : 'plain'} />
            <Stat label={t.callsPtsEntries} value={num(rows.length)} />
          </View>
        </Card>
      ) : null}

      {rows.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionTitle title={t.callsPtsHistory} />
          <MenuGroup>
            {rows.map((r, i) => (
              <View key={`${r.at}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, paddingHorizontal: 14 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: radius.icon,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: r.points < 0 ? 'rgba(101,21,37,.18)' : goldAlpha.fill,
                  }}
                >
                  <KindIcon kind={r.kind} color={r.points < 0 ? burgundy.action : gold.base} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Txt size={14} weight="semibold" color={onVoid.primary}>
                    {label(r.kind)}
                  </Txt>
                  <Txt size={11.5} color={onVoid.faint} numberOfLines={1}>
                    {[shortDate(r.at), r.venueName].filter(Boolean).join(' · ')}
                  </Txt>
                </View>
                {/* A negative line is the no-show penalty, and it is shown as
                    plainly as the rest — a ledger that hides its debits is not
                    one. */}
                <Txt size={14.5} weight="bold" color={r.points < 0 ? burgundy.action : gold.base}>
                  {signed(r.points)}
                </Txt>
              </View>
            ))}
          </MenuGroup>
        </View>
      ) : null}
    </Screen>
  );
}

function Stat({ label, value, tone = 'plain' }: { label: string; value: string; tone?: 'plain' | 'debit' }) {
  return (
    <View style={{ flex: 1, gap: 3, alignItems: 'center' }}>
      <Txt size={15} weight="bold" color={tone === 'debit' ? burgundy.action : onVoid.primary}>
        {value}
      </Txt>
      <Txt size={11} color={onVoid.faint}>
        {label}
      </Txt>
    </View>
  );
}

/** What earned the line, drawn: the ball for playing, the cup for winning. */
function KindIcon({ kind, color }: { kind: PointEntry['kind']; color: string }) {
  const Icon =
    kind === 'match_won'
      ? Trophy
      : kind === 'match_played' || kind === 'match_drawn'
        ? Ball
        : kind === 'rating_given'
          ? Star
          : kind === 'match_verified'
            ? CheckCircle
            : kind === 'no_show'
              ? Ban
              : Pencil;
  return <Icon size={18} color={color} />;
}
