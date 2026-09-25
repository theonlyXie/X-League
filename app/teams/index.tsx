import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { ActionButton, Card, MenuGroup, SectionTitle } from '@/components/kit';
import { ChevronLeft, ChevronRight, Plus } from '@/components/icons';
import { familyFor } from '@/theme/typography';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { createTeam, myTeams, respondToTeamInvite, type Team } from '@/data/squad';
import { useI18n } from '@/i18n';
import { useRefreshTick } from '@/state/refresh';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';

/**
 * P-10 — the teams a player belongs to.
 *
 * A pending invitation sits at the top with its two answers, because an
 * invitation nobody can answer from where they see it is a dead end.
 */
export default function Teams() {
  const { signedIn } = useSession();
  const router = useRouter();
  const { reason, t, num, rtl } = useI18n();

  // The refresh button in the top bar.
  const tick = useRefreshTick();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(isLive);
  /** §4.7: a list we could not read is not an empty list. */
  const [unreachable, setUnreachable] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // Same as notifications: `my_teams` needs an account, and a 401 read as
    // an outage rather than as "you are not signed in".
    if (!isLive || !signedIn) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await myTeams();
        if (!cancelled) {
          setTeams(rows);
          setUnreachable(false);
        }
      } catch {
        if (!cancelled) {
          setTeams([]);
          setUnreachable(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce, signedIn, tick]);

  const invited = teams.filter((team) => team.state === 'invited');
  const active = teams.filter((team) => team.state === 'active');

  const field = {
    flex: 1,
    minWidth: 0,
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

  async function answer(teamId: string, accept: boolean) {
    try {
      await respondToTeamInvite(teamId, accept);
    } catch {
      setNotice(t.offline);
    } finally {
      reload();
    }
  }

  async function create() {
    setCreating(true);
    try {
      const res = await createTeam(name.trim());
      if (res.ok) {
        setName('');
        setNotice(null);
        reload();
      } else {
        setNotice(reason(res.reason) ?? null);
      }
    } catch {
      // A dropped connection used to leave the button disabled for good,
      // because `creating` was only cleared on the path that returned.
      setNotice(t.offline);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
          hitSlop={8}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}
        >
          <ChevronLeft size={22} color={onVoid.primary} />
        </Pressable>
        <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary} style={{ flex: 1 }}>
          {t.teamsTitle}
        </Txt>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {invited.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionTitle title={t.invitation} />
          {invited.map((team) => (
            <Card key={team.teamId} style={{ borderColor: goldAlpha.edgeSoft }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Crest name={team.name} hue={team.crestHue} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt size={15} weight="bold" color={onVoid.primary} numberOfLines={1}>
                    {team.name}
                  </Txt>
                  <Txt size={11.5} color={onVoid.faint}>
                    {t.members(num(team.members))}
                    {team.homeArea ? ` · ${team.homeArea}` : ''}
                  </Txt>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <ActionButton label={t.joinTeam} flex onPress={() => answer(team.teamId, true)} />
                <ActionButton label={t.declineTeam} variant="ghost" flex onPress={() => answer(team.teamId, false)} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {/* Two different silences: nothing here, and could not read the list. */}
      {!loading && active.length === 0 ? (
        <View style={{ gap: 6 }}>
          <Txt size={15} weight="semibold" color={onVoid.primary}>
            {unreachable ? t.listUnreachable : t.noTeams}
          </Txt>
          <Txt size={12.5} lh={1.55} color={onVoid.muted}>
            {unreachable ? t.listUnreachableBlurb : t.noTeamsBlurb}
          </Txt>
        </View>
      ) : null}

      {active.length ? (
        <MenuGroup>
          {active.map((team) => (
            <Pressable
              key={team.teamId}
              accessibilityRole="button"
              accessibilityLabel={team.name}
              onPress={() => router.push(`/teams/${team.teamId}`)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 12,
                paddingHorizontal: 14,
                backgroundColor: pressed ? goldAlpha.fillSoft : 'transparent',
              })}
            >
              <Crest name={team.name} hue={team.crestHue} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt size={15} weight="semibold" color={onVoid.primary} numberOfLines={1}>
                  {team.name}
                </Txt>
                <Txt size={11.5} color={onVoid.faint}>
                  {t.members(num(team.members))}
                  {team.role === 'captain' ? ` · ${t.captain}` : ''}
                </Txt>
              </View>
              <ChevronRight size={16} color={onVoid.dim} />
            </Pressable>
          ))}
        </MenuGroup>
      ) : null}

      <View style={{ gap: 12 }}>
        <SectionTitle title={t.newTeam} />
        <Card>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t.teamName}
              placeholderTextColor={onVoid.disabled}
              accessibilityLabel={t.teamName}
              style={field}
            />
            <ActionButton
              label={t.create}
              disabled={creating || name.trim().length < 2}
              icon={<Plus size={16} color={void_.bg} />}
              onPress={create}
            />
          </View>
          {notice ? (
            <Txt size={12} color={burgundy.action}>
              {notice}
            </Txt>
          ) : null}
        </Card>
      </View>
    </Screen>
  );
}

/** A team's badge: its initials on the hue it was given, or on the inset. */
function Crest({ name, hue }: { name: string; hue: number | null }) {
  return (
    <View
      style={{
        width: 46,
        height: 46,
        borderRadius: radius.chip,
        backgroundColor: hue != null ? `hsl(${hue}, 30%, 18%)` : void_.inset,
        borderWidth: 1,
        borderColor: goldAlpha.edgeSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt size={13} weight="bold" color={gold.base}>
        {name.slice(0, 2).toUpperCase()}
      </Txt>
    </View>
  );
}
