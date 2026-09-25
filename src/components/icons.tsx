import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';
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

/**
 * `scaleX: -1` in Arabic, applied to the SVG so the stroke geometry mirrors.
 *
 * The whole style object, or nothing. It used to return the transform array and
 * the callers spread it into a style literal, which in Latin left a
 * `transform: undefined` key on every one of these icons. react-native-svg does
 * not treat that as absent: it runs the value through a stringify-and-reparse
 * round trip whose parser rejects an empty transform outright, and the throw
 * lands mid-render on the `<Svg>` element rather than anywhere near here. An
 * omitted key is the only shape it reads as "no transform".
 *
 * The array is plain rather than `as const` for the same reason — the library
 * maps over it, and a readonly tuple is a type the FIXME-annotated paths in
 * `extractTransform` are not written for.
 */
function useFlipStyle() {
  const { rtl } = useI18n();
  return rtl ? { transform: [{ scaleX: -1 }] } : undefined;
}

export function ArrowLeft({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={useFlipStyle()}>
      <Path d="M16 10H4" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Polyline points="9,5 4,10 9,15" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function ChevronRight({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={useFlipStyle()}>
      <Polyline points="8,4 14,10 8,16" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function ChevronLeft({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={useFlipStyle()}>
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

/*
 * The redesign's set. Same 20px grid, same 1.5 stroke, drawn here rather than
 * borrowed. Only the ones that point along the reading direction — the log-out
 * arrow and the share arrow's tail do not, a door is a door — are flipped.
 */

const stroke = (color: string) =>
  ({ stroke: color, strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }) as const;

export function Search({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={9} cy={9} r={5.5} {...stroke(color)} />
      <Path d="M13.2 13.2 17 17" {...stroke(color)} />
    </Svg>
  );
}

export function Pin({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M10 17.5s5.5-5.2 5.5-9.3a5.5 5.5 0 0 0-11 0c0 4.1 5.5 9.3 5.5 9.3Z" {...stroke(color)} />
      <Circle cx={10} cy={8.2} r={2} {...stroke(color)} />
    </Svg>
  );
}

export function Share({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={14.5} cy={4.8} r={2.2} {...stroke(color)} />
      <Circle cx={5.5} cy={10} r={2.2} {...stroke(color)} />
      <Circle cx={14.5} cy={15.2} r={2.2} {...stroke(color)} />
      <Path d="M7.4 8.9 12.6 5.9M7.4 11.1l5.2 3" {...stroke(color)} />
    </Svg>
  );
}

export function Clock({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={7} {...stroke(color)} />
      <Path d="M10 6v4l2.6 1.8" {...stroke(color)} />
    </Svg>
  );
}

/** Filter — three sliders. */
export function Sliders({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M3.5 6h13M3.5 14h13" {...stroke(color)} />
      <Circle cx={7.5} cy={6} r={1.8} fill="#080808" {...{ stroke: color, strokeWidth: 1.5 }} />
      <Circle cx={12.5} cy={14} r={1.8} fill="#080808" {...{ stroke: color, strokeWidth: 1.5 }} />
    </Svg>
  );
}

/** Sort — up and down arrows. */
export function SortArrows({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M7 16V4M4 7l3-3 3 3M13 4v12M10 13l3 3 3-3" {...stroke(color)} />
    </Svg>
  );
}

export function CheckCircle({ size = 20, color, filled }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={7.5} {...(filled ? { fill: color } : stroke(color))} />
      <Polyline
        points="6.6,10.3 8.9,12.5 13.4,7.6"
        {...stroke(filled ? '#080808' : color)}
        strokeWidth={filled ? 1.9 : 1.5}
      />
    </Svg>
  );
}

export function Pencil({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M12.8 4.2a1.8 1.8 0 0 1 2.6 2.6L7.5 14.7 4 16l1.3-3.5 7.5-8.3Z" {...stroke(color)} />
    </Svg>
  );
}

export function Trash({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M4 6h12M8 6V4.5h4V6M5.5 6l.8 10h7.4l.8-10" {...stroke(color)} />
    </Svg>
  );
}

export function User({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={7} r={3.2} {...stroke(color)} />
      <Path d="M3.8 17c.8-3.2 3.3-5 6.2-5s5.4 1.8 6.2 5" {...stroke(color)} />
    </Svg>
  );
}

export function Users({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={7.5} cy={7.5} r={2.7} {...stroke(color)} />
      <Path d="M2.5 16c.6-2.7 2.6-4.2 5-4.2s4.4 1.5 5 4.2" {...stroke(color)} />
      <Path d="M12.8 5.2a2.6 2.6 0 0 1 0 5M14.6 12.2c1.5.5 2.5 1.8 2.9 3.8" {...stroke(color)} />
    </Svg>
  );
}

export function Calendar({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Rect x={3.5} y={4.5} width={13} height={12} rx={2.5} {...stroke(color)} />
      <Path d="M3.5 8.5h13M7 3v3M13 3v3" {...stroke(color)} />
    </Svg>
  );
}

export function Home({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M3.5 9 10 3.5 16.5 9v7a1 1 0 0 1-1 1h-3.3v-4.5H7.8V17H4.5a1 1 0 0 1-1-1V9Z" {...stroke(color)} />
    </Svg>
  );
}

export function Trophy({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M6 3.5h8v4a4 4 0 0 1-8 0v-4ZM6 5H3.5a2.5 2.5 0 0 0 2.8 3.3M14 5h2.5a2.5 2.5 0 0 1-2.8 3.3M10 11.5v3M7 16.5h6" {...stroke(color)} />
    </Svg>
  );
}

export function Close({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M5 5l10 10M15 5 5 15" {...stroke(color)} />
    </Svg>
  );
}

export function Shield({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M10 2.8 4 5v4.6c0 3.6 2.6 6.4 6 7.6 3.4-1.2 6-4 6-7.6V5l-6-2.2Z" {...stroke(color)} />
      <Path d="M10 8v2.5" {...stroke(color)} />
      <Circle cx={10} cy={7.2} r={0.2} {...stroke(color)} />
    </Svg>
  );
}

export function Headset({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M4 12V9.5a6 6 0 0 1 12 0V12" {...stroke(color)} />
      <Rect x={3} y={11} width={3.2} height={4.5} rx={1.3} {...stroke(color)} />
      <Rect x={13.8} y={11} width={3.2} height={4.5} rx={1.3} {...stroke(color)} />
      <Path d="M15.4 15.5c0 1-1.4 1.8-3.4 1.8" {...stroke(color)} />
    </Svg>
  );
}

export function LogOut({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={useFlipStyle()}>
      <Path d="M8 3.5H5a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 5 16.5h3M13 6.5l3.5 3.5-3.5 3.5M16.5 10H8" {...stroke(color)} />
    </Svg>
  );
}

/** Call for players — the redesign's "broadcast". */
export function Megaphone({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={useFlipStyle()}>
      <Path d="M3.5 8.2v3.6h2.8l6.2 3.7V4.5L6.3 8.2H3.5ZM6.5 12l.8 4h2M15 7.5a3.5 3.5 0 0 1 0 5" {...stroke(color)} />
    </Svg>
  );
}

/** Owner Mode — a venue's business. */
export function Briefcase({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Rect x={3} y={6.5} width={14} height={10} rx={2} {...stroke(color)} />
      <Path d="M7.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 12.5 5v1.5M3 10.5h14" {...stroke(color)} />
    </Svg>
  );
}

export function Globe({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={7} {...stroke(color)} />
      <Path d="M3 10h14M10 3c2 2 2.8 4.4 2.8 7S12 15 10 17c-2-2-2.8-4.4-2.8-7S8 5 10 3Z" {...stroke(color)} />
    </Svg>
  );
}

export function Key({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={7} cy={10} r={3.5} {...stroke(color)} />
      <Path d="M10.5 10H17M14.5 10v2.5M16.5 10v2" {...stroke(color)} />
    </Svg>
  );
}

export function Ban({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={7} {...stroke(color)} />
      <Path d="M5 15 15 5" {...stroke(color)} />
    </Svg>
  );
}

export function Document({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M5.5 3h6l3 3v11h-9V3ZM11.5 3v3h3M7.8 10h4.4M7.8 13h4.4" {...stroke(color)} />
    </Svg>
  );
}

/** Challenges — two crossed flags would be kinder but this reads at 18px. */
export function Swords({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M4 4l8.5 8.5M16 4l-8.5 8.5M11 14l3-3M9 14l-3-3M13 13.5l3 3M7 13.5l-3 3" {...stroke(color)} />
    </Svg>
  );
}

/** Leaderboards — three bars. */
export function Podium({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M3.5 16.5v-5h4v5M7.5 16.5v-9h5v9M12.5 16.5v-7h4v7M2.5 16.5h15" {...stroke(color)} />
    </Svg>
  );
}

export function Whistle({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={7.5} cy={12} r={4} {...stroke(color)} />
      <Path d="M9 8.3 16.5 6v3.5L11.3 10.6M6 4.5 7 6.5M3.5 6l1.6 1.4" {...stroke(color)} />
    </Svg>
  );
}

/** Opens somewhere else — the maps app. Not flipped: it points out, not along. */
export function External({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M11 4h5v5M16 4l-7 7M14 11.5V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.5" {...stroke(color)} />
    </Svg>
  );
}

export function Plus({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M10 4v12M4 10h12" {...stroke(color)} />
    </Svg>
  );
}

export function Ball({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={7} {...stroke(color)} />
      <Path d="M10 6.5l3 2.2-1.1 3.6H8.1L7 8.7l3-2.2ZM10 3v3.5M13 8.7l3.6-1M11.9 12.3l2 3M8.1 12.3l-2 3M7 8.7l-3.6-1" {...stroke(color)} />
    </Svg>
  );
}
