import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface ContractItem {
  id: string;
  title: string;
  clientReference: string | null;
  status: string;
  validationState: string;
  createdAt: string;
  updatedAt: string;
}

interface ContractsResponse {
  data: ContractItem[];
  total: number;
  page: number;
  hasMore: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Entwurf',
  completed: 'Abgeschlossen',
  archived: 'Archiviert',
};

const VALIDATION_LABELS: Record<string, string> = {
  valid: 'Gültig',
  has_warnings: 'Warnungen',
  has_conflicts: 'Konflikte',
};

export function ContractsPage() {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ContractsResponse>('/contracts')
      .then((res) => setContracts(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1>Meine Verträge</h1>

      {loading && <p aria-live="polite">Verträge werden geladen...</p>}
      {error && <p role="alert" className="error">{error}</p>}

      {!loading && contracts.length === 0 && (
        <p>
          Noch keine Verträge erstellt.{' '}
          <a href="/catalog">Jetzt eine Vorlage wählen.</a>
        </p>
      )}

      {contracts.length > 0 && (
        <table aria-label="Vertragsliste">
          <thead>
            <tr>
              <th scope="col">Titel</th>
              <th scope="col">Aktenzeichen</th>
              <th scope="col">Status</th>
              <th scope="col">Validierung</th>
              <th scope="col">Zuletzt bearbeitet</th>
              <th scope="col">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id}>
                <td>{c.title}</td>
                <td>{c.clientReference ?? '–'}</td>
                <td>
                  <span className={`badge badge--status-${c.status}`}>
                    {STATUS_LABELS[c.status] ?? c.status}
                  </span>
                </td>
                <td>
                  <span className={`badge badge--validation-${c.validationState}`}>
                    {VALIDATION_LABELS[c.validationState] ?? c.validationState}
                  </span>
                </td>
                <td>{new Date(c.updatedAt).toLocaleDateString('de-DE')}</td>
                <td>
                  {c.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => navigate(`/contracts/${c.id}/edit`)}
                      aria-label={`Vertrag "${c.title}" bearbeiten`}
                    >
                      Bearbeiten
                    </button>
                  )}
                  {c.status === 'completed' && (
                    <button
                      type="button"
                      onClick={() => navigate(`/contracts/${c.id}/edit`)}
                      aria-label={`Vertrag "${c.title}" anzeigen`}
                    >
                      Anzeigen
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
