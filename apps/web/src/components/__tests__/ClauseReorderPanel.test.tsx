import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent, act, checkA11y } from '../../test-utils';
import { ClauseReorderPanel, TemplateSection } from '../ClauseReorderPanel';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const SECTIONS: TemplateSection[] = [
  {
    title: 'Allgemeines',
    slots: [
      { clauseId: 'cl-required-1', type: 'required' },
      { clauseId: 'cl-optional-1', type: 'optional' },
      { clauseId: 'cl-alternative-1', type: 'alternative', alternativeClauseIds: ['cl-alt-a', 'cl-alt-b'] },
    ],
  },
  {
    title: 'Finanzen',
    slots: [
      { clauseId: 'cl-required-2', type: 'required' },
      { clauseId: 'cl-optional-2', type: 'optional' },
    ],
  },
];

const SELECTED_SLOTS: Record<string, string> = {
  'cl-optional-1': 'cl-optional-1',
  'cl-alternative-1': 'cl-alt-a',
};

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('ClauseReorderPanel', () => {
  it('renders all sections with titles', () => {
    render(
      <ClauseReorderPanel
        sections={SECTIONS}
        selectedSlots={SELECTED_SLOTS}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByText(/§ 1/)).toBeInTheDocument();
    expect(screen.getByText(/Allgemeines/)).toBeInTheDocument();
    expect(screen.getByText(/§ 2/)).toBeInTheDocument();
    expect(screen.getByText(/Finanzen/)).toBeInTheDocument();
  });

  it('renders all slots within each section', () => {
    render(
      <ClauseReorderPanel
        sections={SECTIONS}
        selectedSlots={SELECTED_SLOTS}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByText('cl-required-1')).toBeInTheDocument();
    expect(screen.getByText('cl-optional-1')).toBeInTheDocument();
    expect(screen.getByText('cl-alternative-1')).toBeInTheDocument();
    expect(screen.getByText('cl-required-2')).toBeInTheDocument();
    expect(screen.getByText('cl-optional-2')).toBeInTheDocument();
  });

  it('marks required slots as not draggable', () => {
    render(
      <ClauseReorderPanel
        sections={SECTIONS}
        selectedSlots={SELECTED_SLOTS}
        onReorder={vi.fn()}
      />,
    );

    // Find the required slot option by its aria-label
    const requiredOption = screen.getByRole('option', {
      name: /cl-required-1.*nicht verschiebbar/,
    });
    expect(requiredOption).toHaveAttribute('draggable', 'false');
  });

  it('marks optional and alternative slots as draggable', () => {
    render(
      <ClauseReorderPanel
        sections={SECTIONS}
        selectedSlots={SELECTED_SLOTS}
        onReorder={vi.fn()}
      />,
    );

    const optionalOption = screen.getByRole('option', {
      name: /cl-optional-1.*Optional/,
    });
    expect(optionalOption).toHaveAttribute('draggable', 'true');

    const altOption = screen.getByRole('option', {
      name: /cl-alternative-1.*Alternativ/,
    });
    expect(altOption).toHaveAttribute('draggable', 'true');
  });

  it('shows type badges for each slot', () => {
    render(
      <ClauseReorderPanel
        sections={SECTIONS}
        selectedSlots={SELECTED_SLOTS}
        onReorder={vi.fn()}
      />,
    );

    const listboxes = screen.getAllByRole('listbox');
    const firstSection = listboxes[0];

    expect(within(firstSection).getByText('Pflicht')).toBeInTheDocument();
    expect(within(firstSection).getByText('Optional')).toBeInTheDocument();
    expect(within(firstSection).getByText('Alternativ')).toBeInTheDocument();
  });

  it('uses role="listbox" and role="option" for accessibility', () => {
    render(
      <ClauseReorderPanel
        sections={SECTIONS}
        selectedSlots={SELECTED_SLOTS}
        onReorder={vi.fn()}
      />,
    );

    const listboxes = screen.getAllByRole('listbox');
    expect(listboxes).toHaveLength(2);

    // First section has 3 options
    const section0Options = within(listboxes[0]).getAllByRole('option');
    expect(section0Options).toHaveLength(3);

    // Second section has 2 options
    const section1Options = within(listboxes[1]).getAllByRole('option');
    expect(section1Options).toHaveLength(2);
  });

  it('calls onReorder with new order when using Alt+ArrowDown keyboard shortcut', async () => {
    const onReorder = vi.fn();
    render(
      <ClauseReorderPanel
        sections={SECTIONS}
        selectedSlots={SELECTED_SLOTS}
        onReorder={onReorder}
      />,
    );

    // Focus on the optional slot (index 1) in first section
    const optionalOption = screen.getByRole('option', {
      name: /cl-optional-1.*Optional/,
    });

    await act(async () => {
      optionalOption.focus();
      fireEvent.keyDown(optionalOption, { key: 'ArrowDown', altKey: true });
    });

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(0, [
      'cl-required-1',
      'cl-alternative-1',
      'cl-optional-1',
    ]);
  });

  it('calls onReorder with new order when using Alt+ArrowUp keyboard shortcut', async () => {
    const onReorder = vi.fn();
    render(
      <ClauseReorderPanel
        sections={SECTIONS}
        selectedSlots={SELECTED_SLOTS}
        onReorder={onReorder}
      />,
    );

    // Focus on the alternative slot (index 2) in first section
    const altOption = screen.getByRole('option', {
      name: /cl-alternative-1.*Alternativ/,
    });

    await act(async () => {
      altOption.focus();
      fireEvent.keyDown(altOption, { key: 'ArrowUp', altKey: true });
    });

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(0, [
      'cl-required-1',
      'cl-alternative-1',
      'cl-optional-1',
    ]);
  });

  it('does not move required slots via keyboard', async () => {
    const onReorder = vi.fn();
    render(
      <ClauseReorderPanel
        sections={SECTIONS}
        selectedSlots={SELECTED_SLOTS}
        onReorder={onReorder}
      />,
    );

    const requiredOption = screen.getByRole('option', {
      name: /cl-required-1.*nicht verschiebbar/,
    });

    await act(async () => {
      requiredOption.focus();
      fireEvent.keyDown(requiredOption, { key: 'ArrowDown', altKey: true });
    });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('announces reorder via live region', async () => {
    render(
      <ClauseReorderPanel
        sections={SECTIONS}
        selectedSlots={SELECTED_SLOTS}
        onReorder={vi.fn()}
      />,
    );

    const optionalOption = screen.getByRole('option', {
      name: /cl-optional-1.*Optional/,
    });

    await act(async () => {
      optionalOption.focus();
      fireEvent.keyDown(optionalOption, { key: 'ArrowDown', altKey: true });
    });

    const liveRegion = screen.getByTestId('reorder-announcement');
    expect(liveRegion.textContent).toContain('nach unten verschoben');
    expect(liveRegion.textContent).toContain('Position 3');
  });

  it('navigates focus with ArrowUp/ArrowDown (without Alt)', async () => {
    const onReorder = vi.fn();
    render(
      <ClauseReorderPanel
        sections={SECTIONS}
        selectedSlots={SELECTED_SLOTS}
        onReorder={onReorder}
      />,
    );

    const listboxes = screen.getAllByRole('listbox');
    const options = within(listboxes[0]).getAllByRole('option');

    // Focus first item and press ArrowDown (navigation only, no reorder)
    await act(async () => {
      options[0].focus();
      fireEvent.keyDown(options[0], { key: 'ArrowDown' });
    });

    // Navigation-only keystrokes should NOT trigger onReorder
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('renders panel heading', () => {
    render(
      <ClauseReorderPanel
        sections={SECTIONS}
        selectedSlots={SELECTED_SLOTS}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByText('Klausel-Reihenfolge')).toBeInTheDocument();
  });

  it('has no axe-core accessibility violations', async () => {
    const { container } = render(
      <ClauseReorderPanel
        sections={SECTIONS}
        selectedSlots={SELECTED_SLOTS}
        onReorder={vi.fn()}
      />,
    );

    const results = await checkA11y(container);
    expect(results).toHaveNoViolations();
  });
});
