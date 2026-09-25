import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { MenuGroup, SearchField, SectionTitle } from '@/components/kit';
import { ChevronLeft, ChevronRight } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius } from '@/theme/tokens';
import { findPlayers, type FoundPlayer } from '@/data/squad';
import { challengeOpponent, findClubs, type FoundClub } from '@/data/opponent';
import { useI18n } from '@/i18n';

/**
 * Naming who you are playing.
 *
 * One search box over two kinds of opponent, because a captain thinking "we're
 * playing Ahmed's lot" does not know or care whether Ahmed's lot is a club on
 * this app or Ahmed himself. Both run on the server — the player search applies
 * PRO-006 visibility and the club search returns only admitted clubs — so
 * nothing here filters a list the client should not have had.
 *
 * A club the reader runs comes back marked and unpressable rather than missing.
 * The server refuses it anyway; showing it greyed says why, where an absence
 * would just look like a search that does not work.
 */
export default function OpponentPicker() {
  const router = useRouter();
  const params = useLocalSearchParams<{ booking?: string }>();
  const bookingId = params.booking ?? null;
  const { reason, t } = useI18n();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [players, setPlayers] = useState<FoundPlayer[]>([]);
  const [clubs, setClubs] = useState<FoundClub[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // Debounced, for the same reason the squad search is: a request per keystroke
  // is a request per keystroke.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setPlayers([]);
      setClubs([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const [p, c] = await Promise.all([
          findPlayers(q).catch(() => [] as FoundPlayer[]),
          findClubs(q).catch(() => [] as FoundClub[]),
        ]);
        if (!cancelled) {
          setPlayers(p);
          setClubs(c);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function invite(opponent: { playerId: string } | { clubId: string }) {
    if (!bookingId || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      const res = await challengeOpponent(bookingId, opponent);
      if (res.ok) router.back();
      else setFailed(reason(res.reason));
    } catch {
      setFailed(t.errVenueCalendarRetry);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/play'))}
          hitSlop={8}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}
        >
          <ChevronLeft size={22} color={onVoid.primary} />
        </Pressable>
        <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary} style={{ flex: 1 }}>
          {t.inviteOpponent}
        </Txt>
      </View>

      <SearchField value={query} onChangeText={setQuery} placeholder={t.searchPlayersHint} />

      {failed ? (
        <Txt size={12.5} color={burgundy.action}>
          {failed}
        </Txt>
      ) : null}

      {searching ? <ActivityIndicator color={gold.base} /> : null}

      {!searching && query.trim().length >= 2 && players.length === 0 && clubs.length === 0 ? (
        <Txt size={12.5} color={onVoid.dim}>
          {t.noPlayersFound}
        </Txt>
      ) : null}

      {clubs.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionTitle title={t.clubs} />
          <MenuGroup>
            {clubs.map((c) => (
              <Row
                key={c.clubId}
                initials={c.name.slice(0, 2).toUpperCase()}
                club
                title={c.name}
                subtitle={c.homeArea}
                // Their own club: shown, and refused here rather than by the
                // server, so the reason is legible before the tap.
                disabled={c.mine || busy}
                hint={c.mine ? t.yourClub : null}
                onPress={() => invite({ clubId: c.clubId })}
              />
            ))}
          </MenuGroup>
        </View>
      ) : null}

      {players.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionTitle title={t.searchPlayers} />
          <MenuGroup>
            {players.map((p) => (
              <Row
                key={p.playerId}
                initials={p.displayName.slice(0, 2).toUpperCase()}
                title={p.displayName}
                subtitle={[p.position, p.preferredArea].filter(Boolean).join(' · ') || null}
                disabled={busy}
                hint={null}
                onPress={() => invite({ playerId: p.playerId })}
              />
            ))}
          </MenuGroup>
        </View>
      ) : null}
    </Screen>
  );
}

/** One result: an avatar — round for a player, a crest's square for a club — and who it is. */
function Row({
  initials,
  title,
  subtitle,
  hint,
  club,
  disabled,
  onPress,
}: {
  initials: string;
  title: string;
  subtitle: string | null;
  hint: string | null;
  club?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: pressed ? goldAlpha.fillSoft : 'transparent',
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: club ? radius.icon : radius.pill,
          backgroundColor: goldAlpha.fill,
          borderWidth: 1,
          borderColor: goldAlpha.edgeSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Txt size={13} weight="bold" color={gold.base}>
          {initials}
        </Txt>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={14.5} weight="semibold" color={onVoid.primary} numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt size={11.5} color={onVoid.faint} numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {hint ? (
        <Txt size={11.5} weight="semibold" color={onVoid.dim}>
          {hint}
        </Txt>
      ) : disabled ? null : (
        <ChevronRight size={16} color={onVoid.dim} />
      )}
    </Pressable>
  );
}
