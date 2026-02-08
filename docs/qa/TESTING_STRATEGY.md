# Testing Strategy - OSCAL Viewer

**Version**: 1.0.0

---

## 1. Test-Philosophie

### 1.1 Grundsätze

- **OSCAL-Korrektheit**: Parser müssen alle OSCAL-Versionen korrekt verarbeiten
- **Accessibility First**: Jede Komponente muss a11y-Tests bestehen
- **Performance-Awareness**: Große Dokumente (1000+ Controls) müssen performant sein

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

### 2.1 Parser Tests (Kritisch)

```typescript
describe('OSCAL Version Detection', () => {
  it('should detect OSCAL 1.0.0', () => {
    expect(detectVersion(oscal100)).toBe('1.0.0')
  })

  it('should detect OSCAL 1.0.4', () => {
    expect(detectVersion(oscal104)).toBe('1.0.4')
  })

  it('should detect OSCAL 1.1.0', () => {
    expect(detectVersion(oscal110)).toBe('1.1.0')
  })

  it('should detect OSCAL 1.1.2', () => {
    expect(detectVersion(oscal112)).toBe('1.1.2')
  })
})

describe('Catalog Parser', () => {
  const versions = ['1.0.0', '1.0.4', '1.1.0', '1.1.2']

  versions.forEach(version => {
    describe(`OSCAL ${version}`, () => {
      it('should parse valid catalog', () => {
        const result = parseCatalog(fixtures[version].catalog)
        expect(result.success).toBe(true)
      })

      it('should extract controls correctly', () => {
        const result = parseCatalog(fixtures[version].catalog)
        expect(result.data.controls.length).toBeGreaterThan(0)
      })

      it('should handle nested groups', () => {
        const result = parseCatalog(fixtures[version].catalog)
        expect(result.data.groups).toBeDefined()
      })
    })
  })
})
```

### 2.2 Component Tests

```typescript
describe('ControlView', () => {
  it('should render control title and id', () => {
    render(<ControlView control={mockControl} />)
    expect(screen.getByText('AC-1')).toBeInTheDocument()
    expect(screen.getByText('Access Control Policy')).toBeInTheDocument()
  })

  it('should render parameters when present', () => {
    render(<ControlView control={controlWithParams} />)
    expect(screen.getByText(/Parameter/)).toBeInTheDocument()
  })

  it('should expand/collapse on click', async () => {
    render(<ControlView control={mockControl} />)
    const toggle = screen.getByRole('button')

    await userEvent.click(toggle)
    expect(screen.getByTestId('control-details')).toBeVisible()

    await userEvent.click(toggle)
    expect(screen.queryByTestId('control-details')).not.toBeVisible()
  })
})
```

### 2.3 Accessibility Tests

```typescript
describe('Accessibility', () => {
  it('should have no violations in ControlView', async () => {
    const { container } = render(<ControlView control={mockControl} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('should have no violations in GroupTree', async () => {
    const { container } = render(<GroupTree groups={mockGroups} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('should support keyboard navigation', async () => {
    render(<GroupTree groups={mockGroups} />)

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
│   ├── oscal-1.0.0/
│   │   ├── catalog.json
│   │   ├── profile.json
│   │   └── ssp.json
│   ├── oscal-1.0.4/
│   │   └── ...
│   ├── oscal-1.1.0/
│   │   └── ...
│   └── oscal-1.1.2/
│       └── ...
├── mocks/
│   ├── controls.ts
│   └── groups.ts
└── factories/
    └── oscal.ts
```

### 3.2 Factory Functions

```typescript
export function createControl(overrides = {}): Control {
  return {
    id: 'AC-1',
    title: 'Access Control Policy',
    params: [],
    parts: [],
    ...overrides
  }
}

export function createCatalog(overrides = {}): Catalog {
  return {
    uuid: crypto.randomUUID(),
    metadata: {
      title: 'Test Catalog',
      'oscal-version': '1.1.2'
    },
    groups: [],
    ...overrides
  }
}
```

---

## 4. E2E Tests

### 4.1 Kritische User Journeys

```typescript
// tests/e2e/upload-catalog.spec.ts
import { test, expect } from '@playwright/test'

test('user can upload and view catalog', async ({ page }) => {
  await page.goto('/')

  // Upload file
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles('tests/fixtures/oscal-1.1.2/catalog.json')

  // Verify catalog loaded
  await expect(page.locator('h1')).toContainText('NIST')

  // Navigate to control
  await page.click('text=AC-1')
  await expect(page.locator('.control-detail')).toBeVisible()
})

test('user can search controls', async ({ page }) => {
  await page.goto('/')
  await uploadCatalog(page)

  // Search
  await page.fill('input[type="search"]', 'password')
  await expect(page.locator('.control-item')).toHaveCount(5)
})
```

---

## 5. Performance Tests

### 5.1 Large Document Tests

```typescript
describe('Performance', () => {
  it('should parse large catalog under 500ms', async () => {
    const largeCatalog = generateLargeCatalog(1000) // 1000 controls

    const start = performance.now()
    parseCatalog(largeCatalog)
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

**Letzte Aktualisierung**: 2024
