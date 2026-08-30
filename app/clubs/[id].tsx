import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Divider, Eyebrow } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { PressScale, Reveal } from '@/components/motion';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import {
  clubDetail,
  clubHonours,
  clubSquad,
  handOverClub,
  leaveClub,
  removeFromClub,
  setClubCrest,
  setClubSlot,
  type ClubDetail,
  type ClubMember,
  type Honour,
  type SlotKind,
} from '@/data/clubs';
import { pickAndUpload } from '@/lib/upload';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';

/**
 * One club: its crest, whether it can enter anything, its squad and what it has
 * won.
 *
 * The eligibility line is the first thing under the name because it is the
 * question a captain opens this screen to answer, and it says what the club is
 * short of rather than only that it is short. `club_eligibility` produces that
 * sentence; nothing is recomputed here from the list of members, which would be
 * a second answer able to disagree with the one the server refuses entries on.
 */
export default function ClubPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { reason, t, num } = useI18n();
  const { signedIn, session } = useSession();

  const [club, setClub] = useState<ClubDetail | null>(null);
  const [squad, setSquad] = useState<ClubMember[]>([]);
  const [honours, setHonours] = useState<Honour[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [unreachable, setUnreachable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!isLive || !signedIn || !id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [detail, members, won] = await Promise.all([
          clubDetail(id),
          clubSquad(id),
          clubHonours(id),
        ]);
        if (!cancelled) {
          setClub(detail);
          setSquad(members);
          setHonours(won);
          setUnreachable(false);
        }
      } catch {
        if (!cancelled) setUnreachable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, nonce, signedIn]);

  // Whether the captain controls are offered at all. The server decides who
  // may actually use them — this only stops the screen showing a row of
  // buttons that every one of a club's ten players would watch fail.
  const captainId = club?.captainId ?? null;
  const canManage = !!captainId && captainId === session?.user?.id;

  async function act(fn: () => Promise<{ ok: boolean; reason?: string }>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setNotice(reason(res.reason) ?? t.offline);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        void Haptics.selectionAsync();
      }
    } catch {
      setNotice(t.offline);
    } finally {
      setBusy(false);
      setOpen(null);
      reload();
    }
  }

  async function changeCrest() {
    if (!club || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const picked = await pickAndUpload('crests', club.clubId);
      if (picked.status === 'ok') {
        const res = await setClubCrest(club.clubId, picked.url);
        if (!res.ok) setNotice(reason(res.reason) ?? t.uploadFailed);
      } else if (picked.status === 'denied') setNotice(t.photoPermission);
      else if (picked.status === 'too-large') setNotice(t.photoTooLarge);
      else if (picked.status === 'failed') setNotice(t.uploadFailed);
    } catch {
      setNotice(t.uploadFailed);
    } finally {
      setBusy(false);
      reload();
    }
  }

  const starters = squad.filter((m) => m.state === 'active' && m.slotKind === 'starter');
  const subs = squad.filter((m) => m.state === 'active' && m.slotKind === 'sub');
  const bench = squad.filter((m) => m.state === 'active' && !m.slotKind);
  const pending = squad.filter((m) => m.state === 'invited');

  function Row({ member }: { member: ClubMember }) {
    const expanded = open === member.playerId;
    return (
      <View style={{ gap: 8 }}>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={member.displayName}
          disabled={!canManage || member.playerId === captainId}
          onPress={() => setOpen(expanded ? null : member.playerId)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 8,
          }}
        >
          <Avatar
            name={member.displayName}
            url={member.photoUrl}
            size={36}
            background={void_.raised}
            border={onVoid.edge}
            color={onVoid.secondary}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt size={14} weight="semibold" color={onVoid.primary}>
              {member.displayName}
            </Txt>
            <Txt size={11.5} color={onVoid.faint}>
              {member.playerId === captainId ? t.captain : null}
              {member.playerId === captainId && member.state === 'invited' ? ' · ' : ''}
              {member.state === 'invited' ? t.clubInvitePending : ''}
              {member.playerId !== captainId && member.state !== 'invited' && !member.slotKind
                ? t.doesNotPlay
                : ''}
            </Txt>
          </View>
          {member.ovr != null ? (
            <Txt size={13} weight="bold" color={gold.base}>
              {num(member.ovr)}
            </Txt>
          ) : null}
        </PressScale>

        {expanded ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 6 }}>
            {member.slotKind !== 'starter' ? (
              <Button
                label={t.makeStarter}
                variant="ghost"
                height={36}
                size={12}
                onPress={() => act(() => setClubSlot(club!.clubId, member.playerId, 'starter'))}
              />
            ) : null}
            {member.slotKind !== 'sub' ? (
              <Button
                label={t.makeSub}
                variant="ghost"
                height={36}
                size={12}
                onPress={() => act(() => setClubSlot(club!.clubId, member.playerId, 'sub'))}
              />
            ) : null}
            {member.slotKind ? (
              <Button
                label={t.benchMember}
                variant="ghost"
                height={36}
                size={12}
                onPress={() => act(() => setClubSlot(club!.clubId, member.playerId, null))}
              />
            ) : null}
            <Button
              label={t.handOver}
              variant="ghost"
              height={36}
              size={12}
              onPress={() => act(() => handOverClub(club!.clubId, member.playerId))}
            />
            <Button
              label={t.removeMember}
              variant="danger"
              height={36}
              size={12}
              onPress={() => act(() => removeFromClub(club!.clubId, member.playerId))}
            />
          </View>
        ) : null}
      </View>
    );
  }

  function Group({ label, members }: { label: string; members: ClubMember[] }) {
    if (!members.length) return null;
    return (
      <View style={{ gap: 2 }}>
        <Eyebrow>{label}</Eyebrow>
        {members.map((m) => (
          <Row key={m.playerId} member={m} />
        ))}
      </View>
    );
  }

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/clubs'))}
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
        <Txt size={20} weight="semibold" color={onVoid.primary} style={{ flex: 1 }}>
          {club?.name ?? t.clubs}
        </Txt>
      </View>

      {loading ? <ActivityIndicator color={gold.base} /> : null}
      {unreachable ? (
        <Txt size={13} color={onVoid.muted}>
          {t.offline}
        </Txt>
      ) : null}

      {/* Three ways this screen has nothing to draw, and they are different
          things to be told: no account, no such club, and a club that could
          not be read. Rendering the header alone for the first two is how a
          screen ends up saying nothing at all. */}
      {!signedIn ? (
        <View style={{ gap: 12 }}>
          <Txt size={13} lh={1.5} color={onVoid.muted}>
            {t.signInToSee}
          </Txt>
          <Button label={t.signIn} onPress={() => router.push('/sign-in?next=/clubs')} />
        </View>
      ) : null}

      {signedIn && !loading && !unreachable && !club ? (
        <Txt size={13} lh={1.5} color={onVoid.muted}>
          {t.noSuchClub}
        </Txt>
      ) : null}

      {club ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar
              name={club.name}
              url={club.crestUrl}
              size={64}
              radius={radius.card}
              background={void_.raised}
              border={goldAlpha.edge}
              color={gold.base}
            />
            <View style={{ flex: 1, gap: 4 }}>
              {club.homeArea ? (
                <Txt size={12} color={onVoid.dim}>
                  {club.homeArea}
                </Txt>
              ) : null}
              <Txt size={13} color={onVoid.secondary}>
                {t.squadOf(num(club.starters), num(club.subs))}
              </Txt>
              <Txt
                size={12}
                weight="medium"
                color={club.eligible ? gold.base : burgundy.action}
              >
                {club.eligible ? t.readyToEnter : (reason(club.reason) ?? t.notReadyToEnter)}
              </Txt>
            </View>
          </View>

          {!club.eligible ? (
            <Txt size={12} lh={1.5} color={onVoid.dim}>
              {t.needFive}
            </Txt>
          ) : null}

          {canManage ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                label={busy ? t.uploading : t.changeCrest}
                variant="ghost"
                flex={1}
                disabled={busy}
                onPress={changeCrest}
              />
              <Button
                label={t.invitePlayers}
                flex={1}
                onPress={() => router.push(`/clubs/${club.clubId}/invite`)}
              />
            </View>
          ) : null}

          {notice ? (
            <Txt size={12} color={burgundy.action}>
              {notice}
            </Txt>
          ) : null}

          <Divider />

          <View style={{ gap: 14 }}>
            <Group label={t.starters} members={starters} />
            <Group label={t.substitutes} members={subs} />
            <Group label={t.doesNotPlay} members={bench} />
            <Group label={t.clubInvitePending} members={pending} />
          </View>

          <Divider />

          <View style={{ gap: 10 }}>
            <Eyebrow>{t.honours}</Eyebrow>
            {!honours.length ? (
              <Txt size={13} color={onVoid.muted}>
                {t.noHonoursYet}
              </Txt>
            ) : null}
            {honours.map((h, i) => (
              <Reveal key={`${h.title}-${h.wonOn}-${i}`} index={i}>
                <View
                  style={{
                    borderRadius: radius.row,
                    borderWidth: 1,
                    borderColor: goldAlpha.edge,
                    backgroundColor: void_.inset,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    gap: 3,
                  }}
                >
                  <Txt size={14} weight="semibold" color={gold.base}>
                    {h.title}
                  </Txt>
                  <Txt size={11.5} color={onVoid.faint}>
                    {[h.region, h.wonOn].filter(Boolean).join(' · ')}
                  </Txt>
                </View>
              </Reveal>
            ))}
          </View>

          {!canManage ? (
            <Button label={t.leaveTheClub} variant="ghost" onPress={() => act(() => leaveClub(club.clubId))} />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
