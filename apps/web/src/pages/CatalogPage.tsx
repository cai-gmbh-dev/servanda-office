import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { ChangelogPanel } from '../components/ChangelogPanel';

interface TemplateItem {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  jurisdiction: string;
  legalArea: string | null;
  tags: string[];
  latestVersion: { id: string; versionNumber: number } | null;
}

interface CatalogResponse {
  data: TemplateItem[];
  total: number;
  page: number;
  hasMore: boolean;
}

export function CatalogPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Changelog panel state
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [changelogTemplateId, setChangelogTemplateId] = useState<string>('');

  // Filter state from URL params
  const searchQuery = searchParams.get('q') ?? '';
  const selectedCategory = searchParams.get('category') ?? '';
  const selectedJurisdiction = searchParams.get('jurisdiction') ?? '';

  useEffect(() => {
    api
      .get<CatalogResponse>('/content/catalog/templates')
      .then((res) => setTemplates(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Extract unique filter values
  const categories = useMemo(
    () => [...new Set(templates.map((t) => t.category).filter((c): c is string => c !== null))].sort(),
    [templates],
  );
  const jurisdictions = useMemo(
    () => [...new Set(templates.map((t) => t.jurisdiction))].sort(),
    [templates],
  );

  // Client-side filtering
  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())
        && !t.description?.toLowerCase().includes(searchQuery.toLowerCase())
        && !t.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))) {
        return false;
      }
      if (selectedCategory && t.category !== selectedCategory) return false;
      if (selectedJurisdiction && t.jurisdiction !== selectedJurisdiction) return false;
      return true;
    });
  }, [templates, searchQuery, selectedCategory, selectedJurisdiction]);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    setSearchParams(params, { replace: true });
  }

  function clearFilters() {
    setSearchParams({}, { replace: true });
  }

  function handleSelect(template: TemplateItem) {
    if (!template.latestVersion) return;
    navigate(`/contracts/new/${template.latestVersion.id}`);
  }

  function handleOpenChangelog(templateId: string) {
    setChangelogTemplateId(templateId);
    setChangelogOpen(true);
  }

  function handleCloseChangelog() {
    setChangelogOpen(false);
  }

  const hasActiveFilters = searchQuery || selectedCategory || selectedJurisdiction;

  return (
    <div className="catalog-page">
      <h1>Vorlagen-Katalog</h1>
      <p>Waehlen Sie eine Vorlage, um einen neuen Vertrag zu erstellen.</p>

      {/* Filter Bar */}
      <div className="filter-bar" role="search" aria-label="Vorlagen filtern">
        <div className="filter-row">
          <label htmlFor="catalog-search" className="sr-only">Suche</label>
          <input
            id="catalog-search"
            type="search"
            placeholder="Vorlage suchen..."
            value={searchQuery}
            onChange={(e) => updateFilter('q', e.target.value)}
            aria-label="Vorlagen durchsuchen"
          />

          <label htmlFor="category-filter" className="sr-only">Kategorie</label>
          <select
            id="category-filter"
            value={selectedCategory}
            onChange={(e) => updateFilter('category', e.target.value)}
            aria-label="Nach Kategorie filtern"
          >
            <option value="">Alle Kategorien</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <label htmlFor="jurisdiction-filter" className="sr-only">Rechtsgebiet</label>
          <select
            id="jurisdiction-filter"
            value={selectedJurisdiction}
            onChange={(e) => updateFilter('jurisdiction', e.target.value)}
            aria-label="Nach Rechtsgebiet filtern"
          >
            <option value="">Alle Rechtsgebiete</option>
            {jurisdictions.map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>

          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} className="btn-clear" aria-label="Filter zuruecksetzen">
              Filter zuruecksetzen
            </button>
          )}
        </div>

        {!loading && (
          <p className="filter-count" aria-live="polite">
            {filtered.length} von {templates.length} Vorlagen
          </p>
        )}
      </div>

      {loading && <p aria-live="polite">Vorlagen werden geladen...</p>}
      {error && <p role="alert" className="error">{error}</p>}

      {!loading && filtered.length === 0 && templates.length > 0 && (
        <p>Keine Vorlagen fuer die gewaehlten Filter gefunden.</p>
      )}

      {!loading && templates.length === 0 && (
        <p>Keine veroeffentlichten Vorlagen verfuegbar.</p>
      )}

      <div className="template-grid" role="list" aria-label="Vorlagen">
        {filtered.map((t) => (
          <article key={t.id} className="template-card" role="listitem">
            <h2>{t.title}</h2>
            {t.description && <p>{t.description}</p>}
            <div className="template-meta">
              {t.category && <span className="badge">{t.category}</span>}
              <span className="badge">{t.jurisdiction}</span>
              {t.legalArea && <span className="badge badge--area">{t.legalArea}</span>}
              {t.tags.map((tag) => (
                <span key={tag} className="badge badge--tag">{tag}</span>
              ))}
            </div>
            <div className="template-card__actions">
              <button
                type="button"
                onClick={() => handleSelect(t)}
                disabled={!t.latestVersion}
                aria-label={`Vertrag erstellen mit Vorlage ${t.title}`}
              >
                Vertrag erstellen
              </button>
              <button
                type="button"
                className="btn-changelog"
                onClick={() => handleOpenChangelog(t.id)}
                aria-label={`Versionshistorie fuer Vorlage ${t.title}`}
              >
                Historie
              </button>
            </div>
          </article>
        ))}
      </div>

      {/* Changelog Slide-Over Panel */}
      <ChangelogPanel
        entityType="template"
        entityId={changelogTemplateId}
        isOpen={changelogOpen}
        onClose={handleCloseChangelog}
      />
    </div>
  );
}
