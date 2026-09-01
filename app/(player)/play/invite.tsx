import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Divider, Eyebrow } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, onVoid, radius, void_ } from '@/theme/tokens';
import { findPlayers, inviteToBooking, squadCounts, type FoundPlayer, type SquadCounts } from '@/data/squad';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * P-07 / P-11 — filling a squad.
 *
 * Search is debounced and runs on the server, which applies PRO-006 visibility.
 * A player who has opted out of discovery genuinely does not come back, so
 * there is nothing here that filters a list the client should not have had.
 *
 * A guest is a first-class option rather than a fallback. Five-a-side is full
 * of people without accounts, and forcing a captain to invent an account for a
 * friend would make the squad list less true, not more.
 */
export default function Invite() {
  const router = useRouter();
  const params = useLocalSearchParams<{ booking?: string }>();
  const bookingId = params.booking ?? null;
  const { reason, t, num } = useI18n();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoundPlayer[]>([]);
  const [searching, setSearching] = useState(false);
  const [guest, setGuest] = useState('');
  const [slotKind, setSlotKind] = useState<'starter' | 'sub'>('starter');
  const [counts, setCounts] = useState<SquadCounts | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<string[]>([]);

  const refreshCounts = async () => {
    if (!isLive || !bookingId) return;
    // Keep the last known counts on failure rather than dropping to null: a
    // null makes `full` evaluate false, which silently removes the "starting
    // five is full" guard and re-enables every Invite button. The server still
    // refuses, so this only ever cost the player a confusing round trip — but
    // it is the guard disappearing quietly that makes it worth saying.
    const next = await squadCounts(bookingId).catch(() => null);
    if (next) setCounts(next);
    else setNotice((n) => n ?? t.offline);
  };

  useEffect(() => {
    void refreshCounts();
  }, [bookingId]);

  // Debounced: a search per keystroke would be a request per keystroke, and the
  // server is the only thing that can answer it.
  useEffect(() => {
    if (!isLive || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
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

  const invite = async (who: { playerId?: string; guestName?: string }) => {
    if (!bookingId) return;
    const res = await inviteToBooking(bookingId, who, { slotKind });
    if (res.ok) {
      setNotice(null);
      if (who.playerId) setInvitedIds((ids) => [...ids, who.playerId!]);
      if (who.guestName) setGuest('');
      void refreshCounts();
    } else {
      setNotice(reason(res.reason) ?? null);
    }
  };

  const full =
    counts !== null &&
    (slotKind === 'starter'
      ? counts.acceptedStarters >= counts.starterCapacity
      : counts.acceptedSubs >= counts.subCapacity);

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
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
          <ArrowLeft size={16} color={onVoid.secondary} />
        </Pressable>
        <View style={{ gap: 2, flex: 1 }}>
          <Txt size={19} weight="bold" em={-0.02} color={onVoid.primary}>
            {t.invitePlayers}
          </Txt>
          {counts ? (
            <Txt size={11.5} color={onVoid.faint}>
              {t.startersOf(num(counts.acceptedStarters), num(counts.starterCapacity))} ·{' '}
              {t.subsOf(num(counts.acceptedSubs), num(counts.subCapacity))}
            </Txt>
          ) : null}
        </View>
      </View>

      {/* Which shirt is being offered changes what capacity means. */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['starter', 'sub'] as const).map((k) => {
          const on = k === slotKind;
          return (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={k === 'starter' ? t.starter : t.sub}
              onPress={() => setSlotKind(k)}
              style={{
                flex: 1,
                height: 40,
                borderRadius: radius.chip,
                alignItems: 'center',
                justifyContent: 'center',
                ...(on
                  ? { backgroundColor: gold.base }
                  : { borderWidth: 1, borderColor: 'rgba(243,238,229,.14)' }),
              }}
            >
              <Txt size={13} weight={on ? 'bold' : 'semibold'} color={on ? void_.bg : onVoid.muted}>
                {k === 'starter' ? t.starter : t.sub}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      {full ? (
        <Txt size={12.5} color={burgundy.action}>
          {slotKind === 'starter' ? t.errStartersFull : t.errSubsFull}
        </Txt>
      ) : null}

      <View style={{ gap: 10 }}>
        <Eyebrow>{t.searchPlayers}</Eyebrow>
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

        {searching ? <ActivityIndicator color={gold.base} /> : null}

        {!searching && query.trim().length >= 2 && results.length === 0 ? (
          <Txt size={12.5} color={onVoid.dim}>
            {t.noPlayersFound}
          </Txt>
        ) : null}

        <View style={{ gap: 8 }}>
          {results.map((p) => {
            const already = invitedIds.includes(p.playerId);
            return (
              <View
                key={p.playerId}
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
                    {p.displayName.slice(0, 2).toUpperCase()}
                  </Txt>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt size={13.5} weight="semibold" color={onVoid.primary}>
                    {p.displayName}
                  </Txt>
                  <Txt size={11} color={onVoid.faint}>
                    {[p.position, p.preferredArea].filter(Boolean).join(' · ')}
                  </Txt>
                </View>
                {p.ovr != null ? (
                  <Txt size={14} weight="bold" color={gold.base}>
                    {num(p.ovr)}
                  </Txt>
                ) : null}
                <Button
                  label={already ? t.invited : t.invite}
                  height={34}
                  round={radius.chip}
                  size={12}
                  disabled={already || full}
                  onPress={() => invite({ playerId: p.playerId })}
                />
              </View>
            );
          })}
        </View>
      </View>

      <Divider />

      <View style={{ gap: 10 }}>
        <Eyebrow>{t.addGuest}</Eyebrow>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={guest}
            onChangeText={setGuest}
            placeholder={t.guestName}
            placeholderTextColor={onVoid.dim}
            style={{
              flex: 1,
              height: 46,
              paddingHorizontal: 14,
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: onVoid.edge,
              color: onVoid.primary,
              backgroundColor: void_.surface,
            }}
          />
          <Button
            label={t.invite}
            height={46}
            disabled={guest.trim().length === 0 || full}
            onPress={() => invite({ guestName: guest.trim() })}
          />
        </View>
      </View>

      {notice ? (
        <Txt size={12.5} color={burgundy.action}>
          {notice}
        </Txt>
      ) : null}
    </Screen>
  );
}
