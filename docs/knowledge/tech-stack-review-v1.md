# Tech-Stack Review v1 -- Architecture Backbone Validierung

**Status:** Final Draft
**Datum:** 2026-02-11
**Owner:** Team 01 (Product Architecture)
**Referenzen:** Architecture Backbone v1 (BB-001..BB-007), Prisma Schema v1, Deployment-Blueprint v1, QA-Gates CI v1

---

## 1. Ubersicht

Dieses Dokument ist das finale Review aller sieben Backbone-Entscheidungen aus dem Architecture Backbone v1. Fur jede Entscheidung wird der Validierungsstatus, die Beweis-Referenzen (Code-Artefakte), identifizierte Risiken und geplante Optimierungen dokumentiert.

### Zusammenfassung

| ID | Entscheidung | Status | Risiko-Level |
|----|-------------|--------|-------------|
| BB-001 | PostgreSQL + RLS (Multi-Tenant) | Validated | Low |
| BB-002 | Express.js Modularer Monolith | Validated | Low |
| BB-003 | React + Vite + TypeScript (Frontend) | Validated | Low |
| BB-004 | pgboss + docxtemplater (Export) | Validated | Medium |
| BB-005 | S3-kompatibel / MinIO (Object Storage) | Validated | Low |
| BB-006 | Keycloak OIDC (Identity) | Validated | Medium |
| BB-007 | Kubernetes + Kustomize (Deployment) | Validated | Low |

---

## 2. BB-001: PostgreSQL + RLS (Multi-Tenant-Isolation)

### Entscheidung

PostgreSQL 16+ mit Row-Level Security (RLS) als primarer Tenant-Isolationsmechanismus. Shared Database mit RLS-Policies auf allen tenant-gescoped Tabellen. DB-per-Tenant optional fur On-Prem (Enterprise).

### Status: VALIDATED

### Beweis-Referenzen

| Artefakt | Pfad | Beschreibung |
|---------|------|-------------|
| Prisma Schema v1 | `apps/api/prisma/schema.prisma` | 12 Modelle, alle mit `tenantId` |
| RLS-Migration | `apps/api/prisma/migrations/00001_enable_rls/migration.sql` | RLS + FORCE auf allen Tabellen |
| Tenant-Context-Middleware | `apps/api/src/middleware/tenant-context.ts` | `SET LOCAL app.current_tenant_id` |
| Tenant-Isolation-Tests | `apps/api/src/__tests__/security/tenant-isolation.test.ts` | Cross-Tenant-Zugriff verifiziert |
| Seed-Script | `apps/api/prisma/seed.ts` | Demo-Tenants (Kanzlei + Vendor) |
| ADR-001 Spezifikation | `docs/knowledge/adr-001-multi-tenant-isolation.md` | Operationalisiert |
| Threat Model | `docs/knowledge/threat-model-tenant-isolation.md` | T-01..T-12 Szenarien |

### Validierungsergebnisse

| Aspekt | Ergebnis | Details |
|--------|---------|---------|
| **12 Tabellen mit RLS** | Bestatigt | tenants, users, teams, audit_events, clauses, clause_versions, templates, template_versions, interview_flows, contract_instances, law_firm_templates, export_jobs, style_templates |
| **FORCE ROW LEVEL SECURITY** | Bestatigt | Auch Table-Owner wird durch RLS gefiltert |
| **Tenant-Context-Middleware** | Bestatigt | JWT -> `SET LOCAL` auf jeder DB-Connection |
| **Cross-Tenant-Tests** | Bestatigt | CI-Gate G-07 blocking, Tests in PR-Gate |
| **Immutability-Trigger** | Bestatigt | Completed Contracts: Pins unveranderlich |
| **Audit-Tabelle** | Bestatigt | Append-only, kein UPDATE/DELETE (RLS-Policy) |

### Risiken

| Risiko | Likelihood | Impact | Mitigation |
|--------|-----------|--------|-----------|
| RLS-Performance bei > 100 Tenants | Low | Medium | Index auf `tenant_id` (vorhanden), regelmaessiges `EXPLAIN ANALYZE`, Monitoring via postgres-exporter |
| Vergessene RLS-Policy bei neuer Tabelle | Medium | Critical | CI-Gate G-08 pruft automatisch alle Tabellen, Migrations-Checkliste |
| RLS-Bypass bei Raw-SQL | Low | Critical | Parameterized Queries via Prisma, kein Raw-SQL mit User-Input, T-02 Security-Test |

### Nachste Optimierungen

1. **Phase 2:** Partitioning nach `tenant_id` fur grosse Tabellen (audit_events, contract_instances)
2. **Phase 2:** DB-per-Tenant Feature-Flag fur Enterprise On-Prem vollstandig testen
3. **Laufend:** Quarterly `EXPLAIN ANALYZE` Review der haufigsten Queries

---

## 3. BB-002: Express.js Modularer Monolith

### Entscheidung

Node.js / Express.js als API-Runtime in einem modularen Monolith mit klar getrennten Bounded Contexts (Identity, Content, Contract, Export). Jedes Modul ist als eigenstandiger Bounded Context modelliert, teilt aber initial eine Runtime und Datenbank. Spatere Service-Extraktion ist durch Interface-Kontrakte vorbereitet.

### Status: VALIDATED

### Beweis-Referenzen

| Artefakt | Pfad | Beschreibung |
|---------|------|-------------|
| API Main Entry | `apps/api/src/main.ts` | Express-Server mit Modul-Registrierung |
| Identity Module | `apps/api/src/modules/identity/routes.ts` | User-Provisioning, activate/deactivate/delete |
| Content Module | `apps/api/src/modules/content/routes.ts` | Clause/Template CRUD + Versioning |
| Content Publishing | `apps/api/src/modules/content/publishing-gates.ts` | 20 Publishing-Gate-Validierungen |
| Content Reviewer | `apps/api/src/modules/content/reviewer.ts` | Reviewer-Workflow, Vier-Augen-Prinzip |
| Content Changelog | `apps/api/src/modules/content/changelog.ts` | Changelog-API |
| Contract Module | `apps/api/src/modules/contract/routes.ts` | ContractInstance CRUD + Version-Pinning |
| Export Module | `apps/api/src/modules/export/routes.ts` | ExportJob CRUD, Queue-Management |
| Export DLQ | `apps/api/src/modules/export/dlq-routes.ts` | Dead-Letter-Queue Monitoring |
| Export Branding | `apps/api/src/modules/export/branding-routes.ts` | StyleTemplate CRUD |
| Health Module | `apps/api/src/modules/health.ts` | Liveness/Readiness-Probes |
| Auth Middleware | `apps/api/src/middleware/auth.ts` | JWT-Validierung + RBAC |
| Error Handler | `apps/api/src/middleware/error-handler.ts` | Generische Fehlerbehandlung |
| Rate Limiting | `apps/api/src/middleware/rate-limit.ts` | Per-Tenant/Per-User Rate Limiting |
| Audit Service | `apps/api/src/services/audit.service.ts` | Zentraler AuditEvent-Service |
| Keycloak Admin | `apps/api/src/services/keycloak-admin.ts` | Keycloak Admin API Integration |
| Shared DB | `apps/api/src/shared/db.ts` | Prisma-Client, Shared Connection |
| Shared Logger | `apps/api/src/shared/logger.ts` | Pino Structured Logging |
| API Package | `apps/api/package.json` | Dependencies: express, prisma, helmet, cors |

### Validierungsergebnisse

| Aspekt | Ergebnis | Details |
|--------|---------|---------|
| **4 Modul-Grenzen** | Bestatigt | Identity, Content, Contract, Export -- jeweils eigenes `routes.ts` |
| **Middleware-Chain** | Bestatigt | Auth -> Tenant-Context -> RBAC -> Handler |
| **API-Versionierung** | Bestatigt | `/api/v1/` Prefix auf allen Endpoints (Sprint 8) |
| **Helmet/CORS** | Bestatigt | Security-Headers geharter (Sprint 8) |
| **43+ Unit Tests** | Bestatigt | Middleware + Services (Sprint 6) |
| **29+ Integration Tests** | Bestatigt | Content/Contract/Export API (Sprint 7) |
| **Service Interfaces** | Bestatigt | Module kommunizieren uber TypeScript-Interfaces |

### Risiken

| Risiko | Likelihood | Impact | Mitigation |
|--------|-----------|--------|-----------|
| Monolith wird zu gross fur ein Team | Low (MVP) | Medium | Klare Modulgrenzen, Interface-Kontrakte, Extraktion vorbereitet |
| Shared DB-Connection Pool Engpass | Low | Medium | Connection-Pool Monitoring, Alert bei > 90% Auslastung |
| Express.js Vulnerabilities | Low | Medium | Dependabot aktiv, regelmaessige Updates |

### Nachste Optimierungen

1. **Phase 2:** OpenAPI 3.1 Auto-Generation aus Route-Definitions (z.B. via tsoa/zod-to-openapi)
2. **Phase 2:** Service-Extraktion evaluieren (Export-Worker ist bereits separater Prozess)
3. **Sprint 9:** Breaking-Change-Policy formalisieren (ADR-005)

---

## 4. BB-003: React + Vite + TypeScript (Frontend)

### Entscheidung

React mit TypeScript als Frontend-Framework, Vite als Build-Tool. Komponentenbasierte Architektur mit Component-Tests (Vitest + React Testing Library) und E2E-Tests (Playwright).

### Status: VALIDATED

### Beweis-Referenzen

| Artefakt | Pfad | Beschreibung |
|---------|------|-------------|
| Web App Entry | `apps/web/src/main.tsx` | React Root mit Vite |
| App Router | `apps/web/src/App.tsx` | Routing-Konfiguration |
| Layout | `apps/web/src/components/Layout.tsx` | Shared Layout |
| DashboardPage | `apps/web/src/pages/DashboardPage.tsx` | Dashboard |
| ContractsPage | `apps/web/src/pages/ContractsPage.tsx` | Vertragsliste |
| CatalogPage | `apps/web/src/pages/CatalogPage.tsx` | Template-Katalog mit Filter/Suche |
| InterviewPage | `apps/web/src/pages/InterviewPage.tsx` | Gefuhrter Q&A-Flow |
| ReviewPage | `apps/web/src/pages/ReviewPage.tsx` | Review-Screen vor Completion |
| LivePreviewPanel | `apps/web/src/components/LivePreviewPanel.tsx` | Echtzeit-Vertragsvorschau |
| QuestionInput | `apps/web/src/components/QuestionInput.tsx` | Interview-Frage-Rendering |
| ConflictResolutionPanel | `apps/web/src/components/ConflictResolutionPanel.tsx` | Konfliktaufloesung |
| Test Utilities | `apps/web/src/test-utils.tsx` | Custom Render mit Providers |
| Component Tests | `apps/web/src/pages/__tests__/*.test.tsx` | CatalogPage, ContractsPage |
| Component Tests | `apps/web/src/components/__tests__/*.test.tsx` | QuestionInput, LivePreviewPanel |
| E2E Happy-Path | `apps/web/e2e/happy-path.spec.ts` | 7 Happy-Path-Tests |
| E2E Contract Flow | `apps/web/e2e/contract-flow.spec.ts` | Vertragsfluss E2E |
| Web Package | `apps/web/package.json` | Dependencies: react, vite, playwright |
| Vite Config | `vitest.config.ts` | Root-Level Vitest Config |
| Lighthouse Config | `lighthouserc.json` | Performance >= 90, Accessibility >= 90 |

### Validierungsergebnisse

| Aspekt | Ergebnis | Details |
|--------|---------|---------|
| **6+ Seiten** | Bestatigt | Dashboard, Contracts, Catalog, Interview, Review, (Login) |
| **Component-Tests** | Bestatigt | 4 Test-Suiten: CatalogPage, ContractsPage, QuestionInput, LivePreviewPanel |
| **E2E Tests** | Bestatigt | Playwright Setup + 7+ Happy-Path + Contract-Flow Tests |
| **axe-core CI** | Bestatigt | 0 Violations als PR-Gate (Sprint 8 aktiviert) |
| **Conditional Logic** | Bestatigt | QuestionInput evaluiert Conditions dynamisch |
| **Live-Preview** | Bestatigt | LivePreviewPanel mit Kapitelstruktur |
| **Conflict Resolution** | Bestatigt | ConflictResolutionPanel mit Alternativenauswahl |
| **TypeScript Strict** | Bestatigt | `tsconfig.json` mit strikter Konfiguration |

### Risiken

| Risiko | Likelihood | Impact | Mitigation |
|--------|-----------|--------|-----------|
| Bundle Size wachst uber Budget | Medium | Low | size-limit als CI-Warning (G-09), Tree-Shaking, Code-Splitting |
| React Version-Upgrade Breaking | Low | Medium | Dependabot, TypeScript Strict hilft bei Migration |
| Accessibility-Regressions | Medium | Medium | axe-core blocking in PR-Gate, Component-Tests mit jest-axe |

### Nachste Optimierungen

1. **Sprint 9:** Review-Screen vor Contract Completion vollstandig implementieren
2. **Sprint 9:** Batch-Clause-Content-Endpoint fur performantere Live-Preview
3. **Phase 2:** Code-Splitting per Route (Lazy Loading)
4. **Phase 2:** Storybook fur Komponenten-Dokumentation

---

## 5. BB-004: pgboss + docxtemplater (Export-Pipeline)

### Entscheidung

pgboss (PostgreSQL-basierte Job-Queue) fur asynchrone Export-Jobs. docxtemplater fur Template-basierte DOCX-Generierung. LibreOffice headless fur optionale DOCX-zu-ODT-Konvertierung (Beta, Feature-Flag).

### Status: VALIDATED

### Beweis-Referenzen

| Artefakt | Pfad | Beschreibung |
|---------|------|-------------|
| Export Worker Entry | `apps/export-worker/src/main.ts` | pgboss Worker-Prozess |
| Export Worker Package | `apps/export-worker/package.json` | pg-boss ^9.0.0, docxtemplater ^3.50.0, pizzip, @aws-sdk/client-s3 |
| Referenz-Template Generator | `apps/export-worker/templates/generate-template.ts` | DOCX-Template-Generierung |
| Export API Routes | `apps/api/src/modules/export/routes.ts` | Job-Erstellung, Status-Abfrage, Download |
| Export DLQ Routes | `apps/api/src/modules/export/dlq-routes.ts` | Dead-Letter-Queue Monitoring |
| Export Branding Routes | `apps/api/src/modules/export/branding-routes.ts` | StyleTemplate CRUD (Kanzlei-Branding) |
| Export Route Tests | `apps/api/src/modules/export/routes.test.ts` | Unit-Tests Export-Endpoints |
| ExportJob Model | `apps/api/prisma/schema.prisma` (Zeile 281-305) | DB-Schema fur Jobs |
| StyleTemplate Model | `apps/api/prisma/schema.prisma` (Zeile 307-333) | Kanzlei-Branding-Schema |
| Export Worker Deployment | `k8s/base/export-worker-deployment.yaml` | Separater K8s-Workload |
| Export Worker HPA | `k8s/overlays/prod/hpa-worker.yaml` | Auto-Scaling fur Worker |
| DOCX Export Spec | `docs/knowledge/docx-export-spec-v1.md` | Vollstandige Spezifikation |
| ODT Evaluation | `docs/knowledge/odt-conversion-eval-v1.md` | LibreOffice-Bewertung |
| ADR-003 | `docs/knowledge/adr-003-export-engine-service.md` | Export als separater Service |
| ADR-004 | `docs/knowledge/adr-004-odt-strategy.md` | ODT-Strategie |

### Validierungsergebnisse

| Aspekt | Ergebnis | Details |
|--------|---------|---------|
| **pgboss Queue** | Bestatigt | Job-Lifecycle: queued -> running -> done/failed, Retry max 3 |
| **docxtemplater Rendering** | Bestatigt | Template-basiert, Platzhalter-Ersetzung, Referenz-Template vorhanden |
| **S3-Upload** | Bestatigt | AWS SDK S3 Client, Presigned URLs |
| **DLQ Monitoring** | Bestatigt | Dead-Letter-Queue mit Admin-Endpoints (Sprint 8) |
| **Feature-Flag-System** | Bestatigt | ODT-Export als Beta hinter Feature-Flag (Sprint 7) |
| **Kanzlei-Branding** | Bestatigt | StyleTemplate CRUD mit Logo, Fonts, Farben, Margins (Sprint 8) |
| **Separater Worker-Prozess** | Bestatigt | Eigenes Package, eigenes K8s-Deployment, eigener HPA |
| **Export Rendering-Tests** | Bestatigt | Unit-Tests + Rendering-Validierung (Sprint 7) |
| **DB-Update nach Completion** | Bestatigt | Status-Update im ExportJob nach Worker-Verarbeitung (Sprint 8 Fix) |

### Risiken

| Risiko | Likelihood | Impact | Mitigation |
|--------|-----------|--------|-----------|
| pgboss Queue-Backlog bei Lastspitzen | Medium | Medium | HPA fur Worker (max 5 Pods), Queue-Depth-Monitoring + Alert (> 50 pending), DLQ-Monitoring |
| docxtemplater Template-Limits (komplexe Layouts) | Medium | Medium | Referenz-Template-Generator, Rendering-Tests fur MVP-Muster, Evaluierung von Alternativen fur Phase 2 |
| LibreOffice headless instabil | Medium | Low | Isolierter Container, Timeout 120s, Retry, Beta-Markierung, Feature-Flag deaktivierbar |
| Export-Worker Out-of-Memory (grosse Dokumente) | Low | Medium | Memory-Limit 2 Gi, /tmp emptyDir 1 Gi, Concurrency-Limit (3) |

### Nachste Optimierungen

1. **Phase 2:** Export-Worker Concurrency dynamisch an Queue-Depth anpassen
2. **Phase 2:** Evaluierung von officeparser/libreoffice-convert als Alternativen
3. **Phase 2:** Export-Caching (gleicher Vertrag + gleiche Version = Cached Result)
4. **Laufend:** Export-Performance-Monitoring via `servanda_export_job_duration_seconds`

---

## 6. BB-005: S3-kompatibel / MinIO (Object Storage)

### Entscheidung

S3-kompatible API als Abstraktionsschicht fur Object Storage. AWS S3 fur Cloud-Deployment, MinIO fur On-Prem. Tenant-Prefix in allen Pfaden, Server-Side Encryption.

### Status: VALIDATED

### Beweis-Referenzen

| Artefakt | Pfad | Beschreibung |
|---------|------|-------------|
| S3 Client Dependencies | `apps/export-worker/package.json` | @aws-sdk/client-s3, @aws-sdk/s3-request-presigner |
| Docker-Compose (MinIO) | `docker/docker-compose.yml` | MinIO Container fur lokale Entwicklung |
| On-Prem MinIO StatefulSet | `k8s/overlays/onprem/minio-statefulset.yaml` | MinIO fur On-Prem K8s |
| On-Prem Config Patch | `k8s/overlays/onprem/onprem-config-patch.yaml` | MinIO-Endpoint-Konfiguration |
| API ConfigMap | `k8s/base/configmap.yaml` | S3-Endpoint + S3-Bucket Konfiguration |
| Export Worker Deployment | `k8s/base/export-worker-deployment.yaml` | S3-Credentials uber Secrets |
| Storage Layout Spec | `docs/knowledge/architecture-backbone-v1.md` (Abschnitt 8.2) | `{tenantId}/exports/`, `{tenantId}/styles/` |

### Validierungsergebnisse

| Aspekt | Ergebnis | Details |
|--------|---------|---------|
| **S3-Upload (Exports)** | Bestatigt | Export-Worker ladt DOCX/ODT uber AWS SDK hoch |
| **Presigned URLs** | Bestatigt | 15 Min. Expiry, Tenant-gescoped |
| **Tenant-Prefix** | Bestatigt | Pfad: `{tenantId}/exports/{exportJobId}.docx` |
| **MinIO On-Prem** | Bestatigt | StatefulSet in On-Prem-Overlay, lokal via Docker-Compose |
| **Cloud-/On-Prem-Austauschbar** | Bestatigt | Nur Endpoint-Konfiguration unterschiedlich (ConfigMap) |
| **StyleTemplate Upload** | Bestatigt | Kanzlei-Branding DOCX-Templates im Storage |

### Risiken

| Risiko | Likelihood | Impact | Mitigation |
|--------|-----------|--------|-----------|
| Path Traversal im Storage | Low | Critical | Server-side Pfad-Validierung, T-08 Security-Test, Tenant-Prefix erzwungen |
| MinIO Datenverlust (On-Prem, Single Node) | Medium | High | Backup-CronJob, mc mirror Dokumentation, Empfehlung: Replicated MinIO fur Prod |
| Storage-Quota-Erschoepfung | Low | Medium | Per-Tenant Storage-Quota (konfigurierbar), Monitoring |

### Nachste Optimierungen

1. **Phase 2:** SSE-KMS mit per-Tenant Key (Enterprise)
2. **Phase 2:** Storage-Lifecycle-Policies (automatische Archivierung alter Exports)
3. **Laufend:** Storage-Usage-Monitoring pro Tenant

---

## 7. BB-006: Keycloak OIDC (Identity)

### Entscheidung

Keycloak als OIDC/SAML Identity Provider. Ein Realm fur die gesamte Plattform, Tenants als Keycloak-Groups mit Tenant-spezifischen Rollen. JWT mit Custom Claims (tenant_id, tenant_type, role, permissions).

### Status: VALIDATED

### Beweis-Referenzen

| Artefakt | Pfad | Beschreibung |
|---------|------|-------------|
| Realm-Export | `docker/keycloak/realm-export.json` | Automatisierte Realm-Konfiguration |
| Auth Middleware | `apps/api/src/middleware/auth.ts` | JWT-Validierung, Claim-Extraktion |
| Auth Tests | `apps/api/src/middleware/auth.test.ts` | JWT-Validierung Unit-Tests |
| Keycloak Admin Service | `apps/api/src/services/keycloak-admin.ts` | Admin API Integration |
| Identity Routes | `apps/api/src/modules/identity/routes.ts` | User-Provisioning, activate/deactivate/delete |
| Docker-Compose | `docker/docker-compose.yml` | Keycloak Container |
| RBAC/IAM Modell | `docs/knowledge/rbac-iam-model-v1.md` | Vollstandiges Rollenmodell |
| Threat Model | `docs/knowledge/threat-model-tenant-isolation.md` | JWT-Security-Szenarien (T-01, T-06, T-11) |

### Validierungsergebnisse

| Aspekt | Ergebnis | Details |
|--------|---------|---------|
| **OIDC Login-Flow** | Bestatigt | SPA -> Keycloak Login -> JWT mit tenant_id |
| **JWT Auth Middleware** | Bestatigt | Signatur-Validierung, Expiry-Check, Claim-Extraktion |
| **MFA TOTP** | Bestatigt | Konfigurierbar pro Tenant, erzwungen fur Platform-Admin |
| **Realm-Automation** | Bestatigt | `realm-export.json` fur reproduzierbare Konfiguration (Sprint 6) |
| **Keycloak Admin API** | Bestatigt | User-Provisioning via Admin API (Sprint 9) |
| **User Lifecycle** | Bestatigt | activate/deactivate/delete + Security-Headers (Sprint 8) |
| **Custom JWT Claims** | Bestatigt | tenant_id, tenant_type, role via Protocol Mapper |
| **RBAC Enforcement** | Bestatigt | 3 Lawfirm-Rollen + 3 Vendor-Rollen + Platform-Admin |

### Risiken

| Risiko | Likelihood | Impact | Mitigation |
|--------|-----------|--------|-----------|
| Keycloak-Komplexitat (Konfiguration) | Medium | Medium | Realm-Automation via realm-export.json, Admin API Integration |
| Keycloak-Upgrades (Breaking Changes) | Low | Medium | Version-Pinning in Docker/K8s, Change-Log reviewen vor Upgrade |
| Keycloak HA-Betrieb (Prod) | Low | High | HA-Cluster mit separater PostgreSQL-DB, Health-Checks |
| JWT-Token-Theft | Low | High | Kurze TTL (15 Min.), Refresh-Token-Rotation, Secure/HttpOnly Cookies |

### Nachste Optimierungen

1. **Sprint 9:** MFA-Konfiguration TOTP fur Admins vollstandig testen
2. **Sprint 9:** Keycloak Admin API Integration erweitern
3. **Phase 2:** SAML/OIDC Federation (Enterprise SSO)
4. **Phase 2:** SCIM Provisioning (automatische User-Sync)
5. **Phase 2:** WebAuthn/FIDO2 als MFA-Alternative

---

## 8. BB-007: Kubernetes + Kustomize (Deployment)

### Entscheidung

Kubernetes als Container-Orchestrierung (Managed fur Cloud, K3s/RKE2 fur On-Prem). Kustomize fur Overlay-basierte Umgebungskonfiguration (dev/staging/prod/onprem). GitHub Actions fur CI/CD mit Docker Image Build + Push.

### Status: VALIDATED

### Beweis-Referenzen

| Artefakt | Pfad | Beschreibung |
|---------|------|-------------|
| **Base-Manifeste** | | |
| Base Kustomization | `k8s/base/kustomization.yaml` | Base-Ressourcen |
| API Deployment | `k8s/base/api-deployment.yaml` | API-Server Pod-Spec |
| API Service | `k8s/base/api-service.yaml` | ClusterIP Service |
| Web Deployment | `k8s/base/web-deployment.yaml` | Frontend (Nginx) |
| Web Service | `k8s/base/web-service.yaml` | ClusterIP Service |
| Export Worker | `k8s/base/export-worker-deployment.yaml` | Worker Pod-Spec |
| PostgreSQL | `k8s/base/postgres-statefulset.yaml` | StatefulSet |
| PostgreSQL Service | `k8s/base/postgres-service.yaml` | ClusterIP Service |
| ConfigMap | `k8s/base/configmap.yaml` | Umgebungsvariablen |
| Namespace | `k8s/base/namespace.yaml` | Default Namespace |
| Backup CronJob | `k8s/base/backup-cronjob.yaml` | Tagliches Backup |
| Backup ConfigMap | `k8s/base/backup-configmap.yaml` | Backup-Konfiguration |
| **Network Policies** | | |
| Default Deny | `k8s/base/network-policy-default-deny.yaml` | Default-Deny Egress |
| API Policy | `k8s/base/network-policy-api.yaml` | API -> PostgreSQL, S3, Keycloak |
| Worker Policy | `k8s/base/network-policy-worker.yaml` | Worker -> PostgreSQL, S3 (kein Keycloak) |
| Web Policy | `k8s/base/network-policy-web.yaml` | Frontend: kein Egress |
| **Dev Overlay** | | |
| Dev Kustomization | `k8s/overlays/dev/kustomization.yaml` | Dev-Konfiguration |
| Dev Namespace Patch | `k8s/overlays/dev/namespace-patch.yaml` | servanda-dev |
| Dev Resource Patch | `k8s/overlays/dev/resource-patch.yaml` | Minimale Ressourcen |
| **Staging Overlay** | | |
| Staging Kustomization | `k8s/overlays/staging/kustomization.yaml` | Staging-Konfiguration |
| Staging Namespace Patch | `k8s/overlays/staging/namespace-patch.yaml` | servanda-staging |
| Staging Resource Patch | `k8s/overlays/staging/resource-patch.yaml` | Mittlere Ressourcen |
| Staging Sealed Secrets | `k8s/overlays/staging/sealed-secrets.yaml` | Encrypted Secrets |
| Staging cert-manager | `k8s/overlays/staging/cert-manager-issuer.yaml` | Let's Encrypt Staging |
| **Prod Overlay** | | |
| Prod Kustomization | `k8s/overlays/prod/kustomization.yaml` | Prod-Konfiguration |
| Prod Namespace Patch | `k8s/overlays/prod/namespace-patch.yaml` | servanda-prod |
| Prod Resource Patch | `k8s/overlays/prod/resource-patch.yaml` | Hohe Ressourcen |
| Prod Replica Patch | `k8s/overlays/prod/replica-patch.yaml` | 2+ Replicas |
| Prod HPA API | `k8s/overlays/prod/hpa-api.yaml` | Auto-Scaling API (max 10) |
| Prod HPA Worker | `k8s/overlays/prod/hpa-worker.yaml` | Auto-Scaling Worker (max 5) |
| Prod External Secrets | `k8s/overlays/prod/external-secrets.yaml` | External Secrets Operator |
| Prod External Secrets Operator | `k8s/overlays/prod/external-secrets-operator.yaml` | ESO Installation |
| Prod External Secrets Sync | `k8s/overlays/prod/external-secrets-sync.yaml` | Secret-Synchronisation |
| Prod Ingress | `k8s/overlays/prod/ingress.yaml` | app.servanda.de, TLS |
| Prod cert-manager | `k8s/overlays/prod/cert-manager-issuer.yaml` | Let's Encrypt Prod |
| **On-Prem Overlay** | | |
| On-Prem Kustomization | `k8s/overlays/onprem/kustomization.yaml` | On-Prem-Konfiguration |
| On-Prem MinIO | `k8s/overlays/onprem/minio-statefulset.yaml` | Lokaler Object Storage |
| On-Prem Static Secrets | `k8s/overlays/onprem/static-secrets.yaml` | Lokale Secrets |
| On-Prem Config Patch | `k8s/overlays/onprem/onprem-config-patch.yaml` | MinIO + LDAP Config |
| **CI/CD** | | |
| PR Gate Workflow | `.github/workflows/pr-gate.yml` | 9 PR-Checks |
| Main Gate Workflow | `.github/workflows/main-gate.yml` | Post-Merge Checks |
| Build + Push Workflow | `.github/workflows/build-push.yml` | Docker Build + Registry Push |
| **Observability** | | |
| Prometheus Config | `docker/prometheus/prometheus.yml` | Metrik-Scraping |
| Grafana Datasource | `docker/grafana/provisioning/datasources/datasource.yml` | Prometheus Datasource |
| Grafana Dashboard Config | `docker/grafana/provisioning/dashboards/dashboard.yml` | Dashboard-Provisioning |
| Grafana Dashboard | `docker/grafana/dashboards/servanda-overview.json` | Servanda Overview Dashboard |
| Docker-Compose | `docker/docker-compose.yml` | Lokale Entwicklungsumgebung |

### Validierungsergebnisse

| Aspekt | Ergebnis | Details |
|--------|---------|---------|
| **4 Overlays** | Bestatigt | dev, staging, prod, onprem -- alle mit Kustomization |
| **Network Policies** | Bestatigt | Default-Deny + spezifische Egress-Policies pro Workload (Sprint 7) |
| **HPAs** | Bestatigt | API (min 2, max 10, CPU 70%) + Worker (min 1, max 5, CPU 60%) |
| **External Secrets** | Bestatigt | ESO + Sync-Manifeste im Prod-Overlay (Sprint 8) |
| **cert-manager** | Bestatigt | ClusterIssuer fur Staging + Prod (Sprint 7 + 8) |
| **Ingress** | Bestatigt | Prod-Ingress mit TLS, Rate-Limiting, Security-Headers |
| **Backup CronJob** | Bestatigt | pg_dump + S3-Upload, taglich |
| **Observability** | Bestatigt | Prometheus + Grafana + postgres-exporter (Sprint 6) |
| **CI/CD Pipelines** | Bestatigt | PR-Gate (9 Checks), Main-Gate (6 Checks), Build-Push (Sprint 7) |
| **Docker-Compose** | Bestatigt | API + Web + Export-Worker + PostgreSQL + MinIO + Keycloak + Prometheus + Grafana |
| **On-Prem MinIO** | Bestatigt | StatefulSet + Config-Patch, LDAP-Konfiguration vorbereitet |

### Risiken

| Risiko | Likelihood | Impact | Mitigation |
|--------|-----------|--------|-----------|
| K8s-Komplexitat fur On-Prem-Kunden | Medium | Medium | K3s als leichtgewichtige Alternative, Installations-Dokumentation, Helm-Charts (Phase 2) |
| Kustomize-Drift zwischen Overlays | Low | Medium | CI-Validierung (`kustomize build` in Pipeline), Overlay-Template-Tests |
| Secret-Rotation Downtime | Low | Medium | External Secrets mit automatischer Rotation, Rolling Restart |

### Nachste Optimierungen

1. **Sprint 9:** cert-manager + Let's Encrypt ClusterIssuer in Prod verifizieren
2. **Phase 2:** Helm-Charts als Alternative zu Kustomize fur On-Prem-Distribution
3. **Phase 2:** GitOps (ArgoCD/Flux) fur automatisiertes Deployment
4. **Phase 2:** OpenTelemetry-Integration fur Distributed Tracing

---

## 9. Gesamt-Bewertung

### Architektur-Gesundheit

| Dimension | Bewertung | Kommentar |
|-----------|----------|-----------|
| **Security** | Stark | 5-Schichten Tenant-Isolation (JWT, Middleware, App, RLS, Storage), Threat Model vollstandig, 12 automatisierte Security-Tests |
| **Modularitat** | Stark | Klare Bounded Contexts, Interface-Kontrakte, unabhangige Deployments (API, Worker, Frontend) |
| **Testbarkeit** | Stark | Testing-Pyramide implementiert, 43+ Unit-Tests, 29+ Integration-Tests, 7+ E2E-Tests, axe-core CI |
| **Operability** | Stark | 4 K8s-Overlays, Monitoring-Stack, Backup-CronJob, HPAs, Network Policies |
| **Skalierbarkeit** | Gut | HPAs fur API + Worker, pgboss-Queue ausreichend fur MVP-Volumen, Partitioning fur Phase 2 vorbereitet |
| **Erweiterbarkeit** | Gut | Modularer Monolith mit definierten Grenzen, Service-Extraktion vorbereitet, Feature-Flag-System vorhanden |

### Offene Punkte fur Phase 2

| # | Thema | Betroffene BB | Prioritat |
|---|-------|--------------|-----------|
| 1 | OpenSearch fur Volltextsuche | BB-001 | High |
| 2 | Service-Extraktion evaluieren | BB-002 | Medium |
| 3 | Code-Splitting + Lazy Loading | BB-003 | Medium |
| 4 | Export-Caching + Performance-Tuning | BB-004 | Medium |
| 5 | SSE-KMS per-Tenant Keys | BB-005 | High (Enterprise) |
| 6 | SAML/OIDC Federation + SCIM | BB-006 | High (Enterprise) |
| 7 | Helm-Charts + GitOps | BB-007 | Medium |

### Empfehlung

Alle sieben Backbone-Entscheidungen sind durch Code-Artefakte, Tests und Infrastruktur-Manifeste validiert. Es gibt keine Entscheidung, die revidiert werden muss. Das System ist bereit fur den MVP-Release-Kandidat-Prozess gemaess der Release-Checkliste v1.

---

*Erstellt: 2026-02-11 | Team 01 (Product Architecture) | Sprint 11*
