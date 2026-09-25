import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { MenuGroup, Unreachable } from '@/components/kit';
import { ChevronLeft } from '@/components/icons';
import { gold, onVoid, radius, void_ } from '@/theme/tokens';
import { myBlocks, unblockPlayer, type Blocked } from '@/data/social';
import { useI18n } from '@/i18n';
import { useSession } from '@/state/session';
import { useRefreshTick } from '@/state/refresh';
import { isLive } from '@/lib/supabase';

/**
 * Who you have stopped hearing from.
 *
 * A block that cannot be undone is a punishment rather than a tool, and the
 * store rule that asks for blocking takes it for granted that this list exists.
 */
export default function BlockedPlayers() {
  const router = useRouter();
  const { t, shortDate } = useI18n();
  const { signedIn } = useSession();
  const tick = useRefreshTick();

  const [rows, setRows] = useState<Blocked[]>([]);
  const [loading, setLoading] = useState(isLive);
  /**
   * §4.7: a list we could not read is not an empty list. This screen used to
   * say "you have not blocked anybody" when the read failed, which is the one
   * sentence here that must be true.
   */
  const [unreachable, setUnreachable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!isLive || !signedIn) {
      setLoading(false);
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await myBlocks();
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
  }, [signedIn, nonce, tick]);

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          hitSlop={8}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}
        >
          <ChevronLeft size={22} color={onVoid.primary} />
        </Pressable>
        <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary} style={{ flex: 1 }}>
          {t.blockedPlayers}
        </Txt>
      </View>

      {loading ? <ActivityIndicator color={gold.base} /> : null}

      {!loading && unreachable ? <Unreachable label={t.offline} onRetry={reload} /> : null}

      {!loading && !unreachable && !rows.length ? (
        <Txt size={13} lh={1.5} color={onVoid.muted}>
          {t.noBlockedPlayers}
        </Txt>
      ) : null}

      {rows.length ? (
        <MenuGroup>
          {rows.map((b) => (
            <View
              key={b.playerId}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}
            >
              <Avatar
                name={b.displayName}
                url={b.photoUrl}
                size={42}
                background={void_.raised}
                border={onVoid.edge}
                color={onVoid.secondary}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt size={14.5} weight="semibold" color={onVoid.primary} numberOfLines={1}>
                  {b.displayName}
                </Txt>
                <Txt size={11.5} color={onVoid.faint}>
                  {shortDate(b.since)}
                </Txt>
              </View>
              <Button
                label={t.unblock}
                variant="accept"
                height={36}
                round={radius.chip}
                size={12.5}
                disabled={busy === b.playerId}
                onPress={() => {
                  setBusy(b.playerId);
                  void unblockPlayer(b.playerId)
                    .catch(() => undefined)
                    .finally(() => {
                      setBusy(null);
                      reload();
                    });
                }}
              />
            </View>
          ))}
        </MenuGroup>
      ) : null}
    </Screen>
  );
}
