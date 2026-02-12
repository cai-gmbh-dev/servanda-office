# Servanda Office v1.0.0 — MVP Release Notes

**Datum:** 2026-02-11
**Status:** Released
**Owner:** Team 01 (Product Architecture)
**Referenzen:** Story-Map MVP, Architecture Backbone v1, Release-Checkliste v1, Performance-Baseline v1

---

## Highlights

- **Multi-Tenant LegalTech-Plattform fuer SME-Kanzleien** -- Shared Database mit PostgreSQL Row-Level Security (RLS) fuer vollstaendige Mandantentrennung (ADR-001).
- **Guided Contract Builder** -- Von der Template-Auswahl ueber ein gefuehrtes Q&A-Interview mit Conditional Logic bis zum fertigen Review und Export. Erster Vertrag in unter 10 Minuten.
- **Immutable Version-Pinning** -- Jede ContractInstance friert zum Zeitpunkt der Erstellung die exakten Clause- und Template-Versionen ein. Reproduzierbarkeit garantiert (ADR-002).
- **DOCX-Export mit Kanzlei-Branding** -- Asynchrone Export-Pipeline (pgboss Queue + docxtemplater Worker) mit konfigurierbaren Style-Templates (Schriftart, Farben, Logo, Kopf-/Fusszeilen).
- **RBAC mit Keycloak OIDC + MFA fuer Admins** -- Drei Rollen (Admin/Editor/User), JWT-basierte Authentifizierung, TOTP-MFA fuer Administratoren, Passwort-Policies (12 Zeichen, Komplexitaet, History).
- **Vier-Augen-Prinzip fuer Content-Publishing** -- 20 Publishing-Gates (10 Clause, 10 Template), Reviewer-Workflow mit Approve/Reject/Request-Changes, Author darf eigene Inhalte nicht freigeben.
- **Compliance-Ready** -- Append-Only Audit-Logging, 30+ Event-Typen, DSGVO-Loeschkonzept, 12 automatisierte Security-Tests (T-01..T-12).

---

## Features nach Epic

### E1: Mandantenfaehigkeit & Identity

- Shared Database mit PostgreSQL RLS auf allen 12 tenant-gescoped Tabellen
- `FORCE ROW LEVEL SECURITY` auf allen Tabellen -- kein Bypass moeglich
- User-Provisioning: Invite, Activate, Deactivate, Delete mit Keycloak-Sync
- Keycloak 24 Integration (OIDC/SAML, Realm-Automation via `realm-export.json`)
- JWT Auth Middleware mit JWKS-Validierung + Dev-Mode-Fallback
- Rate-Limiting: Auth-Endpunkte 20/min, API-Endpunkte 200/min
- Passwort-Policy: Mindestens 12 Zeichen, Komplexitaet, 5er History
- `keycloakId`-Synchronisation im User-Model

### E2: Verlags-Content -- Muster/Klauseln + Versionierung + Publishing

- Clause und Template CRUD mit vollstaendigem Versionierungs-Lifecycle
- Status-Workflow: Draft -> Review -> Approved -> Published -> Deprecated
- 20 Publishing-Gates (PG-C01..C10 fuer Clauses, PG-T01..T10 fuer Templates)
- Reviewer-Workflow: 10 Endpoints fuer Clause+Template Version Reviews
- Vier-Augen-Prinzip: Reviewer darf nicht Author sein, Review-History in Metadata (append-only)
- Published Catalog: Cross-Tenant-Zugriff auf Vendor-Content fuer Kanzleien
- Changelog-API: CRUD fuer Changelog-Eintraege (changeType, legalImpact, summary)
- Content-Import CLI: Bulk-Import von Clauses/Templates via JSON mit Zod-Validierung
- Batch-Clause-Content-Endpoint: `POST /clauses/batch-content` (max 50 IDs)

### E3: Guided Contract Builder (Interview-Engine)

- InterviewFlow-Modell mit 7 Fragetypen: text, number, date, single_choice, multiple_choice, boolean, textarea
- 4-Phasen-Flow: Template-Auswahl -> Interview (Q&A) -> Review -> Export
- Conditional Logic: `evaluateConditions()` mit 4 Operatoren (equals, not_equals, contains, greater_than)
- Auto-Save fuer Antworten und ausgewaehlte Slots (Debounced PATCH)
- Live-Preview Panel: Echtzeit-Vertragsvorschau mit Slot-Resolution und Parameter-Substitution
- Keyboard-Navigation: Enter (naechste Frage), Shift+Enter (zurueck), Ctrl+S (speichern)
- Progress-Indicator mit ARIA-Attributen

### E4: Klausel-Konsistenz & Validierung (Rules)

- Rule-Engine mit 5 Regeltypen: requires, forbids, incompatible_with, scoped_to, requires_answer
- Evaluierungsalgorithmus mit Hard-/Soft-Conflict-Trennung
- ConflictResolutionPanel: Konflikte visuell getrennt (Hard vs. Soft), Dismiss-Option, Re-Validierung
- Kein Export bei offenen Hard Conflicts
- Publishing-Gates pruefen Rules-Vollstaendigkeit bei Status-Transition

### E5: Dokumentinstanzen -- Speichern, Verwalten, Ableiten

- ContractInstance CRUD mit immutablem Version-Pinning (ADR-002)
- `pinnedClauseVersionIds` und `templateVersionId` werden bei Erstellung eingefroren
- Immutability-Trigger: Completed Contracts koennen nicht mehr veraendert werden
- Review-Screen (ReviewPage): Pre-Completion-Pruefung mit Batch-Content, Parameter-Substitution, Validierungsstatus
- ContractsPage mit Filter- und Suchfunktion (Name, Status, Datum)
- CatalogPage mit URL-Parameter-basierten Filtern (q, category, jurisdiction)

### E6: Export (DOCX Pflicht, ODT Beta)

- **DOCX-Export**: docxtemplater-basiertes Rendering mit Referenz-Template (OpenXML, Arial 11pt)
- **ODT-Export (Beta)**: LibreOffice headless Konvertierung (DOCX -> ODT), Feature-Flag per Tenant
- **pgboss Job-Queue**: Asynchrone Verarbeitung, 3 Jobs/Worker Concurrency, max 3 Retries (Exponential Backoff)
- **Template-Caching**: LRU-Cache mit konfigurierbarer Groesse, Pre-Warm Service fuer Top-N Templates
- **S3-Upload**: MinIO-kompatibel, Presigned-URL-Download (15 Min. Expiry)
- **DLQ-Management**: Failed-Jobs anzeigen, Retry, Archive, Statistiken (4 Endpoints)
- **Kanzlei-Branding**: StyleTemplate CRUD (Schriftart, Farben, Logo, Kopf-/Fusszeilen, Margen)
- **Data-Loader**: Prisma-basierte Queries fuer gepinnte Versionen, Slot-Resolution, Style-Templates

### E7: Security, Audit & DSGVO

- **JWT Auth Middleware**: Keycloak JWKS-Validierung (RS256), Token-Expiry (15 Min. Access, 8 Std. Refresh)
- **RBAC**: 3 Rollen (admin/editor/user), serverseitig erzwungen via `requireRole()` Middleware
- **AuditService**: Append-Only, 30+ Event-Typen, Fehler-Isolation (Audit-Fehler blockieren nie Haupt-Operation)
- **Fallback-Queue**: In-Memory-Buffer (max 1000 Events, 30s Flush-Intervall) bei DB-Fehlern
- **Rate-Limiting**: Auth 20/min, API 200/min (konfigurierbar)
- **Security-Headers**: Helmet (CSP, HSTS, X-Content-Type-Options, X-Frame-Options), CORS-Hardening
- **MFA**: TOTP-Konfiguration, Conditional OTP Flow fuer Admins
- **12 automatisierte Security-Tests**: Auth, Tenant-Isolation, RBAC, CORS, Security-Headers (T-01..T-12)
- **CSRF-Schutz**: SameSite-Cookies ausreichend fuer SPA (evaluiert und bestaetigt)

### E8: SME Onboarding & In-Product Hilfe

- **3 User-Guides** nach Rollen: Admin-Guide, Editor-Guide, Enduser-Guide (`docs/guides/user-guide-*.md`)
- **DevOps/Admin-Anleitung**: Deployment (Cloud + On-Prem), Monitoring, Backup/Restore, Incident-Response (`docs/guides/devops-admin-guide.md`)
- **Responsive Design**: Breakpoints fuer Tablet und Mobile, Interview-Layout und Review-Screen optimiert (`responsive.css`)
- **Kontextuelle Hilfe**: helpText und explanation Felder in InterviewFlow-Fragen
- **Changelog-UI**: Slide-over Panel mit Version-History und Change-Types (ChangelogPanel)

---

## Tech-Stack

| Komponente | Technologie | Version |
|---|---|---|
| **Datenbank** | PostgreSQL (mit RLS) | 16 |
| **Backend** | Express / TypeScript (strict) | Node.js 20 |
| **Frontend** | React / Vite / TypeScript | React 18, Vite 5 |
| **Job-Queue** | pgboss (PostgreSQL-basiert) | - |
| **DOCX-Rendering** | docxtemplater | - |
| **ODT-Konvertierung** | LibreOffice headless (Beta) | - |
| **Identity Provider** | Keycloak (OIDC/SAML) | 24 |
| **Object Storage** | S3-kompatibel (MinIO fuer On-Prem) | - |
| **Container-Orchestrierung** | Kubernetes / Kustomize (4 Overlays) | - |
| **CI/CD** | GitHub Actions (PR-Gate + Main-Gate + build-push) | - |
| **Monitoring** | Prometheus + Grafana + Loki + postgres-exporter | - |
| **TLS** | cert-manager + Let's Encrypt | - |
| **Secrets** | External Secrets Operator (Prod), K8s Secrets (On-Prem) | - |

---

## API-Endpoints

Alle Endpoints unter `/api/v1/` Prefix (API-Versionierung mit `X-API-Version` Header, Legacy-Kompatibilitaet ohne Prefix).

| Modul | Prefix | Endpoints | Beschreibung |
|---|---|---|---|
| **Health** | `/api/v1/health` | 1 | Healthcheck (unauthenticated) |
| **Identity** | `/api/v1/identity` | 9 | Users CRUD, Invite, Activate/Deactivate, Audit-Logs |
| **Content** | `/api/v1/content` | 16+ | Clauses/Templates CRUD, Versions, Publishing-Gates, Reviewer-Workflow, Changelog, Catalog, Batch-Content, Import |
| **Contract** | `/api/v1/contracts` | 6 | Contracts CRUD, Auto-Save, Validate (Rule-Engine), Complete (Pin) |
| **Export** | `/api/v1/export-jobs`, `/api/v1/export` | 12 | Job-Create/Status/Download, DLQ (Failed/Retry/Archive/Stats), StyleTemplate CRUD |
| **Gesamt** | | **44+** | |

---

## Quality Metrics

| Metrik | Wert | Status |
|---|---|---|
| **TypeScript** | 0 Errors (strict mode) | Enforced in PR-Gate |
| **ESLint** | 0 Errors | Enforced in PR-Gate |
| **Test Coverage** | >= 80% Lines | Enforced in PR-Gate (Vitest + istanbul) |
| **axe-core** | 0 A11y Violations | Enforced in PR-Gate |
| **Security-Tests** | 12/12 automatisiert (T-01..T-12) | Enforced in Main-Gate (Testcontainers) |
| **k6 Load-Tests** | P95 < 500ms, Error-Rate < 5% | 3 Szenarien (Smoke/Load/Stress) |
| **Lighthouse Performance** | >= 85 (CI-Gate) | Enforced in Main-Gate |
| **Lighthouse Accessibility** | >= 90 (CI-Gate) | Enforced in Main-Gate |
| **E2E-Tests** | 13+ Playwright-Tests | Happy-Path + Contract-Flow |
| **Unit-/Integrationstests** | 100+ Tests | Middleware, Services, API-Module, Components, Export |
| **Dependency Scan** | Keine High/Critical CVEs | Trivy Security Scan in build-push |

---

## Deployment-Optionen

### Kubernetes-Overlays (Kustomize)

| Overlay | Beschreibung |
|---|---|
| **dev** | Reduzierte Resources, 1 Replica, Development-Labels |
| **staging** | Sealed Secrets, mittlere Resources, Staging-Labels |
| **prod** | External Secrets Operator, HPAs (API 3-10, Worker 2-8), NGINX Ingress + TLS (cert-manager), Network Policies |
| **onprem** | MinIO StatefulSet (20Gi), statische K8s Secrets, LDAP-Config |

### Infrastruktur-Features

- Network Policies: Default-Deny + Service-spezifische Policies (API, Worker, Web)
- Backup-CronJob: Taeglicher pg_dump, S3-Upload, 30 Tage Retention
- Observability: Prometheus (3 Scrape-Configs) + Grafana (5+ Dashboard-Panels) + Loki (Log-Aggregation) + Alerting-Rules
- cert-manager: Let's Encrypt ClusterIssuer (Staging + Prod), automatische Zertifikat-Rotation (90 Tage)
- HPA: CPU-basierte Auto-Skalierung fuer API und Export-Worker
- K8s Smoke-Test Script: K3s-Validierung (Namespace, Deployments, Services, Health, RLS)

---

## Architecture Decision Records (ADRs)

| ADR | Titel | Status |
|---|---|---|
| ADR-001 | Tenant-Isolation (Shared DB + PostgreSQL RLS + App-Layer Guards) | Operationalisiert |
| ADR-002 | Version Pinning (Immutable ContractInstance Pins) | Spezifiziert |
| ADR-003 | Export-Engine als separater Worker-Prozess (pgboss Queue) | Accepted |
| ADR-004 | ODT via DOCX-Konvertierung (LibreOffice headless, Beta) | Accepted |
| ADR-005 | Breaking-Change-Policy (SemVer, Deprecation-Timeline 2 Minor / 8 Wochen) | Formalisiert |

### Architecture Backbone Decisions (BB-001..007)

| ID | Entscheidung | Review-Status |
|---|---|---|
| BB-001 | Modularer Monolith statt Microservices | Validiert |
| BB-002 | PostgreSQL-basierte Queue (pgboss) statt Redis/RabbitMQ | Validiert |
| BB-003 | TypeScript Full-Stack (Backend + Frontend) | Validiert |
| BB-004 | REST statt GraphQL | Validiert |
| BB-005 | Keycloak fuer Identity/Auth | Validiert |
| BB-006 | docxtemplater fuer DOCX-Rendering | Validiert |
| BB-007 | Schema-basierte Module (nicht DB-per-Module) | Validiert |

---

## Known Limitations

1. **ODT-Export ist Beta**: Hierarchische Nummerierung kann bei komplexen Templates Abweichungen zeigen. ODT-Konvertierung ueber Feature-Flag per Tenant steuerbar. LibreOffice Cold-Start (+3-8s beim ersten Job pro Worker).

2. **Dev-Mode Auth-Headers als Fallback**: Fuer lokale Entwicklung akzeptiert die Auth-Middleware `x-user-id`/`x-tenant-id`/`x-user-role` Headers als Fallback wenn kein JWT vorhanden ist. In Production ist ausschliesslich JWT-Authentifizierung aktiv.

3. **OpenSearch fuer Volltextsuche noch Phase 2**: Aktuell werden Suche und Filter client-seitig (CatalogPage) bzw. ueber SQL-Queries abgebildet. Fuer grosse Datenmengen ist OpenSearch-Integration geplant.

4. **Batch-Content max 50 IDs**: Der `POST /clauses/batch-content` Endpoint akzeptiert maximal 50 Clause-IDs pro Request. Grosse Templates mit mehr als 50 Klauseln erfordern mehrere Requests.

5. **Audit-Log-Suche ueber SQL**: Komplexe Audit-Log-Analysen (z.B. Anomalie-Erkennung) sind aktuell auf PostgreSQL-Queries begrenzt. SIEM-Integration und Real-time Audit-Stream sind fuer Phase 2 geplant.

6. **Frontend-Internationalisierung**: i18n-Framework ist fuer Sprint 12+ geplant. Die UI ist aktuell auf Deutsch ausgelegt.

7. **Drag-and-Drop Klausel-Reihenfolge**: Manuelle Umordnung von Klauseln im Interview-Flow ist fuer Sprint 12 vorgesehen.

---

## Upgrade-Hinweise

Dies ist die **erste offizielle Release** von Servanda Office. Es gibt keine vorherige Version und somit keine Migration erforderlich.

### Erstinstallation

1. **Kubernetes**: Kustomize-Overlay anwenden (`kubectl apply -k k8s/overlays/prod/` oder `k8s/overlays/onprem/`)
2. **Datenbank**: Prisma-Migrationen werden automatisch ueber Init-Container ausgefuehrt (`prisma migrate deploy`)
3. **Keycloak**: Realm wird automatisch importiert (`realm-export.json` mit `--import-realm`)
4. **Seed-Daten**: Optionaler Seed fuer Demo-Tenant (`prisma db seed`)
5. **Monitoring**: Prometheus, Grafana und Loki werden ueber Docker-Compose Profile oder Kubernetes-Manifeste bereitgestellt

### Breaking-Change-Policy (ab v1.1+)

Gemaess ADR-005 gelten ab dieser Release:
- **SemVer**: Major.Minor.Patch
- **Deprecation-Timeline**: 2 Minor-Versionen oder 8 Wochen Vorlaufzeit
- **Migration-Guides**: Fuer jede Breaking-Change bereitgestellt
- **CI-Gate**: Deprecated-API-Nutzung wird als Warning gemeldet

---

## Sprint-Historie (Sprints 1-12)

| Sprint | Fokus | Deliverables |
|---|---|---|
| 1 | Foundation (ADRs, Domainmodell, QA-Gates, Deployment) | 14 |
| 2 | Editorial + Builder Design (Content Versioning, Interview Flow, Conflict Rules) | 3 |
| 3 | Export + Hardening Specs (DOCX, ODT, A11y Baseline, Audit E2E) | 4 |
| 4 | Code Scaffold (Monorepo, Prisma, Frontend, Export Worker, CI) | 5 |
| 5 | Module Implementation (Service Interfaces, Auth, Content/Contract/Export API) | 6 |
| 6 | Testing + Automation (Unit-Tests, Keycloak Realm, DOCX Templates, K8s, E2E, Observability) | 6 |
| 7 | Integration + Polish (Network Policies, Integration-Tests, Live-Preview, Publishing-Gates) | 6 |
| 8 | Hardening + Production-Readiness (API-Versionierung, Reviewer, DLQ, Prod/OnPrem Overlay) | 8 |
| 9 | E2E + Security (ADR-005, Guides, Keycloak Admin, MFA, Testcontainers, Security-Tests, cert-manager) | 10 |
| 10 | Integration + Validation (OpenAPI, Rate-Limiting, E2E Flow, Backup, External Secrets) | 10 |
| 11 | Release Preparation (Checkliste, Performance-Baseline, Content-Import, Caching, Load-Tests, Loki) | 10 |
| 12 | Final MVP Release + Pilot-Readiness | In Arbeit |
| **Gesamt** | | **82+** |

---

## Kontakt & Support

- **Product Architecture (Team 01)**: Architektur-Entscheidungen, Modul-Boundaries, API-Design
- **Platform Security (Team 02)**: Auth, RBAC, Audit, Keycloak, MFA
- **Content Editorial (Team 03)**: Clause/Template CRUD, Publishing, Reviewer-Workflow
- **Contract Builder (Team 04)**: Interview-Engine, Conditional Logic, Conflict Resolution
- **Export & Integration (Team 05)**: DOCX/ODT Export, Branding, DLQ
- **QA & Compliance (Team 06)**: Testing, Coverage, E2E, Security-Tests, Lighthouse
- **DevOps & On-Prem (Team 07)**: Kubernetes, CI/CD, Monitoring, Backup, On-Prem

---

*Erstellt: 2026-02-11 | Team 01 (Product Architecture) | Sprint 12*
