/**
 * Review Page — Sprint 9 (Team 04)
 *
 * Pre-completion review screen for contracts:
 * - Loads contract details + clause contents via batch endpoint
 * - Shows summary: title, client reference, all interview answers
 * - Renders clause content with placeholders replaced by answers
 * - Displays validation status (valid/warnings/conflicts)
 * - "Zurueck zum Interview" and "Vertrag abschliessen" actions
 * - Post-completion: Export trigger with DOCX download + polling
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useNotifications } from '../hooks/useNotifications';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ContractDetail {
  id: string;
  title: string;
  clientReference: string | null;
  templateVersionId: string;
  clauseVersionIds: string[];
  answers: Record<string, unknown>;
  validationState: string;
  validationMessages: Array<{ severity: string; message: string }> | null;
  status: string;
}

interface ClauseContent {
  id: string;
  clauseId: string;
  versionNumber: number;
  content: string;
  parameters: Record<string, unknown>;
}

interface BatchResponse {
  clauses: ClauseContent[];
}

type ExportState = 'idle' | 'creating' | 'processing' | 'ready' | 'error';

interface ExportJob {
  id: string;
  status: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EXPORT_POLL_INTERVAL = 2000;

const VALIDATION_STATE_LABELS: Record<string, string> = {
  valid: 'Gueltig',
  has_warnings: 'Warnungen vorhanden',
  has_conflicts: 'Konflikte vorhanden',
};

const VALIDATION_STATE_CLASS: Record<string, string> = {
  valid: 'review-validation--valid',
  has_warnings: 'review-validation--warnings',
  has_conflicts: 'review-validation--conflicts',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Replace `{placeholder}` tokens in clause content with actual answer values.
 * Unresolved placeholders remain as-is (highlighted in the UI via CSS).
 */
function resolveContent(
  content: string,
  answers: Record<string, unknown>,
): string {
  return content.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = answers[key];
    if (value === undefined || value === null || value === '') {
      return `{${key}}`; // leave unresolved
    }
    return String(value);
  });
}

/**
 * Format an answer value for human-readable display.
 */
function formatAnswerValue(value: unknown): string {
  if (value === null || value === undefined) return '–';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify } = useNotifications();

  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [clauses, setClauses] = useState<ClauseContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ---- Export state ---- */
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- Load contract + clause contents ---- */
  useEffect(() => {
    if (!id) {
      setError('Keine Vertrags-ID angegeben.');
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const contractData = await api.get<ContractDetail>(
          `/v1/contracts/${id}`,
        );
        setContract(contractData);

        // Load clause contents in batch if there are clause version IDs
        if (
          contractData.clauseVersionIds &&
          contractData.clauseVersionIds.length > 0
        ) {
          const batch = await api.post<BatchResponse>(
            '/v1/content/clauses/batch-content',
            { clauseVersionIds: contractData.clauseVersionIds },
          );
          setClauses(batch.clauses ?? []);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Fehler beim Laden des Vertrags',
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  /* ---- Complete contract ---- */
  const handleComplete = useCallback(async () => {
    if (!contract) return;
    setCompleting(true);
    setError(null);

    try {
      await api.post(`/v1/contracts/${contract.id}/complete`, {});
      setCompleted(true);
      setCompleting(false);
      notify('success', 'Vertrag abgeschlossen');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Fehler beim Abschliessen des Vertrags',
      );
      setCompleting(false);
    }
  }, [contract, notify]);

  /* ---- Export: Trigger ---- */
  const handleExport = useCallback(async () => {
    if (!contract) return;
    setExportState('creating');
    setExportError(null);

    try {
      const job = await api.post<ExportJob>('/v1/export', {
        contractInstanceId: contract.id,
        format: 'docx',
      });
      setExportJobId(job.id);
      setExportState('processing');
      notify('info', 'Export gestartet');
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Fehler beim Erstellen des Exports',
      );
      setExportState('error');
    }
  }, [contract, notify]);

  /* ---- Export: Polling ---- */
  useEffect(() => {
    if (exportState !== 'processing' || !exportJobId) return;

    async function pollExportStatus() {
      try {
        const job = await api.get<ExportJob>(`/v1/export/${exportJobId}`);
        if (job.status === 'completed') {
          setExportState('ready');
        } else if (job.status === 'failed') {
          setExportError('Export fehlgeschlagen. Bitte versuchen Sie es erneut.');
          setExportState('error');
        } else {
          // Still processing — schedule next poll
          pollTimerRef.current = setTimeout(pollExportStatus, EXPORT_POLL_INTERVAL);
        }
      } catch (err) {
        setExportError(
          err instanceof Error ? err.message : 'Fehler beim Abfragen des Export-Status',
        );
        setExportState('error');
      }
    }

    pollTimerRef.current = setTimeout(pollExportStatus, EXPORT_POLL_INTERVAL);

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [exportState, exportJobId]);

  /* ---- Export: Download ---- */
  const handleDownload = useCallback(() => {
    if (!exportJobId) return;
    const baseUrl = import.meta.env.VITE_API_URL ?? '/api';
    window.open(`${baseUrl}/v1/export/${exportJobId}/download`, '_blank');
  }, [exportJobId]);

  /* ---- Render: Loading ---- */
  if (loading) {
    return (
      <div className="review-page" role="status" aria-live="polite">
        <p>Vertrag wird geladen...</p>
      </div>
    );
  }

  /* ---- Render: Error (no contract loaded) ---- */
  if (error && !contract) {
    return (
      <div className="review-page">
        <p role="alert" className="error">
          {error}
        </p>
        <button type="button" onClick={() => navigate(-1)}>
          Zurueck
        </button>
      </div>
    );
  }

  if (!contract) return null;

  /* ---- Render: Completed — Export trigger ---- */
  if (completed) {
    return (
      <div className="review-page">
        <h1>Vertrag abgeschlossen</h1>

        <section className="review-completed" aria-label="Vertrag erfolgreich abgeschlossen">
          <p className="review-completed__message">
            Der Vertrag <strong>{contract.title}</strong> wurde erfolgreich abgeschlossen.
          </p>

          {/* Export status messages */}
          <div aria-live="assertive" className="export-status">
            {exportState === 'creating' && (
              <p role="status">Export wird erstellt...</p>
            )}
            {exportState === 'processing' && (
              <p role="status">Export wird erstellt...</p>
            )}
            {exportState === 'ready' && (
              <p role="status">Export bereit.</p>
            )}
            {exportState === 'error' && exportError && (
              <p role="alert" className="error">{exportError}</p>
            )}
          </div>

          {/* Actions */}
          <div className="review-actions">
            {exportState === 'idle' && (
              <button
                type="button"
                className="primary"
                onClick={handleExport}
              >
                DOCX exportieren
              </button>
            )}

            {(exportState === 'creating' || exportState === 'processing') && (
              <button
                type="button"
                className="primary"
                disabled
                aria-busy="true"
              >
                Export wird erstellt...
              </button>
            )}

            {exportState === 'ready' && (
              <button
                type="button"
                className="primary"
                onClick={handleDownload}
              >
                Herunterladen
              </button>
            )}

            {exportState === 'error' && (
              <button
                type="button"
                className="primary"
                onClick={handleExport}
              >
                Erneut versuchen
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate('/contracts')}
            >
              Zurueck zur Vertragsliste
            </button>
          </div>
        </section>
      </div>
    );
  }

  const answers = contract.answers ?? {};
  const answerKeys = Object.keys(answers);
  const hasConflicts = contract.validationState === 'has_conflicts';
  const validationMessages = contract.validationMessages ?? [];

  return (
    <div className="review-page">
      <h1>Vertragspruefung</h1>

      {/* ---- Header / Meta ---- */}
      <section className="review-meta" aria-label="Vertragsdetails">
        <dl>
          <dt>Titel</dt>
          <dd>{contract.title}</dd>

          <dt>Aktenzeichen</dt>
          <dd>{contract.clientReference ?? '–'}</dd>

          <dt>Status</dt>
          <dd>{contract.status}</dd>
        </dl>
      </section>

      {/* ---- Validation Status ---- */}
      <section
        className={`review-validation ${VALIDATION_STATE_CLASS[contract.validationState] ?? ''}`}
        aria-label="Validierungsstatus"
      >
        <h2>Validierung</h2>
        <p className="review-validation__state">
          {VALIDATION_STATE_LABELS[contract.validationState] ??
            contract.validationState}
        </p>

        {validationMessages.length > 0 && (
          <ul className="review-validation__messages">
            {validationMessages.map((msg, idx) => (
              <li
                key={idx}
                className={`validation-msg validation-msg--${msg.severity}`}
              >
                {msg.severity === 'hard' ? 'Konflikt: ' : 'Warnung: '}
                {msg.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- Interview Answers ---- */}
      <section className="review-answers" aria-label="Interview-Antworten">
        <h2>Ihre Angaben</h2>
        {answerKeys.length === 0 ? (
          <p>Keine Antworten vorhanden.</p>
        ) : (
          <dl className="review-answers__list">
            {answerKeys.map((key) => (
              <div key={key} className="review-answers__item">
                <dt>{key}</dt>
                <dd>{formatAnswerValue(answers[key])}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* ---- Clause Contents ---- */}
      <section className="review-clauses" aria-label="Vertragsklauseln">
        <h2>Klauseln</h2>
        {clauses.length === 0 ? (
          <p>Keine Klauseln geladen.</p>
        ) : (
          <ol className="review-clauses__list">
            {clauses.map((clause) => (
              <li key={clause.id} className="review-clause">
                <h3>
                  Klausel {clause.versionNumber} (
                  {clause.clauseId})
                </h3>
                <div className="review-clause__content">
                  {resolveContent(clause.content, answers)}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ---- Error (inline, after contract loaded) ---- */}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {/* ---- Actions ---- */}
      <div className="review-actions">
        <button
          type="button"
          onClick={() => navigate(-1)}
          disabled={completing}
        >
          Zurueck zum Interview
        </button>
        <button
          type="button"
          className="primary"
          onClick={handleComplete}
          disabled={completing || hasConflicts}
          aria-busy={completing}
        >
          {completing ? 'Wird abgeschlossen...' : 'Vertrag abschliessen'}
        </button>
      </div>

      {hasConflicts && (
        <p className="review-conflict-hint" role="status">
          Der Vertrag kann nicht abgeschlossen werden, solange Konflikte
          bestehen. Bitte kehren Sie zum Interview zurueck und beheben Sie die
          offenen Punkte.
        </p>
      )}
    </div>
  );
}
