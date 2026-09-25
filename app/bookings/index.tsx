import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, Share as NativeShare, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { VenuePhoto } from '@/components/kit';
import { ChevronLeft, Close, Share, Star } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { myBookings, type PastBooking } from '@/data/discovery';
import type { BookingState } from '@/data/api';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';
import { useCard } from '@/state/card';

/**
 * P-10 — every hour this player has booked.
 *
 * Home shows the next booking and the card screen shows finished matches as
 * evidence, which between them left a player with no way to answer "what was
 * the code for last Tuesday?" — the one question a venue asks at the gate.
 *
 * The first page costs nothing: `CardProvider` already fetches these rows for
 * its own use and used to discard all but the unreported ones, so this paints
 * from state the app is holding rather than opening a second connection.
 */
const PAGE = 20;
const MORE = 100;

export default function Bookings() {
  const router = useRouter();
  const { t, num, longDate, hourLabel } = useI18n();
  const { signedIn } = useSession();
  const { bookings, loading, unreachable, reload } = useCard();

  // Only set once the player asks for more, so the provider's rows stay the
  // source until there is a reason for them not to be.
  const [extra, setExtra] = useState<PastBooking[] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const rows = extra ?? bookings;

  const showMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      setExtra(await myBookings(MORE));
    } catch {
      // Leave the rows that are already on screen alone. Replacing a list that
      // works with an error because the *second* page failed would take away
      // something the player already had.
    } finally {
      setLoadingMore(false);
    }
  }, []);

  const stateLabel = (state: BookingState) =>
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

  const now = Date.now();
  const upcoming = rows.filter((b) => new Date(b.startsAt).getTime() >= now);
  const past = rows.filter((b) => new Date(b.startsAt).getTime() < now);

  const share = (b: PastBooking) => {
    const when = `${longDate(b.startsAt)} · ${hourLabel(new Date(b.startsAt).getHours())}`;
    NativeShare.share({ message: t.shareBookingMessage(b.venueName, when, b.code ?? '', '') }).catch(() => {});
  };

  /**
   * The redesign's booking card: picture, facts, and an action bar under
   * them. The card itself opens the detail screen, which holds the code a
   * venue asks for at the gate.
   */
  const card = (b: PastBooking, upcomingRow: boolean) => {
    const canCancel = upcomingRow && (b.state === 'confirmed' || b.state === 'held');
    const owesReview = b.awaitingResult || (b.state === 'completed' && !b.reviewed);
    return (
      <View
        key={b.bookingId}
        style={{
          borderRadius: radius.cardInner,
          borderWidth: 1,
          borderColor: onVoid.edge,
          backgroundColor: void_.surface,
          overflow: 'hidden',
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${b.venueName}, ${stateLabel(b.state)}`}
          // The code is what a player reads out at the gate, so it is the
          // handle the detail screen is addressed by. A booking that never
          // got one is still openable by id.
          onPress={() => router.push(`/bookings/${b.code ?? b.bookingId}`)}
          style={({ pressed }) => ({ flexDirection: 'row', backgroundColor: pressed ? goldAlpha.fillSoft : 'transparent' })}
        >
          <VenuePhoto uri={b.coverUrl} height={112} style={{ width: 104 }} />
          <View style={{ flex: 1, gap: 4, padding: 12 }}>
            <Txt size={14.5} weight="bold" color={onVoid.primary} numberOfLines={1}>
              {b.venueName}
            </Txt>
            <Txt size={11.5} color={onVoid.faint} numberOfLines={1}>
              {b.pitchLabel}
            </Txt>
            <Txt size={12.5} weight="semibold" color={onVoid.primary}>
              {`${longDate(b.startsAt)} | ${hourLabel(new Date(b.startsAt).getHours())}`}
            </Txt>
            {b.area ? (
              <Txt size={11.5} color={onVoid.faint} numberOfLines={1}>
                {b.area}
              </Txt>
            ) : null}
            {b.code ? (
              <Txt size={11} weight="semibold" color={gold.base}>
                {b.code}
              </Txt>
            ) : null}
          </View>
        </Pressable>

        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: onVoid.edgeFaint }}>
          {upcomingRow ? (
            <BarButton label={t.share} onPress={() => share(b)} icon={<Share size={16} color={gold.base} />} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11 }}>
              <View
                style={{
                  paddingVertical: 4,
                  paddingHorizontal: 12,
                  borderRadius: radius.badge,
                  backgroundColor: b.state === 'completed' || b.state === 'checked_in' ? goldAlpha.fill : 'rgba(243,238,229,.06)',
                }}
              >
                <Txt size={11.5} weight="bold" color={b.state === 'completed' || b.state === 'checked_in' ? gold.base : onVoid.muted}>
                  {stateLabel(b.state)}
                </Txt>
              </View>
            </View>
          )}
          <View style={{ width: 1, backgroundColor: onVoid.edgeFaint }} />
          {canCancel ? (
            // Cancelling lives in the lobby and is linked to rather than
            // rebuilt: it is a decision with money attached, and a second
            // implementation is a second chance to get it wrong.
            <BarButton
              label={t.cancelBooking}
              tone="danger"
              onPress={() => router.push(`/play/lobby?booking=${b.bookingId}`)}
              icon={<Close size={16} color={burgundy.action} />}
            />
          ) : owesReview ? (
            <BarButton
              label={b.awaitingResult ? t.resultGoTo : t.rateVenue}
              onPress={() => router.push(`/play/result?booking=${b.bookingId}`)}
              icon={<Star size={14} color={gold.base} />}
            />
          ) : upcomingRow ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Txt size={11.5} weight="semibold" color={onVoid.muted}>
                {stateLabel(b.state)}
              </Txt>
            </View>
          ) : (
            <BarButton label={t.bookAgain} onPress={() => b.venueId && router.push(`/play/venue?venue=${b.venueId}`)} />
          )}
        </View>
      </View>
    );
  };

  const section = (title: string, list: PastBooking[], upcomingRows: boolean) =>
    list.length === 0 ? null : (
      <View style={{ gap: 12 }} key={title}>
        <Txt size={17} weight="bold" color={onVoid.primary}>
          {title}
        </Txt>
        {list.map((b) => card(b, upcomingRows))}
      </View>
    );

  // `Screen` rather than a bare ScrollView: this screen used to draw its own,
  // which meant it reserved no safe-area inset — its back arrow sat under the
  // status bar on any device with a notch — and it was one of only two player
  // screens with no top bar, so the refresh control and the language switch
  // that every other screen carries were missing from it.
  return (
    <Screen
      contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => {
            setExtra(null);
            void reload();
          }}
          tintColor={gold.base}
        />
      }
    >
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
            {t.bookingsTitle}
          </Txt>
          <Txt size={11.5} color={onVoid.faint}>
            {t.bookingsBlurb}
          </Txt>
        </View>
      </View>

      {loading && rows.length === 0 ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {/* Three different silences, told apart. Not signed in, nothing booked,
          and could not read the list are separate problems, and only the last
          one is worth pulling to refresh over. */}
      {!loading && rows.length === 0 ? (
        <View style={{ gap: 6 }}>
          <Txt size={15} weight="semibold" color={onVoid.primary}>
            {unreachable ? t.listUnreachable : t.bookingsEmpty}
          </Txt>
          <Txt size={12.5} lh={1.55} color={onVoid.muted}>
            {unreachable ? t.listUnreachableBlurb : t.bookingsEmptyBlurb}
          </Txt>
          {!unreachable && isLive && signedIn ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/play')} hitSlop={8}>
              <Txt size={12.5} weight="semibold" color={gold.base}>
                {t.bookingsFindOne}
              </Txt>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {section(t.bookingsUpcoming, upcoming, true)}
      {section(t.bookingsPast, past, false)}

      {/* Offered only when there might be more to show: a full page back from
          the server is the only evidence this list is not already complete. */}
      {extra === null && bookings.length >= PAGE ? (
        <Pressable accessibilityRole="button" onPress={showMore} hitSlop={8} disabled={loadingMore}>
          <Txt size={12.5} weight="semibold" color={loadingMore ? onVoid.faint : gold.base}>
            {t.bookingsShowMore}
          </Txt>
        </Pressable>
      ) : null}
    </Screen>
  );
}

function BarButton({
  label,
  onPress,
  icon,
  tone = 'plain',
}: {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  tone?: 'plain' | 'danger';
}) {
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
        gap: 7,
        paddingVertical: 12,
        backgroundColor: pressed ? 'rgba(198,163,75,.07)' : 'transparent',
      })}
    >
      {icon}
      <Txt size={12.5} weight="semibold" color={tone === 'danger' ? burgundy.action : onVoid.primary}>
        {label}
      </Txt>
    </Pressable>
  );
}
