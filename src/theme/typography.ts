import { Platform, TextStyle } from 'react-native';

/**
 * The design sets weights numerically (`font-weight:700`). React Native on
 * Android does not synthesise weights, so each weight is a separate loaded
 * face and must be addressed by family name.
 */
export const face = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

export type Weight = keyof typeof face;

/** Map the design's numeric weights onto the loaded faces. */
export const weightForCss: Record<string, Weight> = {
  '400': 'regular',
  '500': 'medium',
  '600': 'semibold',
  '700': 'bold',
  '800': 'extrabold',
};

/**
 * The design uses `ui-monospace,Menlo,monospace` for booking codes, hold
 * countdowns and audit timestamps.
 */
export const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'ui-monospace, Menlo, monospace',
}) as string;

/**
 * Letter-spacing in the design is in `em`. React Native wants absolute
 * points, so it has to be resolved against the size it is used at.
 */
export const tracking = (fontSize: number, em: number) => fontSize * em;

/** A text style from the design's own vocabulary. */
export const text = (
  fontSize: number,
  weight: Weight = 'regular',
  opts: { em?: number; lineHeight?: number; color?: string } = {},
): TextStyle => ({
  fontFamily: face[weight],
  fontSize,
  ...(opts.em !== undefined ? { letterSpacing: tracking(fontSize, opts.em) } : null),
  ...(opts.lineHeight !== undefined ? { lineHeight: fontSize * opts.lineHeight } : null),
  ...(opts.color !== undefined ? { color: opts.color } : null),
});
