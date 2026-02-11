# Accessibility & Performance Baseline v1

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 06 (QA & Compliance)
**Betroffene Teams:** 04, 06, 07
**Referenzen:** QA-Gates CI v1, Teststrategie v1, QUALITY_GATES.md

---

## 1. Übersicht

Dieses Dokument definiert die Accessibility- und Performance-Baselines für das Servanda Office MVP. Es legt messbare Schwellenwerte fest, integriert diese in die CI/CD-Pipeline und beschreibt die Toolchain für automatisierte Prüfungen.

---

## 2. Accessibility (A11y) Baseline

### 2.1 Standard

| Standard | Level | Scope |
|----------|-------|-------|
| **WCAG 2.1** | **Level AA** | Alle UI-Seiten und Flows |
| **BITV 2.0** | Konform | Deutsche Barrierefreiheitsanforderung |

### 2.2 Kernregeln

| Regel | WCAG-Kriterium | Beschreibung | Testmethode |
|-------|---------------|-------------|-------------|
| Keyboard Navigation | 2.1.1 | Alle Funktionen per Tastatur erreichbar | E2E (Playwright) |
| Fokus-Reihenfolge | 2.4.3 | Logische Tab-Reihenfolge | axe-core + manuell |
| Farbkontrast | 1.4.3 | Mindestens 4.5:1 (Text), 3:1 (Großtext) | axe-core |
| Alt-Texte | 1.1.1 | Alle Bilder/Icons haben Alternativtexte | axe-core |
| Formular-Labels | 1.3.1 | Alle Inputs haben zugehörige Labels | axe-core |
| Fehlermeldungen | 3.3.1 | Fehler werden identifiziert und beschrieben | axe-core + manuell |
| ARIA-Attribute | 4.1.2 | Interaktive Elemente haben korrekte ARIA-Rollen | axe-core |
| Skip-Link | 2.4.1 | "Skip to main content" auf jeder Seite | axe-core |
| Zoom | 1.4.4 | Layout funktioniert bei 200% Zoom | Lighthouse |
| Motion | 2.3.1 | Kein Flackern > 3 Blitze/Sekunde | Manuell |

### 2.3 axe-core CI-Integration

```yaml
# In pr-gate.yml (bereits spezifiziert in QA-Gates CI v1)
a11y-check:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npm run build

    # Storybook oder Dev-Server starten
    - run: npx serve dist -l 3000 &
    - run: npx wait-on http://localhost:3000

    # axe-core gegen alle Routen
    - name: Run axe-core
      run: |
        npx @axe-core/cli http://localhost:3000 \
          --tags wcag2a,wcag2aa,wcag21aa \
          --exit \
          --reporter json \
          > axe-results.json

    - name: Check zero violations
      run: |
        VIOLATIONS=$(jq '.violations | length' axe-results.json)
        if [ "$VIOLATIONS" -ne 0 ]; then
          echo "::error::$VIOLATIONS accessibility violations found"
          jq '.violations[] | {id, impact, description, nodes: (.nodes | length)}' axe-results.json
          exit 1
        fi

    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: axe-results
        path: axe-results.json
```

### 2.4 axe-core in Unit/Component-Tests

```typescript
import { axe, toHaveNoViolations } from 'jest-axe';
// oder für Vitest:
import { axe } from 'axe-core';

expect.extend(toHaveNoViolations);

describe('InterviewQuestion Component', () => {
  it('should have no accessibility violations', async () => {
    const { container } = render(<InterviewQuestion question={mockQuestion} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

### 2.5 Accessibility-Checkliste pro Seite

| Seite/Flow | Keyboard | Kontrast | ARIA | Fokus | Screen Reader |
|-----------|----------|---------|------|-------|--------------|
| Login | ☐ | ☐ | ☐ | ☐ | ☐ |
| Dashboard | ☐ | ☐ | ☐ | ☐ | ☐ |
| Template-Katalog | ☐ | ☐ | ☐ | ☐ | ☐ |
| Interview-Flow | ☐ | ☐ | ☐ | ☐ | ☐ |
| Konfliktauflösung | ☐ | ☐ | ☐ | ☐ | ☐ |
| Review-Screen | ☐ | ☐ | ☐ | ☐ | ☐ |
| Export-Dialog | ☐ | ☐ | ☐ | ☐ | ☐ |
| Audit-Log | ☐ | ☐ | ☐ | ☐ | ☐ |
| Einstellungen | ☐ | ☐ | ☐ | ☐ | ☐ |

### 2.6 ARIA-Spezifikation für Interview-Flow

Der Interview-Flow ist die komplexeste UI-Komponente. Spezifische ARIA-Anforderungen:

| Element | ARIA-Rolle/Attribut | Beschreibung |
|---------|-------------------|-------------|
| Question Panel | `role="form"`, `aria-label="Interview-Frage"` | Formularbereich |
| Progress Sidebar | `role="navigation"`, `aria-label="Fortschritt"` | Section-Navigation |
| Section-Item | `aria-current="step"` (aktiv) | Aktuelle Section markieren |
| Radio-Buttons | `role="radiogroup"`, `aria-labelledby` | single_choice |
| Checkboxen | `role="group"`, `aria-labelledby` | multiple_choice |
| Hilfetext | `aria-describedby` | Verknüpfung Frage → Hilfe |
| Fehler-Anzeige | `role="alert"`, `aria-live="polite"` | Validierungsfehler |
| Konflikt-Banner | `role="alert"`, `aria-live="assertive"` | Hard Conflicts |
| Weiter/Zurück | `aria-label="Nächste Frage"` / `"Vorherige Frage"` | Navigation |
| Auto-Save Status | `role="status"`, `aria-live="polite"` | "Gespeichert" / "Fehler" |

---

## 3. Performance Baseline

### 3.1 Lighthouse-Ziele

| Kategorie | Schwellenwert (CI-Gate) | Ziel (Launch) |
|-----------|------------------------|---------------|
| **Performance** | ≥ 85 | ≥ 90 |
| **Accessibility** | ≥ 90 | ≥ 95 |
| **Best Practices** | ≥ 85 | ≥ 90 |
| **SEO** | ≥ 80 | ≥ 85 |

### 3.2 Core Web Vitals

| Metrik | Ziel | Grenzwert (CI-Gate) | Beschreibung |
|--------|------|---------------------|-------------|
| **LCP** (Largest Contentful Paint) | < 2.0s | < 2.5s | Ladezeit des größten sichtbaren Elements |
| **FID** (First Input Delay) | < 100ms | < 200ms | Reaktionszeit auf erste Interaktion |
| **CLS** (Cumulative Layout Shift) | < 0.05 | < 0.1 | Visuelle Stabilität |
| **INP** (Interaction to Next Paint) | < 200ms | < 300ms | Reaktionszeit auf Interaktionen |
| **TTFB** (Time to First Byte) | < 500ms | < 800ms | Server-Antwortzeit |

### 3.3 Seitenspezifische Ziele

| Seite | LCP | TTI | Bundle-Size |
|-------|-----|-----|-------------|
| Login | < 1.5s | < 2s | < 100 KB |
| Dashboard | < 2.0s | < 3s | < 200 KB |
| Template-Katalog | < 2.0s | < 3s | < 150 KB |
| Interview-Flow | < 2.5s | < 3.5s | < 300 KB |
| Export-Dialog | < 1.5s | < 2s | < 100 KB |

### 3.4 Lighthouse CI-Integration

```yaml
# In main-gate.yml
lighthouse:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci && npm run build

    - name: Start server
      run: npx serve dist -l 3000 &

    - name: Wait for server
      run: npx wait-on http://localhost:3000

    - name: Run Lighthouse CI
      uses: treosh/lighthouse-ci-action@v11
      with:
        urls: |
          http://localhost:3000/
          http://localhost:3000/dashboard
          http://localhost:3000/contracts/new
        budgetPath: ./lighthouse-budget.json
        configPath: ./lighthouserc.json

    - name: Assert scores
      run: |
        # Parse Lighthouse JSON output
        for result in .lighthouseci/*.json; do
          PERF=$(jq '.categories.performance.score * 100' "$result")
          A11Y=$(jq '.categories.accessibility.score * 100' "$result")
          if (( $(echo "$PERF < 85" | bc -l) )); then
            echo "::error::Performance score $PERF < 85"
            exit 1
          fi
          if (( $(echo "$A11Y < 90" | bc -l) )); then
            echo "::error::Accessibility score $A11Y < 90"
            exit 1
          fi
        done
```

### 3.5 lighthouserc.json

```json
{
  "ci": {
    "collect": {
      "numberOfRuns": 3,
      "settings": {
        "preset": "desktop",
        "throttling": {
          "cpuSlowdownMultiplier": 1
        }
      }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.85 }],
        "categories:accessibility": ["error", { "minScore": 0.90 }],
        "categories:best-practices": ["warn", { "minScore": 0.85 }],
        "first-contentful-paint": ["warn", { "maxNumericValue": 2000 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["warn", { "maxNumericValue": 300 }]
      }
    },
    "upload": {
      "target": "filesystem",
      "outputDir": ".lighthouseci"
    }
  }
}
```

---

## 4. Bundle-Size Budgets

### 4.1 size-limit Konfiguration

```json
// package.json
{
  "size-limit": [
    {
      "name": "Main Bundle (JS)",
      "path": "dist/assets/*.js",
      "limit": "250 KB",
      "gzip": true
    },
    {
      "name": "Main Bundle (CSS)",
      "path": "dist/assets/*.css",
      "limit": "50 KB",
      "gzip": true
    },
    {
      "name": "Interview Flow Chunk",
      "path": "dist/assets/interview-*.js",
      "limit": "100 KB",
      "gzip": true
    },
    {
      "name": "Total Initial Load",
      "path": "dist/assets/index-*.js",
      "limit": "200 KB",
      "gzip": true
    }
  ]
}
```

### 4.2 CI-Integration

```yaml
# In pr-gate.yml
bundle-size:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci && npm run build
    - run: npx size-limit
```

---

## 5. API-Performance Baseline

### 5.1 Endpunkt-Latenzen

| Endpunkt | P50 | P95 | P99 | Ziel |
|----------|-----|-----|-----|------|
| `GET /catalog/templates` | < 50ms | < 200ms | < 500ms | Katalog-Browse |
| `POST /contracts` | < 100ms | < 300ms | < 800ms | Vertrag erstellen |
| `PATCH /contracts/{id}` | < 50ms | < 200ms | < 500ms | Auto-Save |
| `POST /contracts/{id}/complete` | < 200ms | < 500ms | < 1s | Fertigstellung |
| `POST /export-jobs` | < 100ms | < 300ms | < 500ms | Export starten |
| `GET /audit-logs` | < 100ms | < 300ms | < 1s | Audit-Abfrage |

### 5.2 Datenbankabfragen

| Abfrage | Ziel | Grenzwert |
|---------|------|-----------|
| Tenant-gescoped SELECT (einfach) | < 5ms | < 20ms |
| Tenant-gescoped SELECT mit JOIN | < 10ms | < 50ms |
| Rule-Evaluierung (20 Klauseln) | < 50ms | < 200ms |
| Audit-Log-Abfrage (100 Events) | < 30ms | < 100ms |

### 5.3 Monitoring-Metriken

```typescript
// Prometheus Custom Metrics (aus Deployment-Blueprint)
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration',
  labelNames: ['query', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
});
```

---

## 6. Rollout-Plan

### Phase 1: Sofort (Sprint 3)

- [x] axe-core in PR-Gate integriert (0 violations = Pflicht)
- [x] Bundle-Size-Budget in PR-Gate
- [ ] Lighthouse CI in Main-Gate (≥85 Perf, ≥90 A11y)
- [ ] ARIA-Spezifikation für Interview-Flow dokumentiert
- [ ] Core Web Vitals Monitoring konfiguriert

### Phase 2: Sprint 4

- [ ] Lighthouse-Scores auf Zielwerte anheben (≥90 Perf, ≥95 A11y)
- [ ] Screen-Reader-Tests (manuell) für kritische Flows
- [ ] Performance-Budgets pro Seite enforced
- [ ] API-Latenz-Monitoring in Grafana-Dashboard

### Phase 3: Sprint 5-6

- [ ] Keyboard-Navigation E2E-Tests (Playwright)
- [ ] Farbkontrast-Prüfung in Design-Tokens
- [ ] Performance-Regression-Tests (automatisiert)
- [ ] Accessibility-Audit durch externe Prüfer (Launch-Gate)

---

## 7. Testing-Strategie

### 7.1 Automatisierte Tests

| Test-Typ | Tool | Frequenz | Gate |
|----------|------|----------|------|
| axe-core (WCAG 2.1 AA) | @axe-core/cli | Jeder PR | PR-Gate |
| Lighthouse Performance | lighthouse-ci | Jeder Main-Merge | Main-Gate |
| Bundle-Size | size-limit | Jeder PR | PR-Gate |
| Component A11y | jest-axe/vitest | Jeder PR | PR-Gate |
| API-Latenz | k6 / Artillery | Wöchentlich | Release-Gate |

### 7.2 Manuelle Tests

| Test | Frequenz | Verantwortung |
|------|----------|---------------|
| Screen-Reader (NVDA/VoiceOver) | Sprint-Ende | Team 06 |
| Keyboard-only Navigation | Sprint-Ende | Team 04 + 06 |
| 200% Zoom | Sprint-Ende | Team 06 |
| Farbkontrast (High-Contrast-Mode) | Sprint-Ende | Team 06 |
| Usability mit assistiver Technologie | Vor Launch | Externer Prüfer |

---

## 8. Offene Punkte

| # | Thema | Owner | Ziel-Sprint |
|---|-------|-------|-------------|
| 1 | Dark-Mode A11y-Kontraste definieren | Team 04 | Phase 2 |
| 2 | Internationalisierung und RTL-Support | Team 04 | Phase 2 |
| 3 | Performance-Budget pro API-Route | Team 06 | Sprint 4 |
| 4 | Load-Testing (100 parallele Nutzer) | Team 06 + 07 | Sprint 5 |
| 5 | Web Vitals Real-User-Monitoring (RUM) | Team 07 | Sprint 6 |
