import { LinearGradient } from 'expo-linear-gradient';

/**
 * One arm of the X. The design draws these as a horizontal gradient that fades
 * out at both ends — a flat line reads as a hard cross and loses the
 * "converging on the void" effect entirely.
 */
export function StrokeLine({
  length,
  angle,
  color = 'rgba(198,163,75,.4)',
  top,
  left,
}: {
  length: number;
  angle: number;
  color?: string;
  top?: number;
  left?: number;
}) {
  return (
    <LinearGradient
      colors={['rgba(198,163,75,0)', color, 'rgba(198,163,75,0)']}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={{
        position: 'absolute',
        width: length,
        height: 1,
        ...(top !== undefined ? { top } : null),
        ...(left !== undefined ? { left } : null),
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}
