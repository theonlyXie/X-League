import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { PressScale, Reveal } from '@/components/motion';
import { ActionButton, Card, MenuGroup, MenuRow, SectionTitle, Unreachable } from '@/components/kit';
import { ChevronDown, ChevronLeft, LogOut, Pencil, Trophy, Users } from '@/components/icons';
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
 *
 * In the redesign's layout: a header card with the crest and the facts, the
 * captain's tools as menu rows, then one card per part of the squad and one
 * for what the club has won.
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

  const squadProps = {
    open,
    setOpen,
    canManage,
    captainId,
    clubId: club?.clubId ?? '',
    meId: session?.user?.id ?? null,
    busy,
    act,
    setNotice,
    t,
    num,
  };

  const starters = squad.filter((m) => m.state === 'active' && m.slotKind === 'starter');
  const subs = squad.filter((m) => m.state === 'active' && m.slotKind === 'sub');
  const bench = squad.filter((m) => m.state === 'active' && !m.slotKind);
  const pending = squad.filter((m) => m.state === 'invited');

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 20 }}>
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
        <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary} style={{ flex: 1 }} numberOfLines={1}>
          {club?.name ?? t.clubs}
        </Txt>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}
      {unreachable ? <Unreachable label={t.offline} onRetry={reload} /> : null}

      {/* Three ways this screen has nothing to draw, and they are different
          things to be told: no account, no such club, and a club that could
          not be read. Rendering the header alone for the first two is how a
          screen ends up saying nothing at all. */}
      {!signedIn ? (
        <Card>
          <Txt size={13} lh={1.5} color={onVoid.muted}>
            {t.signInToSee}
          </Txt>
          <ActionButton label={t.signIn} onPress={() => router.push('/sign-in?next=/clubs')} />
        </Card>
      ) : null}

      {signedIn && !loading && !unreachable && !club ? (
        <Txt size={13} lh={1.5} color={onVoid.muted}>
          {t.noSuchClub}
        </Txt>
      ) : null}

      {club ? (
        <>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar
              name={club.name}
              url={club.crestUrl}
              size={68}
              radius={radius.card}
              background={void_.raised}
              border={goldAlpha.edge}
              color={gold.base}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Txt size={17} weight="bold" color={gold.base} numberOfLines={2}>
                {club.name}
              </Txt>
              {club.homeArea ? (
                <Txt size={12} color={onVoid.faint}>
                  {club.homeArea}
                </Txt>
              ) : null}
              <Txt size={12.5} weight="semibold" color={onVoid.secondary}>
                {t.squadOf(num(club.starters), num(club.subs))}
              </Txt>
              <Txt
                size={12}
                weight="semibold"
                color={club.eligible ? gold.base : burgundy.action}
              >
                {/* When the club is waiting on admission the banner below says
                    so at length; repeating it here as a one-liner reads as two
                    different problems. */}
                {club.eligible
                  ? t.readyToEnter
                  : club.verification !== 'verified'
                    ? t.notReadyToEnter
                    : (reason(club.reason) ?? t.notReadyToEnter)}
              </Txt>
            </View>
          </Card>

          {/* Admission comes before the squad count. A captain looking at a
              club that cannot enter needs to know which of the two reasons it
              is: five more players is work they can do tonight, and waiting on
              X League is not. */}
          {club.verification !== 'verified' ? (
            <View
              style={{
                padding: 14,
                borderRadius: radius.row,
                borderWidth: 1,
                borderColor: club.verification === 'rejected' ? 'rgba(101,21,37,.5)' : goldAlpha.frame,
                backgroundColor:
                  club.verification === 'rejected' ? 'rgba(101,21,37,.09)' : goldAlpha.fill,
                gap: 5,
              }}
            >
              <Txt
                size={13.5}
                weight="semibold"
                color={club.verification === 'rejected' ? burgundy.action : gold.base}
              >
                {club.verification === 'rejected' ? t.clubRejected : t.clubPending}
              </Txt>
              <Txt size={11.5} lh={1.5} color={onVoid.secondary}>
                {club.verification === 'rejected' ? t.clubRejectedBlurb : t.clubPendingBlurb}
              </Txt>
            </View>
          ) : null}

          {club.verification === 'verified' && !club.eligible ? (
            <Txt size={12} lh={1.5} color={onVoid.dim}>
              {t.needFive}
            </Txt>
          ) : null}

          {/* The captain's tools, as rows rather than a pair of buttons: they
              are places to go, and the account menu already taught where
              those live. */}
          {canManage ? (
            <MenuGroup>
              <MenuRow
                icon={<Users size={19} color={gold.base} />}
                title={t.invitePlayers}
                onPress={() => router.push(`/clubs/${club.clubId}/invite`)}
              />
              <MenuRow
                icon={<Pencil size={19} color={gold.base} />}
                title={busy ? t.uploading : t.changeCrest}
                onPress={busy ? undefined : changeCrest}
              />
            </MenuGroup>
          ) : null}

          {notice ? (
            <Txt size={12} color={burgundy.action}>
              {notice}
            </Txt>
          ) : null}

          <View style={{ gap: 12 }}>
            <SectionTitle title={t.clubSquad} />
            <Group label={t.starters} members={starters} {...squadProps} />
            <Group label={t.substitutes} members={subs} {...squadProps} />
            <Group label={t.doesNotPlay} members={bench} {...squadProps} />
            <Group label={t.clubInvitePending} members={pending} {...squadProps} />
          </View>

          <View style={{ gap: 12 }}>
            <SectionTitle title={t.honours} />
            {!honours.length ? (
              <Txt size={13} color={onVoid.muted}>
                {t.noHonoursYet}
              </Txt>
            ) : (
              <MenuGroup>
                {honours.map((h, i) => (
                  <Reveal key={`${h.title}-${h.wonOn}-${i}`} index={Math.min(i, 7)}>
                    <MenuRow
                      icon={<Trophy size={19} color={gold.base} />}
                      title={h.title}
                      detail={[h.region, h.wonOn].filter(Boolean).join(' · ')}
                    />
                  </Reveal>
                ))}
              </MenuGroup>
            )}
          </View>

          {!canManage ? (
            <MenuGroup>
              <MenuRow
                icon={<LogOut size={19} color={burgundy.action} />}
                title={t.leaveTheClub}
                tone="danger"
                onPress={() => act(() => leaveClub(club.clubId))}
              />
            </MenuGroup>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

/**
 * The squad rows, defined at module scope.
 *
 * These were declared inside the screen. A component created during render is
 * a new component *type* on every render, so React threw the whole squad away
 * and rebuilt it every time anything changed — each row's press animation and
 * shared values torn down and recreated on every tap. That is churn on the web
 * and something worse on a device.
 */
type RowProps = {
  member: ClubMember;
  open: string | null;
  setOpen: (id: string | null) => void;
  canManage: boolean;
  captainId: string | null;
  clubId: string;
  /** The viewer, so nobody is offered a button that opens their own number. */
  meId: string | null;
  busy: boolean;
  act: (fn: () => Promise<{ ok: boolean; reason?: string }>) => void;
  setNotice: (sentence: string | null) => void;
  t: ReturnType<typeof useI18n>['t'];
  num: ReturnType<typeof useI18n>['num'];
};

type GroupProps = Omit<RowProps, 'member'> & {
  label: string;
  members: ClubMember[];
};

function Row({
  member,
  open,
  setOpen,
  canManage,
  captainId,
  clubId,
  meId,
  busy,
  act,
  setNotice,
  t,
  num,
}: RowProps) {
  const expanded = open === member.playerId;
  const manageable = canManage && member.playerId !== captainId;
  return (
    <View style={{ gap: 10, paddingVertical: 12, paddingHorizontal: 14 }}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={member.displayName}
        accessibilityState={manageable ? { expanded } : undefined}
        disabled={!manageable}
        onPress={() => setOpen(expanded ? null : member.playerId)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Avatar
          name={member.displayName}
          url={member.photoUrl}
          size={40}
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
          {/* What this member was promised. On the row rather than behind the
              expander, because the captain's own record of who is owed what is
              the thing this feature exists to keep. */}
          {member.bountyPct != null ? (
            <Txt size={11} color={gold.base}>
              {t.bountyShare(num(member.bountyPct))}
            </Txt>
          ) : null}
        </View>
        {member.ovr != null ? (
          <View
            style={{
              minWidth: 36,
              paddingVertical: 4,
              paddingHorizontal: 8,
              borderRadius: radius.badge,
              backgroundColor: goldAlpha.fill,
              alignItems: 'center',
            }}
          >
            <Txt size={13} weight="bold" color={gold.base}>
              {num(member.ovr)}
            </Txt>
          </View>
        ) : null}
        {/* Only rows the captain can act on open, so only they say so. */}
        {manageable ? (
          <View style={expanded ? { transform: [{ rotate: '180deg' }] } : null}>
            <ChevronDown size={16} color={onVoid.dim} />
          </View>
        ) : null}
      </PressScale>

      {/* The club room was a chat this app hosted. This is the same squad,
          reached where they already talk. */}
      {member.playerId !== meId && member.state === 'active' ? (
        <WhatsAppButton
          playerId={member.playerId}
          label={t.whatsapp}
          height={32}
          size={11.5}
          onNotice={setNotice}
        />
      ) : null}

      {expanded ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {member.slotKind !== 'starter' ? (
            <Button
              label={t.makeStarter}
              variant="ghost"
              height={36}
              size={12}
              onPress={() => act(() => setClubSlot(clubId, member.playerId, 'starter'))}
            />
          ) : null}
          {member.slotKind !== 'sub' ? (
            <Button
              label={t.makeSub}
              variant="ghost"
              height={36}
              size={12}
              onPress={() => act(() => setClubSlot(clubId, member.playerId, 'sub'))}
            />
          ) : null}
          {member.slotKind ? (
            <Button
              label={t.benchMember}
              variant="ghost"
              height={36}
              size={12}
              onPress={() => act(() => setClubSlot(clubId, member.playerId, null))}
            />
          ) : null}
          <Button
            label={t.handOver}
            variant="ghost"
            height={36}
            size={12}
            onPress={() => act(() => handOverClub(clubId, member.playerId))}
          />
          <Button
            label={t.removeMember}
            variant="danger"
            height={36}
            size={12}
            onPress={() => act(() => removeFromClub(clubId, member.playerId))}
          />
        </View>
      ) : null}
    </View>
  );
}

function Group({ label, members, ...shared }: GroupProps) {
  if (!members.length) return null;
  return (
    <View
      style={{
        borderRadius: radius.cardInner,
        borderWidth: 1,
        borderColor: onVoid.edge,
        backgroundColor: void_.surface,
        overflow: 'hidden',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, paddingHorizontal: 14 }}>
        <Txt size={13.5} weight="bold" color={onVoid.secondary}>
          {label}
        </Txt>
        <Txt size={12} weight="semibold" color={onVoid.faint}>
          {shared.num(members.length)}
        </Txt>
      </View>
      {members.map((m, i) => (
        <View key={m.playerId} style={i > 0 ? { borderTopWidth: 1, borderTopColor: onVoid.edgeFaint } : null}>
          <Row member={m} {...shared} />
        </View>
      ))}
    </View>
  );
}
