import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { Button } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { MenuGroup, SearchField, SectionTitle, Unreachable } from '@/components/kit';
import { ChevronLeft } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import {
  findPlayers,
  inviteToTeam,
  myTeams,
  teamRoster,
  type FoundPlayer,
  type Team,
  type TeamMember,
} from '@/data/squad';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * P-10 / P-11 — one team's roster, and adding to it.
 *
 * Only the captain sees the invite controls. That is a courtesy rather than a
 * security boundary: the server refuses the call either way (TEAM-002), and
 * showing a button that always fails would be worse than not showing it.
 */
export default function TeamDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const teamId = params.id ?? null;
  const { reason, t, num } = useI18n();

  const [team, setTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [denied, setDenied] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoundPlayer[]>([]);
  const [invitedIds, setInvitedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!isLive || !teamId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [rows, mine] = await Promise.all([teamRoster(teamId), myTeams()]);
        if (cancelled) return;
        setRoster(rows);
        setTeam(mine.find((x) => x.teamId === teamId) ?? null);
      } catch (e: unknown) {
        if (!cancelled) {
          const message = (e as { message?: string })?.message ?? '';
          setDenied(
            message.includes('not a member')
              ? t.errNotYourTeam
              : t.errTeamUnreadable,
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, nonce]);

  useEffect(() => {
    if (!isLive || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const rows = await findPlayers(query.trim());
        if (!cancelled) setResults(rows);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const isCaptain = team?.role === 'captain';
  const inTeam = new Set(roster.map((m) => m.playerId));

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/teams'))}
          hitSlop={8}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}
        >
          <ChevronLeft size={22} color={onVoid.primary} />
        </Pressable>
        <View style={{ gap: 2, flex: 1 }}>
          <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary} numberOfLines={1}>
            {team?.name ?? t.teamsTitle}
          </Txt>
          {team ? (
            <Txt size={11.5} weight="semibold" color={gold.base}>
              {t.members(num(team.members))}
              {team.homeArea ? ` · ${team.homeArea}` : ''}
            </Txt>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {denied ? <Unreachable label={denied} /> : null}

      {!loading && !denied ? (
        <>
          {roster.length ? (
            <View style={{ gap: 12 }}>
              <SectionTitle title={t.squadTitle} />
              <MenuGroup>
                {roster.map((m) => (
                  <View
                    key={m.playerId}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      opacity: m.state === 'invited' ? 0.65 : 1,
                    }}
                  >
                    <Avatar
                      name={m.displayName}
                      size={40}
                      background={void_.inset}
                      border={m.role === 'captain' ? goldAlpha.edge : onVoid.edge}
                      color={gold.base}
                    />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt size={14} weight="semibold" color={onVoid.primary} numberOfLines={1}>
                        {m.displayName}
                      </Txt>
                      <Txt size={11.5} color={onVoid.faint}>
                        {[
                          m.role === 'captain' ? t.captain : null,
                          m.position,
                          m.state === 'invited' ? t.invited : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Txt>
                    </View>
                    {m.ovr != null ? (
                      <Txt size={15} weight="bold" color={gold.base}>
                        {num(m.ovr)}
                      </Txt>
                    ) : null}
                    {/* The team room was one button for everybody. This is one
                        button per person, which is what a squad actually uses. */}
                    {m.state === 'active' ? (
                      <WhatsAppButton
                        playerId={m.playerId}
                        label={t.whatsapp}
                        height={30}
                        size={11}
                        onNotice={setNotice}
                      />
                    ) : null}
                  </View>
                ))}
              </MenuGroup>
            </View>
          ) : null}

          {isCaptain ? (
            <View style={{ gap: 12 }}>
              <SectionTitle title={t.invitePlayers} />
              <SearchField value={query} onChangeText={setQuery} placeholder={t.searchPlayersHint} />
              {results.length ? (
                <MenuGroup>
                  {results.map((p) => {
                    const already = inTeam.has(p.playerId) || invitedIds.includes(p.playerId);
                    return (
                      <View
                        key={p.playerId}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14 }}
                      >
                        <Avatar
                          name={p.displayName}
                          size={40}
                          background={void_.raised}
                          border={onVoid.edge}
                          color={onVoid.secondary}
                        />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Txt size={14} weight="semibold" color={onVoid.primary} numberOfLines={1}>
                            {p.displayName}
                          </Txt>
                          <Txt size={11.5} color={onVoid.faint}>
                            {[p.position, p.preferredArea].filter(Boolean).join(' · ')}
                          </Txt>
                        </View>
                        <Button
                          label={already ? t.invited : t.invite}
                          variant={already ? 'accept' : 'primary'}
                          height={36}
                          round={radius.chip}
                          size={12.5}
                          disabled={already}
                          onPress={async () => {
                            if (!teamId) return;
                            const res = await inviteToTeam(teamId, p.playerId);
                            if (res.ok) setInvitedIds((ids) => [...ids, p.playerId]);
                            else setNotice(reason(res.reason) ?? null);
                          }}
                        />
                      </View>
                    );
                  })}
                </MenuGroup>
              ) : null}
            </View>
          ) : null}

          {notice ? (
            <Txt size={12} color={burgundy.action}>
              {notice}
            </Txt>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
