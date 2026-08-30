import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Eyebrow } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { PressScale, Reveal } from '@/components/motion';
import { ArrowLeft } from '@/components/icons';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { keeperLeaderboard, leaderboard, type BoardRow, type KeeperRow } from '@/data/board';
import { useI18n } from '@/i18n';
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
  }, [venue]);

  const empty = board === 'scorers' ? !scorers.length : !keepers.length;

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
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
        <View style={{ flex: 1 }}>
          <Txt size={20} weight="semibold" color={onVoid.primary}>
            {t.leaderboards}
          </Txt>
          <Txt size={12} color={onVoid.dim}>
            {venue ? (name ?? t.venueBoard) : t.globalBoard}
          </Txt>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {(['scorers', 'keepers'] as const).map((which) => {
          const on = board === which;
          return (
            <PressScale
              key={which}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={which === 'scorers' ? t.scorers : t.keepers}
              onPress={() => {
                setBoard(which);
                void Haptics.selectionAsync();
              }}
              style={{
                flex: 1,
                height: 40,
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: on ? goldAlpha.frame : onVoid.line,
                backgroundColor: on ? goldAlpha.fill : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt size={13} weight="medium" color={on ? gold.base : onVoid.secondary}>
                {which === 'scorers' ? t.scorers : t.keepers}
              </Txt>
            </PressScale>
          );
        })}
      </View>

      {loading ? <ActivityIndicator color={gold.base} /> : null}

      {unreachable ? (
        <Txt size={13} color={onVoid.muted}>
          {t.boardUnreadable}
        </Txt>
      ) : null}

      {!loading && !unreachable && empty ? (
        <Txt size={13} lh={1.5} color={onVoid.muted}>
          {t.noBoardYet}
        </Txt>
      ) : null}

      {board === 'scorers' ? (
        <View style={{ gap: 4 }}>
          {scorers.length ? (
            <Eyebrow>{`${t.goalsShort} · ${t.assistsShort} · ${t.matchesShort}`}</Eyebrow>
          ) : null}
          {scorers.map((row, i) => (
            // Only the first few are staggered; forty reveals in sequence is a
            // wait, not an entrance.
            <Reveal key={row.playerId} index={Math.min(i, 7)}>
              <Place
                place={row.place}
                name={row.displayName}
                photo={row.photoUrl}
                figure={num(row.goals)}
                detail={`${num(row.assists)} ${t.assistsShort} · ${num(row.matches)} ${t.matchesShort}`}
                aside={row.cupGoals > 0 ? t.ofWhichCup(num(row.cupGoals)) : null}
              />
            </Reveal>
          ))}
        </View>
      ) : (
        <View style={{ gap: 4 }}>
          {keepers.length ? <Eyebrow>{t.cleanSheets}</Eyebrow> : null}
          {keepers.map((row, i) => (
            <Reveal key={row.playerId} index={Math.min(i, 7)}>
              <Place
                place={row.place}
                name={row.displayName}
                photo={row.photoUrl}
                figure={num(row.cleanSheets)}
                detail={`${num(row.conceded)} ${t.conceded} · ${num(row.matches)} ${t.matchesShort}`}
                aside={null}
              />
            </Reveal>
          ))}
        </View>
      )}
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
}: {
  place: number;
  name: string;
  photo: string | null;
  figure: string;
  detail: string;
  aside: string | null;
}) {
  const { num } = useI18n();
  const top = place <= 3;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: radius.row,
        backgroundColor: top ? void_.inset : 'transparent',
        borderWidth: 1,
        borderColor: top ? goldAlpha.edge : 'transparent',
      }}
    >
      <Txt
        size={13}
        weight="bold"
        color={top ? gold.base : onVoid.dim}
        style={{ width: 22, textAlign: 'center' }}
      >
        {num(place)}
      </Txt>
      <Avatar
        name={name}
        url={photo}
        size={36}
        background={void_.raised}
        border={onVoid.edge}
        color={onVoid.secondary}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={14} weight="semibold" color={onVoid.primary}>
          {name}
        </Txt>
        <Txt size={11.5} color={onVoid.faint}>
          {detail}
          {aside ? ` · ${aside}` : ''}
        </Txt>
      </View>
      <Txt size={18} weight="bold" color={onVoid.primary}>
        {figure}
      </Txt>
    </View>
  );
}
