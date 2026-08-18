import Svg, { Path, Polyline } from 'react-native-svg';

/**
 * Stroke-based icons on a 20px grid, drawn rather than borrowed from a glyph
 * font so they scale and recolour with the rest of the design.
 *
 * The design's own `←`, `›` and `···` marks are these.
 */

type IconProps = { size?: number; color: string };

export function ArrowLeft({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M16 10H4" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Polyline points="9,5 4,10 9,15" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function ChevronRight({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Polyline points="8,4 14,10 8,16" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function ChevronLeft({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Polyline points="12,4 6,10 12,16" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
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
