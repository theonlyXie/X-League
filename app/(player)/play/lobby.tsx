import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import {
  ActionButton,
  Card,
  MenuGroup,
  MenuRow,
  SectionTitle,
  Unreachable,
  VenuePhoto,
} from '@/components/kit';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { ChevronLeft, Megaphone, Plus, Swords, Trash } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { useBooking } from '@/state/booking';
import { useLobby } from '@/state/lobby';
import { leaveBooking, removeParticipant } from '@/data/squad';
import { cancelBooking } from '@/data/discovery';
import {
  bookingOpponent,
  respondToChallenge,
  withdrawChallenge,
  type Opponent,
} from '@/data/opponent';
import { isLive } from '@/lib/supabase';
import { useI18n } from '@/i18n';

/**
 * P-13 Match lobby — coordinate confirmed participants (§4.3).
 * TEAM-008: roster, open needs, venue, time and check-in state.
 *
 * The whole screen hangs off one booking id, which arrives in the URL. Home,
 * the confirmation screen and a notification all deep-link here, so the lobby
 * cannot assume it is showing "the" booking the app happens to have in memory.
 */
export default function Lobby() {
  const router = useRouter();
  const params = useLocalSearchParams<{ booking?: string }>();
  const { bookingId: heldBookingId, code } = useBooking();
  const bookingId = params.booking ?? heldBookingId;
  const lobby = useLobby(bookingId);
  const { reason, t, num, hour, shortDate, money } = useI18n();

  const [notice, setNotice] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const header = lobby.booking;
  const stages = [
    { label: t.held, done: true },
    { label: t.confirmed, done: true },
    { label: t.checkIn, done: header?.state === 'checked_in' || header?.state === 'completed' },
    { label: t.result, done: header?.state === 'completed' },
  ];

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={8}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}
        >
          <ChevronLeft size={22} color={onVoid.primary} />
        </Pressable>
        <View style={{ gap: 2, flex: 1 }}>
          <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary}>
            {t.matchLobbyTitle}
          </Txt>
          {/* A squad member is not the captain, so `my_bookings` returns
              them nothing and `header` is null — at which point this used to
              fall back to the spine's code, which for them is whatever the
              fixture or their own last booking left there. The venue and the
              pitch moved into the card below, so only the code is left here. */}
          {header?.code ? (
            <Txt size={11.5} weight="semibold" color={gold.base}>
              {header.code}
            </Txt>
          ) : null}
        </View>
      </View>

      {lobby.loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {lobby.denied ? <Unreachable label={lobby.denied} /> : null}

      {!lobby.loading && !lobby.denied ? (
        <>
          {/* What is being played, the checkout's summary card again, with
              the booking's life so far under it. */}
          <Card pad={12}>
            {header ? (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <VenuePhoto uri={header.coverUrl} height={96} round={radius.chip} style={{ width: 92 }} />
                <View style={{ flex: 1, gap: 4, paddingVertical: 2 }}>
                  <Txt size={15} weight="bold" color={onVoid.primary} numberOfLines={2}>
                    {header.venueName}
                  </Txt>
                  {header.pitchLabel ? (
                    <Txt size={12} color={onVoid.muted} numberOfLines={1}>
                      {header.pitchLabel}
                    </Txt>
                  ) : null}
                  <Txt size={12.5} weight="semibold" color={onVoid.primary}>
                    {shortDate(header.startsAt)} · {hour(header.startsAt)}
                  </Txt>
                  {header.area ? (
                    <Txt size={12} color={onVoid.muted} numberOfLines={1}>
                      {header.area}
                    </Txt>
                  ) : null}
                </View>
              </View>
            ) : null}
            {header ? <View style={{ height: 1, backgroundColor: onVoid.edgeFaint }} /> : null}
            <StageRail stages={stages} />
          </Card>

          {/* Who they are playing. Above the squad on purpose: a captain
              filling a team wants to know there is somebody to play before
              they call five people to a match that may not have an opponent. */}
          {bookingId ? (
            <OpponentSection
              bookingId={bookingId}
              amCaptain={Boolean(lobby.booking)}
              onNotice={setNotice}
            />
          ) : null}

          {/* The counts come from the server, not from counting this list. */}
          <Card>
            <SectionTitle
              title={t.squadTitle}
              right={
                lobby.counts ? (
                  <Txt size={11.5} color={onVoid.faint} style={{ flexShrink: 1, textAlign: 'right' }}>
                    {t.startersOf(
                      num(lobby.counts.acceptedStarters),
                      num(lobby.counts.starterCapacity),
                    )}
                    {lobby.counts.pending > 0 ? ` · ${t.awaitingReply(num(lobby.counts.pending))}` : ''}
                  </Txt>
                ) : null
              }
            />

            <View>
              {lobby.squad.map((member, i) => (
                <View
                  key={member.participantId}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 11,
                    borderTopWidth: i > 0 ? 1 : 0,
                    borderTopColor: onVoid.edgeFaint,
                  }}
                >
                  {/* An invitation still out is ringed in gold, where the
                      whole row used to be. */}
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: radius.pill,
                      backgroundColor: void_.inset,
                      borderWidth: 1,
                      borderColor: member.state === 'invited' ? goldAlpha.accent : onVoid.edgeFaint,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Txt size={12} weight="bold" color={gold.base}>
                      {member.displayName.slice(0, 2).toUpperCase()}
                    </Txt>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt size={14} weight="semibold" color={onVoid.primary} numberOfLines={1}>
                      {member.displayName}
                    </Txt>
                    <Txt size={11.5} color={member.state === 'invited' ? gold.base : onVoid.faint}>
                      {[
                        member.isCaptain ? t.captain : null,
                        member.slotKind === 'sub' ? t.sub : t.starter,
                        member.position,
                        member.state === 'invited' ? t.invited : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Txt>
                  </View>
                  {member.ovr != null ? (
                    <Txt size={15} weight="bold" color={gold.base}>
                      {num(member.ovr)}
                    </Txt>
                  ) : null}
                  {/* Where the lobby chat used to be. One button per person,
                      beside their name, rather than a room they all have to
                      remember to open. */}
                  {member.playerId && !member.isCaptain ? (
                    <WhatsAppButton
                      playerId={member.playerId}
                      label={t.whatsapp}
                      height={30}
                      size={11}
                      onNotice={setNotice}
                    />
                  ) : null}
                  {lobby.booking && !member.isCaptain ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t.removePlayer} ${member.displayName}`}
                      hitSlop={6}
                      onPress={async () => {
                        const res = await removeParticipant(member.participantId);
                        if (!res.ok) setNotice(reason(res.reason) ?? null);
                        lobby.reload();
                      }}
                      style={({ pressed }) => ({
                        width: 32,
                        height: 32,
                        borderRadius: radius.pill,
                        borderWidth: 1,
                        borderColor: pressed ? 'rgba(196,120,138,.45)' : onVoid.edge,
                        alignItems: 'center',
                        justifyContent: 'center',
                      })}
                    >
                      <Trash size={15} color={burgundy.action} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          </Card>

          {lobby.booking ? (
            <MenuGroup>
              <MenuRow
                icon={<Plus size={18} color={gold.base} />}
                title={t.invitePlayers}
                onPress={() => router.push(`/play/invite?booking=${bookingId}`)}
              />
              {/* Inviting is for the people you know. This is for the ones
                  you do not, and a captain who is two short at ten o'clock
                  the night before has run out of the first kind. */}
              <MenuRow
                icon={<Megaphone size={18} color={gold.base} />}
                title={t.callForPlayers}
                onPress={() => router.push(`/play/call?booking=${bookingId}`)}
              />
            </MenuGroup>
          ) : null}

          {notice ? (
            <Txt size={12} color={burgundy.action}>
              {notice}
            </Txt>
          ) : null}

          {/* BKG-008: the cancellation the checkout screen promised. */}
          {lobby.booking ? (
            <Card>
              <SectionTitle title={t.cancellationPolicy} />
              {lobby.terms ? (
                <Txt size={12.5} lh={1.55} color={onVoid.muted}>
                  {lobby.terms.freeNow
                    ? t.freeUntil(hour(lobby.terms.cutoffAt))
                    : t.cutoffPassed}
                </Txt>
              ) : null}

              {confirmCancel ? (
                <View style={{ gap: 10 }}>
                  <Txt size={14} weight="semibold" color={onVoid.primary}>
                    {t.cancelConfirm}
                  </Txt>
                  <Txt size={12.5} lh={1.55} color={onVoid.muted}>
                    {lobby.terms?.freeNow ? t.cancelFreeNote : t.cancelLateNote}
                  </Txt>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <ActionButton
                      label={t.cancelNow}
                      variant="danger"
                      flex
                      onPress={async () => {
                        if (!bookingId) return;
                        const res = await cancelBooking(bookingId).catch(() => ({
                          ok: false,
                          free: false,
                          reason: t.offline,
                        }));
                        if (!res.ok) {
                          setNotice(reason(res.reason) ?? null);
                          return;
                        }
                        // `free` is computed by the server and was thrown
                        // away here. It is the difference between walking
                        // away owing nothing and walking away owing the whole
                        // pitch price, and the player was bounced to Home
                        // without being told which.
                        if (res.free) router.replace('/');
                        else setNotice(t.cancelLateNote);
                      }}
                    />
                    <ActionButton
                      label={t.keepBooking}
                      variant="ghost"
                      flex
                      onPress={() => setConfirmCancel(false)}
                    />
                  </View>
                </View>
              ) : (
                <ActionButton
                  label={t.cancelBooking}
                  variant="danger"
                  onPress={() => setConfirmCancel(true)}
                />
              )}
            </Card>
          ) : (
            <ActionButton
              label={t.leaveMatch}
              variant="danger"
              onPress={async () => {
                if (!bookingId) return;
                const res = await leaveBooking(bookingId);
                if (res.ok) router.replace('/');
                else setNotice(reason(res.reason) ?? null);
              }}
            />
          )}
        </>
      ) : null}
    </Screen>
  );
}

/**
 * The opponent, from whichever side is reading.
 *
 * Three states and they are genuinely different: nobody invited, invited and
 * waiting, and on. The middle one is the reason this is not a single line of
 * text — "waiting for an answer" is a thing the captain has to be able to see
 * and to take back, and a screen that only shows an accepted opponent leaves
 * them unable to tell a slow reply from a failed tap.
 *
 * The opponent themselves lands here too, through the same booking, which is
 * why Accept and Decline are drawn from `mineToAnswer` rather than from
 * whether this reader happens to be the captain.
 */
function OpponentSection({
  bookingId,
  amCaptain,
  onNotice,
}: {
  bookingId: string;
  amCaptain: boolean;
  onNotice: (s: string | null) => void;
}) {
  const router = useRouter();
  const { reason, t } = useI18n();
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!isLive) return;
    bookingOpponent(bookingId)
      .then(setOpponent)
      .catch(() => {});
  }, [bookingId]);

  useEffect(load, [load]);

  async function answer(accept: boolean) {
    if (!opponent || busy) return;
    setBusy(true);
    const res = await respondToChallenge(opponent.challengeId, accept).catch(() => ({
      ok: false,
      reason: undefined,
    }));
    setBusy(false);
    if (!res.ok) onNotice(reason(res.reason) ?? t.errVenueCalendarRetry);
    else onNotice(accept ? null : t.opponentDeclinedKeepHour);
    load();
  }

  async function callOff() {
    if (busy) return;
    setBusy(true);
    const res = await withdrawChallenge(bookingId).catch(() => ({ ok: false, reason: undefined }));
    setBusy(false);
    if (!res.ok) onNotice(reason(res.reason) ?? t.errVenueCalendarRetry);
    load();
  }

  return (
    <Card>
      <SectionTitle title={t.opponent} />

      {!opponent ? (
        <>
          <Txt size={12.5} lh={1.55} color={onVoid.muted}>
            {t.noOpponentYet}
          </Txt>
          {amCaptain ? (
            <ActionButton
              label={t.inviteOpponent}
              variant="ghost"
              icon={<Swords size={18} color={gold.base} />}
              onPress={() => router.push(`/play/opponent?booking=${bookingId}`)}
            />
          ) : null}
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: radius.icon,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: goldAlpha.fill,
                borderWidth: 1,
                borderColor: opponent.state === 'accepted' ? goldAlpha.accent : 'transparent',
              }}
            >
              <Swords size={18} color={gold.base} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Txt size={14.5} weight="semibold" color={onVoid.primary}>
                {opponent.displayName}
              </Txt>
              <Txt
                size={11.5}
                weight={opponent.state === 'accepted' ? 'semibold' : 'regular'}
                color={opponent.state === 'accepted' ? gold.base : onVoid.faint}
              >
                {opponent.state === 'accepted' ? t.opponentAccepted : t.opponentInvited}
              </Txt>
            </View>
          </View>
          {opponent.note ? (
            <Txt size={12} lh={1.5} color={onVoid.muted}>
              {opponent.note}
            </Txt>
          ) : null}

          {/* Drawn from whose answer is owed, not from who is captain — the
              opponent reaches this same lobby. */}
          {opponent.mineToAnswer && opponent.state === 'invited' ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <ActionButton label={t.accept} flex disabled={busy} onPress={() => answer(true)} />
              <ActionButton
                label={t.decline}
                variant="ghost"
                flex
                disabled={busy}
                onPress={() => answer(false)}
              />
            </View>
          ) : null}

          {amCaptain && opponent.state === 'invited' ? (
            <ActionButton label={t.callItOff} variant="ghost" disabled={busy} onPress={callOff} />
          ) : null}
        </>
      )}
    </Card>
  );
}

/** The booking's life so far, as the lobby header shows it (§7.2). */
function StageRail({ stages }: { stages: { label: string; done: boolean }[] }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {stages.map((stage, i) => (
        <View key={stage.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: radius.pill,
              backgroundColor: stage.done ? gold.base : 'rgba(243,238,229,.18)',
            }}
          />
          <Txt size={10.5} weight={stage.done ? 'semibold' : 'regular'} color={stage.done ? gold.base : onVoid.dim}>
            {stage.label}
          </Txt>
          {i < stages.length - 1 ? (
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(243,238,229,.1)' }} />
          ) : null}
        </View>
      ))}
    </View>
  );
}
