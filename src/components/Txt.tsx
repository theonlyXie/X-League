import type { ReactNode } from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import { familyFor, tracking, Weight } from '@/theme/typography';
import { useI18nOptional } from '@/i18n';

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
  // Optional on purpose: the error boundary is mounted above the provider so
  // that it catches a failure inside it, and it draws its message with this
  // component. Demanding a provider here is what turned every caught error
  // into a silent death — see `useI18nOptional`.
  const rtl = useI18nOptional()?.rtl ?? false;

  // Tracking is a Latin device. Arabic is cursive: adding space between its
  // letters does not loosen the word, it *disconnects* it — which is why the
  // card read `مبد ئي` and `مو ثّقة`, and why the eyebrows came apart into
  // `أدلة ا لمباريات`. Every one of those is an `em` from the design applied
  // to a translated string. The design's tracking still applies wherever the
  // text is Latin, including Latin inside an Arabic interface.
  const spaced = em !== undefined && !ARABIC.test(textOf(children));

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
          ...(spaced ? { letterSpacing: tracking(size, em!) } : null),
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

/** Arabic, Persian and the presentation forms — anything that joins. */
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/** The text a node will actually draw, for deciding how to draw it. */
function textOf(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(textOf).join('');
  return '';
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

/**
 * Digits and nothing else, in either numeral set.
 *
 * Deliberately narrow. A run of digits cannot be reordered against itself, so
 * dropping the isolate around one is safe. Admit a separator \u2014 `3\u20131`, `5-a` \u2014
 * and it is not: a neutral between two numbers resolves to the paragraph's own
 * direction, which is how `5-a-side` became `a-side-5` in the first place.
 */
const BARE_NUMBER = /^[\s0-9\u0660-\u0669]+$/;

function isolate(children: ReactNode): ReactNode {
  if (typeof children === 'string') {
    // A number standing alone has nothing to be reordered against, so the
    // isolate buys nothing \u2014 and a control character the face does not cover
    // is a control character something may decide to draw. The card's overall
    // rating is the largest piece of type in the app and the worst place to
    // find out.
    if (BARE_NUMBER.test(children)) return children;
    return children.replace(LATIN_RUN, '\u2068$1\u2069');
  }
  if (typeof children === 'number') return isolate(String(children));

  if (Array.isArray(children)) {
    // Text and interpolated values are joined before the runs are found, and
    // used not to be.
    //
    // `<Txt>VOID CARD \u00b7 LVL {level}</Txt>` reaches here as two children \u2014 the
    // string, and the number \u2014 and isolating each separately produced two units
    // rather than one run. Bidi then ordered those two units right-to-left like
    // any other pair, so the player card read "12 LVL \u00b7 VOID CARD" in Arabic
    // instead of "VOID CARD \u00b7 LVL 12". Isolating the number on its own would
    // not have helped: two isolates side by side are still two units.
    //
    // Joining first makes `LVL {level}` exactly what `LVL 12` written as one
    // string already was, which is what whoever wrote the line meant. Done here
    // rather than at the call site for the same reason as the rest of this
    // function: interpolating a value into a line of type is the ordinary way
    // to write one, and no screen should have to remember it is also a hazard.
    if (children.every((c) => typeof c === 'string' || typeof c === 'number')) {
      return isolate(children.join(''));
    }
    return children.map(isolate);
  }

  return children;
}
