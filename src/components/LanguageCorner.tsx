import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from '@/components/Txt';
import { useI18n } from '@/i18n';
import { gold, ink, radius } from '@/theme/tokens';

type Props = {
  /** void = player dark chrome; operative = owner light chrome */
  surface?: 'void' | 'operative';
  offsetTop?: number;
  offsetRight?: number;
};

/**
 * Compact language toggle — top-right corner.
 * Label is the language you switch *to* (ع when English, EN when Arabic).
 */
export function LanguageCorner({ surface = 'void', offsetTop = 6, offsetRight = 14 }: Props) {
  const insets = useSafeAreaInsets();
  const { language, setLanguage, t } = useI18n();
  const next = language === 'ar' ? 'en' : 'ar';
  const label = language === 'ar' ? 'EN' : 'ع';
  const operative = surface === 'operative';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={next === 'ar' ? t('language.switchToArabic') : t('language.switchToEnglish')}
      hitSlop={10}
      onPress={() => void setLanguage(next)}
      style={({ pressed }) => ({
        position: 'absolute',
        top: insets.top + offsetTop,
        right: offsetRight,
        zIndex: 80,
        minWidth: 36,
        height: 32,
        paddingHorizontal: 10,
        borderRadius: radius.denseChip,
        borderWidth: 1,
        borderColor: operative ? 'rgba(20,18,16,.18)' : 'rgba(198,163,75,.45)',
        backgroundColor: pressed
          ? 'rgba(198,163,75,.2)'
          : operative
            ? 'rgba(255,255,255,.85)'
            : 'rgba(20,18,16,.72)',
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Txt size={12} weight="bold" color={operative ? gold.ink : gold.base}>
        {label}
      </Txt>
    </Pressable>
  );
}
