import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, checkA11y } from '../../test-utils';
import { QuestionInput, evaluateConditions, Question } from '../QuestionInput';

// ---- Helper to build a question fixture ----
function makeQuestion(overrides: Partial<Question> & { key: string; type: string; label: string }): Question {
  return {
    required: false,
    ...overrides,
  };
}

// =========================================================================
// QuestionInput — rendering by type
// =========================================================================
describe('QuestionInput', () => {
  it('renders text input', () => {
    const q = makeQuestion({ key: 'name', type: 'text', label: 'Name' });
    render(<QuestionInput question={q} value="" onChange={vi.fn()} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('id', 'q-name');
  });

  it('renders number input', () => {
    const q = makeQuestion({ key: 'age', type: 'number', label: 'Alter' });
    render(<QuestionInput question={q} value="" onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('step', '1');
  });

  it('renders date input', () => {
    const q = makeQuestion({ key: 'dob', type: 'date', label: 'Geburtsdatum' });
    const { container } = render(<QuestionInput question={q} value="" onChange={vi.fn()} />);
    const input = container.querySelector('input[type="date"]');
    expect(input).toBeInTheDocument();
  });

  it('renders single_choice as a select dropdown', () => {
    const q = makeQuestion({
      key: 'color',
      type: 'single_choice',
      label: 'Farbe',
      options: [
        { value: 'red', label: 'Rot' },
        { value: 'blue', label: 'Blau' },
      ],
    });
    render(<QuestionInput question={q} value="" onChange={vi.fn()} />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByText('Rot')).toBeInTheDocument();
    expect(screen.getByText('Blau')).toBeInTheDocument();
    expect(screen.getByText('Bitte wählen...')).toBeInTheDocument();
  });

  it('renders multiple_choice as checkboxes', () => {
    const q = makeQuestion({
      key: 'features',
      type: 'multiple_choice',
      label: 'Features',
      options: [
        { value: 'a', label: 'Option A' },
        { value: 'b', label: 'Option B' },
      ],
    });
    render(<QuestionInput question={q} value={[]} onChange={vi.fn()} />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
  });

  it('renders yes_no as radio buttons', () => {
    const q = makeQuestion({ key: 'agree', type: 'yes_no', label: 'Einverstanden?' });
    render(<QuestionInput question={q} value={undefined} onChange={vi.fn()} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(screen.getByText('Ja')).toBeInTheDocument();
    expect(screen.getByText('Nein')).toBeInTheDocument();
  });

  it('renders currency input with step 0.01', () => {
    const q = makeQuestion({ key: 'price', type: 'currency', label: 'Preis' });
    render(<QuestionInput question={q} value="" onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('step', '0.01');
  });

  // ---- onChange interactions ----
  it('calls onChange with correct value for text input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const q = makeQuestion({ key: 'name', type: 'text', label: 'Name' });
    render(<QuestionInput question={q} value="" onChange={onChange} />);

    await user.type(screen.getByRole('textbox'), 'A');
    expect(onChange).toHaveBeenCalledWith('A');
  });

  it('calls onChange with number for number input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const q = makeQuestion({ key: 'age', type: 'number', label: 'Alter' });
    render(<QuestionInput question={q} value="" onChange={onChange} />);

    await user.type(screen.getByRole('spinbutton'), '5');
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('calls onChange with boolean for yes_no input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const q = makeQuestion({ key: 'agree', type: 'yes_no', label: 'Einverstanden?' });
    render(<QuestionInput question={q} value={undefined} onChange={onChange} />);

    await user.click(screen.getByText('Ja'));
    expect(onChange).toHaveBeenCalledWith(true);

    await user.click(screen.getByText('Nein'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('calls onChange with array for multiple_choice', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const q = makeQuestion({
      key: 'features',
      type: 'multiple_choice',
      label: 'Features',
      options: [
        { value: 'a', label: 'Option A' },
        { value: 'b', label: 'Option B' },
      ],
    });
    render(<QuestionInput question={q} value={[]} onChange={onChange} />);

    await user.click(screen.getByText('Option A'));
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  // ---- Accessibility ----
  it('has no axe-core accessibility violations', async () => {
    const q = makeQuestion({
      key: 'color',
      type: 'single_choice',
      label: 'Farbe',
      options: [
        { value: 'red', label: 'Rot' },
        { value: 'blue', label: 'Blau' },
      ],
    });
    const { container } = render(<QuestionInput question={q} value="" onChange={vi.fn()} />);
    const results = await checkA11y(container);
    expect(results).toHaveNoViolations();
  });
});

// =========================================================================
// evaluateConditions — pure function tests
// =========================================================================
describe('evaluateConditions', () => {
  it('returns true when no conditions', () => {
    expect(evaluateConditions(undefined, {})).toBe(true);
    expect(evaluateConditions([], {})).toBe(true);
  });

  it('equals operator matches', () => {
    const conditions: Question['conditions'] = [
      { questionKey: 'type', operator: 'equals', value: 'residential' },
    ];
    expect(evaluateConditions(conditions, { type: 'residential' })).toBe(true);
    expect(evaluateConditions(conditions, { type: 'commercial' })).toBe(false);
  });

  it('not_equals operator matches', () => {
    const conditions: Question['conditions'] = [
      { questionKey: 'type', operator: 'not_equals', value: 'residential' },
    ];
    expect(evaluateConditions(conditions, { type: 'commercial' })).toBe(true);
    expect(evaluateConditions(conditions, { type: 'residential' })).toBe(false);
  });

  it('contains operator matches array values', () => {
    const conditions: Question['conditions'] = [
      { questionKey: 'tags', operator: 'contains', value: 'premium' },
    ];
    expect(evaluateConditions(conditions, { tags: ['basic', 'premium'] })).toBe(true);
    expect(evaluateConditions(conditions, { tags: ['basic'] })).toBe(false);
    expect(evaluateConditions(conditions, { tags: 'premium' })).toBe(false); // not an array
  });

  it('is_truthy operator matches truthy values', () => {
    const conditions: Question['conditions'] = [
      { questionKey: 'agreed', operator: 'is_truthy' },
    ];
    expect(evaluateConditions(conditions, { agreed: true })).toBe(true);
    expect(evaluateConditions(conditions, { agreed: 'yes' })).toBe(true);
    expect(evaluateConditions(conditions, { agreed: false })).toBe(false);
    expect(evaluateConditions(conditions, { agreed: '' })).toBe(false);
    expect(evaluateConditions(conditions, {})).toBe(false);
  });

  it('AND logic — all conditions must pass', () => {
    const conditions: Question['conditions'] = [
      { questionKey: 'type', operator: 'equals', value: 'residential' },
      { questionKey: 'agreed', operator: 'is_truthy' },
    ];
    expect(
      evaluateConditions(conditions, { type: 'residential', agreed: true }),
    ).toBe(true);
    expect(
      evaluateConditions(conditions, { type: 'residential', agreed: false }),
    ).toBe(false);
    expect(
      evaluateConditions(conditions, { type: 'commercial', agreed: true }),
    ).toBe(false);
  });
});
