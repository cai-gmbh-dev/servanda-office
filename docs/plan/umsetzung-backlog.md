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

## Definition of Ready (DoR)
- User Story mit Akzeptanzkriterien und betroffenen Teams dokumentiert
- Abhängigkeiten + Risiken benannt
- Messkriterium für Done vorhanden

## Definition of Done (DoD)
- Implementiert, getestet und dokumentiert
- Relevante Entscheidung im Knowledge Hub ergänzt
- Team-Update in `.docs/team/<team>/updates.md` eingetragen
