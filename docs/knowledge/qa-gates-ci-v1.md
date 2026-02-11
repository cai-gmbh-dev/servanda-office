# QA-Gates CI-Spezifikation v1

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 06 (QA & Compliance)
**Referenzen:** QUALITY_GATES.md, Architecture Backbone v1, ADR-001, Threat Model, Audit-Compliance v1

---

## 1. Überblick

Dieses Dokument übersetzt die Quality Gates aus `docs/qa/QUALITY_GATES.md` in konkrete CI-Job-Definitionen (GitHub Actions). Alle Gates sind **blocking** (kein Merge ohne grüne Checks), sofern nicht anders markiert.

**CI-Plattform:** GitHub Actions
**Monorepo-Layout:** Modularer Monolith (TypeScript), Module: Identity, Content, Interview, Contract, Export

---

## 2. PR-Gate (Pull Request)

### 2.1 Workflow: `pr-gate.yml`

```yaml
name: PR Gate

on:
  pull_request:
    branches: [main, develop]

concurrency:
  group: pr-${{ github.head_ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'
  POSTGRES_VERSION: '16'

jobs:
  lint-typecheck:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint          # ESLint: 0 errors
      - run: npm run typecheck     # tsc --noEmit: 0 errors

  unit-tests:
    name: Unit Tests + Coverage
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm test -- --coverage --reporter=json
      - name: Check Coverage Threshold
        run: |
          COVERAGE=$(node -e "const c=require('./coverage/coverage-summary.json'); console.log(c.total.lines.pct)")
          echo "Line coverage: $COVERAGE%"
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "::error::Coverage $COVERAGE% is below threshold (80%)"
            exit 1
          fi
      - name: Upload Coverage Report
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/

  build:
    name: Build Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run build

  accessibility:
    name: Accessibility (axe-core)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run test:a11y    # axe-core: 0 violations

  security-tenant-isolation:
    name: Tenant Isolation Tests
    runs-on: ubuntu-latest
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
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - name: Run Migrations
        run: npm run db:migrate:test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/servanda_test
      - name: Tenant Isolation Tests
        run: npm run test:security -- --grep "tenant-isolation"
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/servanda_test
      - name: RLS Enforcement Tests
        run: npm run test:security -- --grep "rls-enforcement"
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/servanda_test

  security-rls-coverage:
    name: RLS Policy Coverage
    runs-on: ubuntu-latest
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
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - name: Run Migrations
        run: npm run db:migrate:test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/servanda_test
      - name: Check RLS on All Tables
        run: |
          TABLES_WITHOUT_RLS=$(psql "$DATABASE_URL" -t -c "
            SELECT schemaname || '.' || tablename
            FROM pg_tables
            WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'pgboss')
            AND tablename NOT IN ('_prisma_migrations', 'schema_migrations')
            EXCEPT
            SELECT schemaname || '.' || tablename
            FROM pg_tables t
            JOIN pg_class c ON c.relname = t.tablename
            WHERE c.relrowsecurity = true
          ")
          if [ -n "$TABLES_WITHOUT_RLS" ]; then
            echo "::error::Tables without RLS: $TABLES_WITHOUT_RLS"
            exit 1
          fi
          echo "All tenant-scoped tables have RLS enabled."
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/servanda_test

  bundle-size:
    name: Bundle Size Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npx size-limit        # Warning only, nicht blocking
    continue-on-error: true         # Bundle-Size ist Warning, nicht Gate
```

### 2.2 PR-Gate Zusammenfassung

| Check | Tool | Bedingung | Blocking | Job |
| --- | --- | --- | --- | --- |
| Linting | ESLint | 0 Errors | Ja | `lint-typecheck` |
| Type Check | TypeScript `tsc` | 0 Errors | Ja | `lint-typecheck` |
| Unit Tests | Vitest | 100% passed | Ja | `unit-tests` |
| Coverage | Vitest + istanbul | >= 80% Lines | Ja | `unit-tests` |
| Build | Vite | Erfolgreich | Ja | `build` |
| Accessibility | axe-core | 0 Violations | Ja | `accessibility` |
| Tenant Isolation | Vitest + PostgreSQL | 0 Cross-Tenant Leaks | Ja | `security-tenant-isolation` |
| RLS Coverage | SQL-Check | Alle Tabellen mit RLS | Ja | `security-rls-coverage` |
| Bundle Size | size-limit | < 200 KB (JS gzip) | Nein (Warning) | `bundle-size` |

### 2.3 Manuelle Review-Checkliste (PR Template)

```markdown
## PR Review Checklist

### Security (Pflicht bei DB/API-Änderungen)
- [ ] Tenant-Isolation: Alle Queries enthalten tenantId-Scoping
- [ ] Keine Raw-SQL-Queries mit User-Input (Parameterized Queries)
- [ ] Neue DB-Tabelle: RLS-Policy + FORCE ROW LEVEL SECURITY vorhanden
- [ ] Object-Storage-Pfade: Tenant-Prefix validiert, kein Path Traversal

### Domain (Pflicht bei Domänenlogik)
- [ ] Version Pinning: ContractInstance pinnt exakte TemplateVersion + ClauseVersions
- [ ] Immutability: Completed Contracts sind nicht änderbar
- [ ] Audit-Events: Relevante Events werden erzeugt (Ref: Audit-Katalog)

### Accessibility (Pflicht bei UI-Änderungen)
- [ ] Keyboard-only Navigation möglich
- [ ] Focus-Ring immer sichtbar
- [ ] Screen Reader gibt sinnvolle Ausgabe
- [ ] Farben nicht als einziges Unterscheidungsmerkmal

### General
- [ ] Keine console.log/console.error im Production-Code
- [ ] Keine Secrets in Code/Config
- [ ] ADR erstellt bei Architektur-Entscheidungen
```

---

## 3. Main-Branch-Gate (Post-Merge)

### 3.1 Workflow: `main-gate.yml`

```yaml
name: Main Gate

on:
  push:
    branches: [main]

env:
  NODE_VERSION: '20'

jobs:
  full-test-suite:
    name: Full Test Suite
    runs-on: ubuntu-latest
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
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - name: Migrations
        run: npm run db:migrate:test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/servanda_test
      - name: Unit + Integration Tests
        run: npm test -- --coverage
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/servanda_test
      - name: Security Tests (Full)
        run: npm run test:security
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/servanda_test

  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
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
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps
      - name: Migrations
        run: npm run db:migrate:test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/servanda_test
      - name: E2E Tests
        run: npm run test:e2e
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/servanda_test
      - name: Upload E2E Report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/

  lighthouse:
    name: Lighthouse CI
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - name: Lighthouse CI
        run: |
          npm install -g @lhci/cli
          lhci autorun
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}

  dependency-scan:
    name: Dependency Security Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - name: Audit Dependencies
        run: npm audit --audit-level=high
      - name: Check for Known Vulnerabilities
        run: npx audit-ci --high
```

### 3.2 Main-Gate Zusammenfassung

| Check | Bedingung | Blocking |
| --- | --- | --- |
| All Unit + Integration Tests | 100% passed | Ja |
| Security Tests (Tenant + RLS + JWT + Path Traversal + Audit) | 100% passed | Ja |
| E2E Tests (Playwright) | 100% passed | Ja |
| Lighthouse Performance | >= 90 Score | Ja |
| Lighthouse Accessibility | >= 90 Score | Ja |
| Dependency Scan | Keine High/Critical CVEs | Ja |

---

## 4. Security-Test-Jobs (Detail)

Abgeleitet aus Threat Model (T-01 bis T-12) und ADR-001 Implementation Spec.

### 4.1 Tenant-Isolation-Tests

```typescript
// tests/security/tenant-isolation.test.ts

describe('Tenant Isolation', () => {
  const tenantA = createTestTenant('Kanzlei A')
  const tenantB = createTestTenant('Kanzlei B')

  beforeAll(async () => {
    // Setup: Daten in Tenant A erstellen
    await withTenantContext(tenantA.id, async () => {
      await createTestContract({ title: 'Vertrag A' })
      await createTestTemplate({ title: 'Template A' })
    })
  })

  it('T-03: Tenant B cannot access Tenant A contracts', async () => {
    const contracts = await withTenantContext(tenantB.id, () =>
      contractRepository.findAll({ tenantId: tenantB.id })
    )
    expect(contracts).toHaveLength(0)
  })

  it('T-03: Tenant B cannot access Tenant A templates (non-published)', async () => {
    const templates = await withTenantContext(tenantB.id, () =>
      templateRepository.findAll({ tenantId: tenantB.id })
    )
    expect(templates).toHaveLength(0)
  })

  it('T-05: Vendor tenant cannot access lawfirm contracts', async () => {
    const vendorTenant = createTestTenant('Verlag', { type: 'vendor' })
    const contracts = await withTenantContext(vendorTenant.id, () =>
      contractRepository.findAll({ tenantId: vendorTenant.id })
    )
    expect(contracts).toHaveLength(0)
  })

  it('Published vendor content is readable cross-tenant', async () => {
    const publishedTemplates = await withTenantContext(tenantA.id, () =>
      templateRepository.findPublished()
    )
    // Nur published Vendor-Content sichtbar, keine Kanzlei-Templates
    expect(publishedTemplates.every(t => t.status === 'published')).toBe(true)
  })
})
```

### 4.2 RLS-Enforcement-Tests

```typescript
// tests/security/rls-enforcement.test.ts

describe('RLS Enforcement', () => {
  it('T-02: Raw SQL with wrong tenant_id returns 0 rows', async () => {
    await withTenantContext(tenantA.id, async () => {
      // Versuche, Tenant-B-Daten mit raw SQL zu lesen
      const result = await db.$queryRaw`
        SELECT * FROM contract_instances WHERE tenant_id = ${tenantB.id}
      `
      expect(result).toHaveLength(0)
    })
  })

  it('T-09: All tables have RLS enabled', async () => {
    const tablesWithoutRLS = await db.$queryRaw`
      SELECT schemaname, tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT IN ('_prisma_migrations', 'schema_migrations')
      EXCEPT
      SELECT t.schemaname, t.tablename FROM pg_tables t
      JOIN pg_class c ON c.relname = t.tablename
      WHERE c.relrowsecurity = true AND t.schemaname = 'public'
    `
    expect(tablesWithoutRLS).toHaveLength(0)
  })

  it('RLS is FORCED (even for table owner)', async () => {
    const tablesWithoutForce = await db.$queryRaw`
      SELECT relname FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relkind = 'r'
        AND relrowsecurity = true
        AND NOT relforcerowsecurity
    `
    expect(tablesWithoutForce).toHaveLength(0)
  })
})
```

### 4.3 JWT-Security-Tests

```typescript
// tests/security/jwt-security.test.ts

describe('JWT Security', () => {
  it('T-01: Modified JWT tenant_id is rejected (401)', async () => {
    const modifiedToken = tamperJWT(validToken, { tenant_id: 'other-tenant' })
    const response = await api.get('/api/v1/contracts', {
      headers: { Authorization: `Bearer ${modifiedToken}` }
    })
    expect(response.status).toBe(401)
  })

  it('T-06: Expired JWT is rejected (401)', async () => {
    const expiredToken = createJWT({ ...claims, exp: Math.floor(Date.now() / 1000) - 60 })
    const response = await api.get('/api/v1/contracts', {
      headers: { Authorization: `Bearer ${expiredToken}` }
    })
    expect(response.status).toBe(401)
  })

  it('Missing tenant_id in JWT is rejected (401)', async () => {
    const tokenWithoutTenant = createJWT({ sub: 'user-1' })
    const response = await api.get('/api/v1/contracts', {
      headers: { Authorization: `Bearer ${tokenWithoutTenant}` }
    })
    expect(response.status).toBe(401)
  })

  it('Role escalation is blocked (403)', async () => {
    const userToken = createJWT({ ...claims, role: 'user' })
    const response = await api.post('/api/v1/users', {
      headers: { Authorization: `Bearer ${userToken}` },
      body: { email: 'new@example.com', role: 'admin' }
    })
    expect(response.status).toBe(403)
  })
})
```

### 4.4 Path-Traversal-Tests

```typescript
// tests/security/path-traversal.test.ts

describe('Object Storage Path Traversal (T-08)', () => {
  it('rejects path with ../', async () => {
    const response = await api.get('/api/v1/exports/../../tenant-b/export.docx', {
      headers: { Authorization: `Bearer ${tenantAToken}` }
    })
    expect(response.status).toBe(400)
  })

  it('rejects path outside tenant prefix', async () => {
    const response = await api.get('/api/v1/exports/tenant-b-id/export.docx', {
      headers: { Authorization: `Bearer ${tenantAToken}` }
    })
    expect([403, 404]).toContain(response.status)
  })
})
```

### 4.5 Audit-Immutability-Tests

```typescript
// tests/security/audit-immutability.test.ts

describe('Audit Immutability (T-12)', () => {
  it('UPDATE on audit_events fails', async () => {
    await expect(
      db.$executeRaw`UPDATE audit_events SET action = 'tampered' WHERE id = ${eventId}`
    ).rejects.toThrow()
  })

  it('DELETE on audit_events fails', async () => {
    await expect(
      db.$executeRaw`DELETE FROM audit_events WHERE id = ${eventId}`
    ).rejects.toThrow()
  })
})
```

---

## 5. Produkt-spezifische Gates

### 5.1 Version-Pinning-Validierung

```typescript
// tests/domain/version-pinning.test.ts

describe('Version Pinning Gate', () => {
  it('ContractInstance pins template version on creation', () => {
    const contract = createContractInstance({
      templateVersionId: 'tv-1',
      clauseVersionIds: ['cv-1', 'cv-2']
    })
    expect(contract.templateVersionId).toBe('tv-1')
    expect(contract.clauseVersionIds).toEqual(['cv-1', 'cv-2'])
  })

  it('Completed contract cannot change pinned versions', async () => {
    const contract = await completeContract(draftContract)
    await expect(
      updateContract(contract.id, { templateVersionId: 'tv-2' })
    ).rejects.toThrow('Cannot modify pinned versions on completed contract')
  })

  it('Draft contract can upgrade versions', async () => {
    const upgraded = await upgradeContractVersions(draftContract.id, {
      newTemplateVersionId: 'tv-2'
    })
    expect(upgraded.templateVersionId).toBe('tv-2')
    expect(upgraded.status).toBe('draft')
  })
})
```

### 5.2 Export-Validierung

```typescript
// tests/domain/export-validation.test.ts

describe('Export Gate', () => {
  it('Export job references valid contract with pinned versions', async () => {
    const job = await createExportJob({
      contractInstanceId: completedContract.id,
      format: 'docx'
    })
    expect(job.status).toBe('pending')
    expect(job.contractInstanceId).toBe(completedContract.id)
  })

  it('Export job validates tenant scope', async () => {
    await expect(
      withTenantContext(tenantB.id, () =>
        createExportJob({ contractInstanceId: tenantAContract.id, format: 'docx' })
      )
    ).rejects.toThrow()
  })
})
```

---

## 6. Performance-Gates

### 6.1 Bundle-Size-Konfiguration

```javascript
// size-limit.config.js
module.exports = [
  {
    path: 'dist/assets/*.js',
    limit: '80 KB',
    gzip: true,
    name: 'JS Bundle'
  },
  {
    path: 'dist/assets/*.css',
    limit: '20 KB',
    gzip: true,
    name: 'CSS Bundle'
  }
]
```

### 6.2 Lighthouse-Konfiguration

```javascript
// lighthouserc.js
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:4173/'],
      numberOfRuns: 3
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.85 }]
      }
    },
    upload: {
      target: 'temporary-public-storage'
    }
  }
}
```

### 6.3 Runtime-Performance-Thresholds

| Metrik | Threshold | Test-Typ |
| --- | --- | --- |
| Render 100 Fragen | < 50 ms | Unit |
| Render 1000 Fragen | < 500 ms | Unit |
| Initial Render | < 150 ms | Unit |
| First Contentful Paint | < 1.5 s | Lighthouse |
| Contract Creation API | < 200 ms | Integration |
| Export Job Start | < 100 ms | Integration |

---

## 7. Dependency-Security

### 7.1 Dependabot-Konfiguration

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    labels:
      - "dependencies"
      - "security"
    ignore:
      - dependency-name: "*"
        update-types: ["version-update:semver-patch"]
```

### 7.2 SBOM-Generierung

```yaml
# Im main-gate.yml ergänzen
  sbom:
    name: Generate SBOM
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
      - run: npm ci
      - name: Generate SBOM
        run: npx @cyclonedx/cyclonedx-npm --output-file sbom.json
      - uses: actions/upload-artifact@v4
        with:
          name: sbom
          path: sbom.json
```

---

## 8. Gate-Matrix (Zusammenfassung)

### PR-Gate (jeder PR)

| # | Check | Blocking | Referenz |
| --- | --- | --- | --- |
| G-01 | ESLint 0 Errors | Ja | — |
| G-02 | TypeScript 0 Errors | Ja | — |
| G-03 | Unit Tests 100% passed | Ja | — |
| G-04 | Coverage >= 80% | Ja | — |
| G-05 | Build erfolgreich | Ja | — |
| G-06 | axe-core 0 Violations | Ja | — |
| G-07 | Tenant Isolation Tests | Ja | Threat Model T-03, T-05 |
| G-08 | RLS auf allen Tabellen | Ja | Threat Model T-09 |
| G-09 | Bundle Size < 200 KB | Nein | — |

### Main-Gate (Post-Merge)

| # | Check | Blocking | Referenz |
| --- | --- | --- | --- |
| G-10 | Full Test Suite (Unit + Integration + Security) | Ja | — |
| G-11 | E2E Tests 100% passed | Ja | — |
| G-12 | Lighthouse Performance >= 90 | Ja | — |
| G-13 | Lighthouse Accessibility >= 90 | Ja | — |
| G-14 | Dependency Scan (no High/Critical) | Ja | — |
| G-15 | SBOM generiert | Ja | Compliance |

### Release-Gate (vor Deployment)

| # | Check | Blocking | Referenz |
| --- | --- | --- | --- |
| G-16 | Alle Main-Gate Checks grün | Ja | — |
| G-17 | Version-Pinning-Validierung bestanden | Ja | ADR-002 |
| G-18 | Cross-Tenant-Pentest bestanden | Ja | Threat Model |
| G-19 | DSGVO-Compliance-Checkliste abgearbeitet | Ja | Audit-Compliance v1 |
| G-20 | Rollback-Plan dokumentiert | Ja | — |

---

## 9. Bypass-Prozess

### Wann erlaubt

- Ausschliesslich für production-kritische Hotfixes.
- Erfordert **explizites Approval** durch Tech Lead (min. 1 Person).

### Anforderungen

```markdown
## Hotfix Exception Request

- [ ] Production-kritischer Bug (Beschreibung: ___)
- [ ] Tech Lead Approved: @name
- [ ] Post-Fix Review geplant (Datum: ___)
- [ ] Rollback-Plan vorhanden
- [ ] Security-Impact bewertet: [ ] Kein Tenant-Isolation-Risiko
```

### Nachbereitung

- Innerhalb von 48 Stunden: regulärer PR mit allen Gate-Checks.
- Bypass wird als `system.hotfix_bypass` Audit-Event protokolliert.

---

## 10. npm-Scripts (Konvention)

```json
{
  "scripts": {
    "lint": "eslint . --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:a11y": "vitest run --grep a11y",
    "test:security": "vitest run --config vitest.security.config.ts",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "build": "vite build",
    "lighthouse": "lhci autorun",
    "db:migrate:test": "prisma migrate deploy",
    "sbom": "npx @cyclonedx/cyclonedx-npm --output-file sbom.json"
  }
}
```

---

## 11. Rollout-Plan

| Phase | Scope | Zeitrahmen |
| --- | --- | --- |
| **Phase 1 (Sprint 1)** | Lint + Typecheck + Unit Tests + Coverage + Build | Sofort |
| **Phase 2 (Sprint 2)** | Accessibility + Security Tests (Tenant + RLS) | Sprint 2 Start |
| **Phase 3 (Sprint 3)** | E2E + Lighthouse + Dependency Scan + SBOM | Sprint 3 Start |
| **Phase 4 (Sprint 4+)** | Release-Gate + Pentest-Integration | Vor MVP-Launch |

**Priorität:** Phase 1 muss vor dem ersten Feature-PR aktiv sein.
