/**
 * LoadingSpinner — Sprint 13 (Team 04)
 *
 * Centered loading spinner with accessible labeling.
 * CSS-only animation (no external dependency).
 * Used as Suspense fallback for lazy-loaded routes.
 */

import './LoadingSpinner.css';

export function LoadingSpinner() {
  return (
    <div className="loading-spinner" role="status" aria-label="Seite wird geladen">
      <div className="loading-spinner__circle" aria-hidden="true" />
      <p className="loading-spinner__text">Wird geladen...</p>
    </div>
  );
}
