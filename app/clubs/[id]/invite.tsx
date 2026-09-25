import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { Card, MenuGroup, Radio, SearchField, SectionTitle } from '@/components/kit';
import { ChevronLeft } from '@/components/icons';
import { burgundy, gold, onVoid, radius, void_ } from '@/theme/tokens';
import { familyFor } from '@/theme/typography';
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
  const { reason, t, rtl } = useI18n();

  const [slot, setSlot] = useState<SlotKind>('starter');
  /**
   * The share of a cup win being offered, as typed. Held as a string rather
   * than a number so an empty box is an empty box — offering nothing and
   * offering zero are different sentences, and `0` in the field would put
   * "0% of the prize" on somebody's invitation.
   */
  const [bounty, setBounty] = useState('');
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

  /** What was typed, or null for no offer. Commas and Arabic digits included. */
  function offeredShare(): number | null {
    const typed = Number(bounty.replace(/[^\d.]/g, ''));
    return Number.isFinite(typed) && typed > 0 ? typed : null;
  }

  async function ask(player: FoundPlayer) {
    if (!id) return;
    setNotice(null);
    try {
      const res = await inviteToClub(id, player.playerId, slot, offeredShare());
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

  const field = {
    height: 48,
    borderRadius: radius.row,
    borderWidth: 1,
    borderColor: onVoid.line,
    backgroundColor: void_.bg,
    paddingHorizontal: 14,
    color: onVoid.primary,
    fontFamily: familyFor('regular', rtl),
    fontSize: 15,
  } as const;

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/clubs'))}
          hitSlop={8}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}
        >
          <ChevronLeft size={22} color={onVoid.primary} />
        </Pressable>
        <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary} style={{ flex: 1 }}>
          {t.invitePlayers}
        </Txt>
      </View>

      {/* The terms of the invitation, in one card, the way the source sets
          out a broadcast before it is sent: which slot, then what is offered. */}
      <Card>
        <Txt size={15} weight="bold" color={onVoid.primary}>
          {t.socialInviteAs}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
          {(['starter', 'sub'] as SlotKind[]).map((kind) => {
            const on = slot === kind;
            const label = kind === 'starter' ? t.inviteAsStarter : t.inviteAsSub;
            return (
              <Pressable
                key={kind}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={label}
                hitSlop={8}
                onPress={() => {
                  setSlot(kind);
                  void Haptics.selectionAsync();
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 4 }}
              >
                <Radio on={on} />
                <Txt size={14} weight={on ? 'semibold' : 'regular'} color={on ? onVoid.primary : onVoid.secondary}>
                  {label}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        <View style={{ height: 1, backgroundColor: onVoid.edgeFaint, marginVertical: 2 }} />

        {/* Only a club can offer this, because only a club enters a cup. The
            squad invitation for an ordinary Thursday match has no field like it
            and should not: there is no prize to take a share of. */}
        <Txt size={15} weight="bold" color={onVoid.primary}>
          {t.bountyLabel}
        </Txt>
        <TextInput
          value={bounty}
          onChangeText={setBounty}
          placeholder={t.bountyHint}
          placeholderTextColor={onVoid.disabled}
          keyboardType="number-pad"
          accessibilityLabel={t.bountyLabel}
          style={field}
        />
        <Txt size={11.5} lh={1.5} color={onVoid.dim}>
          {t.bountyBlurb}
        </Txt>
      </Card>

      <View style={{ gap: 12 }}>
        <SectionTitle title={t.searchPlayers} />
        <SearchField value={query} onChangeText={setQuery} placeholder={t.searchPlayersHint} />

        {searching ? <ActivityIndicator color={gold.base} /> : null}

        {!searching && query.trim().length >= 2 && results.length === 0 ? (
          <Txt size={13} color={onVoid.muted}>
            {t.noPlayersFound}
          </Txt>
        ) : null}

        {results.length ? (
          <MenuGroup>
            {results.map((player) => (
              <View
                key={player.playerId}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14 }}
              >
                <Avatar
                  name={player.displayName}
                  size={40}
                  background={void_.raised}
                  border={onVoid.edge}
                  color={onVoid.secondary}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt size={14} weight="semibold" color={onVoid.primary} numberOfLines={1}>
                    {player.displayName}
                  </Txt>
                  {player.position || player.preferredArea ? (
                    <Txt size={11.5} color={onVoid.faint} numberOfLines={1}>
                      {[player.position, player.preferredArea].filter(Boolean).join(' · ')}
                    </Txt>
                  ) : null}
                </View>
                {asked[player.playerId] ? (
                  <Txt size={12} weight="semibold" color={gold.base}>
                    {t.inviteSent}
                  </Txt>
                ) : (
                  <Button label={t.invite} height={36} round={radius.chip} size={12.5} onPress={() => ask(player)} />
                )}
              </View>
            ))}
          </MenuGroup>
        ) : null}

        {notice ? (
          <Txt size={12} color={burgundy.action}>
            {notice}
          </Txt>
        ) : null}
      </View>
    </Screen>
  );
}
