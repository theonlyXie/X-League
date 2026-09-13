import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { TextInput } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { Button, Divider } from '@/components/ui';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
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

  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.back}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/bookings'))}
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
  );

  // `Screen` for the same three reasons as the list next door: the safe-area
  // inset this drew over, the top bar it was missing, and the keyboard that
  // used to sit on top of the payment-reference field near the bottom.
  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {back}
        <View style={{ gap: 2, flex: 1 }}>
          <Txt size={19} weight="bold" em={-0.02} color={onVoid.primary}>
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
          {/* The code first and largest. It is the only thing on this screen
              somebody needs while standing at a gate with a phone in one hand. */}
          {booking.code ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: onVoid.line,
                borderRadius: radius.card,
                padding: 16,
                gap: 4,
              }}
            >
              <Txt size={11} weight="semibold" em={0.08} upper color={onVoid.faint}>
                {t.bookingCode}
              </Txt>
              <Txt size={28} weight="bold" em={0.04} color={gold.base}>
                {booking.code}
              </Txt>
            </View>
          ) : null}

          <View style={{ gap: 0 }}>
            <Row label={t.bookingsState} value={stateLabel(booking.state)} />
            <Divider />
            <Row label={t.bookingsPitch} value={booking.pitchLabel} />
            <Divider />
            <Row label={t.bookingsPrice} value={money(booking.priceEgp)} />
          </View>

          {/* What is still owed, and by when it can be undone — the two facts
              a player checks before the day arrives.

              Withheld on a booking that never happened. `booking_terms` reports
              the balance from the price whatever the state, so an expired hold
              rendered "EGP 300 due at the venue" beside a closed cancellation
              window: a bill for a pitch nobody took, and a cutoff for a
              cancellation there is nothing left to cancel. */}
          {terms && booking.state !== 'expired' && booking.state !== 'cancelled' ? (
            <View style={{ gap: 6 }}>
              <Txt size={12.5} color={onVoid.secondary}>
                {terms.balanceEgp > 0 ? t.bookingsDueAtVenue(money(terms.balanceEgp)) : t.bookingsSettled}
              </Txt>
              <Txt size={11.5} color={onVoid.faint}>
                {terms.freeNow ? t.freeUntil(moment(terms.cutoffAt)) : t.cutoffPassed}
              </Txt>
            </View>
          ) : null}

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
            <View style={{ gap: 0 }}>
              <Txt size={11} weight="semibold" em={0.08} upper color={onVoid.faint} style={{ paddingBottom: 6 }}>
                {t.squadTitle}
              </Txt>
              {squad.map((m, i) => (
                <View key={m.participantId}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 }}>
                    <Txt size={13} weight="semibold" color={onVoid.primary} style={{ flex: 1 }}>
                      {m.displayName}
                    </Txt>
                    {m.isCaptain ? (
                      <Txt size={11} color={gold.base}>
                        {t.captain}
                      </Txt>
                    ) : null}
                    {/* Null for a guest with no account, and left blank rather
                        than shown as a zero somebody could mistake for a score. */}
                    {m.ovr !== null ? (
                      <Txt size={12} weight="semibold" color={onVoid.secondary}>
                        {num(m.ovr)}
                      </Txt>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ gap: 10 }}>
            {/* One screen hosts both the score and the pitch review, so this is
                one link with two names rather than two links to the same
                place. Which name depends on what is actually outstanding. */}
            {booking.awaitingResult || (booking.state === 'completed' && !booking.reviewed) ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/play/result?booking=${booking.bookingId}`)}
                hitSlop={8}
              >
                <Txt size={13} weight="semibold" color={gold.base}>
                  {booking.awaitingResult ? t.resultGoTo : t.bookingsReviewIt}
                </Txt>
              </Pressable>
            ) : null}

            {booking.reviewed ? (
              <Txt size={12.5} color={onVoid.faint}>
                {t.bookingsReviewed}
              </Txt>
            ) : null}

            {/* Cancelling lives in the lobby, and is linked to rather than
                rebuilt here. It is a decision with money attached — free
                before the cutoff, the full pitch price after — and a second
                implementation of that is a second chance to get it wrong. */}
            {booking.state === 'confirmed' || booking.state === 'held' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/play/lobby?booking=${booking.bookingId}`)}
                hitSlop={8}
              >
                <Txt size={13} weight="semibold" color={onVoid.secondary}>
                  {t.matchLobby}
                </Txt>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      <Txt size={12.5} color={onVoid.faint} style={{ flex: 1 }}>
        {label}
      </Txt>
      <Txt size={13} weight="semibold" color={onVoid.primary}>
        {value}
      </Txt>
    </View>
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
      <Txt size={12.5} color={gold.base}>
        {t.paySettled}
      </Txt>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <Txt size={11} weight="semibold" em={0.08} upper color={onVoid.faint}>
        {t.payTitle}
      </Txt>

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
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: goldAlpha.edge,
                backgroundColor: void_.surface,
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
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: onVoid.line,
              backgroundColor: void_.surface,
              paddingHorizontal: 13,
              paddingTop: 11,
              color: onVoid.primary,
            }}
          />
          <Button
            label={t.payISentIt}
            disabled={busy || note.trim().length < 3}
            onPress={() => void claim()}
          />
        </View>
      ) : (
        <Button label={t.payISentIt} variant="ghost" height={44} onPress={() => setOpen(true)} />
      )}
    </View>
  );
}
