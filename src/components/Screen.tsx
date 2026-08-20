import { ReactNode } from 'react';
import { ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LanguageCorner } from '@/components/LanguageCorner';
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
  /** Compact EN / ع control in the top-right corner. */
  langCorner = true,
}: {
  children: ReactNode;
  surface?: 'void' | 'operative';
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
  langCorner?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const backgroundColor = surface === 'void' ? void_.bg : operative.bg;

  if (!scroll) {
    return (
      <View style={{ flex: 1, backgroundColor, paddingTop: insets.top }}>
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
        {langCorner ? <LanguageCorner surface={surface} /> : null}
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
      >
        {children}
      </ScrollView>
      {langCorner ? <LanguageCorner surface={surface} /> : null}
    </View>
  );
}
