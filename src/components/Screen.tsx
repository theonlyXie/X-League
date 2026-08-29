import { ReactNode } from 'react';
import { ScrollView, ScrollViewProps, StyleProp, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { operative, void_ } from '@/theme/tokens';

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
  refreshControl,
}: {
  children: ReactNode;
  surface?: 'void' | 'operative';
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
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
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor, paddingTop: insets.top }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        {children}
      </ScrollView>
    </View>
  );
}
