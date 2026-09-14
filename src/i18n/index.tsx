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

/**
 * The language, if there is one — for the few things drawn outside the tree.
 *
 * `useI18n` throws when it cannot find a provider, which is right for a screen:
 * a screen with no strings is a bug worth stopping on. It is wrong for a piece
 * of type. `Txt` is rendered by the error boundary, and the boundary sits
 * *above* this provider on purpose so that a failure inside the provider is
 * still caught — so the boundary's own fallback had no language to read and
 * threw while rendering the message about the first error. React has nothing
 * above a boundary that throws in its own render, so the app died, and it died
 * before `componentDidCatch` could write the breadcrumb: every one of those
 * crashes reached us as "closed with no message recorded".
 *
 * Returning null instead lets type render in the default direction when there
 * is no provider, which is exactly what an English-only error screen wants.
 */
export function useI18nOptional(): I18nValue | null {
  return useContext(I18nContext);
}

/**
 * Mirroring is allowed, and nothing more is decided here.
 *
 * This used to force RTL at module scope, on the reasoning that Arabic is the
 * first language and native mirroring is applied at startup. It ran on *every*
 * launch, before the stored preference had been read — so somebody who chose
 * English got RTL forced back on the next time they opened the app, and typed
 * into fields that were still laid out right to left. The direction is decided
 * once the preference is known, below.
 */
if (Platform.OS !== 'web') {
  I18nManager.allowRTL(true);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Arabic until somebody says otherwise. Every player this is built for reads
  // Arabic first, and an app that opens in English asks them to read the wrong
  // language to find the switch.
  const [locale, setLocaleState] = useState<Locale>('ar');
  const [needsRestart, setNeedsRestart] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        // Nothing stored is the first launch, and the first launch is Arabic —
        // which still has to be *applied*, or the copy is Arabic while the
        // document is left in its default direction and every screen lays out
        // the wrong way round.
        applyDirection(stored === 'en' ? 'en' : 'ar', setLocaleState);
      })
      .catch(() => applyDirection('ar', setLocaleState));
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
