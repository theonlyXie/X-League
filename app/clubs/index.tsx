import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Divider, Eyebrow } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { PressScale, Reveal } from '@/components/motion';
import { ArrowLeft } from '@/components/icons';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { createClub, myClubs, respondToClubInvite, type ClubSummary } from '@/data/clubs';
import { useI18n } from '@/i18n';
import { useRefreshTick } from '@/state/refresh';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';

/**
 * The clubs a player belongs to, and the form that founds one.
 *
 * The captain-plays switch is off by default and says why underneath. That is
 * the rule people get wrong — a club of a captain and six players looks like
 * seven and is six — and the moment to say it is while somebody is deciding,
 * not when the server refuses their entry a week later.
 */
export default function Clubs() {
  const { signedIn } = useSession();
  const router = useRouter();
  const { reason, t, num } = useI18n();

  // The refresh button in the top bar.
  const tick = useRefreshTick();
  const [clubs, setClubs] = useState<ClubSummary[]>([]);
  const [loading, setLoading] = useState(isLive);
  /** §4.7: a list we could not read is not an empty list. */
  const [unreachable, setUnreachable] = useState(false);
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [captainPlays, setCaptainPlays] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!isLive || !signedIn) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await myClubs();
        if (!cancelled) {
          setClubs(rows);
          setUnreachable(false);
        }
      } catch {
        if (!cancelled) {
          setClubs([]);
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

  const invited = clubs.filter((c) => c.state === 'invited');
  const active = clubs.filter((c) => c.state === 'active');

  async function found() {
    if (!name.trim() || creating) return;
    setCreating(true);
    setNotice(null);
    try {
      const res = await createClub(
        name.trim(),
        area.trim() || undefined,
        captainPlays ? 'starter' : null,
      );
      if (res.ok) {
        setName('');
        setArea('');
        setCaptainPlays(false);
        if (res.clubId) router.push(`/clubs/${res.clubId}`);
        else reload();
      } else {
        setNotice(reason(res.reason) ?? null);
      }
    } catch {
      setNotice(t.offline);
    } finally {
      setCreating(false);
    }
  }

  async function answer(clubId: string, accept: boolean) {
    try {
      const res = await respondToClubInvite(clubId, accept);
      if (!res.ok) setNotice(reason(res.reason) ?? null);
    } catch {
      setNotice(t.offline);
    } finally {
      reload();
    }
  }

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
            borderColor: onVoid.line,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={16} color={onVoid.secondary} />
        </Pressable>
        <Txt size={20} weight="semibold" color={onVoid.primary}>
          {t.clubs}
        </Txt>
      </View>

      <Txt size={13} lh={1.5} color={onVoid.muted}>
        {t.clubsBlurb}
      </Txt>

      {loading ? <ActivityIndicator color={gold.base} /> : null}

      {unreachable ? (
        <Txt size={13} color={onVoid.muted}>
          {t.offline}
        </Txt>
      ) : null}

      {invited.length ? (
        <View style={{ gap: 10 }}>
          <Eyebrow>{t.clubInvitePending}</Eyebrow>
          {invited.map((club) => (
            <View
              key={club.clubId}
              style={{
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: goldAlpha.edge,
                backgroundColor: void_.surface,
                padding: 14,
                gap: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar
                  name={club.name}
                  url={club.crestUrl}
                  size={40}
                  radius={radius.chip}
                  background={void_.raised}
                  border={goldAlpha.edge}
                  color={gold.base}
                />
                <View style={{ flex: 1 }}>
                  <Txt size={15} weight="semibold" color={onVoid.primary}>
                    {club.name}
                  </Txt>
                  {club.homeArea ? (
                    <Txt size={12} color={onVoid.dim}>
                      {club.homeArea}
                    </Txt>
                  ) : null}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label={t.joinClub} flex={1} onPress={() => answer(club.clubId, true)} />
                <Button
                  label={t.declineClub}
                  variant="ghost"
                  flex={1}
                  onPress={() => answer(club.clubId, false)}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <Eyebrow>{t.myClubs}</Eyebrow>
        {!loading && !unreachable && !active.length ? (
          <Txt size={13} color={onVoid.muted}>
            {t.noClubsYet}
          </Txt>
        ) : null}
        {active.map((club, i) => (
          <Reveal key={club.clubId} index={i}>
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={club.name}
              onPress={() => router.push(`/clubs/${club.clubId}`)}
              style={{
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: onVoid.edge,
                backgroundColor: void_.surface,
                padding: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Avatar
                name={club.name}
                url={club.crestUrl}
                size={44}
                radius={radius.chip}
                background={void_.raised}
                border={goldAlpha.edge}
                color={gold.base}
              />
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={15} weight="semibold" color={onVoid.primary}>
                  {club.name}
                </Txt>
                <Txt size={12} color={onVoid.dim}>
                  {club.isCaptain ? t.captain : club.slotKind ? t.clubSquad : t.doesNotPlay}
                  {club.trophies > 0 ? ` · ${t.trophyCount(num(club.trophies))}` : ''}
                </Txt>
              </View>
              <Txt size={11} weight="medium" color={club.eligible ? gold.base : onVoid.dim}>
                {club.eligible ? t.readyToEnter : t.notReadyToEnter}
              </Txt>
            </PressScale>
          </Reveal>
        ))}
      </View>

      <Divider />

      <View style={{ gap: 12 }}>
        <Eyebrow>{t.newClub}</Eyebrow>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t.clubName}
          placeholderTextColor={onVoid.disabled}
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
        <TextInput
          value={area}
          onChangeText={setArea}
          placeholder={t.clubHomePlaceholder}
          placeholderTextColor={onVoid.disabled}
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

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Switch
            value={captainPlays}
            onValueChange={setCaptainPlays}
            trackColor={{ false: onVoid.edge, true: goldAlpha.fill }}
            thumbColor={captainPlays ? gold.base : onVoid.disabled}
            accessibilityLabel={t.captainPlays}
          />
          <Txt size={13} color={onVoid.secondary} style={{ flex: 1 }}>
            {t.captainPlays}
          </Txt>
        </View>
        <Txt size={12} lh={1.5} color={onVoid.dim}>
          {t.captainPlaysNote}
        </Txt>

        <Button
          label={t.foundIt}
          disabled={!name.trim() || creating}
          onPress={found}
        />
        {notice ? (
          <Txt size={12} color={onVoid.muted}>
            {notice}
          </Txt>
        ) : null}
      </View>
    </Screen>
  );
}
