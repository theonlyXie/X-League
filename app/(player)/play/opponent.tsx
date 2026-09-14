import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Divider, Eyebrow } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, onVoid, radius, void_ } from '@/theme/tokens';
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/play'))}
          hitSlop={8}
          style={{
            width: 34,
            height: 34,
            borderRadius: radius.icon,
            borderWidth: 1,
            borderColor: 'rgba(243,238,229,.14)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={16} color={onVoid.muted} />
        </Pressable>
        <Txt size={19} weight="bold" em={-0.01} color={onVoid.primary}>
          {t.inviteOpponent}
        </Txt>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t.searchPlayersHint}
        placeholderTextColor={onVoid.dim}
        autoCapitalize="none"
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
        <View style={{ gap: 10 }}>
          <Eyebrow>{t.clubs}</Eyebrow>
          <View style={{ gap: 8 }}>
            {clubs.map((c) => (
              <Row
                key={c.clubId}
                initials={c.name.slice(0, 2).toUpperCase()}
                title={c.name}
                subtitle={c.homeArea}
                // Their own club: shown, and refused here rather than by the
                // server, so the reason is legible before the tap.
                disabled={c.mine || busy}
                hint={c.mine ? t.yourClub : null}
                onPress={() => invite({ clubId: c.clubId })}
              />
            ))}
          </View>
        </View>
      ) : null}

      {clubs.length > 0 && players.length > 0 ? <Divider /> : null}

      {players.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Eyebrow>{t.searchPlayers}</Eyebrow>
          <View style={{ gap: 8 }}>
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
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function Row({
  initials,
  title,
  subtitle,
  hint,
  disabled,
  onPress,
}: {
  initials: string;
  title: string;
  subtitle: string | null;
  hint: string | null;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderRadius: radius.control,
        backgroundColor: void_.surface,
        borderWidth: 1,
        borderColor: onVoid.edgeFaint,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: radius.pill,
          backgroundColor: void_.inset,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Txt size={11} weight="bold" color={gold.base}>
          {initials}
        </Txt>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={13.5} weight="semibold" color={onVoid.primary}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt size={11} color={onVoid.faint}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {hint ? (
        <Txt size={11} color={onVoid.dim}>
          {hint}
        </Txt>
      ) : null}
    </Pressable>
  );
}
