import { View } from 'react-native';
import { StrokeLine } from './StrokeLine';
import { goldAlpha, radius, void_ } from '@/theme/tokens';

type Props = {
  /** Overall square size of the mark. */
  size: number;
  /** Draw the two X strokes converging on the void. */
  strokes?: boolean;
  /** How many concentric rings to draw, outermost first. Max 3. */
  rings?: 0 | 1 | 2 | 3;
  /** Glow behind the disc — used on the confirmation moment only. */
  glow?: boolean;
};

/**
 * The X-to-void mark: sculpted diagonals converging on a circular black void,
 * with concentric rings implying motion and gravity (§4.1).
 *
 * Proportions are taken from the 190px confirmation mark in
 * `XL Player.dc.html` and scale from there, so the 22px rail mark and the
 * 190px ceremony mark are the same drawing.
 */
export function VoidMark({ size, strokes = true, rings = 3, glow = false }: Props) {
  const ringSpec = [
    { scale: 186 / 190, color: goldAlpha.ring },
    { scale: 140 / 190, color: goldAlpha.ringInner },
    { scale: 96 / 190, color: 'rgba(198,163,75,.42)' },
  ].slice(3 - rings);

  const disc = size * (56 / 190);
  const strokeLength = size * (180 / 190);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {ringSpec.map((r, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: size * r.scale,
            height: size * r.scale,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: r.color,
          }}
        />
      ))}

      {strokes
        ? [45, -45].map((deg) => (
            <StrokeLine key={deg} length={strokeLength} angle={deg} color="rgba(198,163,75,.55)" />
          ))
        : null}

      <View
        style={{
          width: disc,
          height: disc,
          borderRadius: radius.pill,
          backgroundColor: void_.disc,
          borderWidth: 1,
          borderColor: 'rgba(198,163,75,.7)',
          ...(glow
            ? {
                shadowColor: '#C6A34B',
                shadowOpacity: 0.18,
                shadowRadius: 30,
                shadowOffset: { width: 0, height: 0 },
              }
            : null),
        }}
      />
    </View>
  );
}
