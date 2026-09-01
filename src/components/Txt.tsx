import type { ReactNode } from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import { familyFor, tracking, Weight } from '@/theme/typography';
import { useI18n } from '@/i18n';

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
  children,
  ...rest
}: Props) {
  const { rtl } = useI18n();
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: familyFor(weight, rtl),
          // Mixed-direction runs (a code, a price) resolve against the script
          // the interface is in, not against whatever character comes first.
          writingDirection: rtl ? 'rtl' : 'ltr',
          fontSize: size,
          ...(color ? { color } : null),
          ...(em !== undefined ? { letterSpacing: tracking(size, em) } : null),
          ...(lh !== undefined ? { lineHeight: size * lh } : null),
          ...(upper ? { textTransform: 'uppercase' as const } : null),
          ...(align ? { textAlign: align } : null),
        },
        style,
      ]}
    >
      {rtl ? isolate(children) : children}
    </Text>
  );
}

/**
 * Wrap Latin runs so Arabic text does not rearrange them.
 *
 * `writingDirection: 'rtl'` sets the paragraph direction, which is right and
 * not enough: inside an RTL paragraph the bidi algorithm still reorders a
 * Latin run's trailing punctuation and its neutral characters. That is why the
 * owner's calendar showed `.Sameh A` with the full stop at the front and
 * `a-side-5` instead of `5-a-side`, and why `6 PM` came out as `PM ٦`.
 *
 * U+2068 FIRST STRONG ISOLATE and U+2069 POP DIRECTIONAL ISOLATE exist for
 * exactly this: they tell the algorithm to resolve the run on its own and drop
 * it into the sentence as a single unit. Applied here rather than at each call
 * site, because every piece of type in this app already goes through this
 * component and no screen should have to remember.
 */
// A leading `+` counts as part of the run. Without it the plus fell outside
// the isolate and an Arabic line rendered `+20` as `20+`, which is the one
// place in this app where a number is read aloud to a stranger.
const LATIN_RUN = /(\+?[A-Za-z0-9][A-Za-z0-9\u0027\u2019.,:;!?()\/+\-–—&%#@ ]*[A-Za-z0-9.)\]%]|\+?[A-Za-z0-9])/g;

function isolate(children: ReactNode): ReactNode {
  if (typeof children === 'string') return children.replace(LATIN_RUN, '\u2068$1\u2069');
  if (typeof children === 'number') return children;
  if (Array.isArray(children)) return children.map(isolate);
  return children;
}
