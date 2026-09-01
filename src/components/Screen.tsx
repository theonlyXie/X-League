import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { operative, void_ } from '@/theme/tokens';
import { TopBar } from '@/components/TopBar';

/**
 * The scrolling body of a screen.
 *
 * The design's artboards paint a phone bezel and a mock iOS status bar; a real
 * app gets those from the device, so this reserves the top inset instead of
 * drawing chrome over it.
 */
export function Screen({
  children,
  surface = 'void',
  contentStyle,
  scroll = true,
  bar = true,
  refreshControl,
}: {
  children: ReactNode;
  surface?: 'void' | 'operative';
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
  /**
   * The language switch and the refresh button. On by default, because they
   * belong on every screen; off for the few that are already a full-bleed
   * moment of their own, like the draw reveal.
   */
  bar?: boolean;
  /**
   * Pull-to-refresh. A screen backed by live data needs a way to ask again
   * that does not involve leaving and coming back, and on a phone that gesture
   * is the one people already try.
   */
  refreshControl?: ScrollViewProps['refreshControl'];
}) {
  const insets = useSafeAreaInsets();
  const backgroundColor = surface === 'void' ? void_.bg : operative.bg;

  if (!scroll) {
    return (
      <View style={{ flex: 1, backgroundColor, paddingTop: insets.top }}>
        {bar ? <TopBar /> : null}
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    /**
     * The keyboard used to sit on top of whatever somebody was typing into.
     * Half the forms in this app — a club's name, a venue's area, a score, a
     * message — are far enough down the screen that the field they were tapping
     * disappeared behind the keyboard the moment it opened, with no way to
     * scroll it back into view.
     *
     * `padding` on iOS and `height` on Android are the behaviours those two
     * platforms actually want; the ScrollView keeps the field reachable, and
     * `automaticallyAdjustKeyboardInsets` handles the iOS case where the
     * keyboard opens over content that was already scrolled.
     */
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1, backgroundColor, paddingTop: insets.top }}>
        {bar ? <TopBar /> : null}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
