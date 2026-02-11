/**
 * QuestionInput Component — Sprint 7 (Team 04)
 *
 * Extracted and enhanced from InterviewPage.
 * Supports: text, number, currency, date, yes_no, single_choice, multiple_choice.
 */

export interface Question {
  key: string;
  type: string;
  label: string;
  required?: boolean;
  default?: unknown;
  helpText?: string;
  options?: Array<{ value: string; label: string }>;
  conditions?: Array<{
    questionKey: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'is_truthy';
    value?: unknown;
  }>;
}

interface QuestionInputProps {
  question: Question;
  value: unknown;
  onChange: (val: unknown) => void;
}

export function QuestionInput({ question, value, onChange }: QuestionInputProps) {
  const id = `q-${question.key}`;

  switch (question.type) {
    case 'text':
      return (
        <input
          id={id}
          type="text"
          value={(value as string) ?? (question.default as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          aria-required={question.required}
        />
      );
    case 'number':
    case 'currency':
      return (
        <input
          id={id}
          type="number"
          value={(value as number) ?? (question.default as number) ?? ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          aria-required={question.required}
          step={question.type === 'currency' ? '0.01' : '1'}
        />
      );
    case 'date':
      return (
        <input
          id={id}
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          aria-required={question.required}
        />
      );
    case 'yes_no':
      return (
        <fieldset>
          <legend className="sr-only">{question.label}</legend>
          <label>
            <input
              type="radio"
              name={id}
              checked={value === true}
              onChange={() => onChange(true)}
            />
            Ja
          </label>
          <label>
            <input
              type="radio"
              name={id}
              checked={value === false}
              onChange={() => onChange(false)}
            />
            Nein
          </label>
        </fieldset>
      );
    case 'single_choice':
      return (
        <select
          id={id}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          aria-required={question.required}
        >
          <option value="">Bitte wählen...</option>
          {question.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    case 'multiple_choice':
      return (
        <fieldset>
          <legend className="sr-only">{question.label}</legend>
          {question.options?.map((opt) => {
            const selected = Array.isArray(value) ? (value as string[]) : [];
            const isChecked = selected.includes(opt.value);
            return (
              <label key={opt.value} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {
                    const next = isChecked
                      ? selected.filter((v) => v !== opt.value)
                      : [...selected, opt.value];
                    onChange(next);
                  }}
                />
                {opt.label}
              </label>
            );
          })}
        </fieldset>
      );
    default:
      return (
        <input
          id={id}
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

/**
 * Evaluate whether a question should be visible based on its conditions.
 * All conditions must be met (AND logic).
 */
export function evaluateConditions(
  conditions: Question['conditions'],
  answers: Record<string, unknown>,
): boolean {
  if (!conditions || conditions.length === 0) return true;

  return conditions.every((cond) => {
    const answer = answers[cond.questionKey];

    switch (cond.operator) {
      case 'equals':
        return answer === cond.value;
      case 'not_equals':
        return answer !== cond.value;
      case 'contains':
        return Array.isArray(answer) && answer.includes(cond.value);
      case 'is_truthy':
        return Boolean(answer);
      default:
        return true;
    }
  });
}
