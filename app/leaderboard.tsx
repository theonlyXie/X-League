import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Avatar } from '@/components/Avatar';
import { Reveal } from '@/components/motion';
import { MenuGroup, Pill, Unreachable } from '@/components/kit';
import { ChevronLeft } from '@/components/icons';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { keeperLeaderboard, leaderboard, type BoardRow, type KeeperRow } from '@/data/board';
import { useI18n } from '@/i18n';
import { useRefreshTick } from '@/state/refresh';
import { isLive } from '@/lib/supabase';

/**
 * Who is scoring.
 *
 * Outfield players and goalkeepers are two boards rather than one with a
 * column, because "best" means a different thing for each and ranking a keeper
 * by goals puts every one of them at the bottom of a list they should not be on.
 *
 * The numbers do not count up. A leaderboard is read, and animating the figure
 * delays the answer somebody opened the screen for.
 */
export default function Leaderboard() {
  const { venue, name } = useLocalSearchParams<{ venue?: string; name?: string }>();
  const router = useRouter();
  const { t, num } = useI18n();

  // The refresh button in the top bar.
  const tick = useRefreshTick();
  const [board, setBoard] = useState<'scorers' | 'keepers'>('scorers');
  const [scorers, setScorers] = useState<BoardRow[]>([]);
  const [keepers, setKeepers] = useState<KeeperRow[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    if (!isLive) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [rows, keeperRows] = await Promise.all([
          leaderboard(venue ?? null),
          keeperLeaderboard(venue ?? null),
        ]);
        if (!cancelled) {
          setScorers(rows);
          setKeepers(keeperRows);
          setUnreachable(false);
        }
      } catch {
        if (!cancelled) setUnreachable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [venue, tick]);

  const empty = board === 'scorers' ? !scorers.length : !keepers.length;

  // The places, in one shape for either board: the top three stand apart in
  // gold, the rest sit together in one card below them.
  const places =
    board === 'scorers'
      ? scorers.map((row) => ({
          id: row.playerId,
          place: row.place,
          name: row.displayName,
          photo: row.photoUrl,
          figure: num(row.goals),
          detail: `${num(row.assists)} ${t.assistsShort} · ${num(row.matches)} ${t.matchesShort}`,
          aside: row.cupGoals > 0 ? t.ofWhichCup(num(row.cupGoals)) : null,
        }))
      : keepers.map((row) => ({
          id: row.playerId,
          place: row.place,
          name: row.displayName,
          photo: row.photoUrl,
          figure: num(row.cleanSheets),
          detail: `${num(row.conceded)} ${t.conceded} · ${num(row.matches)} ${t.matchesShort}`,
          aside: null,
        }));
  // By place rather than by index, so a tie for third is two gold rows.
  const podium = places.filter((p) => p.place <= 3);
  const rest = places.filter((p) => p.place > 3);

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
          hitSlop={8}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}
        >
          <ChevronLeft size={22} color={onVoid.primary} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary}>
            {t.leaderboards}
          </Txt>
          <Txt size={11.5} weight="semibold" color={gold.base}>
            {venue ? (name ?? t.venueBoard) : t.globalBoard}
          </Txt>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['scorers', 'keepers'] as const).map((which) => (
          <Pill
            key={which}
            label={which === 'scorers' ? t.scorers : t.keepers}
            on={board === which}
            onPress={() => {
              setBoard(which);
              void Haptics.selectionAsync();
            }}
          />
        ))}
      </View>

      {loading ? <ActivityIndicator color={gold.base} /> : null}

      {unreachable ? <Unreachable label={t.boardUnreadable} /> : null}

      {!loading && !unreachable && empty ? (
        <Txt size={13} lh={1.5} color={onVoid.muted}>
          {t.noBoardYet}
        </Txt>
      ) : null}

      {places.length ? (
        <View style={{ gap: 10 }}>
          {/* What the big figure on the far side of each row is. */}
          <Txt size={12} weight="semibold" color={onVoid.faint}>
            {board === 'scorers' ? `${t.goalsShort} · ${t.assistsShort} · ${t.matchesShort}` : t.cleanSheets}
          </Txt>
          {podium.map((p, i) => (
            <Reveal key={p.id} index={i}>
              <Place {...p} top />
            </Reveal>
          ))}
          {rest.length ? (
            <MenuGroup>
              {rest.map((p, i) => (
                // Only the first few are staggered; forty reveals in sequence
                // is a wait, not an entrance.
                <Reveal key={p.id} index={Math.min(podium.length + i, 7)}>
                  <Place {...p} top={false} />
                </Reveal>
              ))}
            </MenuGroup>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

function Place({
  place,
  name,
  photo,
  figure,
  detail,
  aside,
  top,
}: {
  place: number;
  name: string;
  photo: string | null;
  figure: string;
  detail: string;
  aside: string | null;
  top: boolean;
}) {
  const { num } = useI18n();
  const first = place === 1;
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: top ? 12 : 11,
          paddingHorizontal: 14,
        },
        top
          ? {
              borderRadius: radius.cardInner,
              borderWidth: 1,
              borderColor: first ? goldAlpha.frame : goldAlpha.edge,
              backgroundColor: first ? goldAlpha.fill : void_.surface,
            }
          : null,
      ]}
    >
      {/* The place: a gold medallion on the podium, a plain figure below it. */}
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: first ? gold.base : 'transparent',
          borderWidth: top && !first ? 1 : 0,
          borderColor: goldAlpha.accent,
        }}
      >
        <Txt size={13} weight="bold" color={first ? void_.bg : top ? gold.base : onVoid.dim}>
          {num(place)}
        </Txt>
      </View>
      <Avatar
        name={name}
        url={photo}
        size={top ? 44 : 38}
        background={void_.raised}
        border={top ? goldAlpha.edge : onVoid.edge}
        color={top ? gold.base : onVoid.secondary}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={14.5} weight={top ? 'bold' : 'semibold'} color={onVoid.primary} numberOfLines={1}>
          {name}
        </Txt>
        <Txt size={11.5} color={onVoid.faint}>
          {detail}
          {aside ? ` · ${aside}` : ''}
        </Txt>
      </View>
      <Txt size={top ? 22 : 18} weight="bold" color={top ? gold.base : onVoid.primary}>
        {figure}
      </Txt>
    </View>
  );
}
