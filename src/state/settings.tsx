import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nManager } from 'react-native';
import type { Locale } from '@/i18n/en';
import { loadJson, saveJson } from '@/lib/storage';

const STORAGE_KEY = 'xleague.settings.v1';

type Settings = {
  language: Locale;
  /** Kept for older installs; language is the source of truth. */
  rtl?: boolean;
};

type SettingsContextValue = {
  ready: boolean;
  language: Locale;
  rtl: boolean;
  setLanguage: (locale: Locale) => Promise<void>;
  /** @deprecated prefer setLanguage('ar' | 'en') */
  setRtl: (on: boolean) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function applyRtl(rtl: boolean) {
  if (I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [language, setLanguageState] = useState<Locale>(I18nManager.isRTL ? 'ar' : 'en');

  useEffect(() => {
    loadJson<Settings>(STORAGE_KEY, { language: 'en' }).then((s) => {
      const locale: Locale = s.language === 'ar' || s.rtl ? 'ar' : 'en';
      setLanguageState(locale);
      applyRtl(locale === 'ar');
      setReady(true);
    });
  }, []);

  const setLanguage = useCallback(async (locale: Locale) => {
    setLanguageState(locale);
    await saveJson(STORAGE_KEY, { language: locale, rtl: locale === 'ar' });
    applyRtl(locale === 'ar');
  }, []);

  const setRtl = useCallback(
    async (on: boolean) => {
      await setLanguage(on ? 'ar' : 'en');
    },
    [setLanguage],
  );

  const value = useMemo(
    () => ({
      ready,
      language,
      rtl: language === 'ar',
      setLanguage,
      setRtl,
    }),
    [ready, language, setLanguage, setRtl],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
