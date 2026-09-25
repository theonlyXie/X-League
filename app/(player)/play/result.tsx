import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import {
  ActionButton,
  BackHeader,
  Card,
  SafeTop,
  SectionTitle,
  StickyFooter,
  Unreachable,
  VenuePhoto,
} from '@/components/kit';
import { Star } from '@/components/icons';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { completeMatch, matchAgreement } from '@/data/progress';
import { myBookings, submitReview, type PastBooking } from '@/data/discovery';
import { useCard } from '@/state/card';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * MCH-001 — the step the product was missing.
 *
 * `complete_match` is the only path to `award_match_points`, so until this
 * screen existed the whole progression system — points, XP, levels, and the
 * peer ratings that depend on a match existing — was reachable in SQL and
 * unreachable from a phone. A booking that nobody reports stays a booking.
 *
 * The score is optional on purpose. Five-a-side often ends without anyone
 * agreeing what the score was, and the evidence that matters for the card is
 * that the match was played and checked in, not who won. Reporting it without
 * a score still credits everybody; a result reported later corrects it rather
 * than creating a second match.
 */
export default function ReportResult() {
  const router = useRouter();
  const params = useLocalSearchParams<{ booking?: string }>();
  const bookingId = params.booking ?? null;
  const { reason, t, num, moment } = useI18n();
  const { reload: reloadCard } = useCard();

  const [booking, setBooking] = useState<PastBooking | null>(null);
  const [loading, setLoading] = useState(isLive);
  const [error, setError] = useState<string | null>(null);
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [saving, setSaving] = useState(false);
  // VEN-008. `submit_review` was granted and tested and had no caller
  // anywhere: the pitch page and the owner's reviews tab both *display*
  // reviews, and nothing in the product could create one, so a venue's rating
  // could only ever come from seed data. This is the moment to ask — the
  // player has just played there and is already telling us how it went.
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState('');

  // The booking is fetched rather than passed through params so the screen can
  // name the venue and hour it is asking about — reporting a score against a
  // bare id is how somebody reports the wrong match.
  useEffect(() => {
    if (!isLive || !bookingId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await myBookings(50);
        if (cancelled) return;
        setBooking(rows.find((b) => b.bookingId === bookingId) ?? null);
      } catch {
        if (!cancelled) setError(t.errBookingUnreadable);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const submit = async (withScore: boolean) => {
    if (!bookingId) return;
    setSaving(true);
    // The review goes first and its failure is not fatal. A venue rating that
    // could not be saved must never cost the player their match result, which
    // is the thing the whole progression system hangs on.
    if (stars > 0) {
      await submitReview(bookingId, stars, note.trim() || undefined).catch(() => null);
    }
    const res = await completeMatch(
      bookingId,
      withScore ? home : null,
      withScore ? away : null,
    );
    setSaving(false);
    if (!res.ok) {
      setError(reason(res.reason) ?? null);
      return;
    }
    setError(null);
    // Points were just awarded, so the card this app is holding is stale.
    void reloadCard();
    if (!res.matchId) {
      router.replace('/me');
      return;
    }
    // A cup tie has another captain, and nothing is awarded until they say the
    // same thing — so this report is half of a result, and the next screen is
    // where that is visible rather than a silence in the ledger. A casual
    // booking has no second side and goes straight on to rating, which is the
    // moment the squad is still fresh in mind.
    const state = await matchAgreement(res.matchId).catch(() => null);
    if (state?.twoSided) router.replace(`/play/agree?match=${res.matchId}`);
    else router.replace(`/play/rate?match=${res.matchId}`);
  };

  // In the venue's zone, through the same formatter as every other date in
  // the app. `toLocaleString(undefined, …)` used the *device's* zone, so a
  // player abroad — or simply on a handset set to the wrong city — was asked
  // to confirm a match at an hour it did not kick off at.
  const when = booking ? moment(booking.startsAt) : null;

  // Its own header rather than `Screen`'s, so the report can sit in a pinned
  // bar like checkout's. The keyboard handling `Screen` gave for free is kept
  // here by hand: the review note is typed near the bottom of the page.
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: void_.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeTop />
      <BackHeader
        title={t.resultTitle}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 16 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <Txt size={12.5} lh={1.55} color={onVoid.muted}>
          {t.resultBlurb}
        </Txt>

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={gold.base} />
          </View>
        ) : null}

        {error ? <Unreachable label={error} /> : null}

        {/* Which match, in words. */}
        {booking ? (
          <Card pad={12}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <VenuePhoto uri={booking.coverUrl} height={72} round={radius.chip} style={{ width: 80 }} />
              <View style={{ flex: 1, gap: 4 }}>
                <Txt size={15} weight="bold" color={onVoid.primary} numberOfLines={2}>
                  {booking.venueName}
                </Txt>
                <Txt size={12} color={onVoid.muted}>
                  {booking.pitchLabel}
                  {when ? ` · ${when}` : ''}
                </Txt>
              </View>
            </View>
          </Card>
        ) : null}

        {!loading ? (
          <>
            <Card>
              <SectionTitle title={t.refereeScore} />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <ScoreDial label={t.resultHome} value={home} onChange={setHome} format={num} />
                <ScoreDial label={t.resultAway} value={away} onChange={setAway} format={num} />
              </View>
            </Card>

            <Card>
              <SectionTitle title={t.reviewVenue} />
              <Txt size={12} lh={1.5} color={onVoid.faint}>
                {t.reviewVenueBlurb}
              </Txt>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const on = n <= stars;
                  return (
                    <Pressable
                      key={n}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: stars === n }}
                      accessibilityLabel={t.reviewStars(num(n))}
                      onPress={() => setStars(stars === n ? 0 : n)}
                      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Star size={30} color={on ? gold.base : onVoid.line} />
                    </Pressable>
                  );
                })}
              </View>
              {stars > 0 ? (
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  multiline
                  accessibilityLabel={t.reviewNote}
                  placeholder={t.reviewNote}
                  placeholderTextColor={onVoid.disabled}
                  style={{
                    minHeight: 84,
                    borderRadius: radius.row,
                    borderWidth: 1,
                    borderColor: onVoid.line,
                    backgroundColor: void_.inset,
                    padding: 12,
                    color: onVoid.primary,
                    fontSize: 13.5,
                    textAlignVertical: 'top',
                  }}
                />
              ) : null}
            </Card>
          </>
        ) : null}
      </ScrollView>

      {!loading ? (
        <StickyFooter>
          <View style={{ flex: 1, gap: 4 }}>
            <ActionButton label={t.resultSubmit} onPress={() => submit(true)} disabled={saving} />
            {/* Not every five-a-side ends with an agreed score, and the card
                cares that the match happened rather than who won. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.resultSkipScore}
              onPress={() => submit(false)}
              disabled={saving}
              style={{ paddingVertical: 10, alignItems: 'center', opacity: saving ? 0.45 : 1 }}
            >
              <Txt size={12.5} weight="semibold" color={onVoid.muted}>
                {t.resultSkipScore}
              </Txt>
            </Pressable>
          </View>
        </StickyFooter>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/**
 * A stepper rather than a text field: scores are small integers, and a numeric
 * keyboard over a dark sheet is a worse way to enter "3" than two big targets.
 */
function ScoreDial({
  label,
  value,
  onChange,
  format,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  format: (n: number) => string;
}) {
  return (
    <View
      style={{
        flex: 1,
        padding: 14,
        borderRadius: radius.row,
        backgroundColor: void_.inset,
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Txt size={12.5} weight="semibold" color={onVoid.secondary}>
        {label}
      </Txt>
      <Txt size={40} weight="bold" em={-0.03} color={gold.base}>
        {format(value)}
      </Txt>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Step label="−" onPress={() => onChange(Math.max(0, value - 1))} disabled={value === 0} />
        <Step label="+" onPress={() => onChange(Math.min(99, value + 1))} />
      </View>
    </View>
  );
}

function Step({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? t.oneMore : t.oneFewer}
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      style={{
        width: 44,
        height: 38,
        borderRadius: radius.chip,
        borderWidth: 1,
        borderColor: goldAlpha.edge,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Txt size={18} weight="semibold" color={gold.base}>
        {label}
      </Txt>
    </Pressable>
  );
}
