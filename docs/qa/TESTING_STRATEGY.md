# Testing Strategy - Servanda Office

**Version**: 1.0.0

---

## 1. Test-Philosophie

### 1.1 Grundsätze

- **Mandanten-Isolation**: Tenant-Scoping muss immer serverseitig enforced sein
- **Version Pinning**: Verträge müssen reproduzierbar bleiben
- **Accessibility First**: Jede Komponente muss a11y-Tests bestehen
- **Performance-Awareness**: Große Fragebögen (1000+ Fragen) müssen performant sein

### 1.2 Testing-Pyramide

```
          /\
         /  \
        / E2E\           5%  Kritische User Journeys
       /------\
      /        \
     / Integr.  \       25%  Komponenten + Parser
    /------------\
   /              \
  /     Unit       \    70%  Parser, Utils, Validators
 /------------------\
```

---

## 2. Test-Kategorien

### 2.1 Domain Tests (Kritisch)

```typescript
describe('Version Pinning', () => {
  it('should persist template and clause versions', () => {
    const contract = createContractInstance()
    expect(contract.templateVersionId).toBeDefined()
    expect(contract.clauseVersionIds.length).toBeGreaterThan(0)
  })
})

describe('Tenant Isolation', () => {
  it('should reject cross-tenant access', () => {
    expect(() => getContract({ tenantId: 't-1', id: 'c-2' })).toThrow()
  })
})
```

### 2.2 Component Tests

```typescript
describe('QuestionView', () => {
  it('should render question title', () => {
    render(<QuestionView question={mockQuestion} />)
    expect(screen.getByText('Laufzeit')).toBeInTheDocument()
  })

  it('should render help text when present', () => {
    render(<QuestionView question={questionWithHelp} />)
    expect(screen.getByText(/Hinweis/)).toBeInTheDocument()
  })

  it('should expand/collapse on click', async () => {
    render(<QuestionView question={mockQuestion} />)
    const toggle = screen.getByRole('button')

    await userEvent.click(toggle)
    expect(screen.getByTestId('question-details')).toBeVisible()

    await userEvent.click(toggle)
    expect(screen.queryByTestId('question-details')).not.toBeVisible()
  })
})
```

### 2.3 Accessibility Tests

```typescript
describe('Accessibility', () => {
  it('should have no violations in QuestionView', async () => {
    const { container } = render(<QuestionView question={mockQuestion} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('should have no violations in TemplatePicker', async () => {
    const { container } = render(<TemplatePicker templates={mockTemplates} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('should support keyboard navigation', async () => {
    render(<TemplatePicker templates={mockTemplates} />)

    await userEvent.tab()
    expect(screen.getByRole('treeitem')).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('treeitem')[1]).toHaveFocus()
  })
})
```

---

## 3. Test Fixtures

### 3.1 Fixture-Struktur

```
tests/
├── fixtures/
│   ├── templates/
│   └── clauses/
├── mocks/
│   ├── questions.ts
│   └── templates.ts
└── factories/
    └── domain.ts
```

### 3.2 Factory Functions

```typescript
export function createQuestion(overrides = {}): Question {
  return {
    id: 'q-1',
    title: 'Laufzeit',
    ...overrides
  }
}

export function createTemplate(overrides = {}): Template {
  return {
    id: crypto.randomUUID(),
    title: 'Test Template',
    versions: [],
    ...overrides
  }
}
```

---

## 4. E2E Tests

### 4.1 Kritische User Journeys

```typescript
// tests/e2e/create-contract.spec.ts
import { test, expect } from '@playwright/test'

test('user can create a contract', async ({ page }) => {
  await page.goto('/')

  // Select template
  await page.click('text=Muster A')

  // Answer questions
  await page.fill('input[name="laufzeit"]', '12 Monate')
  await page.click('text=Weiter')

  // Verify preview
  await expect(page.locator('.contract-preview')).toBeVisible()
})

test('user can export docx', async ({ page }) => {
  await page.goto('/')

  await page.click('text=Muster A')
  await page.click('text=Exportieren')
  await expect(page.locator('.export-status')).toContainText('bereit')
})
```

---

## 5. Performance Tests

### 5.1 Large Document Tests

```typescript
describe('Performance', () => {
  it('should render large question set under 500ms', async () => {
    const largeQuestionSet = generateQuestions(1000)

    const start = performance.now()
    render(<QuestionList questions={largeQuestionSet} />)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(500)
  })

  it('should render large list without jank', async () => {
    render(<ControlList controls={generateControls(1000)} />)

    const fps = await measureFPS()
    expect(fps).toBeGreaterThan(30)
  })
})
```

### 5.2 Lighthouse CI

```javascript
// lighthouserc.js
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:4173/'],
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
      }
    }
  }
}
```

---

## 6. Coverage Goals

| Area | Target | Reason |
|------|--------|--------|
| Parser | 90% | Critical for correctness |
| Validators | 90% | Critical for correctness |
| Components | 70% | UI has many edge cases |
| Utils | 80% | Shared functionality |

---

## 7. CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test -- --coverage
      - name: Check Coverage
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage too low: $COVERAGE%"
            exit 1
          fi

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

---

## 8. Test Commands

```bash
# Unit Tests
npm test

# Watch Mode
npm test -- --watch

# Coverage
npm test -- --coverage

# Single File
npm test -- parser.test.ts

# E2E Tests
npm run test:e2e

# E2E with UI
npm run test:e2e -- --ui
```

---

**Letzte Aktualisierung**: 2026-02-10

> **Hinweis:** Die vollständige Teststrategie v1 mit Servanda-spezifischen Security-Tests, Tenant-Isolation, Threat-Model-Coverage und E2E-Journeys findet sich in `docs/knowledge/test-strategy-v1.md`.
