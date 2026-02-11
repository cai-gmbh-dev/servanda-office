# Teststrategie v1 – Servanda Office MVP

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 06 (QA & Compliance)
**Referenzen:** Architecture Backbone v1, Threat Model, ADR-001, ADR-002, ADR-003, Audit-Compliance v1, QA-Gates CI v1

---

## 1. Test-Philosophie

### 1.1 Grundsätze

| Prinzip | Beschreibung | Begründung |
| --- | --- | --- |
| **Tenant-Isolation First** | Jeder Test-Run beweist, dass Tenant-Grenzen eingehalten werden | Kernversprechen der Plattform (ADR-001) |
| **Version Pinning Correctness** | Verträge müssen exakt reproduzierbar sein | Rechtliche Verbindlichkeit (ADR-002) |
| **Accessibility by Default** | Jede UI-Komponente besteht axe-core | Inklusiver Zugang für alle Kanzlei-Nutzer |
| **Security as Tests** | Threat-Model-Szenarien als automatisierte Tests | Prävention statt Reaktion |
| **Fast Feedback** | PR-Gate < 5 Minuten, Main-Gate < 15 Minuten | Entwickler-Produktivität |

### 1.2 Testing-Pyramide (Servanda-spezifisch)

```text
              /\
             /  \
            / E2E\               5%  Kritische User Journeys
           /------\                   (Contract Creation, Export)
          /        \
         / Integr.  \           25%  Modul-Übergreifend + DB
        /  + Security \               (Tenant Isolation, RLS,
       /---------------\               Pinning, Export Pipeline)
      /                  \
     /       Unit         \     70%  Domänenlogik, Validator,
    /                      \          Rules, Serialization
   /________________________\
```

**Verteilung nach Modul:**

| Modul | Unit | Integration | Security | E2E |
| --- | --- | --- | --- | --- |
| Identity | 60% | 20% | 20% | — |
| Content | 70% | 20% | 5% | 5% |
| Interview | 75% | 15% | — | 10% |
| Contract | 60% | 20% | 10% | 10% |
| Export | 50% | 30% | 10% | 10% |

---

## 2. Test-Kategorien

### 2.1 Unit Tests (70%)

**Scope:** Isolierte Domänenlogik ohne DB/Netzwerk.

| Bereich | Beispiel-Tests | Coverage-Ziel |
| --- | --- | --- |
| Rules Engine | `requires`/`forbids`/`incompatible`-Regeln auswerten | 90% |
| Validators | Antwort-Validierung, Pflichtfelder, Typen | 90% |
| Serialization | JSON→Domain, Domain→JSON Round-Trip | 90% |
| Interview Logic | Condition-Evaluation, Flow-Navigation, Skip-Logic | 85% |
| Version Pinning | Pin/Freeze/Upgrade-Logik (ohne DB) | 90% |
| Export Mapping | Template→DOCX Placeholder-Mapping | 85% |
| RBAC Checks | Permission-Matrix-Auswertung | 90% |
| UI Components | Render, Props, Events, States | 70% |
| Utils/Helpers | Date-Formatting, ID-Generation, Slug | 80% |

**Frameworks & Tools:**

- **Runner:** Vitest
- **Assertions:** Vitest built-in (`expect`)
- **Mocking:** Vitest `vi.mock`, `vi.fn`
- **UI:** React Testing Library + jsdom
- **Accessibility:** axe-core via `jest-axe`

```typescript
// Beispiel: Rule-Engine Unit Test
describe('RuleEngine', () => {
  it('evaluates requires-rule correctly', () => {
    const rules: Rule[] = [
      { type: 'requires', sourceClauseId: 'c1', targetClauseId: 'c2' }
    ]
    const selectedClauses = ['c1']
    const result = evaluateRules(rules, selectedClauses)
    expect(result.requiredClauses).toContain('c2')
    expect(result.valid).toBe(false)
  })

  it('evaluates forbids-rule correctly', () => {
    const rules: Rule[] = [
      { type: 'forbids', sourceClauseId: 'c1', targetClauseId: 'c3' }
    ]
    const selectedClauses = ['c1', 'c3']
    const result = evaluateRules(rules, selectedClauses)
    expect(result.conflicts).toHaveLength(1)
    expect(result.valid).toBe(false)
  })
})
```

### 2.2 Integration Tests (25%)

**Scope:** Modul-übergreifend, mit echtem PostgreSQL, ohne externe Dienste (Keycloak gemockt).

| Bereich | Was wird getestet | DB erforderlich |
| --- | --- | --- |
| Tenant Isolation | RLS filtert korrekt, Cross-Tenant-Zugriff blockiert | Ja |
| Version Pinning | ContractInstance-Lifecycle (Draft→Complete), Immutability-Trigger | Ja |
| Content Publishing | Clause-Versioning, Publish→Read-Cross-Tenant | Ja |
| Export Pipeline | Job-Erstellung, pgboss Queue, Worker-Pickup | Ja |
| Audit Events | Events werden korrekt geschrieben, Immutability | Ja |
| API Endpoints | REST-API mit Auth-Mock, Request/Response-Validierung | Ja |
| RBAC Enforcement | Endpoint-Schutz per Rolle | Ja |

**Test-Infrastruktur:**

```typescript
// tests/setup/integration.ts

import { PostgreSqlContainer } from '@testcontainers/postgresql'

let pgContainer: PostgreSqlContainer

beforeAll(async () => {
  pgContainer = await new PostgreSqlContainer('postgres:16')
    .withDatabase('servanda_test')
    .start()

  process.env.DATABASE_URL = pgContainer.getConnectionUri()
  await runMigrations()
})

afterAll(async () => {
  await pgContainer.stop()
})

// Tenant-Context Helper
export async function withTenantContext<T>(
  tenantId: string,
  fn: () => Promise<T>
): Promise<T> {
  await db.$executeRaw`SET LOCAL app.current_tenant_id = ${tenantId}`
  return fn()
}
```

**Vitest-Konfiguration für Integration:**

```typescript
// vitest.integration.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/setup/integration.ts'],
    pool: 'forks',         // Isolation zwischen Tests
    poolOptions: {
      forks: { singleFork: true }  // Shared DB, sequenziell
    },
    testTimeout: 30000
  }
})
```

### 2.3 Security Tests (in Integration)

**Scope:** Automatisierte Tests für alle Threat-Model-Szenarien.

| Threat-ID | Test | Kategorie |
| --- | --- | --- |
| T-01 | JWT mit gefälschtem `tenant_id` → 401 | JWT Security |
| T-02 | SQL-Injection mit fremder `tenant_id` → 0 Rows | RLS Enforcement |
| T-03 | API-Endpoint liefert keine Cross-Tenant-Daten | Tenant Isolation |
| T-04 | Export-Worker validiert tenantId aus Job | Export Security |
| T-05 | Vendor kann Kanzlei-Verträge nicht lesen | Vendor Isolation |
| T-06 | Abgelaufener JWT → 401 | JWT Security |
| T-07 | Admin-Zugriffe werden auditiert | Audit |
| T-08 | Path Traversal in Object Storage → 400 | Storage Security |
| T-09 | Alle Tabellen haben RLS enabled | RLS Coverage |
| T-10 | Error-Responses enthalten keine fremden Entity-IDs | Info Disclosure |
| T-11 | Kein Tenant-Switch ohne Re-Auth | Session Security |
| T-12 | Audit-Events: kein UPDATE/DELETE möglich | Audit Immutability |

**Vitest-Konfiguration für Security:**

```typescript
// vitest.security.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/security/**/*.test.ts'],
    setupFiles: ['tests/setup/integration.ts'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }
    },
    testTimeout: 30000
  }
})
```

### 2.4 E2E Tests (5%)

**Scope:** Kritische User Journeys End-to-End im Browser.

| Journey | Beschreibung | Priorität |
| --- | --- | --- |
| Contract Creation | Template wählen → Q&A beantworten → Vertrag fertigstellen | P0 |
| DOCX Export | Fertigen Vertrag exportieren → Download | P0 |
| Template Publishing | (Vendor) Clause erstellen → Version → Review → Publish | P0 |
| User Management | (Admin) Nutzer einladen → Rolle setzen | P1 |
| Audit Log View | (Admin) Audit-Log einsehen → Filtern → Exportieren | P1 |
| Version Upgrade | Draft-Vertrag → neue Template-Version → Upgrade | P1 |

**Framework:** Playwright

```typescript
// tests/e2e/contract-creation.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Contract Creation Journey', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, { tenant: 'kanzlei-test', role: 'editor' })
  })

  test('user creates a contract from template', async ({ page }) => {
    // 1. Template auswählen
    await page.goto('/contracts/new')
    await page.click('[data-testid="template-mietvertrag"]')

    // 2. Interview beantworten
    await page.fill('[name="laufzeit"]', '12 Monate')
    await page.fill('[name="miete"]', '1200')
    await page.click('[data-testid="next-question"]')

    // 3. Vertrag prüfen
    await expect(page.locator('[data-testid="contract-preview"]')).toBeVisible()
    await expect(page.locator('[data-testid="contract-preview"]')).toContainText('12 Monate')

    // 4. Fertigstellen
    await page.click('[data-testid="complete-contract"]')
    await expect(page.locator('[data-testid="contract-status"]')).toContainText('Fertig')
  })

  test('user exports contract as DOCX', async ({ page }) => {
    await page.goto('/contracts/test-contract-id')

    await page.click('[data-testid="export-button"]')
    await page.selectOption('[data-testid="export-format"]', 'docx')
    await page.click('[data-testid="start-export"]')

    // Warte auf Export-Completion
    await expect(page.locator('[data-testid="export-status"]'))
      .toContainText('Bereit', { timeout: 30000 })

    // Download prüfen
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="download-export"]')
    ])
    expect(download.suggestedFilename()).toMatch(/\.docx$/)
  })
})
```

**Playwright-Konfiguration:**

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,     // Sequenziell wegen shared DB
  retries: 1,
  workers: 1,
  reporter: [['html'], ['json', { outputFile: 'playwright-report/results.json' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI
  }
})
```

---

## 3. Test-Daten & Fixtures

### 3.1 Verzeichnisstruktur

```text
tests/
├── unit/
│   ├── rules/
│   ├── validators/
│   ├── interview/
│   ├── export/
│   └── components/
├── integration/
│   ├── tenant-isolation/
│   ├── version-pinning/
│   ├── content-publishing/
│   ├── export-pipeline/
│   ├── audit/
│   └── api/
├── security/
│   ├── tenant-isolation.test.ts
│   ├── rls-enforcement.test.ts
│   ├── jwt-security.test.ts
│   ├── path-traversal.test.ts
│   └── audit-immutability.test.ts
├── e2e/
│   ├── contract-creation.spec.ts
│   ├── docx-export.spec.ts
│   ├── template-publishing.spec.ts
│   ├── user-management.spec.ts
│   └── audit-log.spec.ts
├── fixtures/
│   ├── tenants.ts
│   ├── users.ts
│   ├── templates.ts
│   ├── clauses.ts
│   ├── contracts.ts
│   └── rules.ts
├── factories/
│   └── domain.ts
├── mocks/
│   ├── keycloak.ts
│   └── storage.ts
└── setup/
    ├── unit.ts
    ├── integration.ts
    └── e2e.ts
```

### 3.2 Factory Functions

```typescript
// tests/factories/domain.ts

export function createTestTenant(name: string, overrides = {}): Tenant {
  return {
    id: crypto.randomUUID(),
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    type: 'lawfirm',
    status: 'active',
    ...overrides
  }
}

export function createTestUser(overrides = {}): User {
  return {
    id: crypto.randomUUID(),
    email: `test-${crypto.randomUUID().slice(0, 8)}@example.com`,
    displayName: 'Test User',
    role: 'editor',
    status: 'active',
    ...overrides
  }
}

export function createTestClauseVersion(overrides = {}): ClauseVersion {
  return {
    id: crypto.randomUUID(),
    clauseId: crypto.randomUUID(),
    versionNumber: 1,
    title: 'Test-Klausel',
    body: 'Musterkörper der Klausel.',
    status: 'published',
    ...overrides
  }
}

export function createTestContractInstance(overrides = {}): ContractInstance {
  return {
    id: crypto.randomUUID(),
    tenantId: crypto.randomUUID(),
    templateVersionId: crypto.randomUUID(),
    clauseVersionIds: [crypto.randomUUID()],
    answers: {},
    selectedSlots: {},
    status: 'draft',
    ...overrides
  }
}

export function createTestRule(overrides = {}): Rule {
  return {
    id: crypto.randomUUID(),
    type: 'requires',
    sourceClauseId: crypto.randomUUID(),
    targetClauseId: crypto.randomUUID(),
    ...overrides
  }
}
```

### 3.3 Multi-Tenant Test-Seeders

```typescript
// tests/fixtures/tenants.ts

export const SEED_TENANTS = {
  kanzleiA: {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Kanzlei Alpha',
    type: 'lawfirm'
  },
  kanzleiB: {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Kanzlei Beta',
    type: 'lawfirm'
  },
  verlag: {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Musterverlag',
    type: 'vendor'
  }
}
```

---

## 4. Coverage-Ziele

| Bereich | Coverage-Ziel | Messung | Blocking |
| --- | --- | --- | --- |
| **Gesamt** | >= 80% Lines | Vitest istanbul | Ja (PR-Gate) |
| Rules Engine | >= 90% Lines | Vitest istanbul | Ja |
| Validators | >= 90% Lines | Vitest istanbul | Ja |
| Version Pinning | >= 90% Lines | Vitest istanbul | Ja |
| RBAC/Auth | >= 85% Lines | Vitest istanbul | Ja |
| UI Components | >= 70% Lines | Vitest istanbul | Nein (Trend) |
| E2E Journey Coverage | 6/6 Journeys | Playwright | Ja (Main-Gate) |
| Security Test Coverage | 12/12 Threat Scenarios | Vitest | Ja (Main-Gate) |

**Coverage-Ausnahmen (Exclude von Coverage):**

- `tests/**` (Test-Dateien selbst)
- `*.config.ts` (Konfiguration)
- `*.d.ts` (Type Declarations)
- Generierter Code (Prisma Client, OpenAPI)

---

## 5. Testumgebungen

| Umgebung | Zweck | DB | Auth | Storage |
| --- | --- | --- | --- | --- |
| **Unit** | Isolierte Logik | Keine (Mocks) | Mock | Mock |
| **Integration** | Modul-übergreifend | PostgreSQL 16 (Testcontainers / CI Service) | Mock (Keycloak-Stub) | Mock (MinIO Stub) |
| **Security** | Threat-Model-Validierung | PostgreSQL 16 (mit RLS) | Mock (JWT-Generator) | Mock |
| **E2E** | User Journeys | PostgreSQL 16 (Seeded) | Keycloak Test-Realm | MinIO (lokal) |

### CI-Service-Container (GitHub Actions)

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_DB: servanda_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

---

## 6. Test-Ausführung & Commands

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:unit": "vitest run --config vitest.config.ts",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:security": "vitest run --config vitest.security.config.ts",
    "test:a11y": "vitest run --grep a11y",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:security && npm run test:e2e"
  }
}
```

---

## 7. Regressions-Strategie

### 7.1 Bug-Fix-Protokoll

1. Bug wird gemeldet (Issue).
2. Reproduzierender Test wird **vor** dem Fix geschrieben (Test muss rot sein).
3. Fix wird implementiert (Test wird grün).
4. Test bleibt permanent in der Suite.

### 7.2 Regressions-Kategorien

| Kategorie | Beispiel | Behandlung |
| --- | --- | --- |
| Security Regression | RLS-Policy fehlt nach Migration | Blocking PR-Gate, sofortiger Fix |
| Domain Regression | Pinning-Logik bricht bei Upgrade | Blocking PR-Gate, hohe Priorität |
| UI Regression | Komponente rendert falsch | PR-Gate (Unit/Snapshot), mittlere Priorität |
| Performance Regression | Render-Zeit über Threshold | Warning (Bundle-Size), niedrigere Priorität |

---

## 8. Flaky-Test-Management

### 8.1 Definition

Ein Test ist **flaky**, wenn er ohne Code-Änderung manchmal passed und manchmal failed.

### 8.2 Prozess

1. Flaky Test wird identifiziert (CI-Logs oder manuelle Beobachtung).
2. Test wird mit `@flaky`-Tag markiert und Issue erstellt.
3. Flaky Tests werden **nicht** aus der Suite entfernt, sondern mit `retry: 2` versehen.
4. Root Cause wird innerhalb von 1 Sprint behoben.
5. Nach Fix: `@flaky`-Tag und Retry entfernen.

### 8.3 Monitoring

- CI-Dashboard zeigt Flaky-Test-Rate.
- Ziel: < 1% Flaky-Rate über alle Test-Suites.

---

## 9. Definition of Done (Testbezogen)

### Feature-DoD

- [ ] Unit Tests geschrieben (alle neuen Funktionen)
- [ ] Integration Tests (bei DB/API-Interaktion)
- [ ] Security Tests (bei Tenant/Auth/Storage-Änderungen)
- [ ] Accessibility Tests bestanden (bei UI-Änderungen)
- [ ] Manuelle explorative Tests (bei neuem User Journey)
- [ ] Coverage >= 80% gehalten

### Sprint-DoD

- [ ] Alle PR-Gate-Checks grün
- [ ] Keine neuen Flaky Tests
- [ ] Security-Test-Coverage deckt alle Threat-Model-Szenarien
- [ ] E2E Journeys für neue Features hinzugefügt

---

## 10. Toolchain-Übersicht

| Tool | Zweck | Version |
| --- | --- | --- |
| Vitest | Unit + Integration + Security Tests | >= 1.x |
| Playwright | E2E Tests | >= 1.40 |
| axe-core | Accessibility Testing | >= 4.x |
| jest-axe | axe-core Integration für Vitest | >= 8.x |
| React Testing Library | Component Testing | >= 14.x |
| Testcontainers | PostgreSQL für Integration Tests (lokal) | >= 10.x |
| Lighthouse CI | Performance + Accessibility Scores | >= 0.13 |
| size-limit | Bundle-Size-Checks | >= 11.x |
| CycloneDX | SBOM-Generierung | >= 4.x |
| istanbul | Coverage-Reporting | (via Vitest) |

---

## 11. Review-Zyklus

| Event | Aktion | Owner |
| --- | --- | --- |
| Neues Modul/Feature | Test-Kategorien + Coverage-Ziel definieren | Feature-Team + Team 06 |
| Neuer Threat-Scenario | Security-Test hinzufügen | Team 02 + Team 06 |
| Sprint-Ende | Flaky-Tests reviewen, Coverage-Trend prüfen | Team 06 |
| Vor Release | Vollständige Test-Suite, Pentest, Coverage-Report | Team 06 + Team 02 |
| Quartals-Review | Teststrategie aktualisieren, Tool-Updates prüfen | Team 06 |
