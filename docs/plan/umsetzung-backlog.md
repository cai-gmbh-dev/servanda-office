# Umsetzung Backlog (operational)

Ziel: Den strategischen Umsetzungsplan in konkrete, teamübergreifende Arbeitspakete übersetzen.

## Sprint 1 (Foundation)
- [x] Domänenmodell v1 finalisieren (Owner: Team 01, Ref: `docs/knowledge/domain-model-v1.md`) ✓ 2026-02-10
- [x] ADR-001 Tenancy-Entscheidung operationalisieren (Owner: Team 01 + 02, Ref: `docs/knowledge/adr-001-multi-tenant-isolation.md`) ✓ 2026-02-10
- [x] ADR-002 Pinning in ContractInstance spezifizieren (Owner: Team 01 + 03, Ref: `docs/knowledge/adr-002-version-pinning.md`) ✓ 2026-02-10
- [x] Architecture Backbone v1 erstellen (Owner: Team 01, Ref: `docs/knowledge/architecture-backbone-v1.md`) ✓ 2026-02-10
- [x] Story-Map nach MVP-Epics priorisieren (Owner: Team 01, Ref: `docs/knowledge/story-map-mvp.md`) ✓ 2026-02-10
- [x] Tenant-Isolation Threat Model (Owner: Team 02, Ref: `docs/knowledge/threat-model-tenant-isolation.md`) ✓ 2026-02-10
- [x] RBAC/IAM-Modell v1 (Owner: Team 02, Ref: `docs/knowledge/rbac-iam-model-v1.md`) ✓ 2026-02-10
- [x] Audit-Event-Katalog + Compliance-Checkliste (Owner: Team 02, Ref: `docs/knowledge/audit-compliance-v1.md`) ✓ 2026-02-10
- [x] QA-Gates CI-Spezifikation v1 (Owner: Team 06, Ref: `docs/knowledge/qa-gates-ci-v1.md`) ✓ 2026-02-10
- [x] Teststrategie v1 für MVP (Owner: Team 06, Ref: `docs/knowledge/test-strategy-v1.md`) ✓ 2026-02-10
- [x] Compliance Evidence Checklist v1 (Owner: Team 06, Ref: `docs/knowledge/compliance-evidence-checklist-v1.md`) ✓ 2026-02-10
- [x] Deployment-Blueprint v1 (Owner: Team 07, Ref: `docs/knowledge/deployment-blueprint-v1.md`) ✓ 2026-02-10
- [x] CI/CD Skeleton v1 (Owner: Team 07, Ref: `docs/knowledge/cicd-skeleton-v1.md`) ✓ 2026-02-10
- [x] Secrets/Key-Handling v1 (Owner: Team 07 + 02, Ref: `docs/knowledge/secrets-key-handling-v1.md`) ✓ 2026-02-10

## Sprint 2 (Editorial + Builder)
- [x] Template/Clause Versioning Schema (Owner: Team 03, Ref: `docs/knowledge/content-versioning-schema-v1.md`) ✓ 2026-02-10
- [x] Interview Flow Design + Save/Resume + Rule Engine (Owner: Team 04, Ref: `docs/knowledge/interview-flow-design-v1.md`) ✓ 2026-02-10
- [x] Konfliktregeln-Matrix requires/forbids/incompatible (Owner: Team 04 + 03, Ref: `docs/knowledge/conflict-rules-matrix-v1.md`) ✓ 2026-02-10

## Sprint 3 (Export + Hardening)
- [x] DOCX Export MVP Spezifikation (Owner: Team 05, Ref: `docs/knowledge/docx-export-spec-v1.md`) ✓ 2026-02-10
- [x] ODT-Konvertierung Evaluierung (Owner: Team 05 + 07, Ref: `docs/knowledge/odt-conversion-eval-v1.md`) ✓ 2026-02-10
- [x] Accessibility/Performance Baseline (Owner: Team 06, Ref: `docs/knowledge/a11y-performance-baseline-v1.md`) ✓ 2026-02-10
- [x] Audit Logging E2E Spezifikation (Owner: Team 02 + 07, Ref: `docs/knowledge/audit-logging-e2e-v1.md`) ✓ 2026-02-10

## Sprint 4 (Implementation — Code Scaffold)
- [x] Monorepo Project Scaffold + Docker-Compose (Owner: Team 01 + 07, Ref: `apps/`, `packages/`, `docker/`) ✓ 2026-02-11
- [x] Prisma Schema v1 + RLS Migrations + Tenant Middleware (Owner: Team 02, Ref: `apps/api/prisma/`) ✓ 2026-02-11
- [x] Frontend Scaffold React + Vite + TypeScript (Owner: Team 04, Ref: `apps/web/`) ✓ 2026-02-11
- [x] Export Worker Skeleton pgboss + docxtemplater (Owner: Team 05, Ref: `apps/export-worker/`) ✓ 2026-02-11
- [x] CI Pipeline v1 GitHub Actions (Owner: Team 06 + 07, Ref: `.github/workflows/`) ✓ 2026-02-11

## Sprint 5 (Module Implementation)
- [x] Module Service Interfaces + Seed Data Script (Owner: Team 01, Ref: `packages/shared/src/services.ts`, `apps/api/prisma/seed.ts`) ✓ 2026-02-11
- [x] JWT Auth Middleware + AuditService + Identity API (Owner: Team 02, Ref: `apps/api/src/middleware/auth.ts`, `apps/api/src/services/audit.service.ts`) ✓ 2026-02-11
- [x] Content API — Clause + Template CRUD mit Versioning (Owner: Team 03, Ref: `apps/api/src/modules/content/routes.ts`) ✓ 2026-02-11
- [x] Contract API + Interview Flow UI (Owner: Team 04, Ref: `apps/api/src/modules/contract/routes.ts`, `apps/web/src/pages/`) ✓ 2026-02-11
- [x] Export API + Data-Loader DB Integration (Owner: Team 05, Ref: `apps/api/src/modules/export/routes.ts`, `apps/export-worker/src/data/data-loader.ts`) ✓ 2026-02-11
- [x] Dockerfiles + Docker-Compose App Services (Owner: Team 06 + 07, Ref: `apps/*/Dockerfile`, `docker/docker-compose.yml`) ✓ 2026-02-11

## Sprint 6 (Testing + Hardening)
- [x] Unit-/Integrationstests für API-Module + Middleware (Owner: Team 06, Ref: `apps/api/src/**/*.test.ts`) ✓ 2026-02-11
- [x] Keycloak Realm-Automation realm-export.json (Owner: Team 02 + 07, Ref: `docker/keycloak/`) ✓ 2026-02-11
- [x] Referenz-DOCX-Templates für Seed-Klauseln (Owner: Team 03 + 05, Ref: `apps/export-worker/templates/`) ✓ 2026-02-11
- [x] Kubernetes-Manifeste Kustomize base + dev (Owner: Team 07, Ref: `k8s/`) ✓ 2026-02-11
- [x] Playwright E2E-Tests Happy-Path (Owner: Team 06, Ref: `apps/web/e2e/`) ✓ 2026-02-11
- [x] Observability: Prometheus + Grafana Docker-Compose (Owner: Team 07, Ref: `docker/`) ✓ 2026-02-11

## Sprint 7 (Integration + Polish)
- [x] K8s Network Policies + Staging-Overlay + build-push Workflow (Owner: Team 07, Ref: `k8s/`, `.github/workflows/build-push.yml`) ✓ 2026-02-11
- [x] Integration-Tests API-Module (Content, Contract, Export) (Owner: Team 06, Ref: `apps/api/src/modules/**/*.test.ts`) ✓ 2026-02-11
- [x] Live-Preview Panel + multiple_choice + Conditional Logic (Owner: Team 04, Ref: `apps/web/src/`) ✓ 2026-02-11
- [x] Changelog-API + Publishing-Gate-Validierung (Owner: Team 03, Ref: `apps/api/src/modules/content/`) ✓ 2026-02-11
- [x] Export Rendering-Test + ODT Feature-Flag Tenant-Config (Owner: Team 05, Ref: `apps/export-worker/`) ✓ 2026-02-11
- [x] Coverage-Gaps schließen: Shared Package + Middleware ergänzen (Owner: Team 06, Ref: `packages/shared/`, `apps/api/src/`) ✓ 2026-02-11

## Sprint 8 (Hardening + Production-Readiness)
- [x] Blocker-Fix: pino-pretty Dependency + Export-Handler Completion (Owner: Team 01, Ref: `apps/api/package.json`, `apps/export-worker/`) ✓ 2026-02-11
- [x] API-Versionierung v1 Prefix + Breaking-Change-Policy (Owner: Team 01, Ref: `apps/api/src/main.ts`) ✓ 2026-02-11
- [x] User-Provisioning API + MFA + Security-Headers (Owner: Team 02, Ref: `apps/api/src/modules/identity/`) ✓ 2026-02-11
- [x] Reviewer-Workflow: Zuweisung + Approve/Reject/Request-Changes (Owner: Team 03, Ref: `apps/api/src/modules/content/`) ✓ 2026-02-11
- [x] Conflict-Resolution UI + Filter/Suche CatalogPage (Owner: Team 04, Ref: `apps/web/src/`) ✓ 2026-02-11
- [x] Dead-Letter-Queue Monitoring + Kanzlei-Branding Style-Templates (Owner: Team 05, Ref: `apps/export-worker/`, `apps/api/src/modules/export/`) ✓ 2026-02-11
- [x] Component-Tests React + axe-core CI Aktivierung (Owner: Team 06, Ref: `apps/web/src/`, `.github/workflows/`) ✓ 2026-02-11
- [x] Prod-Overlay + Ingress-Controller + On-Prem Overlay (Owner: Team 07, Ref: `k8s/overlays/`) ✓ 2026-02-11

## Sprint 9 (E2E + Security-Hardening + Dokumentation)
- [x] Breaking-Change-Policy ADR-005 (Owner: Team 01, Ref: `docs/knowledge/adr-005-breaking-change-policy.md`) ✓ 2026-02-11
- [x] DevOps/Admin-Anleitung: Setup + Deployment + Monitoring (Owner: Team 01 + 07, Ref: `docs/guides/devops-admin-guide.md`) ✓ 2026-02-11
- [x] User-Anleitungen nach Rollen: Admin/Editor/User (Owner: Team 01, Ref: `docs/guides/user-guide-*.md`) ✓ 2026-02-11
- [x] Keycloak Admin API Integration für User-Sync (Owner: Team 02, Ref: `apps/api/src/services/keycloak-admin.ts`) ✓ 2026-02-11
- [x] MFA TOTP-Konfiguration für Admins (Owner: Team 02, Ref: `docker/keycloak/realm-export.json`) ✓ 2026-02-11
- [x] Batch-Clause-Content-Endpoint für Live-Preview (Owner: Team 04, Ref: `apps/api/src/modules/content/routes.ts`) ✓ 2026-02-11
- [x] Review-Screen vor Contract Completion (Owner: Team 04, Ref: `apps/web/src/pages/ReviewPage.tsx`) ✓ 2026-02-11
- [x] Testcontainers-Setup für PostgreSQL-Integration-Tests (Owner: Team 06, Ref: `apps/api/src/__tests__/`) ✓ 2026-02-11
- [x] Security-Test-Szenarien T-01..T-12 automatisieren (Owner: Team 06, Ref: `apps/api/src/__tests__/security/`) ✓ 2026-02-11
- [x] cert-manager + Let's Encrypt ClusterIssuer (Owner: Team 07, Ref: `k8s/overlays/prod/`) ✓ 2026-02-11

## Sprint 10 (Integration + E2E Validation + Production Polish)
- [x] OpenAPI/Swagger API-Dokumentation aller Endpoints (Owner: Team 01, Ref: `docs/api/openapi.yaml`) ✓ 2026-02-11
- [x] Modul-Boundaries + Cross-Module-Regeln dokumentieren (Owner: Team 01, Ref: `docs/knowledge/module-boundaries-v1.md`) ✓ 2026-02-11
- [x] Keycloak Admin API in Identity-Routes integrieren (Owner: Team 02, Ref: `apps/api/src/modules/identity/routes.ts`) ✓ 2026-02-11
- [x] Passwort-Policies Realm + Rate-Limiting Auth-Endpoints (Owner: Team 02, Ref: `docker/keycloak/realm-export.json`, `apps/api/src/middleware/`) ✓ 2026-02-11
- [x] Export-Trigger aus ReviewPage + Keyboard-Navigation Interview (Owner: Team 04, Ref: `apps/web/src/pages/`) ✓ 2026-02-11
- [x] Export-Pipeline E2E-Validierung mit Seed-Daten (Owner: Team 05, Ref: `apps/export-worker/src/__tests__/`) ✓ 2026-02-11
- [x] Playwright E2E Happy-Path: Interview→Review→Complete→Export (Owner: Team 06, Ref: `apps/web/e2e/`) ✓ 2026-02-11
- [x] CI-Pipeline: Testcontainers + Security-Tests integrieren (Owner: Team 06, Ref: `.github/workflows/`) ✓ 2026-02-11
- [x] Lighthouse CI gegen laufende Web-Instanz aktivieren (Owner: Team 06, Ref: `.github/workflows/main-gate.yml`) ✓ 2026-02-11
- [x] Backup-CronJob PostgreSQL + External Secrets Operator Setup (Owner: Team 07, Ref: `k8s/`) ✓ 2026-02-11

## Sprint 11 (MVP Release Preparation)
- [x] MVP Release-Kandidat-Checkliste + Tech-Stack-Review BB-001..007 (Owner: Team 01, Ref: `docs/knowledge/release-checklist-v1.md`, `docs/knowledge/tech-stack-review-v1.md`) ✓ 2026-02-11
- [x] API Performance-Baseline Dokumentation (Owner: Team 01, Ref: `docs/knowledge/performance-baseline-v1.md`) ✓ 2026-02-11
- [x] Keycloak Admin API Unit-Tests + CSRF-Evaluierung (Owner: Team 02, Ref: `apps/api/src/services/__tests__/keycloak-admin.test.ts`, `docs/knowledge/csrf-evaluation-v1.md`) ✓ 2026-02-11
- [x] Content-Import CLI für Verlags-Content (Owner: Team 03, Ref: `apps/api/src/modules/content/import.ts`, `apps/api/src/modules/content/import.test.ts`) ✓ 2026-02-11
- [x] Responsive Design Interview + Review (Owner: Team 04, Ref: `apps/web/src/styles/responsive.css`) ✓ 2026-02-11
- [x] Changelog-UI Frontend (Owner: Team 04, Ref: `apps/web/src/components/ChangelogPanel.tsx`) ✓ 2026-02-11
- [x] Export-Performance-Optimierung Template-Caching (Owner: Team 05, Ref: `apps/export-worker/src/cache/template-cache.ts`, `apps/export-worker/src/cache/pre-warm.ts`) ✓ 2026-02-11
- [x] k6 Load-Tests + Coverage-Report CI-Artefakt (Owner: Team 06, Ref: `apps/api/src/__tests__/load/api-load-test.js`) ✓ 2026-02-11
- [x] Log-Aggregation Loki + Alerting-Rules (Owner: Team 07, Ref: `docker/loki/`, `docker/promtail/`, `docker/prometheus/alerting-rules.yml`) ✓ 2026-02-11
- [x] K8s Smoke-Test Script K3s-Validierung (Owner: Team 07, Ref: `k8s/scripts/smoke-test.sh`) ✓ 2026-02-11

## Sprint 12 (Final MVP Release + Pilot-Readiness)
- [x] Release-Notes v1.0 + Cross-Module-Event-Evaluierung (Owner: Team 01, Ref: `docs/knowledge/release-notes-v1.md`, `docs/knowledge/cross-module-events-v1.md`) ✓ 2026-02-11
- [x] Session-Management-Härtung + Keycloak-Backup (Owner: Team 02, Ref: `apps/api/src/middleware/session-hardening.ts`, `docs/knowledge/keycloak-backup-strategy-v1.md`) ✓ 2026-02-11
- [x] Pilot-Content: Dienstleistungsvertrag + NDA Templates (Owner: Team 03, Ref: `apps/api/prisma/fixtures/dienstleistungsvertrag.json`, `apps/api/prisma/fixtures/nda.json`) ✓ 2026-02-11
- [x] Drag-and-Drop Klausel-Reihenfolge (Owner: Team 04, Ref: `apps/web/src/components/ClauseReorderPanel.tsx`) ✓ 2026-02-11
- [x] i18n-Framework-Setup (Owner: Team 04, Ref: `apps/web/src/i18n/`) ✓ 2026-02-11
- [x] Batch-Export für mehrere Verträge (Owner: Team 05, Ref: `apps/api/src/modules/export/batch-routes.ts`) ✓ 2026-02-11
- [x] Logo-Upload für Kanzlei-Branding (Owner: Team 05, Ref: `apps/api/src/modules/export/logo-upload.ts`) ✓ 2026-02-11
- [x] Visual Regression Tests + Final QA Sign-Off (Owner: Team 06, Ref: `apps/web/e2e/visual-regression.spec.ts`, `docs/knowledge/qa-signoff-v1.md`) ✓ 2026-02-11
- [x] Blue/Green Deployment-Strategie (Owner: Team 07, Ref: `k8s/scripts/blue-green-deploy.sh`) ✓ 2026-02-11
- [x] HPA-Tuning basierend auf k6 Load-Tests (Owner: Team 07, Ref: `k8s/overlays/prod/hpa-tuned.yaml`) ✓ 2026-02-11

## Sprint 13 (Event-System + OpenSearch + Enterprise-Readiness)
- [x] EventBus Interface + InProcessEventBus + Audit-Consumer (Owner: Team 01, Ref: `packages/shared/src/event-bus.ts`, `apps/api/src/events/audit-consumer.ts`) ✓ 2026-02-12
- [x] EventBus Prometheus Metriken (Owner: Team 01, Ref: `apps/api/src/modules/metrics/event-metrics.ts`) ✓ 2026-02-12
- [x] SCIM 2.0 Provisioning Service (Owner: Team 02, Ref: `apps/api/src/modules/scim/routes.ts`) ✓ 2026-02-12
- [x] SSE-KMS per-Tenant Encryption Evaluation (Owner: Team 02, Ref: `docs/knowledge/sse-kms-evaluation-v1.md`) ✓ 2026-02-12
- [x] SAML/OIDC Federation Design (Owner: Team 02, Ref: `docs/knowledge/saml-oidc-federation-v1.md`) ✓ 2026-02-12
- [x] OpenSearch Schema-Mapping + Indexing-Service (Owner: Team 03, Ref: `apps/api/src/services/search/`) ✓ 2026-02-12
- [x] Search API mit Faceted Search + SQL-Fallback (Owner: Team 03, Ref: `apps/api/src/modules/search/routes.ts`) ✓ 2026-02-12
- [x] Code-Splitting Lazy Loading + LoadingSpinner (Owner: Team 04, Ref: `apps/web/src/App.tsx`, `apps/web/src/components/LoadingSpinner.tsx`) ✓ 2026-02-12
- [x] Notification Toast System (Owner: Team 04, Ref: `apps/web/src/components/NotificationToast.tsx`, `apps/web/src/hooks/useNotifications.ts`) ✓ 2026-02-12
- [x] Export Result-Caching (SHA-256 Hash-based) (Owner: Team 05, Ref: `apps/export-worker/src/cache/result-cache.ts`) ✓ 2026-02-12
- [x] Dynamic Worker Concurrency AutoScaler (Owner: Team 05, Ref: `apps/export-worker/src/scaling/auto-scaler.ts`) ✓ 2026-02-12
- [x] Export Prometheus Metrics Server (Owner: Team 05, Ref: `apps/export-worker/src/metrics/export-metrics.ts`) ✓ 2026-02-12
- [x] Soak-Test + Large-Dataset Load-Test (Owner: Team 06, Ref: `apps/api/src/__tests__/load/soak-test.js`) ✓ 2026-02-12
- [x] RUM (Real User Monitoring) Baseline (Owner: Team 06, Ref: `apps/web/src/utils/rum.ts`, `apps/api/src/modules/metrics/rum-routes.ts`) ✓ 2026-02-12
- [x] Process Metrics Endpoint (Owner: Team 06, Ref: `apps/api/src/modules/metrics/process-metrics.ts`) ✓ 2026-02-12
- [x] Helm Charts v1 (Owner: Team 07, Ref: `helm/servanda-office/`) ✓ 2026-02-12
- [x] OpenSearch Docker-Compose (Owner: Team 07, Ref: `docker/opensearch/docker-compose.opensearch.yml`) ✓ 2026-02-12
- [x] GitOps-Evaluierung ArgoCD (Owner: Team 07, Ref: `docs/knowledge/gitops-evaluation-v1.md`) ✓ 2026-02-12

## Definition of Ready (DoR)
- User Story mit Akzeptanzkriterien und betroffenen Teams dokumentiert
- Abhängigkeiten + Risiken benannt
- Messkriterium für Done vorhanden

## Definition of Done (DoD)
- Implementiert, getestet und dokumentiert
- Relevante Entscheidung im Knowledge Hub ergänzt
- Team-Update in `.docs/team/<team>/updates.md` eingetragen
