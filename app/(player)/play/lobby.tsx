import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Divider, Eyebrow } from '@/components/ui';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { useBooking } from '@/state/booking';
import { useLobby } from '@/state/lobby';
import { leaveBooking, removeParticipant } from '@/data/squad';
import { cancelBooking } from '@/data/discovery';
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
            {t.matchLobbyTitle}
          </Txt>
          <Txt size={11.5} color={onVoid.faint}>
            {/* A squad member is not the captain, so `my_bookings` returns
                them nothing and `header` is null — at which point this used to
                fall back to the spine's code, which for them is whatever the
                fixture or their own last booking left there. */}
            {[header?.code, header?.venueName, header?.pitchLabel]
              .filter(Boolean)
              .join(' · ')}
          </Txt>
        </View>
      </View>

      {lobby.loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {lobby.denied ? (
        <View
          style={{
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: radius.chip,
            borderWidth: 1,
            borderColor: 'rgba(101,21,37,.5)',
            backgroundColor: 'rgba(101,21,37,.09)',
          }}
        >
          <Txt size={13} weight="semibold" color={burgundy.action}>
            {lobby.denied}
          </Txt>
        </View>
      ) : null}

      {!lobby.loading && !lobby.denied ? (
        <>
          <StageRail stages={stages} />

          {header ? (
            <View style={{ gap: 4 }}>
              <Txt size={15} weight="semibold" color={onVoid.primary}>
                {shortDate(header.startsAt)} · {hour(header.startsAt)}
              </Txt>
              {header.area ? (
                <Txt size={12} color={onVoid.muted}>
                  {header.area}
                </Txt>
              ) : null}
            </View>
          ) : null}

          {/* The counts come from the server, not from counting this list. */}
          <View style={{ gap: 12 }}>
            <View
              style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
            >
              <Eyebrow>{t.squadTitle}</Eyebrow>
              {lobby.counts ? (
                <Txt size={11.5} color={onVoid.faint}>
                  {t.startersOf(
                    num(lobby.counts.acceptedStarters),
                    num(lobby.counts.starterCapacity),
                  )}
                  {lobby.counts.pending > 0 ? ` · ${t.awaitingReply(num(lobby.counts.pending))}` : ''}
                </Txt>
              ) : null}
            </View>

            <View style={{ gap: 8 }}>
              {lobby.squad.map((member) => (
                <View
                  key={member.participantId}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 11,
                    paddingHorizontal: 14,
                    borderRadius: radius.control,
                    backgroundColor: void_.surface,
                    borderWidth: 1,
                    borderColor:
                      member.state === 'invited' ? goldAlpha.edgeSoft : onVoid.edgeFaint,
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
                      {member.displayName.slice(0, 2).toUpperCase()}
                    </Txt>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt size={13.5} weight="semibold" color={onVoid.primary}>
                      {member.displayName}
                    </Txt>
                    <Txt size={11} color={onVoid.faint}>
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
                    <Txt size={14} weight="bold" color={gold.base}>
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
                      hitSlop={10}
                      onPress={async () => {
                        const res = await removeParticipant(member.participantId);
                        if (!res.ok) setNotice(reason(res.reason) ?? null);
                        lobby.reload();
                      }}
                    >
                      <Txt size={11} color={burgundy.action}>
                        {t.removePlayer}
                      </Txt>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>

            {lobby.booking ? (
              <View style={{ gap: 8 }}>
                <Button
                  label={t.invitePlayers}
                  variant="ghost"
                  height={42}
                  onPress={() => router.push(`/play/invite?booking=${bookingId}`)}
                />
                {/* Inviting is for the people you know. This is for the ones
                    you do not, and a captain who is two short at ten o'clock
                    the night before has run out of the first kind. */}
                <Button
                  label={t.callForPlayers}
                  variant="ghost"
                  height={42}
                  onPress={() => router.push(`/play/call?booking=${bookingId}`)}
                />
              </View>
            ) : null}
          </View>

          {notice ? (
            <Txt size={12} color={burgundy.action}>
              {notice}
            </Txt>
          ) : null}

          <Divider />

          {/* BKG-008: the cancellation the checkout screen promised. */}
          {lobby.booking ? (
            <View style={{ gap: 10 }}>
              {lobby.terms ? (
                <Txt size={11.5} color={onVoid.faint}>
                  {lobby.terms.freeNow
                    ? t.freeUntil(hour(lobby.terms.cutoffAt))
                    : t.cutoffPassed}
                </Txt>
              ) : null}

              {confirmCancel ? (
                <View style={{ gap: 10 }}>
                  <Txt size={13} weight="semibold" color={onVoid.primary}>
                    {t.cancelConfirm}
                  </Txt>
                  <Txt size={12} color={onVoid.muted}>
                    {lobby.terms?.freeNow ? t.cancelFreeNote : t.cancelLateNote}
                  </Txt>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button
                      label={t.cancelNow}
                      variant="decline"
                      flex={1}
                      height={42}
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
                    <Button
                      label={t.keepBooking}
                      variant="ghost"
                      flex={1}
                      height={42}
                      onPress={() => setConfirmCancel(false)}
                    />
                  </View>
                </View>
              ) : (
                <Button
                  label={t.cancelBooking}
                  variant="decline"
                  height={42}
                  onPress={() => setConfirmCancel(true)}
                />
              )}
            </View>
          ) : (
            <Button
              label={t.leaveMatch}
              variant="decline"
              height={42}
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
