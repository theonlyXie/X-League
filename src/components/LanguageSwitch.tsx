import { Pressable, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { useI18n } from '@/i18n';
import { gold, ink, onOperative, onVoid, operative, radius, void_ } from '@/theme/tokens';

/** Language toggle used on Me and Owner More. */
export function LanguageSwitch({ surface = 'void' }: { surface?: 'void' | 'operative' }) {
  const { t, language, setLanguage } = useI18n();
  const isAr = language === 'ar';
  const titleColor = surface === 'operative' ? ink : onVoid.primary;
  const muted = surface === 'operative' ? onOperative.muted : onVoid.muted;
  const border = surface === 'operative' ? onOperative.hairline : onVoid.edge;
  const bg = surface === 'operative' ? operative.surface : void_.surface;

  return (
    <View style={{ gap: 10 }}>
      <Txt size={10} weight="semibold" em={0.14} upper color={surface === 'operative' ? onOperative.faint : onVoid.faint}>
        {t('language.title')}
      </Txt>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['en', 'ar'] as const).map((locale) => {
          const on = language === locale;
          return (
            <Pressable
              key={locale}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={locale === 'ar' ? t('language.arabic') : t('language.english')}
              onPress={() => void setLanguage(locale)}
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: radius.dense,
                borderWidth: 1,
                borderColor: on ? 'rgba(198,163,75,.55)' : border,
                backgroundColor: on ? 'rgba(198,163,75,.12)' : bg,
                alignItems: 'center',
                gap: 2,
              }}
            >
              <Txt size={14} weight="semibold" color={on ? gold.base : titleColor}>
                {locale === 'ar' ? t('language.arabic') : t('language.english')}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      <Txt size={12} color={muted}>
        {isAr ? t('language.arabicOn') : t('language.englishOn')}
      </Txt>
    </View>
  );
}
