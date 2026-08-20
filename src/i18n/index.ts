import { useCallback, useMemo } from 'react';
import { ar } from './ar';
import { en, type Dict, type Locale } from './en';
import { useSettings } from '@/state/settings';

const catalogs: Record<Locale, Dict> = { en, ar };

type Vars = Record<string, string | number>;

/** Dot-path into the dictionary, e.g. `tabs.home` or `checkout.cashBody`. */
export type I18nKey = PathKeys<Dict>;

type PathKeys<T, P extends string = ''> = T extends string
  ? P
  : {
      [K in keyof T & string]: PathKeys<T[K], P extends '' ? K : `${P}.${K}`>;
    }[keyof T & string];

function lookup(dict: Dict, key: string): string | undefined {
  const parts = key.split('.');
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
  );
}

export function translate(locale: Locale, key: I18nKey, vars?: Vars): string {
  const primary = lookup(catalogs[locale], key);
  const fallback = locale === 'en' ? undefined : lookup(en, key);
  return interpolate(primary ?? fallback ?? key, vars);
}

export function useI18n() {
  const { language, setLanguage, rtl, ready } = useSettings();

  const t = useCallback((key: I18nKey, vars?: Vars) => translate(language, key, vars), [language]);

  const isAr = language === 'ar';

  return useMemo(
    () => ({
      t,
      language,
      setLanguage,
      rtl,
      isAr,
      ready,
      /** Prefer start/end over left/right when laying out bilingual UI. */
      writingDirection: (isAr ? 'rtl' : 'ltr') as 'rtl' | 'ltr',
    }),
    [t, language, setLanguage, rtl, isAr, ready],
  );
}

export type { Locale, Dict };
