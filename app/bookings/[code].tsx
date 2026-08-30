import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { Divider } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { gold, onVoid, radius, void_ } from '@/theme/tokens';
import { bookingTerms, myBookings, type BookingTerms, type PastBooking } from '@/data/discovery';
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: void_.bg }}
      contentContainerStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
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
    </ScrollView>
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
