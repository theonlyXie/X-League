import { forwardRef } from 'react';
import { TextInput as RNTextInput, type TextInputProps } from 'react-native';
import { useI18n } from '@/i18n';

/**
 * A text field that types in the direction of the language, not the direction
 * of the process.
 *
 * React Native takes a field's default alignment from `I18nManager.isRTL`,
 * which is a native setting applied when the app starts. Switching language
 * cannot change it until the next launch — so somebody who switched to English
 * kept typing into right-aligned fields, and the `+20` sat on the wrong side of
 * the number. Asking the locale instead makes the direction correct in the same
 * frame the language changes, with no restart owed for the thing people notice
 * first.
 *
 * The caller's own style is applied last and still wins: the phone field is
 * left-to-right in both languages, because a phone number is.
 */
export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextField(props, ref) {
  const { rtl } = useI18n();
  return (
    <RNTextInput
      ref={ref}
      {...props}
      style={[
        { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' },
        props.style,
      ]}
    />
  );
});
