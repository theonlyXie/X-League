import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, onVoid, radius, void_ } from '@/theme/tokens';
import { completeMatch } from '@/data/progress';
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
  const { t, num } = useI18n();
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
        if (!cancelled) setError('Could not load that booking.');
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
      setError(res.reason ?? null);
      return;
    }
    setError(null);
    // Points were just awarded, so the card this app is holding is stale.
    void reloadCard();
    // Straight on to rating: this is the moment the squad is still fresh in
    // mind, and rating is what turns the match into card evidence.
    if (res.matchId) router.replace(`/play/rate?match=${res.matchId}`);
    else router.replace('/me');
  };

  const when = booking
    ? new Date(booking.startsAt).toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
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
            {t.resultTitle}
          </Txt>
          <Txt size={11.5} color={onVoid.faint}>
            {t.resultBlurb}
          </Txt>
        </View>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {error ? (
        <View
          style={{
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: radius.chip,
            borderWidth: 1,
            borderColor: 'rgba(101,21,37,.5)',
            backgroundColor: 'rgba(101,21,37,.09)',
          }}
        >
          <Txt size={12.5} weight="semibold" color={burgundy.action}>
            {error}
          </Txt>
        </View>
      ) : null}

      {/* Which match, in words. */}
      {booking ? (
        <View
          style={{
            padding: 14,
            borderRadius: radius.control,
            backgroundColor: void_.surface,
            borderWidth: 1,
            borderColor: onVoid.edgeFaint,
            gap: 3,
          }}
        >
          <Txt size={14} weight="semibold" color={onVoid.primary}>
            {booking.venueName}
          </Txt>
          <Txt size={12} color={onVoid.muted}>
            {booking.pitchLabel}
            {when ? ` · ${when}` : ''}
          </Txt>
        </View>
      ) : null}

      {!loading ? (
        <>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <ScoreDial label={t.resultHome} value={home} onChange={setHome} format={num} />
            <ScoreDial label={t.resultAway} value={away} onChange={setAway} format={num} />
          </View>

          <View style={{ gap: 10 }}>
            <Eyebrow>{t.reviewVenue}</Eyebrow>
            <Txt size={11.5} color={onVoid.faint}>
              {t.reviewVenueBlurb}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = n <= stars;
                return (
                  <Pressable
                    key={n}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: stars === n }}
                    accessibilityLabel={t.reviewStars(num(n))}
                    onPress={() => setStars(stars === n ? 0 : n)}
                    style={{
                      flex: 1,
                      height: 44,
                      borderRadius: radius.chip,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: on ? gold.base : onVoid.line,
                      backgroundColor: on ? 'rgba(198,163,75,.14)' : 'transparent',
                    }}
                  >
                    <Txt size={14} weight="bold" color={on ? gold.base : onVoid.muted}>
                      {num(n)}
                    </Txt>
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
                  minHeight: 64,
                  borderRadius: radius.chip,
                  borderWidth: 1,
                  borderColor: onVoid.line,
                  padding: 12,
                  color: onVoid.primary,
                  fontSize: 13.5,
                  textAlignVertical: 'top',
                }}
              />
            ) : null}
          </View>

          <View style={{ gap: 10 }}>
            <Button label={t.resultSubmit} onPress={() => submit(true)} disabled={saving} />
            {/* Not every five-a-side ends with an agreed score, and the card
                cares that the match happened rather than who won. */}
            <Pressable
              accessibilityRole="button"
              onPress={() => submit(false)}
              disabled={saving}
              style={{ paddingVertical: 12, alignItems: 'center' }}
            >
              <Txt size={12.5} color={onVoid.muted}>
                {t.resultSkipScore}
              </Txt>
            </Pressable>
          </View>
        </>
      ) : null}
    </Screen>
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
        borderRadius: radius.control,
        backgroundColor: void_.surface,
        borderWidth: 1,
        borderColor: onVoid.edgeFaint,
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Eyebrow>{label}</Eyebrow>
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'One more' : 'One fewer'}
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      style={{
        width: 44,
        height: 38,
        borderRadius: radius.chip,
        backgroundColor: void_.inset,
        borderWidth: 1,
        borderColor: onVoid.edgeFaint,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Txt size={18} weight="semibold" color={onVoid.secondary}>
        {label}
      </Txt>
    </Pressable>
  );
}
