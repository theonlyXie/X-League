import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Eyebrow } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { PressScale } from '@/components/motion';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { findPlayers, type FoundPlayer } from '@/data/squad';
import { directConversation } from '@/data/social';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * Find one person and say something to them.
 *
 * The search is the same one the squad and club invite screens use, which
 * matters for a reason beyond not writing it twice: it applies each profile's
 * own visibility, so a player who has narrowed theirs does not appear here.
 * That makes the list on this screen a true answer to "who can I message" —
 * every name on it can be opened, and the server agrees, because it now reads
 * the same setting when deciding whether to make the room.
 *
 * Tapping a name opens the room rather than asking to confirm. Opening one is
 * idempotent on the server — the same two people always land in the same room
 * — and there is nothing to undo about a room with nothing said in it yet.
 *
 * `replace`, not `push`, so the back button out of the thread goes to the chat
 * list and not to a search for somebody you have already found.
 */
export default function NewMessage() {
  const router = useRouter();
  const { reason, t, num } = useI18n();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoundPlayer[]>([]);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isLive) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    // Debounced: a search per keystroke is a request per keystroke.
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await findPlayers(term);
        if (!cancelled) setResults(rows);
      } catch {
        if (!cancelled) {
          setResults([]);
          setNotice(t.offline);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function open(player: FoundPlayer) {
    if (opening) return;
    setOpening(player.playerId);
    setNotice(null);
    try {
      const res = await directConversation(player.playerId);
      if (res.ok && res.conversationId) router.replace(`/chat/${res.conversationId}`);
      else setNotice(reason(res.reason) ?? t.offline);
    } catch {
      setNotice(t.offline);
    } finally {
      setOpening(null);
    }
  }

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/chat'))}
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
          {t.newMessage}
        </Txt>
      </View>

      <View style={{ gap: 8 }}>
        <Eyebrow>{t.searchPlayers}</Eyebrow>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t.searchPlayersHint}
          placeholderTextColor={onVoid.dim}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            height: 46,
            paddingHorizontal: 14,
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: onVoid.edge,
            color: onVoid.primary,
            backgroundColor: void_.surface,
          }}
        />
        <Txt size={11.5} lh={1.5} color={onVoid.faint}>
          {t.newMessageBlurb}
        </Txt>
      </View>

      {notice ? (
        <Txt size={12.5} lh={1.5} color={burgundy.action}>
          {notice}
        </Txt>
      ) : null}

      {searching ? <ActivityIndicator color={gold.base} /> : null}

      {!searching && query.trim().length >= 2 && results.length === 0 ? (
        <Txt size={13} lh={1.5} color={onVoid.muted}>
          {t.noPlayersFound}
        </Txt>
      ) : null}

      <View style={{ gap: 2 }}>
        {results.map((player) => (
          <PressScale
            key={player.playerId}
            accessibilityRole="button"
            accessibilityLabel={player.displayName}
            disabled={!!opening}
            onPress={() => void open(player)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 11,
              paddingHorizontal: 12,
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: opening === player.playerId ? goldAlpha.edge : 'transparent',
              backgroundColor: opening === player.playerId ? goldAlpha.fill : 'transparent',
            }}
          >
            <Avatar
              name={player.displayName}
              size={38}
              background={void_.raised}
              border={onVoid.edge}
              color={onVoid.secondary}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt size={14} weight="semibold" color={onVoid.primary}>
                {player.displayName}
              </Txt>
              {player.preferredArea ? (
                <Txt size={11.5} color={onVoid.faint}>
                  {player.preferredArea}
                </Txt>
              ) : null}
            </View>
            {player.ovr != null ? (
              <Txt size={13} weight="bold" color={gold.base}>
                {num(player.ovr)}
              </Txt>
            ) : null}
          </PressScale>
        ))}
      </View>
    </Screen>
  );
}
