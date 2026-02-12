# MVP Release-Kandidat-Checkliste v1

**Status:** Final Draft
**Datum:** 2026-02-11
**Owner:** Team 01 (Product Architecture)
**Referenzen:** Story-Map MVP, Architecture Backbone v1, QA-Gates CI v1, Teststrategie v1, Deployment-Blueprint v1, Threat Model, Audit-Compliance v1, RBAC/IAM v1

---

## 1. Funktionale Vollstandigkeit (8 MVP-Epics)

### Epic 1 -- Mandantenfahigkeit & Identity

| Story-ID | Story | Prio | Status | Verifizierung |
|-----------|-------|------|--------|---------------|
| E1.S0 | DB-Schema + RLS-Policies aufsetzen (ADR-001) | P0 | [ ] Implementiert | RLS auf allen 12 Tabellen, `FORCE ROW LEVEL SECURITY` aktiv |
| E1.S1 | Kanzlei-Mandant anlegen (Name, Adresse, Jurisdiktion, Sprache) | P0 | [ ] Implementiert | API: `POST /api/v1/tenants`, Prisma `Tenant`-Modell |
| E1.S2 | Nutzer einladen, Rollen vergeben (Admin, Editor, User) | P0 | [ ] Implementiert | Invitation-Flow, Keycloak User-Creation |
| E1.S3 | Login + Tenant-Isolation (nur eigene Daten sichtbar) | P0 | [ ] Implementiert | JWT mit `tenant_id`, Cross-Tenant-Tests grun |
| E1.S4 | Berechtigungen steuern (RBAC) | P1 | [ ] Implementiert | 3 Rollen serverseitig erzwungen, RBAC-Middleware |
| E1.S5 | Security-Settings (MFA optional, Session Timeout) | P2 | [ ] Implementiert | TOTP-MFA konfigurierbar, Keycloak Realm-Config |

**Gate:** Cross-Tenant-Zugriff scheitert in CI (ADR-001 Tenant-Isolation-Tests).

---

### Epic 2 -- Verlags-Content: Muster/Klauseln + Versionierung + Publishing

| Story-ID | Story | Prio | Status | Verifizierung |
|-----------|-------|------|--------|---------------|
| E2.S1 | Klausel anlegen (Text, Parameter, Tags, Jurisdiktion) | P0 | [ ] Implementiert | Content API CRUD, `Clause` + `ClauseVersion` Modelle |
| E2.S2 | Template anlegen (Sections, Slots, Klausel-Referenzen) | P0 | [ ] Implementiert | `Template` + `TemplateVersion` mit Structure JSON |
| E2.S3 | Versionen erstellen (immutable) + Status-Workflow | P0 | [ ] Implementiert | Draft->Review->Approved->Published->Deprecated |
| E2.S4 | Reviewer zuweisen + Freigabe erzwingen | P1 | [ ] Implementiert | Vier-Augen-Prinzip, Reviewer-Endpoints, 20 Publishing Gates |
| E2.S5 | Kanzlei sieht nur Published-Versionen | P1 | [ ] Implementiert | Cross-Tenant Content-RLS-Policy |
| E2.S6 | Hinweis bei neueren Versionen | P2 | [ ] Implementiert | UI-Warnung, kein Auto-Update |

**Gate:** Published-Versionen sind immutable. Nicht-Published fur Kanzlei unsichtbar.

---

### Epic 3 -- Guided Contract Builder (Interview-Engine)

| Story-ID | Story | Prio | Status | Verifizierung |
|-----------|-------|------|--------|---------------|
| E3.S1 | Fragenkatalog definieren (Fragetypen, Reihenfolge) | P0 | [ ] Implementiert | `InterviewFlow` Modell, 7 Fragetypen |
| E3.S2 | Conditional Logic (wenn Antwort X -> zeige Frage Y) | P1 | [ ] Implementiert | Condition-Evaluation in QuestionInput |
| E3.S3 | Gefuhrter Flow (Progress, Zwischenspeichern, Zuruck/Weiter) | P1 | [ ] Implementiert | InterviewPage, Autosave |
| E3.S4 | Erlauterungen + "Mehr erfahren" pro Frage | P2 | [ ] Implementiert | helpText + explanation Felder |
| E3.S5 | Live-Preview/Outline (Kapitelstruktur) | P2 | [ ] Implementiert | LivePreviewPanel Komponente |

**Gate:** Entwurf kann gespeichert und spater fortgesetzt werden.

---

### Epic 4 -- Klausel-Konsistenz & Validierung (MVP Rules)

| Story-ID | Story | Prio | Status | Verifizierung |
|-----------|-------|------|--------|---------------|
| E4.S1 | Rules definieren pro Klausel (requires/forbids/incompatible_with/scoped_to/requires_answer) | P0 | [ ] Implementiert | Rules JSON embedded in ClauseVersion |
| E4.S2 | Validierung bei Publikation | P1 | [ ] Implementiert | Publishing-Gates prufen Rules-Vollstandigkeit |
| E4.S3 | Live-Konfliktmeldungen beim Zusammenbau + Losungsvorschlage | P1 | [ ] Implementiert | ConflictResolutionPanel |
| E4.S4 | Konflikte auflosen (Alternative wahlen, Zusatz entfernen) | P1 | [ ] Implementiert | selectedSlots Update, Re-Validierung |

**Gate:** Kein Export bei Hard Conflicts. Konflikte verstandlich formuliert.

---

### Epic 5 -- Dokumentinstanzen: Speichern, Verwalten, Ableiten

| Story-ID | Story | Prio | Status | Verifizierung |
|-----------|-------|------|--------|---------------|
| E5.S1 | Vertrag speichern (Name, Mandant/Projekt, Tags) + Version-Pinning | P1 | [ ] Implementiert | ContractInstance mit immutable Pins (ADR-002) |
| E5.S2 | Vertrag als Kanzlei-Template ableiten ("Clone as Template") | P1 | [ ] Implementiert | LawFirmTemplate Erstellung |
| E5.S3 | Bibliothek eigener Templates verwalten | P2 | [ ] Implementiert | CatalogPage mit Filter/Suche |
| E5.S4 | Vertrage suchen/filtern (Name, Tag, Datum) | P2 | [ ] Implementiert | ContractsPage, Query-Parameter |

**Gate:** Vertrag speichert Answers + gepinnte Versions (Reproduzierbarkeit).

---

### Epic 6 -- Export (DOCX Pflicht, ODT optional)

| Story-ID | Story | Prio | Status | Verifizierung |
|-----------|-------|------|--------|---------------|
| E6.S0 | Export-Service Infrastruktur (Job-Queue, Worker, Object Storage) | P0 | [ ] Implementiert | pgboss Queue, Export-Worker, S3-Upload |
| E6.S1 | DOCX Export (saubere Nummerierung/Uberschriften) | P1 | [ ] Implementiert | docxtemplater Rendering, Referenz-Template |
| E6.S2 | Formatvorlage/Style-Template auswahlen | P2 | [ ] Implementiert | StyleTemplate CRUD, Kanzlei-Branding |
| E6.S3 | Kopf-/Fusszeilen konfigurieren | P2 | [ ] Implementiert | headerConfig/footerConfig in StyleTemplate |
| E6.S4 | ODT Export (Beta, Feature-Flag) | P3 | [ ] Implementiert | Feature-Flag-System, LibreOffice headless |

**Gate:** DOCX bei 2-3 MVP-Mustern "pixelstabil" (Listen, Uberschriften, Seitenumbruche).

---

### Epic 7 -- Security, Audit & DSGVO-Basics

| Story-ID | Story | Prio | Status | Verifizierung |
|-----------|-------|------|--------|---------------|
| E7.S0 | Audit-Event-Infrastruktur (append-only, tenant-gescoped) | P0 | [ ] Implementiert | AuditService, Immutable-Tabelle, 30+ Event-Typen |
| E7.S1 | Audit-Logs einsehen (Login, Rollenwechsel, Publish, Export) | P1 | [ ] Implementiert | `GET /api/v1/audit-logs` + Admin-UI |
| E7.S2 | Verschlusselung in transit (TLS) und at rest (DB TDE, SSE) | P1 | [ ] Implementiert | TLS 1.2+, HSTS, SSE-S3 |
| E7.S3 | Vertrage loschen/archivieren | P2 | [ ] Implementiert | Status `archived`, Retention-Konzept |
| E7.S4 | Daten exportieren (Portabilitat) | P2 | [ ] Implementiert | Tenant-Datenexport JSON/CSV |

**Gate:** Auditlog tenant-gescoped, immutable. Loschkonzept dokumentiert.

---

### Epic 8 -- SME Onboarding & In-Product Hilfe

| Story-ID | Story | Prio | Status | Verifizierung |
|-----------|-------|------|--------|---------------|
| E8.S1 | Guided Onboarding (1-2 Min.) mit erstem Beispielvertrag | P2 | [ ] Implementiert | Onboarding-Flow, Seed-Demo-Daten |
| E8.S2 | Kontextuelle Hilfe (Tooltips, kurze Erklarungen) | P2 | [ ] Implementiert | helpText in InterviewFlow |
| E8.S3 | Feedback-Widget | P3 | [ ] Implementiert | Optional fur MVP |

**Gate:** Erster Vertrag in <10 Minuten moglich (Usability-Test).

---

## 2. Quality Gates

### 2.1 PR-Gate (jeder Pull Request -- blocking)

| # | Check | Tool | Schwellenwert | Status |
|---|-------|------|--------------|--------|
| G-01 | ESLint | eslint | 0 Errors | [ ] Grun |
| G-02 | TypeScript | tsc --noEmit | 0 Errors | [ ] Grun |
| G-03 | Unit Tests | Vitest | 100% passed | [ ] Grun |
| G-04 | Coverage | Vitest + istanbul | >= 80% Lines | [ ] Grun |
| G-05 | Build | Vite / tsc | Erfolgreich | [ ] Grun |
| G-06 | Accessibility | axe-core | 0 Violations | [ ] Grun |
| G-07 | Tenant Isolation | Vitest + PostgreSQL | 0 Cross-Tenant Leaks | [ ] Grun |
| G-08 | RLS Coverage | SQL-Check | Alle Tabellen mit RLS | [ ] Grun |
| G-09 | Bundle Size | size-limit | < 200 KB JS gzip (Warning) | [ ] Gepruft |

### 2.2 Main-Gate (Post-Merge -- blocking)

| # | Check | Schwellenwert | Status |
|---|-------|--------------|--------|
| G-10 | Full Test Suite (Unit + Integration + Security) | 100% passed | [ ] Grun |
| G-11 | E2E Tests (Playwright) | 100% passed | [ ] Grun |
| G-12 | Lighthouse Performance | >= 90 Score | [ ] Grun |
| G-13 | Lighthouse Accessibility | >= 90 Score | [ ] Grun |
| G-14 | Dependency Scan | Keine High/Critical CVEs | [ ] Grun |
| G-15 | SBOM generiert | CycloneDX vorhanden | [ ] Grun |

### 2.3 Release-Gate (vor Deployment -- blocking)

| # | Check | Schwellenwert | Status |
|---|-------|--------------|--------|
| G-16 | Alle Main-Gate Checks grun | Prerequisite | [ ] Bestatigt |
| G-17 | Version-Pinning-Validierung | ADR-002 Tests bestanden | [ ] Bestatigt |
| G-18 | Cross-Tenant-Pentest | Kein Cross-Tenant-Zugriff moglich | [ ] Bestanden |
| G-19 | DSGVO-Compliance-Checkliste | Alle Punkte abgearbeitet | [ ] Bestatigt |
| G-20 | Rollback-Plan dokumentiert | Vorhanden + getestet | [ ] Bestatigt |

---

## 3. Security Checklist

### 3.1 Tenant-Isolation (ADR-001)

- [ ] RLS-Policies auf allen 12 tenant-gescoped Tabellen aktiv
- [ ] `FORCE ROW LEVEL SECURITY` auf allen Tabellen
- [ ] Cross-Tenant-Access-Tests in CI grun (T-03, T-05)
- [ ] App-Layer Guards: `tenantId` als Pflichtparameter in allen Repositories
- [ ] Object-Storage-Pfad-Validierung (Tenant-Prefix, kein Path Traversal)
- [ ] Presigned URLs mit 15 Min. Expiry + Tenant-Scope

### 3.2 Authentifizierung & Autorisierung

- [ ] OIDC-Login via Keycloak funktional und getestet
- [ ] JWT-Signatur-Validierung (RS256/ES256, kein HS256)
- [ ] Token-Expiry erzwungen (15 Min. Access, 8 Std. Refresh)
- [ ] Refresh-Token-Rotation aktiviert (One-Time-Use)
- [ ] RBAC serverseitig fur alle Endpoints erzwungen
- [ ] Vier-Augen-Prinzip fur Publish-Workflow (Author != Reviewer)
- [ ] MFA (TOTP) optional konfigurierbar pro Tenant
- [ ] MFA erzwungen fur Platform-Admin
- [ ] Passwort-Policy: 12 Zeichen, Komplexitat, History 5

### 3.3 Security-Headers & Hartung

- [ ] Helmet-Middleware aktiviert (CSP, HSTS, X-Content-Type-Options, X-Frame-Options)
- [ ] CORS auf erlaubte Origins beschrankt
- [ ] CSRF-Schutz (SameSite Cookies)
- [ ] Rate-Limiting aktiv (per Tenant, per User)
- [ ] API-Versionierung v1 Prefix (`/api/v1/...`)

### 3.4 Security-Tests (Threat Model T-01..T-12)

| Threat-ID | Szenario | Testtyp | Status |
|-----------|---------|---------|--------|
| T-01 | JWT mit gefalschtem `tenant_id` -> 401 | Automatisiert | [ ] Grun |
| T-02 | SQL-Injection mit fremder `tenant_id` -> 0 Rows | Automatisiert | [ ] Grun |
| T-03 | API-Endpoint liefert keine Cross-Tenant-Daten | Automatisiert | [ ] Grun |
| T-04 | Export-Worker validiert tenantId aus Job | Automatisiert | [ ] Grun |
| T-05 | Vendor kann Kanzlei-Vertrage nicht lesen | Automatisiert | [ ] Grun |
| T-06 | Abgelaufener JWT -> 401 | Automatisiert | [ ] Grun |
| T-07 | Admin-Zugriffe werden auditiert | Automatisiert | [ ] Grun |
| T-08 | Path Traversal in Object Storage -> 400 | Automatisiert | [ ] Grun |
| T-09 | Alle Tabellen haben RLS enabled | Automatisiert | [ ] Grun |
| T-10 | Error-Responses enthalten keine fremden Entity-IDs | Automatisiert | [ ] Grun |
| T-11 | Kein Tenant-Switch ohne Re-Auth | Automatisiert | [ ] Grun |
| T-12 | Audit-Events: kein UPDATE/DELETE moglich | Automatisiert | [ ] Grun |

### 3.5 Verschlusselung

- [ ] TLS 1.2+ auf allen Verbindungen (Client<->API, API<->DB, API<->Storage)
- [ ] HSTS-Header konfiguriert (max-age=63072000, includeSubDomains, preload)
- [ ] DB Encryption at Rest aktiviert (PostgreSQL TDE)
- [ ] Object Storage SSE aktiviert (SSE-S3 Default, SSE-KMS Enterprise)
- [ ] Keine Secrets in Code/Config-Dateien (Vault/K8s External Secrets)

### 3.6 Dependency Security

- [ ] Dependabot/Snyk in CI aktiv
- [ ] Keine bekannten Critical/High Vulnerabilities
- [ ] SBOM generiert (CycloneDX)
- [ ] Docker-Images auf minimaler Base (distroless/alpine)

---

## 4. Infrastructure Readiness

### 4.1 Kubernetes Prod-Overlay

- [ ] Namespace `servanda-prod` konfiguriert
- [ ] API Deployment: 2+ Replicas, HPA (CPU 70%, max 10 Pods)
- [ ] Export-Worker Deployment: 1+ Replicas, HPA (CPU 60%, max 5 Pods)
- [ ] Frontend Deployment: 1+ Replicas (Nginx)
- [ ] Ingress konfiguriert (`app.servanda.de`, TLS, Rate-Limiting)
- [ ] Resource Requests/Limits gesetzt fur alle Workloads
- [ ] Security Context: `runAsNonRoot`, `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`

### 4.2 TLS & Zertifikate

- [ ] cert-manager installiert
- [ ] Let's Encrypt ClusterIssuer konfiguriert (Staging + Prod)
- [ ] TLS-Secret fur Ingress automatisch erstellt
- [ ] Zertifikat-Rotation automatisiert (90 Tage)

### 4.3 Secrets Management

- [ ] External Secrets Operator installiert (Prod-Overlay)
- [ ] DB-Credentials uber External Secrets synchronisiert
- [ ] S3-Credentials uber External Secrets synchronisiert
- [ ] Keycloak-Secrets uber External Secrets synchronisiert
- [ ] Keine Plaintext-Secrets in Git

### 4.4 Backup & Recovery

- [ ] Backup-CronJob konfiguriert (`k8s/base/backup-cronjob.yaml`)
- [ ] PostgreSQL pg_dump taglich (Full-Backup)
- [ ] WAL-Archiving fur Point-in-Time Recovery (Cloud)
- [ ] Object Storage Replication/Backup konfiguriert
- [ ] Keycloak-DB Backup inkludiert
- [ ] Recovery-Test durchgefuhrt (Restore von Backup verifiziert)
- [ ] RPO < 1 Stunde (Cloud) / < 24 Stunden (On-Prem)
- [ ] RTO < 1 Stunde (Cloud) / < 4 Stunden (On-Prem)

### 4.5 Monitoring & Observability

- [ ] Prometheus installiert und Metriken scrapen aktiv
- [ ] Grafana Dashboards vorhanden (System Health, API Performance, Export Pipeline, Tenant Activity, Database, Security)
- [ ] postgres-exporter aktiv
- [ ] Custom-Metriken: `servanda_http_request_duration_seconds`, `servanda_export_job_duration_seconds`, `servanda_export_queue_depth`
- [ ] Alerting-Regeln konfiguriert:
  - [ ] HighErrorRate (5xx Rate > 1% fur 5 Min.)
  - [ ] APILatencyHigh (P95 > 2s fur 5 Min.)
  - [ ] ExportQueueBacklog (Queue > 50 fur 10 Min.)
  - [ ] ExportFailureRate (> 5% fur 10 Min.)
  - [ ] DatabaseConnectionPoolExhausted (> 90% fur 5 Min.)

### 4.6 Network Policies

- [ ] Default-Deny Egress Policy aktiv
- [ ] API: Zugriff nur auf PostgreSQL (5432), MinIO/S3 (9000), Keycloak (8080), DNS (53)
- [ ] Export-Worker: Zugriff nur auf PostgreSQL (5432), MinIO/S3 (9000), DNS (53) -- KEIN Keycloak
- [ ] Frontend: Kein direkter Backend-Zugriff (nur via Ingress)

### 4.7 On-Prem Overlay (Enterprise)

- [ ] On-Prem Kustomize-Overlay vorhanden (MinIO, LDAP, Static Secrets)
- [ ] Air-Gap Image-Bundle erstellt
- [ ] K3s/RKE2 Installation getestet
- [ ] LDAP/AD Integration in Keycloak getestet
- [ ] DB-per-Tenant Modus getestet (Feature-Flag)

---

## 5. Data Migration & Seeding

### 5.1 Prisma-Schema

- [ ] Schema synchron mit Domain Model v1 (12 Modelle)
- [ ] Alle Migrationen erfolgreich anwendbar (`prisma migrate deploy`)
- [ ] RLS-Migration (00001_enable_rls) vorhanden und getestet
- [ ] Immutability-Trigger fur CompletedContracts vorhanden
- [ ] Init-Container fur automatische Migration im Deployment konfiguriert

### 5.2 Seed-Daten

- [ ] Prisma Seed-Script vorhanden (`prisma/seed.ts`)
- [ ] Demo-Tenant (Kanzlei) mit 3 Nutzern (Admin, Editor, User)
- [ ] Demo-Vendor-Tenant mit Beispiel-Klauseln und Templates
- [ ] 2-3 vollstandige Muster mit Fragen/Rules/Klauseln gepflegt
- [ ] Mindestens 1 Published Template fur E2E-Flow
- [ ] Default StyleTemplate vorhanden (system)

### 5.3 Tenant-Onboarding-Prozess

- [ ] Tenant-Erstellung via API (`POST /api/v1/tenants`) funktional
- [ ] Automatische Keycloak-Group-Erstellung bei Tenant-Anlage
- [ ] Erster Admin-User wird bei Tenant-Erstellung angelegt
- [ ] Einladungs-Email-Flow funktional
- [ ] Default-Settings (Jurisdiktion, Sprache) werden korrekt angewendet

---

## 6. Documentation

### 6.1 API-Dokumentation

- [ ] OpenAPI 3.1 Spezifikation vorhanden und aktuell
- [ ] Alle Endpoints dokumentiert (Identity, Content, Contract, Export, Audit)
- [ ] Authentifizierungs-Flow dokumentiert (OIDC/JWT)
- [ ] Error-Response-Schema dokumentiert (Fehlercodes, Meldungen)
- [ ] API-Versionierung dokumentiert (v1 Prefix)

### 6.2 User Guides (3 Rollen)

- [ ] **Admin Guide:** Tenant-Einstellungen, Nutzerverwaltung, MFA-Konfiguration, Audit-Logs
- [ ] **Editor Guide:** Vertragserstellung, Template-Management, Export, Styles
- [ ] **User Guide:** Vertragserstellung, Interview-Flow, Export

### 6.3 DevOps / Admin Guide

- [ ] Deployment-Anleitung (Cloud + On-Prem)
- [ ] Kustomize-Overlay-Dokumentation (dev/staging/prod/onprem)
- [ ] Monitoring-Dashboard-Beschreibung
- [ ] Backup/Restore-Verfahren dokumentiert
- [ ] Incident-Response-Plan dokumentiert
- [ ] Rollback-Verfahren dokumentiert

### 6.4 Architecture Decision Records

- [ ] ADR-001: Tenant-Isolation (RLS + App-Layer) -- Operationalisiert
- [ ] ADR-002: Version Pinning (ContractInstance) -- Spezifiziert
- [ ] ADR-003: Export-Engine als separater Service -- Accepted
- [ ] ADR-004: ODT via Konvertierung -- Accepted
- [ ] ADR-005: Breaking-Change-Policy -- Formalisiert (Sprint 9+)

---

## 7. Performance

### 7.1 API-Latenz-Ziele

| Metrik | P50 | P95 | P99 | Status |
|--------|-----|-----|-----|--------|
| Contract Creation API | < 100 ms | < 200 ms | < 500 ms | [ ] Gemessen |
| Content API (Clause/Template CRUD) | < 50 ms | < 150 ms | < 300 ms | [ ] Gemessen |
| Interview Flow Load | < 100 ms | < 200 ms | < 500 ms | [ ] Gemessen |
| Export Job Start (Queuing) | < 50 ms | < 100 ms | < 200 ms | [ ] Gemessen |
| Audit Log Query (paginated) | < 100 ms | < 300 ms | < 500 ms | [ ] Gemessen |

### 7.2 Export-Performance

| Metrik | Ziel | Status |
|--------|------|--------|
| DOCX Export (einfach, ~10 Klauseln) | < 5s P95 | [ ] Gemessen |
| DOCX Export (komplex, ~50 Klauseln) | < 15s P95 | [ ] Gemessen |
| ODT Konvertierung (DOCX -> ODT) | < 30s P95 | [ ] Gemessen |
| Export-Queue-Durchsatz | >= 200 Jobs/Stunde | [ ] Verifiziert |

### 7.3 Frontend-Performance

| Metrik | Ziel | Status |
|--------|------|--------|
| Lighthouse Performance Score | >= 90 | [ ] Gemessen |
| Lighthouse Accessibility Score | >= 90 | [ ] Gemessen |
| Lighthouse Best Practices Score | >= 85 | [ ] Gemessen |
| First Contentful Paint (FCP) | < 1.5s | [ ] Gemessen |
| Largest Contentful Paint (LCP) | < 2.5s | [ ] Gemessen |
| Cumulative Layout Shift (CLS) | < 0.1 | [ ] Gemessen |
| JS Bundle Size (gzip) | < 80 KB | [ ] Gemessen |
| CSS Bundle Size (gzip) | < 20 KB | [ ] Gemessen |

### 7.4 Runtime-Performance-Thresholds

| Metrik | Schwellenwert | Status |
|--------|--------------|--------|
| Render 100 Fragen (Interview) | < 50 ms | [ ] Gemessen |
| Render 1000 Fragen (Interview) | < 500 ms | [ ] Gemessen |
| Initial Render (App) | < 150 ms | [ ] Gemessen |
| Rule-Engine Evaluation (50 Rules) | < 10 ms | [ ] Gemessen |

---

## 8. Go/No-Go Kriterien

### 8.1 Blocker-Liste (No-Go bei einem offenen Blocker)

| # | Kategorie | Kriterium | Status |
|---|-----------|-----------|--------|
| B-01 | Security | Cross-Tenant-Datenleck moglich | [ ] Kein Blocker |
| B-02 | Security | RLS-Policy fehlt auf einer Tabelle | [ ] Kein Blocker |
| B-03 | Security | JWT-Manipulation erlaubt Zugriff | [ ] Kein Blocker |
| B-04 | Funktional | E2E-Kern-Flow (Template -> Q&A -> Export) bricht ab | [ ] Kein Blocker |
| B-05 | Funktional | DOCX-Export liefert korrupte Datei | [ ] Kein Blocker |
| B-06 | Funktional | Version-Pinning ist nicht immutable nach Completion | [ ] Kein Blocker |
| B-07 | Funktional | Audit-Events konnen geloscht/verandert werden | [ ] Kein Blocker |
| B-08 | Infrastruktur | Prod-Deployment schlagt fehl | [ ] Kein Blocker |
| B-09 | Infrastruktur | Backup/Restore funktioniert nicht | [ ] Kein Blocker |
| B-10 | Infrastruktur | Monitoring/Alerting nicht funktional | [ ] Kein Blocker |
| B-11 | Performance | API P95-Latenz > 2s | [ ] Kein Blocker |
| B-12 | Performance | Export P95 > 30s | [ ] Kein Blocker |
| B-13 | Compliance | DSGVO-Loschkonzept nicht implementiert | [ ] Kein Blocker |
| B-14 | QA | Security-Tests T-01..T-12 nicht vollstandig grun | [ ] Kein Blocker |
| B-15 | QA | E2E-Tests < 100% passed | [ ] Kein Blocker |

### 8.2 Sign-off-Prozess

**Erforderliche Freigaben (alle mussen erteilt sein):**

| # | Rolle | Prufungsumfang | Sign-off |
|---|-------|---------------|----------|
| 1 | **Architektur (Team 01)** | ADRs eingehalten, Modulgrenzen sauber, BB-001..007 validiert, Breaking-Change-Policy | [ ] Freigegeben durch: _____________ |
| 2 | **Security (Team 02)** | Threat Model T-01..T-12 abgedeckt, Pentest bestanden, RBAC korrekt, MFA funktional | [ ] Freigegeben durch: _____________ |
| 3 | **QA (Team 06)** | Coverage >= 80%, E2E 100%, Lighthouse >= 90, keine Flaky Tests, SBOM vorhanden | [ ] Freigegeben durch: _____________ |
| 4 | **Product Owner** | Alle P0/P1 Stories implementiert, Usability-Test bestanden (< 10 Min erster Vertrag) | [ ] Freigegeben durch: _____________ |
| 5 | **DevOps (Team 07)** | Prod-Overlay ready, Monitoring aktiv, Backup getestet, Rollback-Plan vorhanden | [ ] Freigegeben durch: _____________ |

### 8.3 Rollback-Plan

- [ ] Vorherige Image-Versionen im Container Registry vorhanden
- [ ] Rollback-Verfahren dokumentiert (K8s Rollout Undo)
- [ ] DB-Migration-Rollback getestet (Prisma Transaction-Rollback)
- [ ] Point-in-Time Recovery fur DB verifiziert
- [ ] DNS-Failover-Verfahren dokumentiert (falls CDN/Ingress betroffen)
- [ ] Kommunikationsplan fur Rollback-Szenario vorhanden

### 8.4 Pilot-Kriterien (MVP-Launch)

- [ ] 2-3 Muster vollstandig mit Fragen/Rules/Klauseln gepflegt
- [ ] Gefuhrter Flow von Template-Auswahl bis DOCX-Export funktioniert E2E
- [ ] Tenant-Isolation in CI verifiziert (ADR-001 Tests grun)
- [ ] Version-Pinning verifiziert (ADR-002 Tests grun)
- [ ] Kein Hard Conflict erlaubt Export
- [ ] DOCX "pixelstabil" bei MVP-Mustern
- [ ] Audit-Logs vollstandig und tenant-gescoped
- [ ] Erster Vertrag in < 10 Minuten moglich (Usability-Test)
- [ ] Lighthouse Performance >= 90, Accessibility >= 90

---

## 9. Release-Ablauf

```text
1. Release-Branch erstellen (release/v0.1.0 von main)
2. Release-Gate-Checks durchfuhren (G-16..G-20)
3. Blocker-Liste prufen (B-01..B-15 alle "Kein Blocker")
4. Sign-off einholen (5 Freigaben)
5. Prod-Deployment via CI/CD Pipeline
6. Smoke-Tests auf Prod (Kern-Flow verifizieren)
7. Monitoring verifizieren (Dashboards, Alerts)
8. Release-Tag setzen (v0.1.0)
9. Release-Notes publizieren
10. Pilot-Kunden informieren
```

---

## 10. Post-Release Monitoring (erste 48 Stunden)

| Metrik | Schwellenwert | Aktion bei Uberschreitung |
|--------|--------------|---------------------------|
| Error Rate (5xx) | < 1% | Sofortige Analyse, ggf. Rollback |
| API P95 Latenz | < 2s | Performance-Investigation |
| Export Failure Rate | < 5% | Worker-Analyse, DLQ prufen |
| Login-Fehlerrate | < 2% | Keycloak-Logs prufen |
| Cross-Tenant-Alert | 0 Incidents | Sofortiger Rollback + Security-Review |

---

*Erstellt: 2026-02-11 | Team 01 (Product Architecture) | Sprint 11*
