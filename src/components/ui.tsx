import { ReactNode } from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { Txt } from './Txt';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';

/**
 * Bring a control's touch target up to the 44pt floor without changing what
 * the design draws. Several controls in the source are 38pt tall.
 */
export const hitSlopTo44 = (drawnHeight: number) => {
  const pad = Math.max(0, (44 - drawnHeight) / 2);
  return { top: pad, bottom: pad, left: 0, right: 0 };
};

/** The small uppercase label that opens most sections on Void surfaces. */
export function Eyebrow({ children, color = onVoid.dim }: { children: ReactNode; color?: string }) {
  return (
    <Txt size={10} weight="regular" em={0.18} upper color={color}>
      {children}
    </Txt>
  );
}

/** A horizontal hairline. */
export function Divider({ color = onVoid.edge }: { color?: string }) {
  return <View style={{ height: 1, backgroundColor: color }} />;
}

type ButtonVariant = 'primary' | 'ghost' | 'accept' | 'decline' | 'danger' | 'operative';

const VARIANT: Record<ButtonVariant, { bg: string; border?: string; fg: string; weight: 'bold' | 'semibold' }> = {
  primary: { bg: gold.base, fg: void_.bg, weight: 'bold' },
  ghost: { bg: 'transparent', border: 'rgba(243,238,229,.18)', fg: onVoid.primary, weight: 'semibold' },
  accept: { bg: goldAlpha.fill, border: goldAlpha.accent, fg: gold.base, weight: 'bold' },
  decline: { bg: 'transparent', border: 'rgba(243,238,229,.14)', fg: onVoid.secondary, weight: 'semibold' },
  danger: { bg: 'transparent', border: 'rgba(156,36,56,.4)', fg: burgundy.action, weight: 'semibold' },
  operative: { bg: void_.bg, fg: '#F3EEE5', weight: 'semibold' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  height = 44,
  round = radius.row,
  size = 14,
  flex,
  width,
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  height?: number;
  round?: number;
  size?: number;
  flex?: number;
  width?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = VARIANT[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      hitSlop={hitSlopTo44(height)}
      style={({ pressed }) => [
        {
          height,
          borderRadius: round,
          backgroundColor: v.bg,
          alignItems: 'center',
          justifyContent: 'center',
          ...(v.border ? { borderWidth: 1, borderColor: v.border } : null),
          ...(flex !== undefined ? { flex } : null),
          ...(width !== undefined ? { width } : null),
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
        },
        style,
      ]}
    >
      <Txt size={size} weight={v.weight} color={v.fg}>
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * The corner ornament on signature cards: two rings running off the corner
 * with the void disc set inside them.
 */
export function CornerVoid() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, width: 150, height: 150 }}>
      <View
        style={{
          position: 'absolute',
          top: -40,
          right: -40,
          width: 150,
          height: 150,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: 'rgba(198,163,75,.12)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: -14,
          right: -14,
          width: 96,
          height: 96,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: 'rgba(198,163,75,.18)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 24,
          right: 24,
          width: 20,
          height: 20,
          borderRadius: radius.pill,
          backgroundColor: void_.disc,
          borderWidth: 1,
          borderColor: goldAlpha.frame,
        }}
      />
    </View>
  );
}

/** The hatched placeholder the design uses wherever venue photography goes. */
export function TurfSwatch({ size, round }: { size: number; round: number }) {
  const stripes = Math.ceil((size * 2) / 12) + 2;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: round,
        backgroundColor: '#0F0E0B',
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: stripes }).map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: -size,
            left: i * 12 - size,
            width: 6,
            height: size * 3,
            backgroundColor: void_.inset,
            transform: [{ rotate: '45deg' }],
          }}
        />
      ))}
    </View>
  );
}

/** Overlapping participant initials, as on the Home tonight card. */
export function AvatarStack({ initials, openSlot }: { initials: string[]; openSlot?: boolean }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {initials.map((ini, i) => (
        <View
          key={ini + i}
          style={{
            width: 26,
            height: 26,
            borderRadius: radius.pill,
            backgroundColor: void_.inset,
            borderWidth: 1,
            borderColor: void_.bg,
            alignItems: 'center',
            justifyContent: 'center',
            ...(i > 0 ? { marginLeft: -8 } : null),
          }}
        >
          <Txt size={9} weight="bold" color={gold.base}>
            {ini}
          </Txt>
        </View>
      ))}
      {openSlot ? (
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: 'rgba(243,238,229,.3)',
            marginLeft: -8,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Txt size={11} color={onVoid.faint}>
            +
          </Txt>
        </View>
      ) : null}
    </View>
  );
}
