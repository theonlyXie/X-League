import { type ReactNode, useEffect } from 'react';
import { Pressable, View, type PressableProps, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/**
 * The three pieces of motion this product actually earned.
 *
 * Everything here runs on the UI thread and touches only transform, opacity, or
 * the width of an absolutely positioned childless element — the one shape where
 * animating width does not re-run layout on its siblings, and the only way to
 * fill a bar without smearing its corner radius the way scaleX would.
 *
 * Three things were asked for and deliberately are not here. Screen transitions
 * belong to the native stack and are never rebuilt in JS. Tabs do not slide:
 * they are peers, and sliding implies a depth that is not there. And numbers do
 * not count up — a leaderboard is read, and animating the figure delays the
 * answer the reader opened the screen for.
 */

/** Strong ease-out. The built-in easings are as weak here as they are in CSS. */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * The press target has to be the animated component itself. A plain Pressable
 * is not one, so a transition declared on it is silently inert — which is the
 * kind of bug that looks like "the animation just does not run".
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Press feedback.
 *
 * The scale takes the label and any icon with it, which is what makes a press
 * read as physical rather than as a colour change. Feedback lands on press-in,
 * because waiting for the tap to complete is the latency people actually feel.
 */
export function PressScale({
  children,
  style,
  disabled,
  ...rest
}: PressableProps & { children: ReactNode; style?: ViewStyle }) {
  const reduced = useReducedMotion();

  // Driven as a shared value rather than through the CSS-transition form.
  // That form takes its curve as a string, and Reanimated accepts only the
  // named keywords there — `cubic-bezier(...)` throws on every render that
  // sets it, which took each press through the error boundary instead of
  // scaling anything. Named keywords would parse, but the curve above exists
  // because they are too weak here, so this uses the imperative form the rest
  // of this file already uses and keeps the bezier.
  //
  // It also stops a press re-rendering the tree it is giving feedback on: the
  // scale now lives on the UI thread from press to release.
  const scale = useSharedValue(1);

  const press = (to: number) => {
    if (disabled || reduced) return;
    scale.set(withTiming(to, { duration: 120, easing: EASE_OUT }));
  };

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        press(0.97);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        press(1);
        rest.onPressOut?.(e);
      }}
      // A finger drifting a few pixels should not cancel a press somebody meant.
      pressRetentionOffset={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * How full a cup is.
 *
 * State indication, not decoration: a cup at fifteen of sixteen is the reason
 * somebody enters tonight rather than next week, and a bar that arrives already
 * full says nothing about how close that is.
 */
export function CapacityBar({
  filled,
  capacity,
  height = 6,
  track,
  fill,
  full,
}: {
  filled: number;
  capacity: number;
  height?: number;
  track: string;
  fill: string;
  /** The colour for a cup with no places left, which is a different fact. */
  full?: string;
}) {
  const reduced = useReducedMotion();
  const share = capacity > 0 ? Math.max(0, Math.min(1, filled / capacity)) : 0;
  const progress = useSharedValue(reduced ? share : 0);

  useEffect(() => {
    progress.set(
      reduced ? share : withDelay(90, withTiming(share, { duration: 420, easing: EASE_OUT })),
    );
  }, [share, reduced, progress]);

  const style = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: capacity, now: filled }}
      style={{
        height,
        borderRadius: height,
        backgroundColor: track,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            borderRadius: height,
            backgroundColor: share >= 1 && full ? full : fill,
          },
          style,
        ]}
      />
    </View>
  );
}

/**
 * A rare-tier entrance, for the roll of honour and nothing else.
 *
 * Winning something happens once a season, which is the only tier where this
 * kind of motion is worth what it costs. It never starts from scale 0 — nothing
 * in the world appears out of nothing — and under reduced motion it keeps the
 * fade and drops the movement.
 */
export function Reveal({
  children,
  index = 0,
  style,
}: {
  children: ReactNode;
  index?: number;
  style?: ViewStyle;
}) {
  const reduced = useReducedMotion();
  const shown = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    shown.set(
      reduced ? 1 : withDelay(index * 70, withTiming(1, { duration: 320, easing: EASE_OUT })),
    );
  }, [index, reduced, shown]);

  const animated = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: reduced
      ? []
      : [{ translateY: (1 - shown.get()) * 10 }, { scale: 0.96 + shown.get() * 0.04 }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
