import { Text, TextProps, TextStyle } from 'react-native';
import { face, tracking, Weight } from '@/theme/typography';

type Props = Omit<TextProps, 'style'> & {
  /** Font size in points, exactly as the design states it. */
  size?: number;
  weight?: Weight;
  color?: string;
  /** Letter-spacing in `em`, as the design writes it. */
  em?: number;
  /** Line-height as a multiplier, as the design writes it. */
  lh?: number;
  upper?: boolean;
  align?: TextStyle['textAlign'];
  style?: TextProps['style'];
};

/**
 * Every piece of type in the app goes through here so the loaded Inter face
 * is always addressed by name and `em` tracking is resolved against the size
 * it is actually used at.
 */
export function Txt({
  size = 13,
  weight = 'regular',
  color,
  em,
  lh,
  upper,
  align,
  style,
  ...rest
}: Props) {
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: face[weight],
          fontSize: size,
          ...(color ? { color } : null),
          ...(em !== undefined ? { letterSpacing: tracking(size, em) } : null),
          ...(lh !== undefined ? { lineHeight: size * lh } : null),
          ...(upper ? { textTransform: 'uppercase' as const } : null),
          ...(align ? { textAlign: align } : null),
        },
        style,
      ]}
    />
  );
}
