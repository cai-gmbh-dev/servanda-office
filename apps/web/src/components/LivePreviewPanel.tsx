/**
 * Live Preview Panel — Sprint 7 (Team 04)
 *
 * Shows a live outline of the contract being built,
 * reflecting the current answers and selected clauses.
 * Updates reactively as the user answers interview questions.
 */

import { useMemo } from 'react';

interface Section {
  title: string;
  slots: Array<{
    clauseId: string;
    type: 'required' | 'optional' | 'alternative';
    alternativeClauseIds?: string[];
  }>;
}

interface ClausePreview {
  id: string;
  title: string;
  content: string;
}

interface LivePreviewPanelProps {
  contractTitle: string;
  sections: Section[];
  answers: Record<string, unknown>;
  selectedSlots: Record<string, string>;
  clausePreviews: Record<string, ClausePreview>;
}

export function LivePreviewPanel({
  contractTitle,
  sections,
  answers,
  selectedSlots,
  clausePreviews,
}: LivePreviewPanelProps) {
  const resolvedSections = useMemo(() => {
    return sections.map((section, sIdx) => {
      const resolvedClauses = section.slots
        .map((slot) => {
          // For alternative slots, use the selected alternative or the default
          const effectiveClauseId =
            slot.type === 'alternative' && selectedSlots[slot.clauseId]
              ? selectedSlots[slot.clauseId]
              : slot.clauseId;

          // For optional slots without selection, skip
          if (slot.type === 'optional' && !selectedSlots[slot.clauseId]) {
            return null;
          }

          const preview = clausePreviews[effectiveClauseId];
          return preview ?? { id: effectiveClauseId, title: 'Klausel', content: '' };
        })
        .filter(Boolean) as ClausePreview[];

      return {
        number: `§ ${sIdx + 1}`,
        title: section.title,
        clauses: resolvedClauses,
      };
    });
  }, [sections, selectedSlots, clausePreviews]);

  const substituteAnswers = (content: string): string => {
    return content.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      const value = answers[key];
      if (value === undefined || value === '') return `[${key}]`;
      if (typeof value === 'number') {
        return new Intl.NumberFormat('de-DE').format(value);
      }
      if (typeof value === 'boolean') {
        return value ? 'Ja' : 'Nein';
      }
      return String(value);
    });
  };

  return (
    <aside className="live-preview" aria-label="Vertragsvorschau">
      <h2>Vorschau</h2>

      <div className="live-preview__document">
        <h3 className="live-preview__title">{contractTitle || 'Neuer Vertrag'}</h3>

        {resolvedSections.length === 0 ? (
          <p className="live-preview__empty">
            Keine Abschnitte verfügbar. Beantworten Sie die Fragen, um die Vorschau zu sehen.
          </p>
        ) : (
          resolvedSections.map((section) => (
            <div key={section.number} className="live-preview__section">
              <h4>
                {section.number} {section.title}
              </h4>
              {section.clauses.map((clause, cIdx) => (
                <p key={clause.id} className="live-preview__clause">
                  <span className="live-preview__clause-num">({cIdx + 1})</span>{' '}
                  {substituteAnswers(clause.content) || (
                    <span className="live-preview__placeholder">[Inhalt wird geladen...]</span>
                  )}
                </p>
              ))}
              {section.clauses.length === 0 && (
                <p className="live-preview__placeholder">[Keine Klauseln ausgewählt]</p>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
