import { describe, it, expect } from 'vitest';
import { render, screen, checkA11y } from '../../test-utils';
import { LivePreviewPanel } from '../LivePreviewPanel';

// ---- Fixtures ----
const CLAUSE_PREVIEWS = {
  cl1: {
    id: 'cl1',
    title: 'Mietgegenstand',
    content: 'Der Vermieter überlässt dem Mieter {{mieterName}} die Wohnung in {{adresse}}.',
  },
  cl2: {
    id: 'cl2',
    title: 'Mietdauer',
    content: 'Das Mietverhältnis beginnt am {{startDatum}} und ist unbefristet.',
  },
  cl3: {
    id: 'cl3',
    title: 'Kaution',
    content: 'Die Kaution beträgt {{kautionBetrag}} Euro.',
  },
};

const SECTIONS = [
  {
    title: 'Allgemeines',
    slots: [
      { clauseId: 'cl1', type: 'required' as const },
      { clauseId: 'cl2', type: 'required' as const },
    ],
  },
  {
    title: 'Finanzen',
    slots: [
      { clauseId: 'cl3', type: 'optional' as const },
    ],
  },
];

describe('LivePreviewPanel', () => {
  it('renders contract title', () => {
    render(
      <LivePreviewPanel
        contractTitle="Mietvertrag Müller"
        sections={[]}
        answers={{}}
        selectedSlots={{}}
        clausePreviews={{}}
      />,
    );
    expect(screen.getByText('Mietvertrag Müller')).toBeInTheDocument();
  });

  it('renders section titles', () => {
    render(
      <LivePreviewPanel
        contractTitle="Test"
        sections={SECTIONS}
        answers={{}}
        selectedSlots={{ cl3: 'cl3' }}
        clausePreviews={CLAUSE_PREVIEWS}
      />,
    );
    expect(screen.getByText(/§ 1/)).toBeInTheDocument();
    expect(screen.getByText(/Allgemeines/)).toBeInTheDocument();
    expect(screen.getByText(/§ 2/)).toBeInTheDocument();
    expect(screen.getByText(/Finanzen/)).toBeInTheDocument();
  });

  it('substitutes {{key}} parameters with answer values', () => {
    render(
      <LivePreviewPanel
        contractTitle="Test"
        sections={SECTIONS}
        answers={{ mieterName: 'Max Müller', adresse: 'Berliner Str. 5', startDatum: '01.01.2025' }}
        selectedSlots={{ cl3: 'cl3' }}
        clausePreviews={CLAUSE_PREVIEWS}
      />,
    );
    expect(screen.getByText(/Max Müller/)).toBeInTheDocument();
    expect(screen.getByText(/Berliner Str\. 5/)).toBeInTheDocument();
    expect(screen.getByText(/01\.01\.2025/)).toBeInTheDocument();
  });

  it('shows [key] placeholder for unresolved parameters', () => {
    render(
      <LivePreviewPanel
        contractTitle="Test"
        sections={[{
          title: 'Allgemeines',
          slots: [{ clauseId: 'cl1', type: 'required' as const }],
        }]}
        answers={{}}
        selectedSlots={{}}
        clausePreviews={CLAUSE_PREVIEWS}
      />,
    );
    // Unresolved {{mieterName}} should become [mieterName]
    expect(screen.getByText(/\[mieterName\]/)).toBeInTheDocument();
    expect(screen.getByText(/\[adresse\]/)).toBeInTheDocument();
  });

  it('skips optional slots without selection', () => {
    render(
      <LivePreviewPanel
        contractTitle="Test"
        sections={SECTIONS}
        answers={{}}
        selectedSlots={{}}
        clausePreviews={CLAUSE_PREVIEWS}
      />,
    );
    // Optional cl3 should not render because selectedSlots does not include it
    // The Finanzen section should show "[Keine Klauseln ausgewählt]"
    expect(screen.getByText('[Keine Klauseln ausgewählt]')).toBeInTheDocument();
  });

  it('handles empty sections', () => {
    render(
      <LivePreviewPanel
        contractTitle="Test"
        sections={[]}
        answers={{}}
        selectedSlots={{}}
        clausePreviews={{}}
      />,
    );
    expect(
      screen.getByText(/Keine Abschnitte verfügbar/),
    ).toBeInTheDocument();
  });

  it('has no axe-core accessibility violations', async () => {
    const { container } = render(
      <LivePreviewPanel
        contractTitle="Mietvertrag"
        sections={SECTIONS}
        answers={{ mieterName: 'Max', adresse: 'Berlin', startDatum: '01.01.2025', kautionBetrag: 1500 }}
        selectedSlots={{ cl3: 'cl3' }}
        clausePreviews={CLAUSE_PREVIEWS}
      />,
    );
    const results = await checkA11y(container);
    expect(results).toHaveNoViolations();
  });
});
