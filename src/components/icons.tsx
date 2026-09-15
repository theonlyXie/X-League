import Svg, { Path, Polyline } from 'react-native-svg';
import { useI18n } from '@/i18n';

/**
 * Stroke-based icons on a 20px grid, drawn rather than borrowed from a glyph
 * font so they scale and recolour with the rest of the design.
 *
 * The design's own `←`, `›` and `···` marks are these.
 *
 * The three that point along the reading direction flip in Arabic. Nothing else
 * does: a star, a tick and a rising trend mean the same thing in both
 * directions, and mirroring them would only make them look wrong.
 *
 * This was found by looking at the screens rather than by any check. The RTL
 * walk asserts direction, overflow and copy, and every one of those passed
 * while the back button on every screen in the app pointed the wrong way.
 */

type IconProps = { size?: number; color: string };

/** `scaleX: -1` in Arabic, applied to the SVG so the stroke geometry mirrors. */
function useFlip() {
  const { rtl } = useI18n();
  return rtl ? ([{ scaleX: -1 }] as const) : undefined;
}

export function ArrowLeft({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ transform: useFlip() }}>
      <Path d="M16 10H4" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Polyline points="9,5 4,10 9,15" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function ChevronRight({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ transform: useFlip() }}>
      <Polyline points="8,4 14,10 8,16" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function ChevronLeft({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ transform: useFlip() }}>
      <Polyline points="12,4 6,10 12,16" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** Points at a list that opens below — the venue switch in Owner Mode. */
export function ChevronDown({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Polyline points="5,8 10,14 15,8" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function MoreHorizontal({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      {[5, 10, 15].map((cx) => (
        <Path key={cx} d={`M${cx} 10h0.01`} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      ))}
    </Svg>
  );
}

/** The rating star, filled — used in venue metadata lines. */
export function Star({ size = 12, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path
        d="M10 1.6l2.6 5.27 5.82.85-4.21 4.1.99 5.79L10 14.87l-5.2 2.74.99-5.79L1.58 7.72l5.82-.85z"
        fill={color}
      />
    </Svg>
  );
}

/** The form arrow — points up when a player's recent trend is rising. */
export function TrendUp({ size = 12, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path d="M10 3l7 12H3z" fill={color} />
    </Svg>
  );
}

/** A tick, used on the owner's completed check-in. */
export function Check({ size = 14, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Polyline points="4,10.5 8,14.5 16,5.5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/**
 * Refresh. Not mirrored: a circular arrow means the same thing in both
 * directions, and flipping it would only make it look wrong.
 */
/**
 * Notifications.
 *
 * Deliberately not flipped in Arabic: a bell is a bell in both directions, and
 * mirroring it would only make it look wrong — the same reasoning as the star
 * and the tick above.
 */
export function Bell({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M5.5 8a4.5 4.5 0 0 1 9 0c0 3 .8 4.3 1.4 5 .3.4 0 1-.5 1H4.6c-.5 0-.8-.6-.5-1 .6-.7 1.4-2 1.4-5Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M8.2 16.2a2 2 0 0 0 3.6 0" stroke={color} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export function Rotate({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
      />
      <Polyline
        points="16.5,2.5 16.5,6 13,6"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
