import { ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View, ViewStyle } from 'react-native';
import { Txt } from './Txt';
import { ArrowLeft } from './icons';
import { burgundy, gold, ink, onOperative, operative, radius } from '@/theme/tokens';
import { mono } from '@/theme/typography';

/**
 * The Operative surface, as a small kit.
 *
 * Owner Mode and the admin console are shift software: bone surfaces, denser
 * type, 8–12 px corners, and ink rather than gold for emphasis — gold stays
 * reserved for money and for the app-sourced booking. Every screen in those two
 * areas was repeating the same six shapes, so they live here once.
 */

export function OpScreen({ children, gap = 18 }: { children: ReactNode; gap?: number }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: operative.bg }}
      contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 28, gap }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function OpSection({
  title,
  hint,
  children,
  action,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Txt size={9.5} weight="semibold" em={0.14} upper color={onOperative.faint}>
          {title}
        </Txt>
        {action}
      </View>
      {hint ? (
        <Txt size={11} lh={1.5} color="rgba(20,18,16,.5)">
          {hint}
        </Txt>
      ) : null}
      {children}
    </View>
  );
}

/** A panel row: the workhorse of every list in Owner Mode. */
export function OpRow({
  children,
  onPress,
  accent,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  /** Gold edge for anything about money or an app booking. */
  accent?: boolean;
  style?: ViewStyle;
}) {
  const body = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: radius.panel,
          backgroundColor: operative.surface,
          borderWidth: 1,
          borderColor: accent ? 'rgba(198,163,75,.5)' : onOperative.hairline,
        },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      {body}
    </Pressable>
  );
}

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

export function OpField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  width,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad';
  width?: number;
}) {
  return (
    <View style={{ gap: 5, width }}>
      <Txt size={9.5} weight="semibold" em={0.12} upper color={onOperative.faint}>
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={onOperative.disabled}
        keyboardType={keyboardType ?? 'default'}
        // The label above is a sibling `Txt`, which a screen reader has no way
        // to associate with this input: every field in Owner Mode announced
        // itself as an unlabelled text box.
        accessibilityLabel={label}
        style={{
          height: 40,
          paddingHorizontal: 12,
          borderRadius: radius.chip,
          borderWidth: 1,
          borderColor: onOperative.hairline,
          backgroundColor: operative.surface,
          color: ink,
          fontSize: 13,
        }}
      />
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
        padding: 12,
        borderRadius: radius.panel,
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
        <Txt size={10} color="rgba(20,18,16,.42)">
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

/** Back, and what this screen is. */
export function OpHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        hitSlop={8}
        style={{
          width: 32,
          height: 32,
          borderRadius: radius.chip,
          borderWidth: 1,
          borderColor: onOperative.hairline,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ArrowLeft size={15} color={ink} />
      </Pressable>
      <Txt size={17} weight="bold" em={-0.02} color={ink}>
        {title}
      </Txt>
    </View>
  );
}

/** Whatever the server said when it refused. */
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
