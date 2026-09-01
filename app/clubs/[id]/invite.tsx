import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { PressScale } from '@/components/motion';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { findPlayers, type FoundPlayer } from '@/data/squad';
import { inviteToClub, type SlotKind } from '@/data/clubs';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * Filling a club.
 *
 * The slot is chosen before the search, not after picking somebody, because a
 * captain filling a bench is doing the same thing eight times and should not
 * answer the same question eight times.
 */
export default function InviteToClub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { reason, t } = useI18n();

  const [slot, setSlot] = useState<SlotKind>('starter');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoundPlayer[]>([]);
  const [searching, setSearching] = useState(false);
  const [asked, setAsked] = useState<Record<string, true>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // Debounced: a search per keystroke is a request per keystroke.
    if (!isLive || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const rows = await findPlayers(query.trim());
        if (!cancelled) setResults(rows);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function ask(player: FoundPlayer) {
    if (!id) return;
    setNotice(null);
    try {
      const res = await inviteToClub(id, player.playerId, slot);
      if (res.ok) {
        setAsked((prev) => ({ ...prev, [player.playerId]: true }));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setNotice(reason(res.reason) ?? t.offline);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch {
      setNotice(t.offline);
    }
  }

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/clubs'))}
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
        <Txt size={20} weight="semibold" color={onVoid.primary}>
          {t.invitePlayers}
        </Txt>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {(['starter', 'sub'] as SlotKind[]).map((kind) => {
          const on = slot === kind;
          return (
            <PressScale
              key={kind}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={kind === 'starter' ? t.inviteAsStarter : t.inviteAsSub}
              onPress={() => {
                setSlot(kind);
                void Haptics.selectionAsync();
              }}
              style={{
                flex: 1,
                height: 42,
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: on ? goldAlpha.frame : onVoid.line,
                backgroundColor: on ? goldAlpha.fill : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt size={13} weight="medium" color={on ? gold.base : onVoid.secondary}>
                {kind === 'starter' ? t.inviteAsStarter : t.inviteAsSub}
              </Txt>
            </PressScale>
          );
        })}
      </View>

      <View style={{ gap: 10 }}>
        <Eyebrow>{t.searchPlayers}</Eyebrow>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t.searchPlayersHint}
          placeholderTextColor={onVoid.disabled}
          autoCapitalize="none"
          style={{
            height: 46,
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: onVoid.line,
            backgroundColor: void_.surface,
            paddingHorizontal: 14,
            color: onVoid.primary,
          }}
        />

        {searching ? <ActivityIndicator color={gold.base} /> : null}

        {!searching && query.trim().length >= 2 && results.length === 0 ? (
          <Txt size={13} color={onVoid.muted}>
            {t.noPlayersFound}
          </Txt>
        ) : null}

        {results.map((player) => (
          <View
            key={player.playerId}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}
          >
            <Avatar
              name={player.displayName}
              size={36}
              background={void_.raised}
              border={onVoid.edge}
              color={onVoid.secondary}
            />
            <Txt size={14} weight="semibold" color={onVoid.primary} style={{ flex: 1 }}>
              {player.displayName}
            </Txt>
            {asked[player.playerId] ? (
              <Txt size={12} color={gold.base}>
                {t.inviteSent}
              </Txt>
            ) : (
              <Button label={t.invite} height={36} size={12} onPress={() => ask(player)} />
            )}
          </View>
        ))}

        {notice ? (
          <Txt size={12} color={burgundy.action}>
            {notice}
          </Txt>
        ) : null}
      </View>
    </Screen>
  );
}
