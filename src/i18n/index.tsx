import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nManager, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STRINGS } from './strings';
import * as fmt from './format';
import { translateReason } from './reasons';

/**
 * Language and direction (NFR-LOC-001, AUTH-002).
 *
 * On native, mirroring is a process-level setting: `I18nManager.forceRTL` only
 * takes effect after a reload, which is why switching language says so rather
 * than pretending the layout flipped. On web the direction is applied to the
 * document immediately. Either way `dir` below is the truth the screens read,
 * so a screen never has to ask which platform it is on.
 */

export type Locale = fmt.Locale;

const STORAGE_KEY = 'x-league.locale';

type I18nValue = {
  locale: Locale;
  /** True when the interface should read right-to-left. */
  rtl: boolean;
  /** 'rtl' | 'ltr' — for `writingDirection` and web `dir`. */
  dir: 'rtl' | 'ltr';
  /** True when a restart is needed for mirroring to take effect (native only). */
  needsRestart: boolean;
  t: (typeof STRINGS)['en'];
  /**
   * A refusal the database sent back, in this reader's language.
   *
   * Every screen that shows a server `reason` goes through here. Anything not
   * mapped falls back to the English sentence, which says something true —
   * never a generic apology, which says nothing anybody can act on.
   */
  reason: (text: string | null | undefined) => string | null;
  setLocale: (locale: Locale) => Promise<void>;

  // Locale-aware formatting, bound to the current language.
  num: (value: number) => string;
  money: (value: number) => string;
  hour: (iso: string) => string;
  shortDate: (iso: string) => string;
  longDate: (iso: string) => string;
  slot: (label: string) => string;
  /** An hour of the day from its 24-hour number: `9:00 PM`, `١٠:٠٠ ص`. */
  hourLabel: (hour24: number) => string;
  /** A moment with its hour: `3:00 PM on Sun 30 Aug`. */
  moment: (iso: string) => string;
  clock: (text: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [needsRestart, setNeedsRestart] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'ar' || stored === 'en') applyDirection(stored, setLocaleState);
      })
      .catch(() => {});
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    await AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
    const flipped = applyDirection(next, setLocaleState);
    // On native the mirroring itself only lands after a reload.
    setNeedsRestart(Platform.OS !== 'web' && flipped);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const rtl = locale === 'ar';
    return {
      locale,
      rtl,
      dir: rtl ? 'rtl' : 'ltr',
      needsRestart,
      t: STRINGS[locale] as (typeof STRINGS)['en'],
      setLocale,
      reason: (text) => translateReason(text, locale),
      num: (v) => fmt.num(v, locale),
      money: (v) => fmt.money(v, locale),
      hour: (iso) => fmt.hour(iso, locale),
      shortDate: (iso) => fmt.shortDate(iso, locale),
      longDate: (iso) => fmt.longDate(iso, locale),
      slot: (l) => fmt.slotLabel(l, locale),
      hourLabel: (h) => fmt.hourLabel(h, locale),
      moment: (iso) => fmt.momentLabel(iso, locale),
      clock: (c) => fmt.clock(c, locale),
    };
  }, [locale, needsRestart, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Apply the direction as far as the platform allows, and report whether a
 * restart is still owed.
 */
function applyDirection(next: Locale, commit: (l: Locale) => void): boolean {
  const rtl = next === 'ar';
  let restartOwed = false;

  if (Platform.OS === 'web') {
    // The document carries direction on web, so mirroring is immediate.
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
      document.documentElement.setAttribute('lang', next);
    }
  } else if (I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
    restartOwed = true;
  }

  commit(next);
  return restartOwed;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside an I18nProvider');
  return ctx;
}
