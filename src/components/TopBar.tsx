import { useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { Rotate } from '@/components/icons';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { useI18n } from '@/i18n';
import { useRefresh } from '@/state/refresh';

/**
 * The two controls that belong on every screen.
 *
 * **Refresh**, because the app loads each screen once and then holds it, and
 * without a visible way to ask again the only way to see anything new was to
 * close the app and open it. The gesture existed on some screens; nobody finds
 * a gesture.
 *
 * **Language**, because this is an Arabic-first app and the switch was buried
 * at the bottom of the account screen — which is behind a sign-in. Somebody who
 * opens the app in the wrong language should not have to read the wrong
 * language to fix it.
 *
 * It sits above the screen's own content rather than inside a navigation
 * header, because most screens here draw their own title and back arrow.
 */
export function TopBar() {
  const { locale, setLocale, t } = useI18n();
  const refresh = useRefresh();
  const spin = useRef(new Animated.Value(0)).current;

  const turn = () => {
    spin.setValue(0);
    // One turn, on the UI thread, so the tap has an answer even when the
    // screen behind it is already showing what it was going to show.
    Animated.timing(spin, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    refresh();
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 2,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          padding: 2,
          borderRadius: radius.pill,
          backgroundColor: void_.surface,
          borderWidth: 1,
          borderColor: onVoid.edgeFaint,
        }}
      >
        {(['ar', 'en'] as const).map((code) => {
          const on = code === locale;
          return (
            <Pressable
              key={code}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={code === 'ar' ? 'العربية' : 'English'}
              hitSlop={6}
              onPress={() => {
                if (!on) void setLocale(code);
              }}
              style={{
                paddingVertical: 4,
                paddingHorizontal: 11,
                borderRadius: radius.pill,
                backgroundColor: on ? goldAlpha.fill : 'transparent',
              }}
            >
              <Txt size={11.5} weight={on ? 'bold' : 'semibold'} color={on ? gold.base : onVoid.faint}>
                {code === 'ar' ? 'ع' : 'EN'}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.refresh}
        hitSlop={8}
        onPress={turn}
        style={({ pressed }) => ({
          width: 32,
          height: 32,
          borderRadius: radius.icon,
          borderWidth: 1,
          borderColor: pressed ? goldAlpha.edge : onVoid.edgeFaint,
          backgroundColor: void_.surface,
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <Animated.View
          style={{
            transform: [
              { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
            ],
          }}
        >
          <Rotate size={16} color={onVoid.secondary} />
        </Animated.View>
      </Pressable>
    </View>
  );
}
