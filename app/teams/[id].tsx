import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Divider, Eyebrow } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, onVoid, radius, void_ } from '@/theme/tokens';
import {
  findPlayers,
  inviteToTeam,
  myTeams,
  teamRoster,
  type FoundPlayer,
  type Team,
  type TeamMember,
} from '@/data/squad';
import { teamConversation } from '@/data/social';
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
  const { t, num } = useI18n();

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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/teams'))}
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
            {team?.name ?? t.teamsTitle}
          </Txt>
          {team ? (
            <Txt size={11.5} color={onVoid.faint}>
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

      {denied ? (
        <Txt size={13} color={burgundy.action}>
          {denied}
        </Txt>
      ) : null}

      {!loading && !denied ? (
        <>
          <View style={{ gap: 8 }}>
            {roster.map((m) => (
              <View
                key={m.playerId}
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
                  opacity: m.state === 'invited' ? 0.65 : 1,
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
                    {m.displayName.slice(0, 2).toUpperCase()}
                  </Txt>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt size={13.5} weight="semibold" color={onVoid.primary}>
                    {m.displayName}
                  </Txt>
                  <Txt size={11} color={onVoid.faint}>
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
                  <Txt size={14} weight="bold" color={gold.base}>
                    {num(m.ovr)}
                  </Txt>
                ) : null}
              </View>
            ))}
          </View>

          <Button
            label={t.messageSquad}
            variant="ghost"
            height={44}
            onPress={async () => {
              if (!teamId) return;
              const room = await teamConversation(teamId);
              if (room.ok && room.conversationId) router.push(`/chat/${room.conversationId}`);
              else setNotice(room.reason ?? null);
            }}
          />

          {isCaptain ? (
            <>
              <Divider />
              <View style={{ gap: 10 }}>
                <Eyebrow>{t.invitePlayers}</Eyebrow>
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
                {results.map((p) => {
                  const already = inTeam.has(p.playerId) || invitedIds.includes(p.playerId);
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
                      <View style={{ flex: 1, gap: 2 }}>
                        <Txt size={13.5} weight="semibold" color={onVoid.primary}>
                          {p.displayName}
                        </Txt>
                        <Txt size={11} color={onVoid.faint}>
                          {[p.position, p.preferredArea].filter(Boolean).join(' · ')}
                        </Txt>
                      </View>
                      <Button
                        label={already ? t.invited : t.invite}
                        height={34}
                        round={radius.chip}
                        size={12}
                        disabled={already}
                        onPress={async () => {
                          if (!teamId) return;
                          const res = await inviteToTeam(teamId, p.playerId);
                          if (res.ok) setInvitedIds((ids) => [...ids, p.playerId]);
                          else setNotice(res.reason ?? null);
                        }}
                      />
                    </View>
                  );
                })}
              </View>
            </>
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
