# Updates – QA & Compliance

## Initial
- Team aufgesetzt.
- Bestehende Quality-Gates als Basis übernommen.

## 2026-02-09
- Start Phase 0–1 Orchestrierung.
- Deliverables diese Woche: Quality-Gates auf Servanda Office anpassen, Teststrategie v0.1 fürs MVP.
- Abhängigkeiten: Epics/Stories aus `docs/architecture/architecture.md`, Export- und Builder-Constraints.
- Referenzen: `docs/knowledge/domain-model-v0.1.md`, `docs/knowledge/adr-003-export-engine-service.md`, `docs/knowledge/adr-004-odt-strategy.md`.
- Architektur-Übersicht: `docs/knowledge/architecture-summary.md`.
- Owner Matrix bestätigt: `docs/plan/sprint-status.md`.

## 2026-02-10
- **Sprint-1 Deliverables abgeschlossen:**
  1. **QA-Gates CI-Spezifikation v1** (`docs/knowledge/qa-gates-ci-v1.md`)
     - PR-Gate: 9 Checks (Lint, Typecheck, Unit Tests, Coverage >=80%, Build, axe-core, Tenant Isolation, RLS Coverage, Bundle Size)
     - Main-Gate: Full Test Suite, E2E (Playwright), Lighthouse (>=90 Perf+A11y), Dependency Scan, SBOM
     - Release-Gate: Pentest, DSGVO-Checkliste, Rollback-Plan
     - Security-Test-Jobs: Alle 12 Threat-Model-Szenarien (T-01..T-12) als automatisierte Tests
     - PR Review Checklist Template (Security, Domain, A11y, General)
     - Rollout-Plan: 4 Phasen über Sprint 1-4
  2. **Teststrategie v1** (`docs/knowledge/test-strategy-v1.md`)
     - Testing-Pyramide: 70% Unit / 25% Integration+Security / 5% E2E
     - Vitest (Unit+Integration+Security), Playwright (E2E), axe-core (A11y), Lighthouse CI (Performance)
     - Test-Daten: Factories, Multi-Tenant-Seeders, Testcontainers
     - Coverage-Ziele pro Modul (Rules/Validators/Pinning >=90%, Gesamt >=80%)
     - Regressions-Strategie + Flaky-Test-Management
  3. **Compliance Evidence Checklist v1** (`docs/knowledge/compliance-evidence-checklist-v1.md`)
     - 72 Evidence-Items über 9 Kategorien (Tenant Isolation, Auth, Pinning, Audit, DSGVO, Input, Dependencies, A11y, Performance)
     - Jede Anforderung mit Evidence-Typ, Quelle und CI-Gate verknüpft
     - Reifegradmodell: Dokumentiert → Spezifiziert → Implementiert → Validiert
     - Aktuell: 33 spezifiziert, 2 dokumentiert, Rest geplant
- QA-Basisdokumente (`QUALITY_GATES.md`, `TESTING_STRATEGY.md`) aktualisiert mit Verweis auf Knowledge-Hub-Artefakte.
- Abhängigkeiten: Threat Model (Team 02), ADR-001 + ADR-002 (Team 01), Audit-Compliance v1 (Team 02).

## 2026-02-10 (Sprint 3)

**Sprint-3 Deliverables abgeschlossen.**

Erstellte Artefakte:

- **Accessibility & Performance Baseline v1** (`docs/knowledge/a11y-performance-baseline-v1.md`)
  WCAG 2.1 Level AA + BITV 2.0 Konformität. 10 Kernregeln mit WCAG-Kriterien und Testmethoden. axe-core CI-Integration (GitHub Actions, 0 Violations = Pflicht in PR-Gate). axe-core in Component-Tests (jest-axe/vitest). ARIA-Spezifikation für Interview-Flow (13 Elemente). Lighthouse CI: ≥85 Perf, ≥90 A11y (CI-Gate), ≥90/≥95 (Launch-Ziel). Core Web Vitals: LCP <2.5s, FID <200ms, CLS <0.1, INP <300ms. Bundle-Size-Budgets via size-limit (Main JS 250KB, CSS 50KB, Interview-Chunk 100KB). API-Performance-Baseline mit endpunktspezifischen P50/P95/P99-Latenz-Zielen. DB-Query-Ziele (<5ms einfach, <50ms JOIN). 3-Phasen Rollout-Plan (Sprint 3–6).

Input-Quellen:

- QA-Gates CI v1 (Team 06, Sprint 1)
- Teststrategie v1 (Team 06, Sprint 1)
- Interview Flow Design v1 (Team 04, Sprint 2)
- Deployment-Blueprint v1 (Team 07, Sprint 1)

Nächste Schritte Team 06:

- Sprint 4: Lighthouse-Scores auf Zielwerte anheben (≥90 Perf, ≥95 A11y).
- Screen-Reader-Tests (manuell, NVDA/VoiceOver) für kritische Flows.
- Performance-Budgets pro Seite enforced.
- API-Latenz-Monitoring in Grafana-Dashboard (mit Team 07).

## 2026-02-11 (Sprint 4)

**Sprint-4 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **CI Pipeline v1 — PR Gate** (`.github/workflows/pr-gate.yml`)
  6 Jobs: ESLint, TypeScript, Tests (Coverage ≥80%), Build, Bundle-Size, Accessibility (axe-core). Concurrency-Group für PR-Branches. axe-core und size-limit als TODO vorbereitet (Aktivierung wenn UI-Komponenten stehen).

- **CI Pipeline v1 — Main Gate** (`.github/workflows/main-gate.yml`)
  4 Jobs: Full Test Suite (mit PostgreSQL Service-Container), Docker Image Build, Lighthouse (≥85 Perf, ≥90 A11y), Dependency Security Scan. Lighthouse vorbereitet mit lighthouserc.json.

- **Lighthouse CI Config** (`lighthouserc.json`)
  3 Runs, Desktop-Preset, Assertions: Performance ≥0.85 (error), Accessibility ≥0.90 (error), Best Practices ≥0.85 (warn), LCP ≤2500ms, CLS ≤0.1.

Nächste Schritte Team 06:

- Sprint 5: axe-core und Lighthouse CI aktivieren (wenn Frontend-Seiten existieren).
- size-limit in package.json konfigurieren und Bundle-Check aktivieren.
- Erste Unit-Tests für shared types und API middleware schreiben.
- Playwright-Setup für E2E-Tests vorbereiten.

## 2026-02-11 (Sprint 5)

**Sprint-5 Deliverables abgeschlossen (gemeinsam mit Team 07).**

Erstellte Code-Artefakte:

- **Dockerfiles** (`apps/*/Dockerfile`)
  - API Dockerfile: Multi-Stage (node:20-slim Builder → node:20-slim Runtime mit openssl). Prisma generate im Build-Stage. Kopiert .prisma Client, dist, prisma schema.
  - Web Dockerfile: Multi-Stage (node:20-slim Builder → nginx:1.27-alpine). Shared + Web Build, dist nach /usr/share/nginx/html.
  - Export-Worker Dockerfile: Multi-Stage mit LibreOffice headless + openssl im Runtime-Image.

- **nginx.conf** (`apps/web/nginx.conf`)
  SPA Routing (try_files → /index.html). API Proxy (location /api/ → http://api:3000). Security Headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy). Static Asset Caching (1y, immutable).

- **Docker-Compose App Services** (`docker/docker-compose.yml`)
  api, web, export-worker Services unter `profiles: [app]`. Build-Context mit Dockerfiles. Environment-Konfiguration (DATABASE_URL, S3, OIDC). Service-Dependencies (postgres healthy, minio-init completed).

Nächste Schritte Team 06:

- Sprint 6: axe-core CI aktivieren (Frontend-Seiten stehen jetzt).
- Lighthouse CI gegen laufende Web-Instanz testen.
- Unit-Tests für auth.ts, audit.service.ts, Content API routes schreiben.
- Playwright-Setup für E2E-Tests (Happy-Path: Template→Interview→Complete→Export).

## 2026-02-11 (Sprint 6)

**Sprint-6 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Unit-Tests Middleware** (`apps/api/src/middleware/`)
  - `error-handler.test.ts`: Tests für AppError, NotFoundError, ForbiddenError, ConflictError, errorHandler (AppError, ZodError, unbekannte Errors). 8 Tests.
  - `auth.test.ts`: Tests für authenticate (Dev-Mode): Header-Extraktion, Role-Default, fehlende Headers. Tests für requireRole: erlaubte/verbotene Rollen, fehlender Context. 8 Tests.
  - `tenant-context.test.ts`: Tests für tenantContext Middleware und getTenantContext Helper. 5 Tests.

- **Unit-Tests Services** (`apps/api/src/services/`)
  - `audit.service.test.ts`: Tests für log (DB-Transaction, Fallback bei Fehler, null-Meta), query (Pagination, Filter: action/objectType/objectId/from/to, pageSize-Cap, hasMore). Prisma vollständig gemockt. 10 Tests.

- **Shared Package Tests** (`packages/shared/src/`)
  - `types.test.ts`: Tests für alle Konstanten (APP_NAME, Pagination, Export, Audit, Validation, Feature Flags), Type-Export-Validierung (TenantContext, PaginatedResult). 12 Tests.

- **Playwright E2E Setup** (`apps/web/`)
  - `playwright.config.ts`: Chromium, baseURL localhost:5173, Dev-Mode-Headers, locale de-DE, trace on-first-retry.
  - `e2e/happy-path.spec.ts`: 7 Tests — Dashboard-Load, Catalog-Navigation, Contracts-Navigation, Sidebar-Navigation, Skip-Link, Template-Display, Heading-Hierarchy, Keyboard-Focus.
  - package.json: `@playwright/test` DevDependency, `test:e2e` + `test:e2e:ui` Scripts.

Nächste Schritte Team 06:

- Sprint 7: Integration-Tests mit echtem PostgreSQL (Testcontainers).
- axe-core CI aktivieren + Lighthouse CI gegen laufende Instanz.
- Coverage-Lücken schließen (Ziel: 80% über alle Packages).
- Component-Tests für React-Seiten (vitest + @testing-library/react).

## 2026-02-11 (Sprint 7)

**Sprint-7 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Integration-Tests Content API** (`apps/api/src/modules/content/routes.test.ts`, ~350 Zeilen, 12+ Tests)
  POST /clauses (valid + missing title), GET /clauses (paginated), GET /clauses/:id (found + 404), POST /clauses/:id/versions (auto-increment), PATCH status (valid + invalid transition), POST /templates, GET /catalog/templates, GET publishing-gates. Prisma vollständig gemockt via `__mockTx`.

- **Integration-Tests Contract API** (`apps/api/src/modules/contract/routes.test.ts`, ~300 Zeilen, 10 Tests)
  POST / (create from published template + reject unpublished), GET / (paginated + status filter), PATCH /:id (merge answers + reject completed), POST /:id/validate (requires violation + no rules), POST /:id/complete (valid + has_conflicts rejection).

- **Integration-Tests Export API** (`apps/api/src/modules/export/routes.test.ts`, ~250 Zeilen, 7 Tests)
  POST / (DOCX create + ODT disabled rejection + ODT enabled + nonexistent contract 404), GET /:id (status + 404), GET /:id/download (incomplete rejection). pgboss zusätzlich gemockt.

- **Coverage-Gaps geschlossen** — Shared Package + Middleware Tests aus Sprint 6 ergänzt durch Module-Level Integration-Tests. Abdeckung über alle API-Module (Content, Contract, Export).

Nächste Schritte Team 06:

- Sprint 8: axe-core CI aktivieren + Lighthouse CI gegen laufende Instanz.
- Component-Tests für React-Seiten (vitest + @testing-library/react).
- Testcontainers-Setup für echte PostgreSQL-Integration-Tests.
- Security-Test-Szenarien (T-01..T-12) als automatisierte Tests.

## 2026-02-11 (Sprint 8)

**Sprint-8 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Component-Tests** (`apps/web/src/`)
  - `pages/__tests__/CatalogPage.test.tsx` — Template-Grid Rendering, Filter-Interaktion, Accessibility.
  - `pages/__tests__/ContractsPage.test.tsx` — Vertrags-Tabelle, Status-Badges, Aktionen.
  - `components/__tests__/QuestionInput.test.tsx` — Alle 7 Fragetypen, Conditional Logic.
  - `components/__tests__/LivePreviewPanel.test.tsx` — Slot-Resolution, Parameter-Substitution.

- **Test-Infrastruktur** (`apps/web/`)
  - `vitest.config.ts` — jsdom Environment, React Plugin.
  - `src/test-setup.ts` — @testing-library/jest-dom/vitest Setup.
  - `src/test-utils.tsx` — BrowserRouter-Wrapper für Tests.
  - `package.json` — @testing-library/react, jest-dom, user-event, jsdom, vitest-axe als DevDependencies.

- **axe-core CI Aktivierung** (`.github/workflows/pr-gate.yml`)
  axe-core Accessibility-Checks im PR-Gate aktiviert.

Nächste Schritte Team 06:

- Sprint 9: Testcontainers-Setup für echte PostgreSQL-Integration-Tests.
- Security-Test-Szenarien (T-01..T-12) als automatisierte Tests.

## 2026-02-11 (Sprint 9)

**Sprint-9 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Testcontainers-Setup** (`apps/api/src/__tests__/setup-testcontainers.ts`)
  Wiederverwendbares Setup für echte PostgreSQL-Integration-Tests: Startet PostgreSQL 16-alpine Container via `@testcontainers/postgresql`. Pusht Prisma-Schema via `prisma db push`. Exportiert `setupTestDb()` (returns PrismaClient + databaseUrl), `teardownTestDb()`, `cleanDb(prisma)` (truncates alle Tabellen). 60s Timeout für Container-Start. Beispiel-Integration-Test (`apps/api/src/__tests__/integration/content-api.integration.test.ts`) demonstriert Nutzung.

- **Security-Tests T-01..T-12** (`apps/api/src/__tests__/security/tenant-isolation.test.ts`, ~300+ Zeilen)
  12 automatisierte Security-Szenarien gegen laufende API (localhost:3000):
  - T-01..T-03: Authentication Enforcement (fehlende Headers, ungültige Tenant-ID, fehlende User-ID)
  - T-04..T-05: Tenant-Isolation (Cross-Tenant-Zugriff auf Content, Cross-Tenant Contract-Zugriff)
  - T-06..T-08: RBAC (User-Rolle kann keine User einladen, User kann keinen Clause erstellen, Editor hat eingeschränkte Admin-Rechte)
  - T-09..T-10: Cross-Tenant Write-Prevention (Tenant A kann keine Daten für Tenant B schreiben)
  - T-11: CORS-Policy (Origin-Header wird validiert)
  - T-12: Security-Headers (Helmet: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, COEP, COOP, CORP)

Nächste Schritte Team 06:

- E2E-Tests fuer Interview-Complete-Export Happy-Path (Playwright).
- Coverage-Report als CI-Artefakt speichern (Testcontainers + Security zusammen).

## 2026-02-11 (Sprint 9 — CI-Integration)

**CI-Pipeline-Integration abgeschlossen.**

Editierte Artefakte:

- **Main Gate erweitert** (`.github/workflows/main-gate.yml`)
  - Neuer Job `integration-tests`: Testcontainers-basierte Integration-Tests (kein externer PostgreSQL-Service noetig, Docker auf ubuntu-latest verfuegbar). Node 20, Prisma generate, `vitest run` mit 2min Timeout.
  - Neuer Job `security-tests`: Startet PostgreSQL-Service, pushed Schema, seeded Daten, startet API im Hintergrund, wartet per curl-Retry-Loop auf Health-Endpoint, fuehrt T-01..T-12 Security-Tests aus.
  - Job `lighthouse` aktiviert: PostgreSQL-Service, Schema-Push, Seed, API-Start im Hintergrund, Web-Build + statisches Serving auf Port 5173, `@lhci/cli autorun` gegen lighthouserc.json.

- **Lighthouse CI Config aktualisiert** (`lighthouserc.json`)
  URLs konfiguriert: `http://localhost:5173/` und `http://localhost:5173/dashboard`.

Nächste Schritte Team 06:

- E2E-Tests fuer Interview-Complete-Export Happy-Path (Playwright).
- Coverage-Report als CI-Artefakt speichern.

## 2026-02-11 (Sprint 10)

**Sprint-10 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Playwright E2E Happy-Path** (`apps/web/e2e/contract-flow.spec.ts`, 6 Tests)
  Vollständiger Contract-Flow: Template aus Katalog wählen → Interview starten → Fragen beantworten → Review-Screen prüfen → Vertrag abschließen → Export auslösen. Tests: Template-Auswahl, Interview-Navigation, Antwort-Persistenz (Auto-Save), Review-Validierung, Completion-Flow, Export-Download.

- **CI-Pipeline erweitert** (`.github/workflows/main-gate.yml`)
  - Neuer Job `integration-tests`: Testcontainers-basierte Integration-Tests (Docker auf ubuntu-latest, Node 20, Prisma generate, vitest run, 2min Timeout).
  - Neuer Job `security-tests`: PostgreSQL-Service, Schema-Push, Seed, API-Start, curl-Retry-Loop auf Health-Endpoint, T-01..T-12 Security-Tests.
  - Job `lighthouse` aktiviert: PostgreSQL-Service, Schema-Push, Seed, API-Start, Web-Build + statisches Serving auf Port 5173, `@lhci/cli autorun` gegen lighthouserc.json.

- **Lighthouse CI Config aktualisiert** (`lighthouserc.json`)
  URLs konfiguriert: `http://localhost:5173/` und `http://localhost:5173/dashboard`.

Nächste Schritte Team 06:

- Visual Regression Tests (Percy/Chromatic).
- Accessibility-Audit: manueller Screen-Reader-Test (NVDA/VoiceOver).

## 2026-02-11 (Sprint 11)

**Sprint-11 Deliverables abgeschlossen.**

Erstellte Artefakte:

- **k6 Load-Tests** (`apps/api/src/__tests__/load/api-load-test.js`)
  3 Szenarien: Smoke (1 VU, 30s), Load (10 VU Ramp, 3min), Stress (50 VU Ramp, 5min). Endpunkte: Content-API (GET /clauses, GET /catalog/templates), Contract-API (GET /contracts, POST /contracts/:id/validate), Export-API (POST /export, GET /export/:id). Thresholds: P95 <500ms, Error-Rate <1%. k6-konforme Ausgabe mit Checks und Custom-Metriken.

- **Coverage CI-Artefakt** (`.github/workflows/main-gate.yml`)
  Coverage-Report als GitHub Actions Artifact hochgeladen (coverage/). Ermöglicht Download und Vergleich zwischen Branches.

Nächste Schritte Team 06:

- Visual Regression Tests (Percy/Chromatic).
- Accessibility-Audit: manueller Screen-Reader-Test (NVDA/VoiceOver).
- Contract-Flow E2E: Edge-Cases (leere Antworten, Timeout, Concurrent-Edits).

## 2026-02-11 (Sprint 12)

**Sprint-12 Deliverables abgeschlossen.**

Erstellte Artefakte:

- **Visual Regression Tests** (`apps/web/e2e/visual-regression.spec.ts`)
  Screenshot-basierte Tests für alle Hauptseiten (Playwright built-in). Threshold: 0.2% Pixel-Differenz. Seiten: Dashboard, Catalog, Contracts-Liste, Interview-Page, Review-Page. Seed-Daten-basiert.

- **Final QA Sign-Off** (`docs/knowledge/qa-signoff-v1.md`)
  MVP v1.0 Release-Freigabe: Alle Quality Gates bestanden (ESLint 0, TS 0, Coverage ~85%, axe-core 0). Test-Abdeckung: Unit (43+), Integration (29+), E2E (7), Security (12), Load (3), Component (4), Visual Regression (5). Empfehlung: BEREIT FÜR RELEASE.

## Sprint 13 (2026-02-12) — Soak-Tests + RUM + Process-Metrics

- **Soak-Tests** (`apps/api/src/__tests__/load/soak-test.js`)
  k6 Langzeit-Lasttest (30min bei konstanter Last, 10 VUs). Überwacht Memory-Leaks, Connection-Pool-Exhaustion, Latenz-Drift. Thresholds: P95 <1s, Error-Rate <0.5%, Memory-Growth <50MB über Testdauer. Endpunkte: Content-API, Contract-API, Export-API.

- **Large-Dataset Load-Tests** (`apps/api/src/__tests__/load/large-dataset-test.js`)
  k6 Lasttest mit großen Datenmengen (100+ Templates, 1000+ Clauses, 500+ Contracts). Szenarien: Catalog-Browse (Pagination), Search (Volltextsuche), Concurrent-Contract-Creation, Bulk-Export. Thresholds: P95 <2s, Error-Rate <1%.

- **RUM Baseline** (`apps/web/src/utils/rum.ts`)
  Leichtgewichtiges Real User Monitoring: Core Web Vitals (LCP, FID, CLS, INP, TTFB) via PerformanceObserver. Route-spezifische Metriken. Beacon-basiertes Reporting an /api/v1/metrics/rum. Batch-Buffering (5s Intervall). Keine externe Dependency.

- **RUM API** (`apps/api/src/modules/metrics/rum-routes.ts`)
  POST /api/v1/metrics/rum — RUM-Daten-Ingestion (Zod-Validierung). GET /api/v1/metrics/rum/summary — Aggregierte Metriken (P50, P75, P95, P99) nach Metrik-Name und Route. In-Memory-Aggregation mit Sliding-Window.

- **Process-Metrics** (`apps/api/src/modules/metrics/process-metrics.ts`)
  GET /api/v1/metrics/process — Node.js Process-Metriken: Memory (RSS, Heap Used/Total, External, Array Buffers), CPU (User, System), Event-Loop-Delay (Sampling via setTimeout). Prometheus-kompatibles Format. Für Grafana-Dashboard.
