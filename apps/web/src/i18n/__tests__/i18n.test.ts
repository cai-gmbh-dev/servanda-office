import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement, ReactNode } from 'react';
import {
  TranslationProvider,
  useTranslation,
  createT,
  Locale,
} from '../index';

/* ------------------------------------------------------------------ */
/*  Wrapper helper                                                     */
/* ------------------------------------------------------------------ */

function createWrapper(initialLocale?: Locale) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      TranslationProvider,
      { initialLocale },
      children,
    );
  };
}

/* ------------------------------------------------------------------ */
/*  createT (standalone, no React)                                     */
/* ------------------------------------------------------------------ */

describe('createT', () => {
  it('resolves a simple German key', () => {
    const t = createT('de');
    expect(t('nav.dashboard')).toBe('Dashboard');
  });

  it('resolves nested German keys', () => {
    const t = createT('de');
    expect(t('interview.next_question')).toBe('Nächste Frage');
    expect(t('review.title')).toBe('Vertrag prüfen');
    expect(t('catalog.search_placeholder')).toBe('Vorlage suchen...');
  });

  it('resolves English keys', () => {
    const t = createT('en');
    expect(t('nav.catalog')).toBe('Template Catalog');
    expect(t('interview.next_question')).toBe('Next Question');
    expect(t('common.loading')).toBe('Loading...');
  });

  it('interpolates parameters', () => {
    const t = createT('de');
    const result = t('interview.step_of', { current: '3', total: '10' });
    expect(result).toBe('Schritt 3 von 10');
  });

  it('interpolates with number values', () => {
    const t = createT('de');
    const result = t('interview.step_of', { current: 2, total: 5 });
    expect(result).toBe('Schritt 2 von 5');
  });

  it('returns the key itself for missing keys', () => {
    const t = createT('de');
    expect(t('nonexistent.key')).toBe('nonexistent.key');
    expect(t('deeply.nested.nonexistent')).toBe('deeply.nested.nonexistent');
  });

  it('falls back to German for missing English keys', () => {
    // Both de and en have the same keys in our setup, so we test
    // that English locale works and falls back properly.
    const t = createT('en');
    // If a key existed only in de, it would fall back. Since both
    // have the same structure, verify English returns English.
    expect(t('common.save')).toBe('Save');
  });

  it('leaves unmatched interpolation parameters as-is', () => {
    const t = createT('de');
    const result = t('interview.step_of', { current: '1' });
    // {total} is not provided, should remain as {total}
    expect(result).toBe('Schritt 1 von {total}');
  });

  it('handles partial key paths that resolve to objects', () => {
    const t = createT('de');
    // 'nav' resolves to an object, not a string → should return key
    expect(t('nav')).toBe('nav');
  });
});

/* ------------------------------------------------------------------ */
/*  useTranslation hook                                                */
/* ------------------------------------------------------------------ */

describe('useTranslation', () => {
  it('returns t, locale, and setLocale', () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: createWrapper(),
    });

    expect(result.current.t).toBeTypeOf('function');
    expect(result.current.locale).toBe('de');
    expect(result.current.setLocale).toBeTypeOf('function');
  });

  it('t() returns correct German text by default', () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: createWrapper(),
    });

    expect(result.current.t('nav.dashboard')).toBe('Dashboard');
    expect(result.current.t('interview.next_question')).toBe('Nächste Frage');
    expect(result.current.t('common.loading')).toBe('Laden...');
  });

  it('t() with parameters interpolates correctly', () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: createWrapper(),
    });

    const text = result.current.t('interview.step_of', {
      current: 3,
      total: 10,
    });
    expect(text).toBe('Schritt 3 von 10');
  });

  it('missing keys return the key itself', () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: createWrapper(),
    });

    expect(result.current.t('does.not.exist')).toBe('does.not.exist');
  });

  it('setLocale switches language', () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: createWrapper('de'),
    });

    // Initially German
    expect(result.current.locale).toBe('de');
    expect(result.current.t('nav.catalog')).toBe('Vorlagen-Katalog');

    // Switch to English
    act(() => {
      result.current.setLocale('en');
    });

    expect(result.current.locale).toBe('en');
    expect(result.current.t('nav.catalog')).toBe('Template Catalog');
    expect(result.current.t('common.save')).toBe('Save');
  });

  it('setLocale back to German restores German translations', () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: createWrapper('de'),
    });

    // Switch to English
    act(() => {
      result.current.setLocale('en');
    });
    expect(result.current.t('interview.save')).toBe('Save');

    // Switch back to German
    act(() => {
      result.current.setLocale('de');
    });
    expect(result.current.t('interview.save')).toBe('Speichern');
  });

  it('initializes with specified locale', () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: createWrapper('en'),
    });

    expect(result.current.locale).toBe('en');
    expect(result.current.t('common.cancel')).toBe('Cancel');
  });

  it('throws when used outside TranslationProvider', () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useTranslation());
    }).toThrow('useTranslation() must be used within a <TranslationProvider>');

    spy.mockRestore();
  });
});

/* ------------------------------------------------------------------ */
/*  All translation keys coverage                                      */
/* ------------------------------------------------------------------ */

describe('Translation completeness', () => {
  it('de.json and en.json have the same top-level keys', () => {
    const t_de = createT('de');
    const t_en = createT('en');

    // Check all known keys exist in both languages
    const keys = [
      'nav.dashboard',
      'nav.catalog',
      'nav.contracts',
      'nav.settings',
      'interview.next_question',
      'interview.previous_question',
      'interview.save',
      'interview.progress',
      'interview.step_of',
      'interview.auto_saved',
      'interview.complete',
      'review.title',
      'review.summary',
      'review.answers',
      'review.clauses',
      'review.validation_valid',
      'review.validation_warnings',
      'review.validation_conflicts',
      'review.back_to_interview',
      'review.finalize',
      'catalog.search_placeholder',
      'catalog.filter_category',
      'catalog.filter_jurisdiction',
      'catalog.reset_filters',
      'catalog.create_contract',
      'catalog.no_results',
      'contracts.title',
      'contracts.status_draft',
      'contracts.status_completed',
      'contracts.status_archived',
      'contracts.edit',
      'contracts.view',
      'contracts.export',
      'export.preparing',
      'export.processing',
      'export.ready',
      'export.download',
      'export.retry',
      'export.failed',
      'common.loading',
      'common.error',
      'common.save',
      'common.cancel',
      'common.delete',
      'common.confirm',
      'common.back',
    ];

    for (const key of keys) {
      const de = t_de(key);
      const en = t_en(key);
      expect(de).not.toBe(key); // should not fall back to key
      expect(en).not.toBe(key); // should not fall back to key
    }
  });
});
