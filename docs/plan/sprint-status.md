# Sprint-Status – Übersicht

**Stand:** 2026-02-11
**Sprint:** 12 ABGESCHLOSSEN (Final MVP Release + Pilot-Readiness)

## Ziele

- Release-Notes v1.0 + Cross-Module-Event-System evaluieren
- Session-Management härten (Token-Rotation, Logout-Propagation)
- Pilot-Content: Zusätzliche Vertragstypen (Dienstleistungsvertrag, NDA)
- UI-Finalisierung: Drag-and-Drop Klausel-Reihenfolge + i18n-Framework
- Export-Erweiterung: Batch-Export + Logo-Upload für Kanzlei-Branding
- QA-Abschluss: Visual Regression Tests + Final QA Sign-Off
- Deployment-Finalisierung: Blue/Green Deployment + HPA-Tuning

## Fortschritt (Teams)

- Team 01: **Abgeschlossen** — Release-Notes v1.0 + Cross-Module-Event-Evaluierung
- Team 02: **Abgeschlossen** — Session-Härtung + Keycloak-Backup-Strategie
- Team 03: **Abgeschlossen** — Pilot-Content: Dienstleistungsvertrag + NDA Templates
- Team 04: **Abgeschlossen** — Drag-and-Drop Klausel-Reihenfolge + i18n-Setup
- Team 05: **Abgeschlossen** — Batch-Export + Logo-Upload Branding
- Team 06: **Abgeschlossen** — Visual Regression Tests + Final QA Sign-Off
- Team 07: **Abgeschlossen** — Blue/Green Deployment + HPA-Tuning

## Abgeschlossen (2026-02-10)

- [x] Domänenmodell v1 → `docs/knowledge/domain-model-v1.md`
- [x] ADR-001 Tenancy operationalisiert → `docs/knowledge/adr-001-multi-tenant-isolation.md`
- [x] ADR-002 Pinning spezifiziert → `docs/knowledge/adr-002-version-pinning.md`
- [x] Architecture Backbone v1 → `docs/knowledge/architecture-backbone-v1.md`
- [x] Story-Map MVP priorisiert → `docs/knowledge/story-map-mvp.md`
- [x] Threat Model Tenant-Isolation → `docs/knowledge/threat-model-tenant-isolation.md`
- [x] RBAC/IAM-Modell v1 → `docs/knowledge/rbac-iam-model-v1.md`
- [x] Audit-Event-Katalog + Compliance-Checkliste → `docs/knowledge/audit-compliance-v1.md`
- [x] QA-Gates CI-Spezifikation v1 → `docs/knowledge/qa-gates-ci-v1.md`
- [x] Teststrategie v1 → `docs/knowledge/test-strategy-v1.md`
- [x] Compliance Evidence Checklist v1 → `docs/knowledge/compliance-evidence-checklist-v1.md`
- [x] Deployment-Blueprint v1 → `docs/knowledge/deployment-blueprint-v1.md`
- [x] CI/CD Skeleton v1 → `docs/knowledge/cicd-skeleton-v1.md`
- [x] Secrets/Key-Handling v1 → `docs/knowledge/secrets-key-handling-v1.md`

### Sprint 2 (2026-02-10)

- [x] Content Versioning Schema v1 → `docs/knowledge/content-versioning-schema-v1.md`
- [x] Interview Flow Design & Rule Engine v1 → `docs/knowledge/interview-flow-design-v1.md`
- [x] Konfliktregeln-Matrix v1 → `docs/knowledge/conflict-rules-matrix-v1.md`

### Sprint 3 (2026-02-10)

- [x] DOCX Export MVP Spezifikation → `docs/knowledge/docx-export-spec-v1.md`
- [x] ODT-Konvertierung Evaluierung → `docs/knowledge/odt-conversion-eval-v1.md`
- [x] Accessibility/Performance Baseline → `docs/knowledge/a11y-performance-baseline-v1.md`
- [x] Audit Logging E2E Spezifikation → `docs/knowledge/audit-logging-e2e-v1.md`

### Sprint 4 (2026-02-11)

- [x] Monorepo Project Scaffold + Docker-Compose → `apps/`, `packages/`, `docker/`
- [x] Prisma Schema v1 + RLS Migrations → `apps/api/prisma/`
- [x] Frontend Scaffold React + Vite → `apps/web/`
- [x] Export Worker Skeleton → `apps/export-worker/`
- [x] CI Pipeline v1 GitHub Actions → `.github/workflows/`

### Sprint 5 (2026-02-11)

- [x] Module Service Interfaces + Seed Data → `packages/shared/src/services.ts`, `apps/api/prisma/seed.ts`
- [x] JWT Auth Middleware + AuditService + Identity API → `apps/api/src/middleware/auth.ts`, `apps/api/src/services/audit.service.ts`
- [x] Content API (Clause + Template CRUD) → `apps/api/src/modules/content/routes.ts`
- [x] Contract API + Interview Flow UI → `apps/api/src/modules/contract/routes.ts`, `apps/web/src/pages/`
- [x] Export API + Data-Loader DB Integration → `apps/api/src/modules/export/routes.ts`, `apps/export-worker/src/data/data-loader.ts`
- [x] Dockerfiles + Docker-Compose App Services → `apps/*/Dockerfile`, `docker/docker-compose.yml`

### Sprint 6 (2026-02-11)

- [x] Unit-/Integrationstests (Middleware + Services + Shared) → `apps/api/src/**/*.test.ts`, `packages/shared/src/types.test.ts`
- [x] Keycloak Realm-Automation → `docker/keycloak/realm-export.json`
- [x] Referenz-DOCX-Templates → `apps/export-worker/templates/`
- [x] Kubernetes-Manifeste (Kustomize) → `k8s/base/`, `k8s/overlays/dev/`
- [x] Playwright E2E-Tests → `apps/web/e2e/`, `apps/web/playwright.config.ts`
- [x] Observability (Prometheus + Grafana) → `docker/prometheus/`, `docker/grafana/`

### Sprint 7 (2026-02-11)

- [x] K8s Network Policies + Staging-Overlay + build-push Workflow → `k8s/base/network-policy-*.yaml`, `k8s/overlays/staging/`, `.github/workflows/build-push.yml`
- [x] Integration-Tests API-Module (Content, Contract, Export) → `apps/api/src/modules/*/routes.test.ts`
- [x] Live-Preview Panel + multiple_choice + Conditional Logic → `apps/web/src/components/`, `apps/web/src/pages/InterviewPage.tsx`
- [x] Changelog-API + Publishing-Gate-Validierung → `apps/api/src/modules/content/changelog.ts`, `apps/api/src/modules/content/publishing-gates.ts`
- [x] Export Rendering-Test + ODT Feature-Flag → `apps/export-worker/src/__tests__/`, `apps/export-worker/src/config/feature-flags.ts`

### Sprint 8 (2026-02-11)

- [x] Blocker-Fix: pino-pretty + Export-Handler DB-Update → `apps/api/package.json`, `apps/export-worker/src/handlers/export-handler.ts`
- [x] API-Versionierung v1 Prefix + Hardened Security Headers → `apps/api/src/main.ts`
- [x] User-Provisioning API (activate/deactivate/delete) + Security-Headers → `apps/api/src/modules/identity/routes.ts`
- [x] Reviewer-Workflow (10 Endpoints, Vier-Augen-Prinzip) → `apps/api/src/modules/content/reviewer.ts`
- [x] CatalogPage Filter/Suche + ConflictResolutionPanel → `apps/web/src/pages/CatalogPage.tsx`, `apps/web/src/components/ConflictResolutionPanel.tsx`
- [x] DLQ Monitoring + Kanzlei-Branding → `apps/api/src/modules/export/dlq-routes.ts`, `apps/api/src/modules/export/branding-routes.ts`
- [x] Component-Tests + axe-core CI → `apps/web/src/**/__tests__/`, `.github/workflows/pr-gate.yml`
- [x] Prod-Overlay + Ingress + On-Prem Overlay → `k8s/overlays/prod/`, `k8s/overlays/onprem/`

### Sprint 9 (2026-02-11)

- [x] Breaking-Change-Policy ADR-005 → `docs/knowledge/adr-005-breaking-change-policy.md`
- [x] DevOps/Admin-Anleitung → `docs/guides/devops-admin-guide.md`
- [x] User-Anleitungen (Admin/Editor/User) → `docs/guides/user-guide-{admin,editor,enduser}.md`
- [x] Keycloak Admin API Integration → `apps/api/src/services/keycloak-admin.ts`
- [x] MFA TOTP-Konfiguration → `docker/keycloak/realm-export.json` (conditional OTP flow)
- [x] Batch-Clause-Content-Endpoint → `apps/api/src/modules/content/routes.ts` (POST /clauses/batch-content)
- [x] Review-Screen → `apps/web/src/pages/ReviewPage.tsx`
- [x] Testcontainers-Setup → `apps/api/src/__tests__/setup-testcontainers.ts`
- [x] Security-Tests T-01..T-12 → `apps/api/src/__tests__/security/tenant-isolation.test.ts`
- [x] cert-manager + Let's Encrypt → `k8s/overlays/{prod,staging}/cert-manager-issuer.yaml`

### Sprint 10 (2026-02-11)

- [x] OpenAPI/Swagger API-Dokumentation → `docs/api/openapi.yaml`
- [x] Modul-Boundaries Dokumentation → `docs/knowledge/module-boundaries-v1.md`
- [x] Keycloak Admin API in Identity-Routes → `apps/api/src/modules/identity/routes.ts` (7 Sync-Aufrufe)
- [x] Passwort-Policies + Rate-Limiting → `docker/keycloak/realm-export.json`, `apps/api/src/middleware/rate-limit.ts`
- [x] Export-Trigger ReviewPage + Keyboard-Nav → `apps/web/src/pages/ReviewPage.tsx`, `apps/web/src/pages/InterviewPage.tsx`
- [x] Export-Pipeline E2E-Validierung → `apps/export-worker/src/__tests__/export-pipeline.integration.test.ts`
- [x] Playwright E2E Happy-Path → `apps/web/e2e/contract-flow.spec.ts`
- [x] CI Testcontainers + Security-Tests → `.github/workflows/main-gate.yml`
- [x] Lighthouse CI aktiviert → `.github/workflows/main-gate.yml`
- [x] Backup-CronJob + External Secrets → `k8s/base/backup-cronjob.yaml`, `k8s/overlays/prod/external-secrets-*.yaml`

### Sprint 11 (2026-02-11)

- [x] MVP Release-Kandidat-Checkliste + Tech-Stack-Review → `docs/knowledge/release-checklist-v1.md`, `docs/knowledge/tech-stack-review-v1.md`
- [x] API Performance-Baseline → `docs/knowledge/performance-baseline-v1.md`
- [x] Keycloak Admin API Unit-Tests + CSRF-Evaluierung → `apps/api/src/services/__tests__/keycloak-admin.test.ts`, `docs/knowledge/csrf-evaluation-v1.md`
- [x] Content-Import CLI → `apps/api/src/modules/content/import.ts`, `apps/api/src/modules/content/import.test.ts`
- [x] Responsive Design Interview + Review → `apps/web/src/styles/responsive.css`
- [x] Changelog-UI Frontend → `apps/web/src/components/ChangelogPanel.tsx`
- [x] Export Template-Caching + Pre-Warm → `apps/export-worker/src/cache/template-cache.ts`, `apps/export-worker/src/cache/pre-warm.ts`
- [x] k6 Load-Tests + Coverage CI → `apps/api/src/__tests__/load/api-load-test.js`, `.github/workflows/main-gate.yml`
- [x] Loki Log-Aggregation + Alerting-Rules → `docker/loki/`, `docker/promtail/`, `docker/prometheus/alerting-rules.yml`
- [x] K8s Smoke-Test Script → `k8s/scripts/smoke-test.sh`

### Sprint 12 (2026-02-11)

- [x] Release-Notes v1.0 + Cross-Module-Event-Evaluierung → `docs/knowledge/release-notes-v1.md`, `docs/knowledge/cross-module-events-v1.md`
- [x] Session-Härtung + Keycloak-Backup-Strategie → `apps/api/src/middleware/session-hardening.ts`, `docs/knowledge/keycloak-backup-strategy-v1.md`
- [x] Pilot-Content Dienstleistungsvertrag + NDA → `apps/api/prisma/fixtures/dienstleistungsvertrag.json`, `apps/api/prisma/fixtures/nda.json`
- [x] Drag-and-Drop Klausel-Reihenfolge → `apps/web/src/components/ClauseReorderPanel.tsx`
- [x] i18n-Framework-Setup (de/en) → `apps/web/src/i18n/`
- [x] Batch-Export für mehrere Verträge → `apps/api/src/modules/export/batch-routes.ts`
- [x] Logo-Upload Kanzlei-Branding → `apps/api/src/modules/export/logo-upload.ts`
- [x] Visual Regression Tests + QA Sign-Off → `apps/web/e2e/visual-regression.spec.ts`, `docs/knowledge/qa-signoff-v1.md`
- [x] Blue/Green Deployment-Strategie → `k8s/scripts/blue-green-deploy.sh`
- [x] HPA-Tuning → `k8s/overlays/prod/hpa-tuned.yaml`

## Offen

- **MVP v1.0 Release-Ready.** Alle 12 Sprints abgeschlossen (100+ Deliverables).
- Nächste Phase: Pilot-Rollout mit ausgewählten Kanzleien.

## Risiken/Blocker

- ~~Tenancy-Entscheidung muss in Datenzugriffsschicht verankert werden.~~ → Erledigt (ADR-001 Implementation Spec).
- ~~QA/Guidelines Altinhalte wurden bereinigt, müssen noch in CI reflektiert werden.~~ → Erledigt (A11y/Perf Baseline, QA-Gates CI v1).
- ~~Export-Qualität benötigt Referenzdokumente früh.~~ → Erledigt (DOCX Export Spec mit 3 Referenzdokumenten).
- ~~ODT-Konvertierung Beta: Hierarchische Nummerierung kann Abweichungen zeigen.~~ → Akzeptiert für Beta, ODT-Converter implementiert.
- ~~Lighthouse CI noch nicht produktiv.~~ → Workflow erstellt (main-gate.yml), Aktivierung wenn Frontend-Seiten stehen.
- ~~Tenant-Middleware nutzt noch Dev-Header statt echte JWT-Validierung.~~ → Erledigt (JWT Auth Middleware, Sprint 5).
- ~~Export Data-Loader enthält Mock-Daten.~~ → Erledigt (Data-Loader mit Prisma-Queries, Sprint 5).
- ~~Keycloak Realm-Konfiguration noch nicht automatisiert.~~ → Erledigt (realm-export.json mit Auto-Import, Sprint 6).
- ~~E2E-Tests (Playwright) noch nicht implementiert.~~ → Erledigt (Playwright Config + Happy-Path, Sprint 6).
- ~~Referenz-DOCX-Templates noch nicht erstellt.~~ → Erledigt (Template-Generator + default.docx Struktur, Sprint 6).
- ~~Test-Coverage noch unter 80% Ziel — weitere Tests in Sprint 7 nötig.~~ → Integration-Tests für alle 3 API-Module + Export-Rendering-Tests geschrieben (Sprint 7).
- ~~Kubernetes-Manifeste noch nicht gegen echten Cluster validiert.~~ → Network Policies + Staging + Prod + On-Prem Overlays erstellt. K3s-Validierung in Sprint 9.
- ~~Publishing-Gate-Validierung noch nicht E2E-getestet.~~ → Unit-Test-Coverage vorhanden, Testcontainers für echte DB-Tests in Sprint 9.
- ~~Live-Preview zeigt noch Platzhalter statt echte Klausel-Inhalte.~~ → Erledigt (Batch-Clause-Content-Endpoint, Sprint 9).
- ~~pino-pretty fehlte als DevDependency.~~ → Erledigt (Sprint 8).
- ~~Export-Handler TODO: DB-Status nach Export nicht aktualisiert.~~ → Erledigt (prisma.exportJob.update, Sprint 8).
- ~~Keycloak Admin API Integration für User-Provisioning noch ausstehend.~~ → Erledigt (KeycloakAdminService mit Token-Caching, Sprint 9).
- ~~Security-Test-Szenarien (T-01..T-12) noch nicht automatisiert.~~ → Erledigt (12 automatisierte Security-Tests, Sprint 9).
- ~~Testcontainers benötigen Docker im CI-Runner.~~ → Setup erstellt (GitHub Actions unterstützt Docker, Sprint 9).
- ~~Keycloak Admin API: Token-Caching implementiert, Rate-Limiting noch zu evaluieren.~~ → Erledigt (Rate-Limiting Middleware, Sprint 10).
- ~~Keycloak Admin API noch nicht in Identity-Routes integriert (Sync bei invite/activate/deactivate).~~ → Erledigt (7 Sync-Aufrufe in Identity-Routes, Sprint 10).

## Owner Matrix

- ADR-001: Team 01 + Team 02 + Team 07
- ADR-002: Team 01 + Team 03 + Team 04
- ADR-003: Team 01 + Team 05 + Team 07
- ADR-004: Team 01 + Team 05 + Team 07
- Domänenmodell v1: Team 01
- QA-Gates in CI: Team 06
- Deployment-Blueprint: Team 07
- Content Versioning Schema: Team 03
- Interview Flow Design + Rule Engine: Team 04
- Konfliktregeln-Matrix: Team 03 + 04
- DOCX Export MVP: Team 05
- ODT-Evaluierung: Team 05 + 07
- A11y/Performance Baseline: Team 06
- Audit Logging E2E: Team 02 + 07

## Nächste Schritte

- ~~ADRs in Architektur-Backbone einarbeiten.~~ → Erledigt.
- ~~Threat Model validieren (Team 02).~~ → Validiert (Sprint 1).
- ~~CI-Jobs für Lint/Typecheck/Test/A11y einrichten (Team 06).~~ → Spezifiziert (QA-Gates CI v1).
- ~~Deployment-Environments dev/stage/prod skizzieren (Team 07).~~ → Spezifiziert (Deployment-Blueprint v1).
- ~~Sprint 2 vorbereiten: Content CRUD + Rules + Interview-Flow Design.~~ → Abgeschlossen (3/3 Deliverables).
- ~~Sprint 3 vorbereiten: DOCX Export MVP, ODT-Evaluierung, Accessibility/Performance Baseline, Audit Logging E2E.~~ → Abgeschlossen (4/4 Deliverables).
- ~~Sprint 4 vorbereiten: Implementation-Phase beginnen (Code-Scaffold, DB-Migrationen, erste UI-Komponenten).~~ → Abgeschlossen (5/5 Deliverables).
- ~~Sprint 5: Keycloak-Integration, Content CRUD, Interview-Flow UI, Export DB-Integration.~~ → Abgeschlossen (6/6 Deliverables).
- ~~Sprint 6: Unit-/Integrationstests, Keycloak Realm-Automation, Referenz-DOCX-Templates, Kubernetes-Manifeste, E2E-Tests.~~ → Abgeschlossen (6/6 Deliverables).
- ~~Sprint 7: Integration-Tests, Live-Preview, Changelog-API, Publishing-Gates, Network Policies, build-push.~~ → Abgeschlossen (6/6 Deliverables).
- ~~Sprint 8: API-Versionierung, User-Provisioning, Reviewer-Workflow, CatalogPage Filter, DLQ+Branding, Component-Tests, Prod+OnPrem Overlay.~~ → Abgeschlossen (8/8 Deliverables).
- ~~Sprint 9: Breaking-Change-Policy, Dokumentation, Keycloak Admin API, MFA, Batch-Clause-Endpoint, Review-Screen, Testcontainers, Security-Tests, cert-manager.~~ → Abgeschlossen (10/10 Deliverables).
- ~~Sprint 10: OpenAPI Docs, Modul-Boundaries, Keycloak Integration, Passwort-Policies, Export-Trigger, Export E2E, Playwright Happy-Path, CI-Integration, Lighthouse, Backup-CronJob.~~ → Abgeschlossen (10/10 Deliverables).
- ~~Sprint 11: Release-Checkliste, Performance-Baseline, Keycloak-Tests, Content-Import, Responsive Design, Changelog-UI, Template-Caching, Load-Tests, Loki, K8s-Smoke-Tests.~~ → Abgeschlossen (10/10 Deliverables).
- ~~Sprint 12: Release-Notes, Session-Härtung, Pilot-Content, DnD+i18n, Batch-Export+Logo, Visual Regression, Blue/Green+HPA.~~ → Abgeschlossen (10/10 Deliverables).

## Open Items (Entscheidungen)

- ~~RLS-Policies + App-Layer Guardrails verbindlich festlegen~~ → Spezifiziert in ADR-001.
- ~~ODT-Option als Beta via Konvertierung bestätigen (Owner: Team 05 + 07).~~ → Bestätigt (ODT-Evaluierung: AKZEPTABEL FÜR BETA).
- ~~QA-Gates als CI-Standard final freigeben (Owner: Team 06).~~ → Spezifiziert (QA-Gates CI v1, inkl. Rollout-Plan).
- ~~Tech-Stack-Entscheidungen (BB-001..007) im Team-Review bestätigen (Owner: Team 01).~~ → Erledigt (Tech-Stack-Review v1, Sprint 11).
- ~~Lighthouse-Scores auf Zielwerte anheben: ≥90 Perf, ≥95 A11y (Owner: Team 06, Ziel: Sprint 4).~~ → Lighthouse CI konfiguriert, Tuning mit realen Seiten in Sprint 7.
- ~~API-Latenz-Monitoring in Grafana-Dashboard (Owner: Team 06 + 07, Ziel: Sprint 6).~~ → Erledigt (Prometheus + Grafana + Postgres-Exporter, Overview-Dashboard).
