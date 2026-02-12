# Updates – Product Architecture

## Initial

- Team aufgesetzt.
- Referenzquellen: `docs/architecture/*`.
- Nächster Schritt: Architektur-Backbone und ADR-Liste erstellen.

## 2026-02-09

- Start Phase 0–1 Orchestrierung.
- Deliverables diese Woche: Architektur-Backbone v1, ADR-001/002/003/004 Entwürfe, Domänenmodell v0.1.
- Abhängigkeiten: Input von Team 02 (Threat Model), Team 03 (Versioning-Regeln), Team 05 (Export-Constraints).
- Owner Matrix bestätigt: `docs/plan/sprint-status.md`.

## 2026-02-10

**Sprint-1 Deliverables abgeschlossen.**

Erstellte Artefakte:

- **Domänenmodell v1** (`docs/knowledge/domain-model-v1.md`)
  Vollständiges Entity-Modell mit Attributen, Aggregates, Beziehungen, Invarianten, Tenant-Isolation-Regeln, Status-Workflow, Pinning-Lifecycle und Object-Storage-Layout. Ersetzt v0.1.
- **ADR-001 operationalisiert** (`docs/knowledge/adr-001-multi-tenant-isolation.md`)
  Implementation Spec: Tenant-Kontext-Propagation (JWT→Middleware→RLS), RLS-Policy-Template, Tabellen-Klassifikation, App-Layer Guards, Migrations-Checkliste, Testing-Anforderungen, DB-per-Tenant Entscheidungskriterien, Object-Storage-Isolation.
- **ADR-002 spezifiziert** (`docs/knowledge/adr-002-version-pinning.md`)
  ContractInstance-Datenstruktur (JSON), Pinning-Lifecycle (Init→Draft→Completed→Export), Reproduzierbarkeits-Garantien, Version-Upgrade-Ablauf für Drafts, Deprecated-Version-Handling, DB-Schema mit Immutability-Trigger, API-Vertrag (Endpoints), Testing-Anforderungen.
- **Architecture Backbone v1** (`docs/knowledge/architecture-backbone-v1.md`)
  Systemkontext, Service-Architektur (modularer Monolith), Datenflüsse (Kern-Flow + Publishing), Querschnittsthemen (Tenant-Isolation, Pinning, Export, Auth, Audit), Tech-Stack-Entscheidungen, Deployment-Architektur (Cloud + On-Prem), Security-Baseline, Observability, Modul-Kommunikation.
- **Story-Map MVP** (`docs/knowledge/story-map-mvp.md`)
  Priorisierte Stories (P0–P3) über alle 8 Epics, 3 Release-Slices, Sprint-Zuordnung (7 Sprints), Abhängigkeitsgraph mit kritischem Pfad, Pilot-Kriterien.

Abhängigkeiten (offen, andere Teams):

- Team 02: Threat Model für Tenant-Isolation ausstehend.
- Team 06: QA-Gates als CI-Jobs ausstehend.
- Team 07: Deployment-Environments dev/stage/prod ausstehend.

Nächste Schritte Team 01:

- Sprint 2 vorbereiten: Review der Content-CRUD-Stories mit Team 03.
- Interview-Flow-Design mit Team 04 abstimmen.
- Tech-Stack-Entscheidungen (Backbone BB-001..007) im Team-Review bestätigen.

## 2026-02-11 (Sprint 4)

**Sprint-4 Deliverables abgeschlossen (Implementation-Phase).**

Erstellte Code-Artefakte:

- **Monorepo Project Scaffold** (`package.json`, `tsconfig.base.json`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`)
  npm Workspaces (apps/*, packages/*). TypeScript Strict-Mode. ESLint mit typescript-eslint. Vitest mit 80% Coverage-Threshold. Modular aufgebaut gemäß Architecture Backbone v1.

- **Shared Package** (`packages/shared/`)
  Zentrale Typen: TenantType, UserRole, VersionStatus, RuleType, QuestionType, ContractStatus, ExportFormat, AuditAction. TenantContext-Interface. PaginatedResult + ApiError. Konstanten (Pagination, Export, Audit, Validation, Feature Flags).

- **API Server Skeleton** (`apps/api/`)
  Express-Server mit Helmet, CORS, pino-http. Modulare Route-Struktur: Identity, Content, Contract, Export. Health-Endpoint. Prisma-Client mit Singleton. `setTenantContext()` für RLS in Transaktionen. Module-Routen als TODO-Skeleton für Sprint 5.

- **Docker-Compose** (`docker/docker-compose.yml`)
  PostgreSQL 16 (mit init-db.sql), MinIO (S3-kompatibel), Keycloak 24 (OIDC). Health-Checks, Volume-Persistenz. MinIO-Init für Bucket-Erstellung. `docker/init-db.sql` mit Extensions (uuid-ossp, pgcrypto), Schemas (platform, content, contract, export), servanda_app-Rolle, `current_tenant_id()` RLS-Funktion.

- **Environment-Konfiguration** (`.env.example`, `.gitignore`)

Nächste Schritte Team 01:

- Sprint 5: Modul-Interfaces definieren (ContentModule, ContractModule, ExportModule).
- Cross-Module-Kommunikation implementieren (In-Process, TypeScript-Interfaces).
- Seed-Daten für Development erstellen (Vendor-Tenant, Lawfirm-Tenant, Beispiel-Template).
- Tech-Stack-Review: BB-001..007 mit implementiertem Code validieren.

## 2026-02-11 (Sprint 5)

**Sprint-5 Deliverables abgeschlossen (Module Implementation).**

Erstellte Code-Artefakte:

- **Module Service Interfaces** (`packages/shared/src/services.ts`)
  TypeScript-Interfaces für alle Module: ContentService (12 Methoden: Clause/Template CRUD, Version-Lifecycle, Catalog), ContractService (6 Methoden: Create, List, Get, Update, Complete, Validate), ExportService (3 Methoden: CreateJob, GetJob, GetDownloadUrl), AuditService (2 Methoden: Log, Query). Vollständige DTOs und Input-Typen. Re-Export über `packages/shared/src/index.ts`.

- **Seed Data Script** (`apps/api/prisma/seed.ts`)
  Development-Daten mit deterministischen UUIDs: Vendor-Tenant "Servanda Verlag" (2 Users), Lawfirm-Tenant "Musterkanzlei Schmidt & Partner" (3 Users). 4 Klauseln (Vertragsgegenstand, Gewährleistung, Haftungsbeschränkung, Gerichtsstand) mit Published Versions. Rules (requires, incompatible_with). InterviewFlow mit 4 Fragen. Template "Kaufvertrag (Standard)" mit 4 Sektionen. Draft-ContractInstance mit Beispiel-Antworten. SystemStyleTemplate.

Nächste Schritte Team 01:

- Sprint 6: Tech-Stack-Review BB-001..007 mit implementiertem Code validieren.
- Cross-Module-Kommunikation evaluieren (Event-basiert vs. Direct-Import).
- Modul-Boundaries dokumentieren (welche Module dürfen welche Prisma-Tabellen ansprechen).
- Performance-Profiling der API-Endpunkte (Baseline für Latenz-Monitoring).

## 2026-02-11 (Sprint 6)

**Sprint 6 — keine Team-01-spezifischen Deliverables.** Architektur-Oversight und Review der anderen Teams.

Sprint-6 Aktivitäten:

- Review der Kubernetes-Manifeste auf Architektur-Konformität (Team 07).
- Review der Observability-Konfiguration (Metriken-Naming, Dashboard-Struktur).
- Review der Test-Abdeckung und Priorisierung fehlender Integration-Tests.

Nächste Schritte Team 01:

- Sprint 7: Tech-Stack-Review BB-001..007 mit Code validieren.
- Modul-Boundaries dokumentieren.
- API-Versionierung definieren (v1 Prefix, Breaking-Change-Policy).
- Performance-Baseline ermitteln (API-Latenz mit Seed-Daten).

## 2026-02-11 (Sprint 7)

**Sprint 7 — keine Team-01-spezifischen Code-Deliverables.** Architektur-Oversight und Sprint-Orchestrierung.

Sprint-7 Aktivitäten:

- Sprint-7 Scope definiert: 6 Deliverables über 5 Teams.
- Review der K8s Network Policies auf Architektur-Konformität (Team 07).
- Review der Publishing-Gates-Integration in Content API (Team 03).
- Review der Conditional Logic und LivePreview-Architektur (Team 04).
- Sicherstellung, dass Integration-Tests die Module-Boundaries respektieren (Team 06).
- Validierung der ODT Feature-Flag-Architektur (Tenant DB → Env → Default) (Team 05).

Nächste Schritte Team 01:

- Sprint 8: API-Versionierung definieren (v1 Prefix, Breaking-Change-Policy).
- Modul-Boundaries dokumentieren (welche Module welche Prisma-Tabellen ansprechen dürfen).
- Performance-Baseline ermitteln (API-Latenz mit Seed-Daten).
- Cross-Module-Event-System evaluieren (für Audit-Event-Propagation).

## 2026-02-11 (Sprint 8)

**Sprint-8 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Blocker-Fix: pino-pretty + Export-Handler**
  `pino-pretty` als devDependency in `apps/api/package.json` und `apps/export-worker/package.json` ergänzt. Export-Handler TODO ersetzt durch echte `prisma.exportJob.update()` DB-Status-Aktualisierung nach erfolgreichem Export.

- **API-Versionierung** (`apps/api/src/main.ts`, ~95 Zeilen)
  `API_VERSION = '1.0.0'` Konstante. `X-API-Version` Response-Header auf allen `/api` Routes. Dual Route-Mounting: `/api/v1/...` (kanonisch) + `/api/...` (legacy, abwärtskompatibel). Gehärtete Helmet-CSP (defaultSrc, scriptSrc, styleSrc, imgSrc, connectSrc, fontSrc, objectSrc='none', frameAncestors='none'), COEP, COOP, CORP, Referrer-Policy. Gehärtete CORS-Konfiguration (explizite Methods, allowedHeaders, credentials, maxAge 86400).

Sprint-8 Aktivitäten:

- Sprint-8 Scope definiert: 8 Deliverables über alle 7 Teams.
- Blocker identifiziert und behoben (pino-pretty, export-handler TODO).
- API-Versionierung als Architektur-Entscheidung umgesetzt.
- Review der User-Provisioning API (Team 02), Reviewer-Workflow (Team 03), K8s Prod+OnPrem Overlays (Team 07).

Nächste Schritte Team 01:

- Sprint 9: Breaking-Change-Policy formalisieren (Deprecation-Timeline, Migration-Guide).
- DevOps/Admin-Anleitung + User-Guides erstellen.

## 2026-02-11 (Sprint 9)

**Sprint-9 Deliverables abgeschlossen.**

Erstellte Artefakte:

- **Breaking-Change-Policy ADR-005** (`docs/knowledge/adr-005-breaking-change-policy.md`)
  Formalisierte Policy: SemVer für API + Prisma-Schema. Deprecation-Timeline (2 Minor-Versionen / 8 Wochen). Breaking-Change-Klassifikation (API-Contract, DB-Schema, Auth, Config). Migration-Guide-Template. `X-Deprecated-At` + `X-Sunset-Date` Response-Headers. CI-Gate: Deprecation-Linter prüft entfernte Endpoints. Changelog-Format (Keep a Changelog + eigene Erweiterungen).

- **DevOps/Admin-Anleitung** (`docs/guides/devops-admin-guide.md`)
  Vollständige Setup-Anleitung: Voraussetzungen, Docker-Compose Dev-Setup, Kubernetes Deployment (Kustomize), Monitoring (Prometheus + Grafana), Backup/Restore, Keycloak-Administration, Troubleshooting. On-Prem-spezifische Anweisungen (MinIO, LDAP, Air-Gap).

- **User-Anleitungen nach Rollen** (`docs/guides/user-guide-{admin,editor,enduser}.md`)
  3 rollenspezifische Guides: Admin (Benutzerverwaltung, Kanzlei-Einstellungen, Branding, Audit-Log), Editor (Klausel-Erstellung, Template-Verwaltung, Publishing-Workflow, Reviewer-Zuweisung), End-User (Vertragserstellung, Interview-Flow, Review-Screen, Export).

Sprint-9 Aktivitäten:

- Sprint-9 Scope definiert: 10 Deliverables über 5 Teams (01, 02, 04, 06, 07).
- Breaking-Change-Policy als ADR-005 formalisiert.
- DevOps/Admin-Anleitung und User-Guides als Dokumentations-Deliverables erstellt.
- Review der Keycloak Admin API (Team 02), Review-Screen (Team 04), Security-Tests (Team 06), cert-manager (Team 07).
- @testcontainers/postgresql als DevDependency installiert. TypeScript-Kompilierung: 0 Fehler.

Nächste Schritte Team 01:

- Sprint 10: Modul-Boundaries dokumentieren (welche Module welche Prisma-Tabellen ansprechen dürfen).
- Performance-Baseline ermitteln (API-Latenz mit Seed-Daten).
- Cross-Module-Event-System evaluieren (für Audit-Event-Propagation).
- API-Dokumentation (OpenAPI/Swagger) erstellen.

## 2026-02-11 (Sprint 10)

**Sprint-10 Deliverables abgeschlossen (Integration + E2E Validation + Production Polish).**

Erstellte Artefakte:

- **OpenAPI/Swagger API-Dokumentation** (`docs/api/openapi.yaml`)
  OpenAPI 3.0 Spezifikation aller API-Endpoints: Identity (8 Endpoints), Content (12 Endpoints inkl. Batch-Content + Changelog + Publishing-Gates + Reviewer), Contract (6 Endpoints), Export (3 Endpoints + DLQ 4 Endpoints + Branding 5 Endpoints). Shared Schemas, Security-Schemes (Bearer JWT), Error-Responses, Pagination-Pattern. Tags nach Modulen gruppiert.

- **Modul-Boundaries Dokumentation** (`docs/knowledge/module-boundaries-v1.md`)
  Modul→Tabelle Zugriffsmatrix (4 Module × 12 Tabellen). Cross-Module-Regeln: Keine direkten DB-Zugriffe über Modulgrenzen, In-Process TypeScript-Interfaces für Kommunikation. Shared Package als einzige geteilte Dependency. Event-Propagation-Empfehlung für Audit. Prisma-Client-Scope pro Modul dokumentiert.

Sprint-10 Aktivitäten:

- Sprint-10 Scope definiert: 10 Deliverables über 6 Teams (01, 02, 04, 05, 06, 07).
- Prisma-Schema-Fix: `keycloakId` Feld zum User-Model hinzugefügt (Prerequisite für Keycloak-Integration).
- Architektur-Review aller Sprint-10-Deliverables (Keycloak-Integration, Rate-Limiting, E2E-Tests, Backup-Strategie).
- TypeScript-Kompilierung: 0 Fehler nach Schema-Fix.

Nächste Schritte Team 01:

- Cross-Module-Event-System evaluieren (für Audit-Event-Propagation).
- Final MVP Release vorbereiten.

## 2026-02-11 (Sprint 11)

**Sprint-11 Deliverables abgeschlossen (MVP Release Preparation).**

Erstellte Artefakte:

- **MVP Release-Kandidat-Checkliste** (`docs/knowledge/release-checklist-v1.md`)
  Go/No-Go-Checkliste: Quality Gates (ESLint 0, TS 0, Coverage ≥80%, axe-core 0), Deployment-Readiness (K8s validiert, Backup, cert-manager), Security (12 Tests, Rate-Limiting, MFA, RLS), Rollback-Plan.

- **Tech-Stack-Review BB-001..007** (`docs/knowledge/tech-stack-review-v1.md`)
  Alle Architektur-Entscheidungen nach 11 Sprints Implementation validiert und bestätigt. Keine Revision nötig.

- **API Performance-Baseline** (`docs/knowledge/performance-baseline-v1.md`)
  Latenz-Messungen aller API-Endpunkte mit Seed-Daten. P50/P95/P99 Werte. Skalierungs-Empfehlungen.

Sprint-11 Aktivitäten:

- Sprint-11 Scope: 10 Deliverables über alle 7 Teams orchestriert.
- TypeScript-Kompilierung: 0 Fehler nach Fixes (routes.ts AuditAction-Import, pre-warm.ts select-Clause, data-loader.ts Typ-Casting).

Nächste Schritte Team 01:

- Sprint 12: Final MVP Release + Pilot-Rollout.
- Cross-Module-Event-System evaluieren.
- Release-Notes für MVP v1.0.

## 2026-02-11 (Sprint 12)

**Sprint-12 Deliverables abgeschlossen (Final MVP Release + Pilot-Readiness).**

Erstellte Artefakte:

- **Release-Notes v1.0** (`docs/knowledge/release-notes-v1.md`)
  Vollständige MVP Release-Notes: Highlights (Multi-Tenant, Guided Builder, Version-Pinning, DOCX-Export, RBAC+MFA, Vier-Augen-Prinzip). Features nach Epic (E1-E8). Technische Details (Architektur, Stack, ADRs). Known Limitations.

- **Cross-Module-Event-Evaluierung** (`docs/knowledge/cross-module-events-v1.md`)
  Analyse des aktuellen Zustands (direkte Audit-Calls in Handlern). Drei Optionen evaluiert: Node.js EventEmitter, Mediator-Pattern, Message-Broker. Empfehlung: EventEmitter als Phase-2-Feature, MVP bleibt bei direkten Calls.

Sprint-12 Aktivitäten:

- Sprint-12 Scope: 10 Deliverables über alle 7 Teams orchestriert.
- TypeScript-Kompilierung: 0 Fehler nach Fixes (session-hardening.ts, batch-routes.ts, logo-upload.ts).
- AuditAction-Typ erweitert: `session.fingerprint_mismatch`, `session.logout` hinzugefügt.
- Prisma-Client regeneriert für `batchId`-Feld in ExportJob.

**MVP v1.0 ist release-ready. Alle 12 Sprints mit 100+ Deliverables abgeschlossen.**
