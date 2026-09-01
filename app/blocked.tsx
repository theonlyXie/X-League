import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { ArrowLeft } from '@/components/icons';
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
        if (!cancelled) setRows(list);
      } catch {
        if (!cancelled) setRows([]);
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          hitSlop={8}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
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
        <Txt size={20} weight="semibold" color={onVoid.primary} style={{ flex: 1 }}>
          {t.blockedPlayers}
        </Txt>
      </View>

      {loading ? <ActivityIndicator color={gold.base} /> : null}

      {!loading && !rows.length ? (
        <Txt size={13} lh={1.5} color={onVoid.muted}>
          {t.noBlockedPlayers}
        </Txt>
      ) : null}

      {rows.length ? <Eyebrow>{t.blockedPlayers}</Eyebrow> : null}

      <View style={{ gap: 8 }}>
        {rows.map((b) => (
          <View
            key={b.playerId}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              borderRadius: radius.control,
              backgroundColor: void_.surface,
              borderWidth: 1,
              borderColor: onVoid.edgeFaint,
            }}
          >
            <Avatar
              name={b.displayName}
              url={b.photoUrl}
              size={38}
              background={void_.raised}
              border={onVoid.edge}
              color={onVoid.secondary}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt size={14} weight="semibold" color={onVoid.primary}>
                {b.displayName}
              </Txt>
              <Txt size={11.5} color={onVoid.faint}>
                {shortDate(b.since)}
              </Txt>
            </View>
            <Button
              label={t.unblock}
              variant="ghost"
              height={36}
              size={12}
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
      </View>
    </Screen>
  );
}
