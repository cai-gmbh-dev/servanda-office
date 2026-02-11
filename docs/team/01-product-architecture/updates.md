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

- Sprint 9: Modul-Boundaries dokumentieren (welche Module welche Prisma-Tabellen ansprechen dürfen).
- Performance-Baseline ermitteln (API-Latenz mit Seed-Daten).
- Cross-Module-Event-System evaluieren (für Audit-Event-Propagation).
- Breaking-Change-Policy formalisieren (Deprecation-Timeline, Migration-Guide).
