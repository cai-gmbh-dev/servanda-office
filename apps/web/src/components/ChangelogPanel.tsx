/**
 * Changelog Panel — Sprint 11 (Team 04)
 *
 * Slide-over panel showing version history for clauses or templates.
 * - Fetches changelog via GET /content/{clauses|templates}/:id/changelog
 * - Timeline with version, date, author, change type, summary, legal impact
 * - Color-coded change types: green=published, yellow=updated, red=deprecated
 * - Accessible: role="dialog", aria-label, Escape-to-close, Focus-Trap
 * - Loading / Error states
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChangelogEntry {
  version: number;
  date: string;
  author: string;
  changeType: 'created' | 'updated' | 'published' | 'deprecated';
  summary: string;
  legalImpact: 'none' | 'low' | 'medium' | 'high';
}

interface ChangelogResponse {
  entries: ChangelogEntry[];
}

export interface ChangelogPanelProps {
  entityType: 'clause' | 'template';
  entityId: string;
  isOpen: boolean;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CHANGE_TYPE_LABELS: Record<string, string> = {
  created: 'Erstellt',
  updated: 'Aktualisiert',
  published: 'Veroeffentlicht',
  deprecated: 'Veraltet',
};

const CHANGE_TYPE_CLASS: Record<string, string> = {
  created: 'changelog-entry--created',
  updated: 'changelog-entry--updated',
  published: 'changelog-entry--published',
  deprecated: 'changelog-entry--deprecated',
};

const LEGAL_IMPACT_LABELS: Record<string, string> = {
  none: 'Kein Einfluss',
  low: 'Gering',
  medium: 'Mittel',
  high: 'Hoch',
};

const LEGAL_IMPACT_CLASS: Record<string, string> = {
  none: 'badge-impact--none',
  low: 'badge-impact--low',
  medium: 'badge-impact--medium',
  high: 'badge-impact--high',
};

/* ------------------------------------------------------------------ */
/*  Helper: format date for German locale                              */
/* ------------------------------------------------------------------ */

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ChangelogPanel({
  entityType,
  entityId,
  isOpen,
  onClose,
}: ChangelogPanelProps) {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  /* ---- Determine API path ---- */
  const apiPath =
    entityType === 'clause'
      ? `/content/clauses/${entityId}/changelog`
      : `/content/templates/${entityId}/changelog`;

  /* ---- Fetch changelog when opened ---- */
  useEffect(() => {
    if (!isOpen || !entityId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<ChangelogResponse>(apiPath)
      .then((res) => {
        if (!cancelled) {
          setEntries(res.entries ?? []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Fehler beim Laden der Versionshistorie',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, entityId, apiPath]);

  /* ---- Focus trap + Escape handling ---- */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      // Escape to close
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Focus trap within the panel
      if (e.key === 'Tab' && panelRef.current) {
        const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusableElements.length === 0) return;

        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift+Tab: wrap from first to last
          if (document.activeElement === firstFocusable) {
            e.preventDefault();
            lastFocusable.focus();
          }
        } else {
          // Tab: wrap from last to first
          if (document.activeElement === lastFocusable) {
            e.preventDefault();
            firstFocusable.focus();
          }
        }
      }
    },
    [isOpen, onClose],
  );

  /* ---- Mount/unmount keyboard listener ---- */
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  /* ---- Focus management: save previous focus, restore on close ---- */
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Focus the close button after panel renders
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  /* ---- Prevent body scroll when panel is open ---- */
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  /* ---- Don't render if closed ---- */
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="changelog-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="changelog-panel"
        role="dialog"
        aria-label={`Versionshistorie ${entityType === 'clause' ? 'Klausel' : 'Vorlage'}`}
        aria-modal="true"
      >
        {/* Header */}
        <div className="changelog-panel__header">
          <h2 className="changelog-panel__title">Versionshistorie</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="changelog-panel__close"
            onClick={onClose}
            aria-label="Versionshistorie schliessen"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        {/* Content */}
        <div className="changelog-panel__content">
          {/* Loading state */}
          {loading && (
            <div className="changelog-loading" role="status" aria-live="polite">
              <div className="changelog-spinner" aria-hidden="true" />
              <p>Versionshistorie wird geladen...</p>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="changelog-error" role="alert">
              <p className="changelog-error__message">{error}</p>
              <button
                type="button"
                className="changelog-error__retry"
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  api
                    .get<ChangelogResponse>(apiPath)
                    .then((res) => setEntries(res.entries ?? []))
                    .catch((err) =>
                      setError(
                        err instanceof Error
                          ? err.message
                          : 'Fehler beim Laden',
                      ),
                    )
                    .finally(() => setLoading(false));
                }}
              >
                Erneut versuchen
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && entries.length === 0 && (
            <p className="changelog-empty">Keine Versionshistorie vorhanden.</p>
          )}

          {/* Timeline */}
          {!loading && !error && entries.length > 0 && (
            <ol className="changelog-timeline" aria-label="Versionseintraege">
              {entries.map((entry, idx) => (
                <li
                  key={`${entry.version}-${idx}`}
                  className={`changelog-entry ${CHANGE_TYPE_CLASS[entry.changeType] ?? ''}`}
                >
                  <div className="changelog-entry__marker" aria-hidden="true" />
                  <div className="changelog-entry__content">
                    <div className="changelog-entry__header">
                      <span className="changelog-entry__version">
                        v{entry.version}
                      </span>
                      <span
                        className={`changelog-entry__type badge-change badge-change--${entry.changeType}`}
                      >
                        {CHANGE_TYPE_LABELS[entry.changeType] ?? entry.changeType}
                      </span>
                      {entry.legalImpact && entry.legalImpact !== 'none' && (
                        <span
                          className={`badge-impact ${LEGAL_IMPACT_CLASS[entry.legalImpact] ?? ''}`}
                        >
                          {LEGAL_IMPACT_LABELS[entry.legalImpact] ?? entry.legalImpact}
                        </span>
                      )}
                    </div>
                    <time
                      className="changelog-entry__date"
                      dateTime={entry.date}
                    >
                      {formatDate(entry.date)}
                    </time>
                    <p className="changelog-entry__author">{entry.author}</p>
                    {entry.summary && (
                      <p className="changelog-entry__summary">{entry.summary}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </>
  );
}
