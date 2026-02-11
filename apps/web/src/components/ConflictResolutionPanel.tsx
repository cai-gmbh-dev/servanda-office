import { useState } from 'react';
import { api } from '../lib/api';

interface ValidationMessage {
  ruleId: string;
  clauseId: string;
  severity: 'hard' | 'soft';
  message: string;
}

interface ConflictResolutionPanelProps {
  contractId: string;
  validationState: string;
  validationMessages: ValidationMessage[];
  onResolved: () => void;
}

export function ConflictResolutionPanel({
  contractId,
  validationState,
  validationMessages,
  onResolved,
}: ConflictResolutionPanelProps) {
  const [resolving, setResolving] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const hardConflicts = validationMessages.filter((m) => m.severity === 'hard');
  const softWarnings = validationMessages.filter((m) => m.severity === 'soft');
  const visibleWarnings = softWarnings.filter((m) => !dismissed.has(m.ruleId));

  function dismissWarning(ruleId: string) {
    setDismissed((prev) => new Set([...prev, ruleId]));
  }

  async function revalidate() {
    setResolving(true);
    try {
      await api.post(`/contracts/${contractId}/validate`);
      onResolved();
    } finally {
      setResolving(false);
    }
  }

  if (validationState === 'valid' && validationMessages.length === 0) {
    return (
      <div className="conflict-panel conflict-panel--valid" role="status" aria-label="Validierung">
        <span className="conflict-icon" aria-hidden="true">&#10003;</span>
        <span>Keine Konflikte — Vertrag kann abgeschlossen werden.</span>
      </div>
    );
  }

  return (
    <div className="conflict-panel" role="region" aria-label="Konflikte und Warnungen">
      <h3>Validierung</h3>

      {hardConflicts.length > 0 && (
        <div className="conflict-section conflict-section--hard">
          <h4 className="conflict-heading--hard">
            <span aria-hidden="true">&#9888;</span>
            {hardConflicts.length} {hardConflicts.length === 1 ? 'Konflikt' : 'Konflikte'} (blockierend)
          </h4>
          <p className="conflict-hint">Diese Konflikte müssen gelöst werden, bevor der Vertrag abgeschlossen werden kann.</p>
          <ul className="conflict-list" role="list">
            {hardConflicts.map((m) => (
              <li key={m.ruleId} className="conflict-item conflict-item--hard" role="listitem">
                <span className="conflict-message">{m.message}</span>
                <span className="conflict-clause">Klausel: {m.clauseId.slice(0, 8)}...</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {visibleWarnings.length > 0 && (
        <div className="conflict-section conflict-section--soft">
          <h4 className="conflict-heading--soft">
            <span aria-hidden="true">&#9432;</span>
            {visibleWarnings.length} {visibleWarnings.length === 1 ? 'Warnung' : 'Warnungen'}
          </h4>
          <p className="conflict-hint">Warnungen blockieren den Abschluss nicht, sollten aber geprüft werden.</p>
          <ul className="conflict-list" role="list">
            {visibleWarnings.map((m) => (
              <li key={m.ruleId} className="conflict-item conflict-item--soft" role="listitem">
                <span className="conflict-message">{m.message}</span>
                <button
                  type="button"
                  className="btn-dismiss"
                  onClick={() => dismissWarning(m.ruleId)}
                  aria-label={`Warnung ausblenden: ${m.message}`}
                >
                  Ausblenden
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="conflict-actions">
        <button
          type="button"
          onClick={revalidate}
          disabled={resolving}
          className="btn-revalidate"
          aria-label="Erneut validieren"
        >
          {resolving ? 'Wird geprüft...' : 'Erneut validieren'}
        </button>
      </div>
    </div>
  );
}
