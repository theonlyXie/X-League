import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Divider, Eyebrow } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { createTeam, myTeams, respondToTeamInvite, type Team } from '@/data/squad';
import { useI18n } from '@/i18n';
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
  const { t, num } = useI18n();

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
  }, [nonce, signedIn]);

  const invited = teams.filter((team) => team.state === 'invited');
  const active = teams.filter((team) => team.state === 'active');

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
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
        <Txt size={19} weight="bold" em={-0.02} color={onVoid.primary}>
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
          <Eyebrow>{t.invitation}</Eyebrow>
          {invited.map((team) => (
            <View
              key={team.teamId}
              style={{
                padding: 16,
                borderRadius: radius.cardInner,
                backgroundColor: void_.surface,
                borderWidth: 1,
                borderColor: goldAlpha.edgeSoft,
                gap: 12,
              }}
            >
              <View style={{ gap: 3 }}>
                <Txt size={14.5} weight="semibold" color={onVoid.primary}>
                  {team.name}
                </Txt>
                <Txt size={11.5} color={onVoid.faint}>
                  {t.members(num(team.members))}
                  {team.homeArea ? ` · ${team.homeArea}` : ''}
                </Txt>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  label={t.joinTeam}
                  variant="accept"
                  flex={1}
                  height={38}
                  round={radius.chip}
                  size={13}
                  onPress={async () => {
                    await respondToTeamInvite(team.teamId, true);
                    reload();
                  }}
                />
                <Button
                  label={t.declineTeam}
                  variant="decline"
                  flex={1}
                  height={38}
                  round={radius.chip}
                  size={13}
                  onPress={async () => {
                    await respondToTeamInvite(team.teamId, false);
                    reload();
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}

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

      <View style={{ gap: 8 }}>
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
              paddingVertical: 13,
              paddingHorizontal: 14,
              borderRadius: radius.control,
              backgroundColor: void_.surface,
              borderWidth: 1,
              borderColor: pressed ? goldAlpha.edge : onVoid.edgeFaint,
            })}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: radius.chip,
                backgroundColor:
                  team.crestHue != null ? `hsl(${team.crestHue}, 30%, 18%)` : void_.inset,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt size={12} weight="bold" color={gold.base}>
                {team.name.slice(0, 2).toUpperCase()}
              </Txt>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt size={14} weight="semibold" color={onVoid.primary}>
                {team.name}
              </Txt>
              <Txt size={11.5} color={onVoid.faint}>
                {t.members(num(team.members))}
                {team.role === 'captain' ? ` · ${t.captain}` : ''}
              </Txt>
            </View>
          </Pressable>
        ))}
      </View>

      <Divider />

      <View style={{ gap: 10 }}>
        <Eyebrow>{t.newTeam}</Eyebrow>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t.teamName}
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
            label={t.create}
            height={46}
            disabled={creating || name.trim().length < 2}
            onPress={async () => {
              setCreating(true);
              const res = await createTeam(name.trim());
              setCreating(false);
              if (res.ok) {
                setName('');
                setNotice(null);
                reload();
              } else {
                setNotice(res.reason ?? null);
              }
            }}
          />
        </View>
        {notice ? (
          <Txt size={12} color={burgundy.action}>
            {notice}
          </Txt>
        ) : null}
      </View>
    </Screen>
  );
}
