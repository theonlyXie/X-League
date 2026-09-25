import { ReactElement, ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Txt } from './Txt';
import { hitSlopTo44 } from './ui';
import { ChevronLeft, ChevronRight } from './icons';
import { burgundy, gold, ink, onOperative, operative, radius } from '@/theme/tokens';
import { useI18n } from '@/i18n';

/**
 * The redesign's building blocks, in Operative.
 *
 * `kit.tsx` carries the SportEase structure in the player app's gold on void.
 * Owner Mode keeps its own clothes — bone surfaces, ink for emphasis, gold only
 * for money and the app-sourced booking — so the same shapes are drawn again
 * here from the Operative tokens rather than recoloured at every call site.
 *
 * What already fitted stays in `operative.tsx` (the notice, the standing band,
 * the tiles, the mono figures, the compact row and its small buttons). This
 * file adds the structure the redesign brought: cards, section titles, the
 * menu, the tall primary action and the footer it is pinned in.
 *
 * Nothing here fetches.
 */

/* ------------------------------------------------------------------------ */
/* Page                                                                      */
/* ------------------------------------------------------------------------ */

/**
 * One Owner Mode screen. A title makes it a sub-screen with a pinned back
 * header; a footer pins the screen's main action under the scroll.
 *
 * `OwnerHeader` already sits above every one of these with the status-bar
 * inset, so nothing here pads for it.
 */
export function OpPage({
  title,
  subtitle,
  onBack,
  right,
  footer,
  children,
  gap = 20,
  refreshControl,
}: {
  title?: string;
  subtitle?: string | null;
  onBack?: () => void;
  right?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  gap?: number;
  refreshControl?: ReactElement<RefreshControlProps>;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: operative.bg }}>
      {title ? <OpBackHeader title={title} subtitle={subtitle} onBack={onBack} right={right} /> : null}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 28, gap }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        {children}
      </ScrollView>
      {footer ? <OpStickyFooter>{footer}</OpStickyFooter> : null}
    </View>
  );
}

/** Back, a title, and room on the far side for an action. */
export function OpBackHeader({
  title,
  subtitle,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: onOperative.edge,
        backgroundColor: operative.bg,
      }}
    >
      {/* Labelled from the string table. The old `OpHeader` announced itself
          as "Back" in both languages. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.back}
        hitSlop={8}
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/owner')))}
        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
      >
        <ChevronLeft size={22} color={ink} />
      </Pressable>
      <View style={{ flex: 1, gap: 1 }}>
        <Txt size={18} weight="bold" em={-0.01} color={ink} numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt size={11.5} weight="semibold" color={onOperative.muted} numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** The large title a tab opens with, for the tabs that have no back. */
export function OpHeading({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Txt size={22} weight="bold" em={-0.02} color={ink} style={{ flexShrink: 1 }}>
        {title}
      </Txt>
      {right}
    </View>
  );
}

/* ------------------------------------------------------------------------ */
/* Sections                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * A section's title, with an optional line under it and an action on the far
 * side. Replaces the 9.5 px uppercase eyebrow, which was the smallest type on
 * the screen doing the job of its largest heading.
 */
export function OpSectionTitle({
  title,
  hint,
  action,
  onAction,
  right,
}: {
  title: string;
  hint?: string | null;
  action?: string;
  onAction?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Txt size={17} weight="bold" em={-0.01} color={ink} style={{ flexShrink: 1 }}>
          {title}
        </Txt>
        {right}
        {action && onAction ? (
          <Pressable accessibilityRole="button" accessibilityLabel={action} hitSlop={12} onPress={onAction}>
            <Txt size={12.5} weight="semibold" color={ink} style={{ textDecorationLine: 'underline' }}>
              {action}
            </Txt>
          </Pressable>
        ) : null}
      </View>
      {hint ? (
        <Txt size={12} lh={1.5} color={onOperative.muted}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

/** A titled section: the title, then what it is about. */
export function OpGroup({
  title,
  hint,
  action,
  onAction,
  right,
  children,
  gap = 12,
}: {
  /**
   * Left out where the back header already says it: a screen headed
   * "Requests" whose only section was also headed "Requests" said it twice.
   */
  title?: string;
  hint?: string | null;
  action?: string;
  onAction?: () => void;
  right?: ReactNode;
  children?: ReactNode;
  gap?: number;
}) {
  return (
    <View style={{ gap }}>
      {title ? (
        <OpSectionTitle title={title} hint={hint} action={action} onAction={onAction} right={right} />
      ) : hint ? (
        <Txt size={12.5} lh={1.5} color={onOperative.muted}>
          {hint}
        </Txt>
      ) : null}
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------------ */
/* Surfaces                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * A plain card. `accent` is the gold edge, for money and the app booking only;
 * `dashed` is an open hour — something the venue could still sell.
 */
export function OpCard({
  children,
  style,
  pad = 16,
  accent,
  dashed,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  pad?: number;
  accent?: boolean;
  dashed?: boolean;
}) {
  return (
    <View
      style={[
        {
          borderRadius: radius.cardInner,
          borderWidth: 1,
          borderStyle: dashed ? 'dashed' : 'solid',
          borderColor: accent ? 'rgba(198,163,75,.5)' : dashed ? 'rgba(20,18,16,.22)' : onOperative.hairline,
          backgroundColor: dashed ? 'transparent' : operative.surface,
          padding: pad,
          gap: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Nothing to show, said in a card rather than as a blank. */
export function OpEmpty({ title, blurb }: { title: string; blurb?: string | null }) {
  return (
    <OpCard style={{ gap: 5 }} pad={blurb ? 18 : 16}>
      {/* A lone line is usually a whole sentence, and reads as one rather
          than as a heading with nothing under it. */}
      <Txt size={blurb ? 14.5 : 13.5} weight={blurb ? 'bold' : 'semibold'} lh={1.45} color={blurb ? ink : onOperative.secondary}>
        {title}
      </Txt>
      {blurb ? (
        <Txt size={12} lh={1.5} color={onOperative.muted}>
          {blurb}
        </Txt>
      ) : null}
    </OpCard>
  );
}

/** The bar pinned to the foot of a screen, above the tab bar. */
export function OpStickyFooter({ children }: { children: ReactNode }) {
  // No home-indicator inset: every Owner Mode screen sits above the tab bar,
  // and the tab bar has already paid it.
  return (
    <View
      style={{
        paddingTop: 12,
        paddingBottom: 12,
        paddingHorizontal: 18,
        borderTopWidth: 1,
        borderTopColor: onOperative.edge,
        backgroundColor: operative.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {children}
    </View>
  );
}

/** A label and a value, for summaries. */
export function OpKeyValue({
  label,
  value,
  strong,
  money,
}: {
  label: string;
  value: string;
  strong?: boolean;
  /** Gold ink: the one colour this surface keeps for money. */
  money?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <Txt size={strong ? 14 : 13} weight={strong ? 'bold' : 'regular'} color={strong ? ink : onOperative.muted}>
        {label}
      </Txt>
      <Txt
        size={strong ? 15.5 : 13.5}
        weight={strong ? 'bold' : 'semibold'}
        color={money ? gold.ink : ink}
        style={{ flexShrink: 1, textAlign: 'right' }}
      >
        {value}
      </Txt>
    </View>
  );
}

/* ------------------------------------------------------------------------ */
/* Menu                                                                      */
/* ------------------------------------------------------------------------ */

/** Rows in a card, divided by hairlines. */
export function OpMenuGroup({ children }: { children: ReactNode }) {
  const rows = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View
      style={{
        width: '100%',
        borderRadius: radius.cardInner,
        borderWidth: 1,
        borderColor: onOperative.hairline,
        backgroundColor: operative.surface,
        overflow: 'hidden',
      }}
    >
      {rows.map((row, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: onOperative.edgeFaint } : null}>
          {row}
        </View>
      ))}
    </View>
  );
}

export type OpTone = 'plain' | 'money' | 'danger';

/** The colour an icon in a menu tile is drawn in, for the tile's tone. */
export const opIconInk = (tone: OpTone = 'plain') =>
  tone === 'money' ? gold.ink : tone === 'danger' ? burgundy.ink : ink;

/**
 * One destination: an icon in a tile, a title, a line under it, a chevron.
 * The tile is ink on the band; `money` makes it gold, since on this surface
 * gold says money and nothing else.
 */
export function OpMenuRow({
  icon,
  title,
  detail,
  onPress,
  tone = 'plain',
  right,
}: {
  icon: ReactNode;
  title: string;
  detail?: string | null;
  onPress?: () => void;
  tone?: OpTone;
  right?: ReactNode;
}) {
  const tile =
    tone === 'money' ? 'rgba(198,163,75,.18)' : tone === 'danger' ? 'rgba(139,33,53,.08)' : operative.band;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 13,
        paddingHorizontal: 14,
        backgroundColor: pressed ? 'rgba(20,18,16,.04)' : 'transparent',
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: radius.icon,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tile,
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={14.5} weight="semibold" color={tone === 'danger' ? burgundy.ink : ink}>
          {title}
        </Txt>
        {detail ? (
          <Txt size={11.5} lh={1.4} color={onOperative.faint} numberOfLines={2}>
            {detail}
          </Txt>
        ) : null}
      </View>
      {right ?? (onPress ? <ChevronRight size={16} color={onOperative.dim} /> : null)}
    </Pressable>
  );
}

/* ------------------------------------------------------------------------ */
/* Controls                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * The primary action, in the redesign's proportions: 50 tall, 14 corners.
 * Filled in ink rather than gold — the shift's verbs are not money.
 */
export function OpActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  flex,
  icon,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  flex?: boolean;
  icon?: ReactNode;
  accessibilityLabel?: string;
}) {
  const primary = variant === 'primary';
  const off = disabled || !onPress;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: flex ? 1 : undefined,
        alignSelf: flex ? undefined : 'stretch',
        height: 50,
        borderRadius: radius.row,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: primary ? ink : 'transparent',
        borderWidth: primary ? 0 : 1,
        borderColor: variant === 'danger' ? 'rgba(139,33,53,.4)' : onOperative.line,
        opacity: off ? 0.42 : pressed ? 0.85 : 1,
      })}
    >
      {icon}
      <Txt
        size={15}
        weight="bold"
        color={primary ? operative.surface : variant === 'danger' ? burgundy.ink : ink}
        numberOfLines={1}
        style={{ flexShrink: 1 }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * A rounded pill, for choosing one of a few: a pitch, a channel, a kind of
 * closure. Chosen is filled ink, as the pitch pickers already were.
 */
export function OpPill({
  label,
  on,
  onPress,
  size = 'md',
  role = 'radio',
  accessibilityLabel,
  disabled,
}: {
  label: string;
  on?: boolean;
  onPress?: () => void;
  size?: 'sm' | 'md';
  role?: 'radio' | 'button';
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  const h = size === 'sm' ? 30 : 36;
  return (
    <Pressable
      accessibilityRole={onPress ? role : undefined}
      accessibilityState={on !== undefined ? { selected: on, disabled: !!disabled } : { disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      disabled={!onPress || disabled}
      hitSlop={hitSlopTo44(h)}
      style={({ pressed }) => ({
        height: h,
        paddingHorizontal: size === 'sm' ? 11 : 14,
        borderRadius: radius.pill,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: on ? ink : onOperative.line,
        backgroundColor: on ? ink : pressed ? 'rgba(20,18,16,.04)' : 'transparent',
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <Txt size={size === 'sm' ? 11.5 : 12.5} weight={on ? 'bold' : 'semibold'} color={on ? operative.surface : ink}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** A row of pills that wraps. */
export function OpPills({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

/** A small word-link inside a card: "Decline", "Message the captain". */
export function OpLink({
  label,
  onPress,
  tone = 'plain',
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  tone?: 'plain' | 'danger';
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => ({ opacity: disabled ? 0.45 : pressed ? 0.7 : 1 })}
    >
      <Txt size={12.5} weight="semibold" color={tone === 'danger' ? burgundy.ink : ink}>
        {label}
      </Txt>
    </Pressable>
  );
}
