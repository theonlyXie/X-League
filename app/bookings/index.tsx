import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { Divider } from '@/components/ui';
import { ArrowLeft, ChevronRight } from '@/components/icons';
import { gold, onVoid, radius, void_ } from '@/theme/tokens';
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

  const section = (title: string, list: PastBooking[]) =>
    list.length === 0 ? null : (
      <View style={{ gap: 0 }} key={title}>
        {/* `upper` rather than `toUpperCase()`: Arabic has no case, and
            uppercasing it is a no-op that still costs a needless transform. */}
        <Txt size={11} weight="semibold" em={0.08} upper color={onVoid.faint} style={{ paddingBottom: 6 }}>
          {title}
        </Txt>
        {list.map((b, i) => (
          <View key={b.bookingId}>
            {i > 0 ? <Divider /> : null}
            <Pressable
              accessibilityRole="button"
              // The code is what a player reads out at the gate, so it is the
              // handle the detail screen is addressed by. A booking that never
              // got one is still openable by id.
              onPress={() => router.push(`/bookings/${b.code ?? b.bookingId}`)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 }}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={13.5} weight="semibold" color={onVoid.primary}>
                  {b.venueName}
                </Txt>
                <Txt size={11.5} color={onVoid.faint}>
                  {[longDate(b.startsAt), hourLabel(new Date(b.startsAt).getHours()), b.pitchLabel]
                    .filter(Boolean)
                    .join(' · ')}
                </Txt>
                {/* Said rather than implied. A booking with no result yet is
                    the one thing on this screen a player can still act on. */}
                {b.awaitingResult ? (
                  <Txt size={11} color={gold.base}>
                    {t.bookingsAwaitingResult}
                  </Txt>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Txt size={11.5} color={onVoid.secondary}>
                  {stateLabel(b.state)}
                </Txt>
                {b.code ? (
                  <Txt size={11} weight="semibold" color={gold.base}>
                    {b.code}
                  </Txt>
                ) : null}
              </View>
              <ChevronRight size={14} color={onVoid.faint} />
            </Pressable>
          </View>
        ))}
      </View>
    );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: void_.bg }}
      contentContainerStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}
      showsVerticalScrollIndicator={false}
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
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
        <View style={{ gap: 2, flex: 1 }}>
          <Txt size={19} weight="bold" em={-0.02} color={onVoid.primary}>
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

      {section(t.bookingsUpcoming, upcoming)}
      {section(t.bookingsPast, past)}

      {/* Offered only when there might be more to show: a full page back from
          the server is the only evidence this list is not already complete. */}
      {extra === null && bookings.length >= PAGE ? (
        <Pressable accessibilityRole="button" onPress={showMore} hitSlop={8} disabled={loadingMore}>
          <Txt size={12.5} weight="semibold" color={loadingMore ? onVoid.faint : gold.base}>
            {t.bookingsShowMore}
          </Txt>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
