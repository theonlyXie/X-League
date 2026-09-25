import { ReactNode, useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Share as NativeShare, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { TextInput } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { ActionButton, Card, MenuGroup, MenuRow, SectionTitle, Tag, VenuePhoto } from '@/components/kit';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { CheckCircle, ChevronLeft, Clock, Share, Star, User, Users } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import { bookingTerms, myBookings, type BookingTerms, type PastBooking } from '@/data/discovery';
import {
  claimBookingPayment,
  venuePaymentChannels,
  type ChannelKind,
  type VenueChannel,
} from '@/data/venueMoney';
import { bookingSquad, type SquadMember } from '@/data/squad';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';
import { useCard } from '@/state/card';

/**
 * One booking, addressed by the code the player reads out at the gate.
 *
 * Everything here is asked of the server rather than carried in from the list:
 * a screen reached from a stale list, or by opening the URL directly, has to be
 * as correct as one reached by tapping. The list's copy is used only for the
 * first paint, so the screen is never blank while the truth is in flight.
 */
export default function BookingDetail() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { t, num, money, longDate, hourLabel, moment } = useI18n();
  const { signedIn } = useSession();
  const { bookings } = useCard();

  // The code is the address, but a booking that never got one is still
  // reachable by id — which is what the list falls back to when it links.
  const fromList = bookings.find((b) => b.code === code || b.bookingId === code) ?? null;

  const [booking, setBooking] = useState<PastBooking | null>(fromList);
  const [squad, setSquad] = useState<SquadMember[]>([]);
  const [terms, setTerms] = useState<BookingTerms | null>(null);
  const [loading, setLoading] = useState(isLive && signedIn);

  const load = useCallback(async () => {
    if (!isLive || !signedIn) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // A wider page than the list holds, because a code typed into the URL
      // may well be older than the twenty rows the provider keeps.
      const rows = await myBookings(200);
      const found = rows.find((b) => b.code === code || b.bookingId === code) ?? null;
      setBooking(found);

      if (found) {
        // Independently caught: a booking whose squad or terms cannot be read
        // is still a booking worth showing, and blanking the whole screen over
        // one absent section would hide the code the player came here for.
        const [s, tm] = await Promise.all([
          bookingSquad(found.bookingId).catch(() => [] as SquadMember[]),
          bookingTerms(found.bookingId).catch(() => null),
        ]);
        setSquad(s);
        setTerms(tm);
      }
    } catch {
      // The rows already on screen came from this player's own list, so
      // they are left alone rather than blanked over a failed refresh.
    } finally {
      setLoading(false);
    }
  }, [code, signedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  const stateLabel = (state: PastBooking['state']) =>
    ({
      held: t.bookingStateHeld,
      pending_payment: t.bookingStatePendingPayment,
      confirmed: t.bookingStateConfirmed,
      checked_in: t.bookingStateCheckedIn,
      completed: t.bookingStateCompleted,
      expired: t.bookingStateExpired,
      cancelled: t.bookingStateCancelled,
      no_show: t.bookingStateNoShow,
    })[state];

  // Nothing to take to a gate or pass round the group once the hour is gone
  // for good, so the card stops offering to share it.
  const over = (s: PastBooking['state']) => s === 'expired' || s === 'cancelled' || s === 'no_show';
  const canShare = !!booking?.code && !over(booking.state);
  const canLobby = booking?.state === 'confirmed' || booking?.state === 'held';

  const share = () => {
    if (!booking) return;
    const when = `${longDate(booking.startsAt)} · ${hourLabel(new Date(booking.startsAt).getHours())}`;
    NativeShare.share({
      message: t.shareBookingMessage(
        [booking.venueName, booking.pitchLabel].filter(Boolean).join(' · '),
        when,
        booking.code ?? '',
        '',
      ),
    }).catch(() => {});
  };

  // `Screen` for the same three reasons as the list next door: the safe-area
  // inset this drew over, the top bar it was missing, and the keyboard that
  // used to sit on top of the payment-reference field near the bottom.
  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/bookings'))}
          hitSlop={8}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}
        >
          <ChevronLeft size={22} color={onVoid.primary} />
        </Pressable>
        <View style={{ gap: 2, flex: 1 }}>
          <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary} numberOfLines={1}>
            {booking?.venueName ?? t.bookingsTitle}
          </Txt>
          {booking ? (
            <Txt size={11.5} color={onVoid.faint}>
              {[longDate(booking.startsAt), hourLabel(new Date(booking.startsAt).getHours())].join(' · ')}
            </Txt>
          ) : null}
        </View>
      </View>

      {loading && !booking ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {/* Signed out and "no such booking" are different answers, and the second
          one would be a guess: without an account there is nothing to look the
          code up against, so the screen says what is actually true. Saying
          nothing at all is what it did first, and a screen that renders only a
          heading is how a dead end looks like a bug. */}
      {!loading && !booking ? (
        <View style={{ gap: 6 }}>
          <Txt size={15} weight="semibold" color={onVoid.primary}>
            {signedIn && isLive ? t.bookingsNotFound : t.bookingsSignedOut}
          </Txt>
          <Txt size={12.5} lh={1.55} color={onVoid.muted}>
            {signedIn && isLive ? t.bookingsNotFoundBlurb : t.bookingsSignedOutBlurb}
          </Txt>
          {!signedIn && isLive ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/sign-in?next=/bookings')}
              hitSlop={8}
            >
              <Txt size={12.5} weight="semibold" color={gold.base}>
                {t.signIn}
              </Txt>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {booking ? (
        <>
          {/* The confirmation screen's summary card, for any booking: the
              picture, the code, the facts, and the two things a player does
              with it next. */}
          <Card pad={0} style={{ overflow: 'hidden', gap: 0 }}>
            <View>
              <VenuePhoto uri={booking.coverUrl} height={132} />
              <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row' }}>
                <Tag
                  label={stateLabel(booking.state)}
                  tone={booking.state === 'confirmed' || booking.state === 'checked_in' ? 'gold' : 'plain'}
                />
              </View>
            </View>

            <View style={{ padding: 16, gap: 14 }}>
              {/* The code first and largest. It is the only thing on this screen
                  somebody needs while standing at a gate with a phone in one hand. */}
              {booking.code ? (
                <View
                  style={{
                    padding: 14,
                    borderRadius: radius.row,
                    backgroundColor: void_.bg,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: 'rgba(198,163,75,.35)',
                    gap: 4,
                  }}
                  accessibilityLabel={t.bookingCodeIs(booking.code)}
                >
                  <Txt size={9.5} em={0.2} upper color={onVoid.dim}>
                    {t.bookingCode}
                  </Txt>
                  <Txt size={24} weight="bold" em={0.14} color={gold.base} style={{ fontFamily: mono }}>
                    {booking.code}
                  </Txt>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 }}>
                <Fact label={t.bookingsState} value={stateLabel(booking.state)} />
                <Fact label={t.bookingsPitch} value={booking.pitchLabel} />
                <Fact label={t.bookingsPrice} value={money(booking.priceEgp)} />
                <Fact
                  label={t.time}
                  value={[longDate(booking.startsAt), hourLabel(new Date(booking.startsAt).getHours())].join(' · ')}
                />
              </View>

              {/* What is still owed, and by when it can be undone — the two facts
                  a player checks before the day arrives.

                  Withheld on a booking that never happened. `booking_terms` reports
                  the balance from the price whatever the state, so an expired hold
                  rendered "EGP 300 due at the venue" beside a closed cancellation
                  window: a bill for a pitch nobody took, and a cutoff for a
                  cancellation there is nothing left to cancel. */}
              {terms && booking.state !== 'expired' && booking.state !== 'cancelled' ? (
                <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: onVoid.edgeFaint, paddingTop: 12 }}>
                  <Txt size={13} weight="semibold" color={terms.balanceEgp > 0 ? onVoid.primary : gold.base}>
                    {terms.balanceEgp > 0 ? t.bookingsDueAtVenue(money(terms.balanceEgp)) : t.bookingsSettled}
                  </Txt>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Clock size={13} color={onVoid.faint} />
                    <Txt size={11.5} color={onVoid.faint} style={{ flexShrink: 1 }}>
                      {terms.freeNow ? t.freeUntil(moment(terms.cutoffAt)) : t.cutoffPassed}
                    </Txt>
                  </View>
                </View>
              ) : null}
            </View>

            {canShare || canLobby ? (
              <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: onVoid.edgeFaint }}>
                {canShare ? (
                  <BarButton label={t.share} onPress={share} icon={<Share size={17} color={gold.base} />} />
                ) : null}
                {canShare && canLobby ? <View style={{ width: 1, backgroundColor: onVoid.edgeFaint }} /> : null}
                {/* Cancelling lives in the lobby, and is linked to rather than
                    rebuilt here. It is a decision with money attached — free
                    before the cutoff, the full pitch price after — and a second
                    implementation of that is a second chance to get it wrong. */}
                {canLobby ? (
                  <BarButton
                    label={t.matchLobby}
                    onPress={() => router.push(`/play/lobby?booking=${booking.bookingId}`)}
                    icon={<Users size={17} color={gold.base} />}
                  />
                ) : null}
              </View>
            ) : null}
          </Card>

          {/* Where the money goes, and the captain's half of agreeing it went.
              Only while there is still something outstanding: a settled booking
              has nothing to send and nothing to claim, and offering either
              would be inviting somebody to pay twice. */}
          {terms &&
          booking.state !== 'expired' &&
          booking.state !== 'cancelled' &&
          terms.balanceEgp > 0 ? (
            <PayBlock
              bookingId={booking.bookingId}
              venueId={terms.venueId}
              claimedAt={terms.paymentClaimedAt}
              settled={terms.balanceSettled}
              onClaimed={() => void load()}
            />
          ) : null}

          {squad.length ? (
            <View style={{ gap: 12 }}>
              <SectionTitle title={t.squadTitle} />
              <MenuGroup>
                {squad.map((m) => (
                  <MenuRow
                    key={m.participantId}
                    icon={<User size={18} color={gold.base} />}
                    title={m.displayName}
                    detail={m.isCaptain ? t.captain : null}
                    // Null for a guest with no account, and left blank rather
                    // than shown as a zero somebody could mistake for a score.
                    right={
                      m.ovr !== null ? (
                        <Txt size={13} weight="bold" color={onVoid.secondary}>
                          {num(m.ovr)}
                        </Txt>
                      ) : undefined
                    }
                  />
                ))}
              </MenuGroup>
            </View>
          ) : null}

          {/* One screen hosts both the score and the pitch review, so this is
              one link with two names rather than two links to the same
              place. Which name depends on what is actually outstanding. */}
          {booking.awaitingResult || (booking.state === 'completed' && !booking.reviewed) ? (
            <ActionButton
              label={booking.awaitingResult ? t.resultGoTo : t.bookingsReviewIt}
              icon={<Star size={16} color={void_.bg} />}
              onPress={() => router.push(`/play/result?booking=${booking.bookingId}`)}
            />
          ) : null}

          {booking.reviewed ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <CheckCircle size={16} color={gold.base} />
              <Txt size={12.5} color={onVoid.faint}>
                {t.bookingsReviewed}
              </Txt>
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '50%', gap: 4, paddingRight: 10 }}>
      <Txt size={11} color={onVoid.faint}>
        {label}
      </Txt>
      <Txt size={13} weight="semibold" color={onVoid.primary}>
        {value}
      </Txt>
    </View>
  );
}

function BarButton({ label, onPress, icon }: { label: string; onPress: () => void; icon?: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        backgroundColor: pressed ? goldAlpha.fillSoft : 'transparent',
      })}
    >
      {icon}
      <Txt size={13} weight="semibold" color={onVoid.primary}>
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * Where to send the money, and the captain saying they sent it.
 *
 * The venue's wallet is asked for rather than assumed: a venue that has not
 * set one up is told about honestly — pay at the gate — instead of the screen
 * showing an empty box or, worse, a number from somewhere else.
 *
 * "I have sent it" is a claim, and the copy says so. It does not mark the
 * booking paid; it tells the venue to go and look. Once it is made, this
 * becomes a statement of where things stand and a way into the room, because
 * the next thing a captain wants after claiming is usually to ask whether it
 * landed.
 */
function PayBlock({
  bookingId,
  venueId,
  claimedAt,
  settled,
  onClaimed,
}: {
  bookingId: string;
  venueId: string;
  claimedAt: string | null;
  settled: boolean;
  onClaimed: () => void;
}) {
  const router = useRouter();
  const { reason, t } = useI18n();
  const [channels, setChannels] = useState<VenueChannel[]>([]);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    venuePaymentChannels(venueId)
      .then((rows) => {
        if (!cancelled) setChannels(rows.filter((c) => c.active));
      })
      .catch(() => {
        /* No channels is a real answer, and so is a failure to read them. Both
           end at the same honest sentence below rather than an empty box. */
      });
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  const kindLabel = (k: ChannelKind) =>
    k === 'wallet'
      ? t.payWallet
      : k === 'instapay'
        ? t.payInstapay
        : k === 'bank'
          ? t.payBank
          : t.payContact;

  const claim = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await claimBookingPayment(bookingId, channels[0]?.kind ?? 'wallet', note);
      if (res.ok) {
        setOpen(false);
        setNote('');
        onClaimed();
      } else {
        setNotice(reason(res.reason) ?? null);
      }
    } catch {
      setNotice(t.offline);
    } finally {
      setBusy(false);
    }
  };

  if (settled) {
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <CheckCircle size={18} color={gold.base} />
          <Txt size={13} weight="semibold" color={gold.base} style={{ flex: 1 }}>
            {t.paySettled}
          </Txt>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle title={t.payTitle} />

      {channels.length === 0 ? (
        <Txt size={12.5} lh={1.5} color={onVoid.muted}>
          {t.payNoChannels}
        </Txt>
      ) : (
        <View style={{ gap: 10 }}>
          <Txt size={11.5} color={onVoid.faint}>
            {t.payWhereToSend}
          </Txt>
          {channels.map((c) => (
            <View
              key={c.channelId}
              style={{
                padding: 12,
                borderRadius: radius.row,
                borderWidth: 1,
                borderColor: goldAlpha.edge,
                backgroundColor: void_.bg,
                gap: 3,
              }}
            >
              <Txt size={10} weight="bold" em={0.08} upper color={onVoid.dim}>
                {kindLabel(c.kind)} · {c.label}
              </Txt>
              <Txt size={15} weight="semibold" color={gold.base}>
                {c.value}
              </Txt>
              {c.instructions ? (
                <Txt size={11.5} lh={1.45} color={onVoid.muted}>
                  {c.instructions}
                </Txt>
              ) : null}
            </View>
          ))}
          <Txt size={11.5} color={onVoid.faint}>
            {t.payAtGateInstead}
          </Txt>
        </View>
      )}

      {notice ? (
        <Txt size={12} color={burgundy.action}>
          {notice}
        </Txt>
      ) : null}

      {claimedAt ? (
        <View style={{ gap: 6 }}>
          <Txt size={12.5} weight="semibold" color={gold.base}>
            {t.payClaimed}
          </Txt>
          <Txt size={11.5} lh={1.5} color={onVoid.muted}>
            {t.payClaimedBlurb}
          </Txt>
          {/* The thread a captain and a venue settled a payment in is gone.
              This is the same conversation, on the venue's own number. */}
          <WhatsAppButton
            bookingId={bookingId}
            label={t.payTalkToVenue}
            height={42}
            onNotice={setNotice}
          />
        </View>
      ) : open ? (
        <View style={{ gap: 10 }}>
          <Txt size={11.5} color={onVoid.faint}>
            {t.payNoteLabel}
          </Txt>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t.payNotePlaceholder}
            placeholderTextColor={onVoid.disabled}
            multiline
            style={{
              minHeight: 62,
              borderRadius: radius.row,
              borderWidth: 1,
              borderColor: onVoid.line,
              backgroundColor: void_.bg,
              paddingHorizontal: 13,
              paddingTop: 11,
              color: onVoid.primary,
            }}
          />
          <ActionButton
            label={t.payISentIt}
            disabled={busy || note.trim().length < 3}
            onPress={() => void claim()}
          />
        </View>
      ) : (
        <ActionButton label={t.payISentIt} variant="ghost" onPress={() => setOpen(true)} />
      )}
    </Card>
  );
}
