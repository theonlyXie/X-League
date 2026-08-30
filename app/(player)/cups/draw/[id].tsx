import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { EASE_OUT, Reveal } from '@/components/motion';
import { ArrowLeft } from '@/components/icons';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { tournamentDetail, type Fixture, type TournamentDetail } from '@/data/cups';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * The draw, watched rather than read.
 *
 * The pairings are already decided — `generate_fixtures` drew them, at random,
 * the moment the organiser closed entries. Nothing here decides anything, and
 * that matters: this is a replay of a result, so it can be skipped, watched
 * again, and it never disagrees with the fixture list one screen away.
 *
 * Two acts. First the field: everyone who is in, which is the question before
 * the question. Then the opening round, one pairing at a time, because a list
 * of eight matches arriving at once is a table and a table is not a draw.
 *
 * Only the first round is played out. In a league every club meets every other
 * eventually, so revealing all of it would be six minutes of theatre for
 * information the fixtures tab shows better; the opening round is the part
 * where "who do we get" has an answer.
 */
export default function DrawReveal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const tournamentId = params.id ?? null;
  const { t, num } = useI18n();
  const reduced = useReducedMotion();

  const [cup, setCup] = useState<TournamentDetail | null>(null);
  const [loading, setLoading] = useState(isLive);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    if (!isLive || !tournamentId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    tournamentDetail(tournamentId)
      .then((detail) => {
        if (cancelled) return;
        setCup(detail);
        setUnreachable(false);
      })
      .catch(() => {
        if (!cancelled) setUnreachable(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  /** A bye is not a pairing, so it is in the field and not in the reveal. */
  const ties = useMemo<Fixture[]>(() => {
    const all = cup?.fixtures ?? [];
    const first = all.length ? Math.min(...all.map((f) => f.round)) : 0;
    return all
      .filter((f) => f.round === first && f.home && f.away)
      .sort((a, b) => a.sequence - b.sequence);
  }, [cup]);

  const entrants = useMemo(
    () => (cup?.teams ?? []).filter((e) => e.state === 'accepted'),
    [cup],
  );

  const crestOf = useCallback(
    (registrationId: string | null) =>
      entrants.find((e) => e.registration_id === registrationId)?.crest_url ?? null,
    [entrants],
  );

  /**
   * `step` is how far the reveal has got: 0 is the field alone, and each step
   * after that adds one pairing. It is driven by a timer that the player can
   * outrun by tapping, and it is cleared on every change so a skip cannot leave
   * an older timer still walking forward behind it.
   */
  const [step, setStep] = useState(0);
  const [runs, setRuns] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = step >= ties.length;

  useEffect(() => {
    if (reduced) {
      setStep(ties.length);
      return;
    }
    if (!ties.length || done) return;
    timer.current = setTimeout(() => setStep((n) => n + 1), step === 0 ? 900 : 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [step, ties.length, done, reduced, runs]);

  const nudge = useCallback(() => {
    if (done) return;
    if (timer.current) clearTimeout(timer.current);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep((n) => n + 1);
  }, [done]);

  const again = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setStep(0);
    setRuns((n) => n + 1);
  }, []);

  return (
    <Screen contentStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          hitSlop={12}
          onPress={() => router.back()}
        >
          <ArrowLeft size={20} color={onVoid.secondary} />
        </Pressable>
        <Txt size={19} weight="bold" em={-0.02} color={onVoid.primary} style={{ flex: 1 }}>
          {t.drawTitle}
        </Txt>
        {!done && ties.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.drawSkip}
            hitSlop={10}
            onPress={() => {
              if (timer.current) clearTimeout(timer.current);
              setStep(ties.length);
            }}
          >
            <Txt size={12.5} weight="semibold" color={gold.base}>
              {t.drawSkip}
            </Txt>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {!loading && (unreachable || !cup) ? (
        <Txt size={13} color={onVoid.faint}>
          {t.offline}
        </Txt>
      ) : null}

      {cup ? (
        <>
          <Txt size={13} color={onVoid.secondary}>
            {cup.name}
          </Txt>

          {/* Act one: the field. Everyone who is in, before anybody knows who
              they have got. */}
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
              <Eyebrow>{t.drawField}</Eyebrow>
              <Txt size={11} color={onVoid.faint}>
                {t.drawFieldCount(num(entrants.length))}
              </Txt>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {entrants.map((e, i) => (
                <Reveal key={`${runs}-${e.registration_id}`} index={i}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingVertical: 7,
                      paddingHorizontal: 11,
                      borderRadius: radius.chip,
                      borderWidth: 1,
                      borderColor: onVoid.line,
                      backgroundColor: void_.inset,
                    }}
                  >
                    <Avatar
                      name={e.entrant_name}
                      url={e.crest_url}
                      size={22}
                      radius={radius.badge}
                      background={void_.raised}
                      border={goldAlpha.edge}
                      color={gold.base}
                    />
                    <Txt size={12.5} weight="medium" color={onVoid.primary}>
                      {e.entrant_name}
                    </Txt>
                  </View>
                </Reveal>
              ))}
            </View>
          </View>

          {/* Act two: who plays who. */}
          {ties.length === 0 ? (
            <View style={{ gap: 8, paddingTop: 8 }}>
              <Txt size={15} weight="semibold" color={onVoid.primary}>
                {t.drawNotYet}
              </Txt>
              <Txt size={12.5} color={onVoid.faint}>
                {t.drawNotYetBlurb}
              </Txt>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={done ? t.drawPairings : t.drawTapOn}
              onPress={nudge}
              style={{ gap: 12 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                <Eyebrow>{t.drawPairings}</Eyebrow>
                <Txt size={11} color={onVoid.faint}>
                  {cup.format === 'knockout' ? t.drawFirstMatches : t.drawOpeningRound}
                </Txt>
              </View>

              <View style={{ gap: 10 }}>
                {ties.slice(0, step).map((f, i) => (
                  <Tie
                    key={`${runs}-${f.fixture_id}`}
                    home={f.home ?? t.bye}
                    away={f.away ?? t.bye}
                    homeCrest={crestOf(f.home_entrant_id)}
                    awayCrest={crestOf(f.away_entrant_id)}
                    where={f.venue_name}
                    fresh={!reduced && i === step - 1}
                  />
                ))}
              </View>

              {!done ? (
                <Txt size={11} color={onVoid.faint} style={{ textAlign: 'center' }}>
                  {t.drawTapOn}
                </Txt>
              ) : null}
            </Pressable>
          )}

          {done && ties.length > 0 ? (
            <Reveal index={0} style={{ gap: 12 }}>
              {cup.format !== 'knockout' ? (
                <Txt size={12.5} color={onVoid.secondary} style={{ textAlign: 'center' }}>
                  {t.drawThenEveryone}
                </Txt>
              ) : null}
              <Button
                label={t.drawSeeFixtures}
                onPress={() => router.replace(`/cups/${cup.tournamentId}`)}
              />
              <Pressable accessibilityRole="button" accessibilityLabel={t.drawAgain} onPress={again}>
                <Txt size={12.5} weight="semibold" color={gold.base} style={{ textAlign: 'center' }}>
                  {t.drawAgain}
                </Txt>
              </Pressable>
            </Reveal>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

/**
 * One pairing, arriving.
 *
 * The two sides come in from their own edges and the `v` lands last, a beat
 * after them — which is the whole trick: the pause before the second crest is
 * where the drama is, and a card that faded in as one piece would have none of
 * it. Only transform and opacity move, so it all stays on the UI thread.
 *
 * `fresh` is false for every pairing already on screen. Re-running their
 * entrance each time a new one arrives would make the whole column twitch.
 */
function Tie({
  home,
  away,
  homeCrest,
  awayCrest,
  where,
  fresh,
}: {
  home: string;
  away: string;
  homeCrest: string | null;
  awayCrest: string | null;
  where: string | null;
  fresh: boolean;
}) {
  const { t } = useI18n();
  const shown = useSharedValue(fresh ? 0 : 1);
  const clash = useSharedValue(fresh ? 0 : 1);

  useEffect(() => {
    if (!fresh) return;
    shown.set(withTiming(1, { duration: 420, easing: EASE_OUT }));
    clash.set(withDelay(300, withTiming(1, { duration: 260, easing: EASE_OUT })));
  }, [fresh, shown, clash]);

  /**
   * The ground comes in last, with the `v`.
   *
   * It used to be plain text outside the animation, so a card caught halfway
   * through its entrance showed an empty box with a venue name floating in it
   * — the least important line on the card arriving before the two clubs.
   */

  const homeSide = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateX: (1 - shown.get()) * -34 }],
  }));
  const awaySide = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateX: (1 - shown.get()) * 34 }],
  }));
  const middle = useAnimatedStyle(() => ({
    opacity: clash.get(),
    transform: [{ scale: 0.7 + clash.get() * 0.3 }],
  }));
  /** The ground fades with the `v` but does not scale — a line of text that
      grows reads as a mistake where a badge that grows reads as a landing. */
  const tail = useAnimatedStyle(() => ({ opacity: clash.get() }));

  return (
    <View
      style={{
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: radius.control,
        backgroundColor: void_.surface,
        borderWidth: 1,
        borderColor: goldAlpha.edge,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Animated.View
          style={[
            { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
            homeSide,
          ]}
        >
          <Txt
            size={13}
            weight="semibold"
            color={onVoid.primary}
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {home}
          </Txt>
          <Avatar
            name={home}
            url={homeCrest}
            size={26}
            radius={radius.badge}
            background={void_.raised}
            border={goldAlpha.edge}
            color={gold.base}
          />
        </Animated.View>

        <Animated.View style={middle}>
          <Txt size={11} weight="bold" em={0.1} color={gold.base}>
            {t.versusShort}
          </Txt>
        </Animated.View>

        <Animated.View
          style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }, awaySide]}
        >
          <Avatar
            name={away}
            url={awayCrest}
            size={26}
            radius={radius.badge}
            background={void_.raised}
            border={goldAlpha.edge}
            color={gold.base}
          />
          <Txt
            size={13}
            weight="semibold"
            color={onVoid.primary}
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {away}
          </Txt>
        </Animated.View>
      </View>

      {/* A ground, if the organiser has placed it. Silence rather than a
          placeholder when they have not — this screen is about the pairing. */}
      {where ? (
        <Animated.View style={tail}>
          <Txt size={10.5} color={onVoid.faint} style={{ textAlign: 'center' }}>
            {where}
          </Txt>
        </Animated.View>
      ) : null}
    </View>
  );
}
