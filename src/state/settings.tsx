import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nManager } from 'react-native';
import { loadJson, saveJson } from '@/lib/storage';

const STORAGE_KEY = 'xleague.settings.v1';

type Settings = { rtl: boolean };

type SettingsContextValue = {
  ready: boolean;
  rtl: boolean;
  setRtl: (on: boolean) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>({ rtl: I18nManager.isRTL });

  useEffect(() => {
    loadJson<Settings>(STORAGE_KEY, { rtl: false }).then((s) => {
      setSettings(s);
      setReady(true);
    });
  }, []);

  const setRtl = useCallback(async (rtl: boolean) => {
    setSettings({ rtl });
    await saveJson(STORAGE_KEY, { rtl });
    if (I18nManager.isRTL !== rtl) {
      I18nManager.allowRTL(rtl);
      I18nManager.forceRTL(rtl);
    }
  }, []);

  const value = useMemo(() => ({ ready, rtl: settings.rtl, setRtl }), [ready, settings.rtl, setRtl]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
