import { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import { Txt } from './Txt';
import { burgundy, gold, ink, onOperative, operative, radius } from '@/theme/tokens';
import { face, mono } from '@/theme/typography';

/**
 * The Operative surface, as a small kit.
 *
 * Owner Mode and the admin console are shift software: bone surfaces, denser
 * type, 8–12 px corners, and ink rather than gold for emphasis — gold stays
 * reserved for money and for the app-sourced booking. Every screen in those two
 * areas was repeating the same six shapes, so they live here once.
 *
 * The page, section, header and row shapes moved to `kitOperative.tsx` with
 * the redesign; what is left here is what it kept as it was.
 */

export function OpButton({
  label,
  onPress,
  tone = 'primary',
  disabled,
  flex,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'quiet' | 'danger';
  disabled?: boolean;
  flex?: number;
}) {
  const palette =
    tone === 'primary'
      ? { bg: ink, fg: operative.surface, border: ink }
      : tone === 'danger'
        ? { bg: 'transparent', fg: burgundy.ink, border: 'rgba(139,33,53,.4)' }
        : { bg: 'transparent', fg: ink, border: onOperative.hairline };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex,
        height: 40,
        minWidth: 84,
        paddingHorizontal: 16,
        borderRadius: radius.chip,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.bg,
        borderWidth: 1,
        borderColor: palette.border,
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      })}
    >
      <Txt size={12.5} weight="semibold" color={palette.fg}>
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * A label over its input, as on the sign-in screen: the label in sentence case
 * at reading size rather than a 9.5 px uppercase eyebrow, the box tall enough
 * to hit with a thumb at the gate.
 */
export function OpField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  width,
  hint,
  multiline,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad';
  width?: number;
  hint?: string | null;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
}) {
  return (
    <View style={{ gap: 7, width }}>
      <Txt size={12.5} weight="semibold" color={onOperative.secondary} numberOfLines={1}>
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={onOperative.disabled}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        // The label above is a sibling `Txt`, which a screen reader has no way
        // to associate with this input: every field in Owner Mode announced
        // itself as an unlabelled text box.
        accessibilityLabel={label}
        style={{
          height: multiline ? 92 : 48,
          paddingHorizontal: 14,
          paddingTop: multiline ? 12 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
          borderRadius: radius.row,
          borderWidth: 1,
          borderColor: onOperative.line,
          backgroundColor: operative.surface,
          color: ink,
          fontFamily: face.semibold,
          fontSize: 15,
        }}
      />
      {hint ? (
        <Txt size={11.5} lh={1.45} color={onOperative.faint}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

/** A number that matters, with its unit underneath. */
export function OpTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        padding: 13,
        borderRadius: radius.cardInner,
        backgroundColor: operative.surface,
        borderWidth: 1,
        borderColor: accent ? 'rgba(198,163,75,.5)' : onOperative.hairline,
        gap: 6,
      }}
    >
      <Txt size={9.5} weight="semibold" em={0.14} color={onOperative.faint}>
        {label}
      </Txt>
      <Txt size={20} weight="bold" em={-0.02} color={accent ? gold.ink : ink}>
        {value}
      </Txt>
      {sub ? (
        // The ramp's own step. `.42` came to 2.8:1 on the surface — the unit
        // under every figure on the Money and Reviews tabs was below AA.
        <Txt size={10} color={onOperative.dim}>
          {sub}
        </Txt>
      ) : null}
    </View>
  );
}

/** Money and codes, in the mono face the calendar already uses. */
export function OpMono({ children, size = 12.5 }: { children: ReactNode; size?: number }) {
  return (
    <Txt size={size} color={ink} style={{ fontFamily: mono }}>
      {children}
    </Txt>
  );
}

/**
 * Where the venue stands with the platform.
 *
 * Separate from `OpNotice` because that one is burgundy, and burgundy is the
 * colour this product uses for something being wrong. A venue awaiting
 * verification has nothing wrong with it — it is listed, it is bookable, and it
 * simply ranks below the verified ones — so dressing that as an error would be
 * the screen lying in a different register. Declined and suspended are a
 * different matter and do get the burgundy.
 *
 * Renders nothing at all once verified: the gold badge on the venue profile
 * says that, and repeating it on every screen would be noise.
 */
export function OpStanding({
  title,
  blurb,
  tone,
}: {
  title: string;
  blurb: string;
  tone: 'info' | 'warn';
}) {
  const line = tone === 'warn' ? 'rgba(139,33,53,.35)' : 'rgba(198,163,75,.45)';
  const fill = tone === 'warn' ? 'rgba(139,33,53,.06)' : 'rgba(198,163,75,.08)';
  return (
    <View
      style={{
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: radius.chip,
        borderWidth: 1,
        borderColor: line,
        backgroundColor: fill,
        gap: 4,
      }}
    >
      <Txt size={12.5} weight="semibold" color={tone === 'warn' ? burgundy.ink : ink}>
        {title}
      </Txt>
      <Txt size={11.5} lh={1.5} color={onOperative.muted}>
        {blurb}
      </Txt>
    </View>
  );
}

/** Whatever the server said when it refused. */
export function OpNotice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <View
      style={{
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: radius.chip,
        borderWidth: 1,
        borderColor: 'rgba(139,33,53,.35)',
        backgroundColor: 'rgba(139,33,53,.06)',
      }}
    >
      <Txt size={12} color={burgundy.ink}>
        {text}
      </Txt>
    </View>
  );
}
