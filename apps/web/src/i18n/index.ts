/**
 * i18n Setup — Sprint 12 (Team 04)
 *
 * Lightweight i18n framework for Servanda Office.
 * Uses React Context + JSON translation files.
 * Default language: de (German).
 * Fallback: de.
 * No external dependency (no react-i18next, no i18next).
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
  createElement,
} from 'react';

import deTranslations from './de.json';
import enTranslations from './en.json';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type Locale = 'de' | 'en';

/** Nested translation dictionary: keys can be strings or sub-objects. */
type TranslationDict = {
  [key: string]: string | TranslationDict;
};

/** Parameters for interpolation: `{ name: 'Müller' }` */
type TranslationParams = Record<string, string | number>;

/** Return type of useTranslation() hook. */
export interface UseTranslationReturn {
  /** Translate a dot-separated key, optionally with interpolation params. */
  t: (key: string, params?: TranslationParams) => string;
  /** Current locale. */
  locale: Locale;
  /** Switch locale. */
  setLocale: (locale: Locale) => void;
}

/* ------------------------------------------------------------------ */
/*  Translation registry                                               */
/* ------------------------------------------------------------------ */

const translations: Record<Locale, TranslationDict> = {
  de: deTranslations as TranslationDict,
  en: enTranslations as TranslationDict,
};

const DEFAULT_LOCALE: Locale = 'de';
const FALLBACK_LOCALE: Locale = 'de';

/* ------------------------------------------------------------------ */
/*  Core resolver                                                      */
/* ------------------------------------------------------------------ */

/**
 * Resolve a dot-separated key like 'interview.step_of' from a
 * nested translation dictionary. Returns undefined if not found.
 */
function resolveKey(dict: TranslationDict, key: string): string | undefined {
  const parts = key.split('.');
  let current: TranslationDict | string = dict;

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as TranslationDict)[part];
    if (current === undefined) {
      return undefined;
    }
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Replace `{param}` placeholders with actual values.
 * Unmatched placeholders remain as-is.
 */
function interpolate(template: string, params: TranslationParams): string {
  return template.replace(/\{(\w+)\}/g, (_match, paramKey: string) => {
    const value = params[paramKey];
    if (value === undefined) return `{${paramKey}}`;
    return String(value);
  });
}

/**
 * Create a `t` function for a given locale.
 */
export function createT(locale: Locale): (key: string, params?: TranslationParams) => string {
  return (key: string, params?: TranslationParams): string => {
    // Try current locale
    const dict = translations[locale];
    let value = dict ? resolveKey(dict, key) : undefined;

    // Fallback to default locale if not found
    if (value === undefined && locale !== FALLBACK_LOCALE) {
      const fallbackDict = translations[FALLBACK_LOCALE];
      value = fallbackDict ? resolveKey(fallbackDict, key) : undefined;
    }

    // If still not found, return the key itself
    if (value === undefined) {
      return key;
    }

    // Interpolate parameters
    if (params) {
      return interpolate(value, params);
    }

    return value;
  };
}

/* ------------------------------------------------------------------ */
/*  React Context                                                      */
/* ------------------------------------------------------------------ */

interface TranslationContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: TranslationParams) => string;
}

const TranslationContext = createContext<TranslationContextValue | null>(null);

/* ------------------------------------------------------------------ */
/*  TranslationProvider                                                */
/* ------------------------------------------------------------------ */

export interface TranslationProviderProps {
  /** Initial locale. Defaults to 'de'. */
  initialLocale?: Locale;
  children: ReactNode;
}

export function TranslationProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: TranslationProviderProps) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  const t = useCallback(
    (key: string, params?: TranslationParams): string => {
      return createT(locale)(key, params);
    },
    [locale],
  );

  const value = useMemo<TranslationContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, t],
  );

  return createElement(TranslationContext.Provider, { value }, children);
}

/* ------------------------------------------------------------------ */
/*  useTranslation Hook                                                */
/* ------------------------------------------------------------------ */

/**
 * Returns `{ t, locale, setLocale }` from the nearest TranslationProvider.
 * Throws if used outside a TranslationProvider.
 */
export function useTranslation(): UseTranslationReturn {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error(
      'useTranslation() must be used within a <TranslationProvider>. ' +
        'Wrap your component tree with <TranslationProvider>.',
    );
  }
  return context;
}
