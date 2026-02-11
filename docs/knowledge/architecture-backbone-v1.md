# Architecture Backbone v1 — Servanda Office

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 01 (Product Architecture)
**Referenzen:** ADR-001, ADR-002, ADR-003, ADR-004, domain-model-v1.md

---

## 1. Systemkontext

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         Externe Akteure                             │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐    │
│  │ Kanzlei-     │  │ Verlag-      │  │ Platform-Admin         │    │
│  │ Nutzer       │  │ Redakteur    │  │ (Systembetrieb)        │    │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬────────────┘    │
│         │                  │                      │                  │
└─────────┼──────────────────┼──────────────────────┼─────────────────┘
          │                  │                      │
          ▼                  ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Servanda Office Platform                          │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     API Gateway / BFF                        │   │
│  └──────────┬──────────────┬──────────────┬────────────────────┘   │
│             │              │              │                          │
│    ┌────────▼──────┐ ┌────▼──────┐ ┌────▼──────────────┐          │
│    │  Platform     │ │  Content  │ │  Contract          │          │
│    │  Services     │ │  Services │ │  Services          │          │
│    └────────┬──────┘ └────┬──────┘ └────┬──────────────┘          │
│             │              │              │                          │
│    ┌────────▼──────────────▼──────────────▼────────────────┐       │
│    │              Shared Infrastructure                     │       │
│    │  ┌──────────┐  ┌───────────┐  ┌───────────────────┐  │       │
│    │  │PostgreSQL│  │  Object   │  │  Message Queue     │  │       │
│    │  │  + RLS   │  │  Storage  │  │  (Export Jobs)     │  │       │
│    │  └──────────┘  └───────────┘  └───────────────────┘  │       │
│    └───────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼ (Phase 2+)
┌─────────────────────┐
│ Externe Systeme      │
│ - Signatur (FP-Design)│
│ - DMS / CRM (API)   │
│ - SIEM               │
└─────────────────────┘
```

---

## 2. Service-Architektur

Das MVP wird als **modularer Monolith** mit klar getrennten Bounded Contexts gebaut.
Jeder Context ist als eigenständiges Modul deploybar, teilt aber initial eine Runtime und Datenbank.

### Service-Schnitt

```text
┌──────────────────────────────────────────────────────────────┐
│                     API Layer (REST)                          │
│  Routes, Auth-Middleware, Tenant-Context, Rate Limiting       │
└──────────┬───────────────────────────────────────────────────┘
           │
     ┌─────┼──────────┬──────────────┬──────────────┐
     │     │          │              │              │
     ▼     ▼          ▼              ▼              ▼
┌────────┐┌────────┐┌────────────┐┌────────────┐┌──────────┐
│Identity││Content ││ Interview  ││ Contract   ││ Export   │
│Module  ││Module  ││ Module     ││ Module     ││ Module   │
│        ││        ││            ││            ││          │
│- Auth  ││- Clause││- Flow Mgmt ││- Instance  ││- Job Mgmt│
│- Users ││- Templ.││- Questions ││- LawFirm   ││- DOCX   │
│- Teams ││- Vers. ││- Conditions││  Templates ││- ODT    │
│- RBAC  ││- Rules ││- Validation││- Search    ││- Styles │
│- Audit ││- Publi.││            ││            ││          │
└───┬────┘└───┬────┘└─────┬──────┘└─────┬──────┘└────┬─────┘
    │         │           │             │             │
    └─────────┴───────────┴──────┬──────┴─────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Data Access Layer     │
                    │   (Repository Pattern)  │
                    │   + Tenant-Scoping      │
                    │   + RLS Enforcement     │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   PostgreSQL + RLS      │
                    │   Object Storage (S3)   │
                    └─────────────────────────┘
```

### Modul-Verantwortlichkeiten

| Modul | Bounded Context | Verantwortung | Owner-Team |
| --- | --- | --- | --- |
| **Identity** | Platform | Auth, Users, Teams, RBAC, Audit | 02 |
| **Content** | Content | Clauses, Templates, Versioning, Rules, Publishing | 03 |
| **Interview** | Content | Flow-Design, Questions, Conditions, Live-Validation | 04 |
| **Contract** | Contract | ContractInstance, LawFirmTemplate, Search | 04 |
| **Export** | Export | ExportJob, DOCX/ODT-Generierung, Styles | 05 |

---

## 3. Datenflüsse

### 3.1 Vertragserstellung (Kern-Flow)

```text
Kanzlei-Nutzer                    System
      │
      │  1. Template auswählen
      │─────────────────────────→  Content Module:
      │                            resolve currentPublishedVersionId
      │                                 │
      │  2. Vertrag initialisieren       │
      │←─────────────────────────  Contract Module:
      │   ContractInstance (draft)  create mit gepinnten Versions
      │   + InterviewFlow geladen  (ADR-002)
      │
      │  3. Fragen beantworten
      │─────────────────────────→  Interview Module:
      │                            validate answers
      │                            evaluate conditions
      │                                 │
      │  4. Live-Validierung             │
      │←─────────────────────────  Contract Module:
      │   validationState +        evaluate Rules gegen
      │   Konflikte/Warnungen      gepinnte ClauseVersions
      │
      │  5. Konflikte lösen
      │─────────────────────────→  Contract Module:
      │   (Alternative wählen)     update selectedSlots
      │                            re-validate
      │
      │  6. Vertrag fertigstellen
      │─────────────────────────→  Contract Module:
      │                            status → completed
      │                            Pins immutable (ADR-002)
      │
      │  7. Export anfordern
      │─────────────────────────→  Export Module:
      │                            ExportJob → Queue (ADR-003)
      │                                 │
      │  8. Download                     │
      │←─────────────────────────  Export Worker:
      │   DOCX (oder ODT Beta)    lädt gepinnte Versionen,
      │                            generiert Dokument,
      │                            speichert in Object Storage
```

### 3.2 Publishing-Flow (Verlag)

```text
Verlag-Redakteur                  System
      │
      │  1. Klausel/Template erstellen
      │─────────────────────────→  Content Module:
      │                            Version (status: draft)
      │
      │  2. Rules definieren
      │─────────────────────────→  Content Module:
      │                            Rules embedded in Version
      │
      │  3. Submit for Review
      │─────────────────────────→  Content Module:
      │                            status → review
      │                            Reviewer wird benachrichtigt
      │
      │  4. Review + Approve
      │─────────────────────────→  Content Module:
      │   (durch Reviewer)         status → approved
      │                            Validierung: Rules vollständig?
      │
      │  5. Publish
      │─────────────────────────→  Content Module:
      │                            status → published
      │                            currentPublishedVersionId aktualisiert
      │                            AuditEvent erzeugt
      │                                 │
      │                            Betroffene Draft-Verträge:
      │                            → "Neuere Version verfügbar" Hinweis
```

---

## 4. Querschnittsthemen (Cross-Cutting Concerns)

### 4.1 Tenant-Isolation (ADR-001)

**Enforcement-Schichten:**

| Schicht | Mechanismus | Verantwortung |
| --- | --- | --- |
| **HTTP** | JWT mit `tenant_id` Claim | API Gateway |
| **Middleware** | `SET LOCAL app.current_tenant_id` auf DB-Connection | Tenant-Context-Middleware |
| **App-Layer** | `tenantId` als Pflichtparameter an Repositories | Service-Layer |
| **DB-Layer** | RLS-Policies auf allen tenant-gescoped Tabellen | PostgreSQL |
| **Storage** | Tenant-Prefix in Object Storage Pfaden | Storage-Adapter |

**Referenz:** [ADR-001 Implementation Spec](adr-001-multi-tenant-isolation.md)

### 4.2 Version-Pinning (ADR-002)

**Kernprinzip:** ContractInstance referenziert exakte, immutable Versionen.

| Lifecycle-Phase | Verhalten |
| --- | --- |
| **Draft** | Pins gesetzt, Upgrade möglich (explizit) |
| **Completed** | Pins immutable (DB-Trigger verhindert Änderung) |
| **Export** | Nur gepinnte Versionen verwendet |

**Referenz:** [ADR-002 Spezifikation](adr-002-version-pinning.md)

### 4.3 Export-Architektur (ADR-003)

```text
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│ Contract │────→│  Export API   │────→│ Message Queue│────→│  Export  │
│ Module   │     │  (Job create) │     │ (Jobs)       │     │  Worker  │
└──────────┘     └──────────────┘     └──────────────┘     └────┬─────┘
                                                                 │
                                                     ┌───────────▼──────┐
                                                     │  Object Storage  │
                                                     │  (DOCX/ODT)     │
                                                     └──────────────────┘
```

- Job-Lifecycle: `queued` → `running` → `done` / `failed`
- Worker isoliert (eigener Prozess/Container, kein direkter DB-Write außer Job-Status)
- ODT: DOCX → LibreOffice headless Konvertierung (ADR-004), als "Beta" markiert

**Referenz:** [ADR-003](adr-003-export-engine-service.md), [ADR-004](adr-004-odt-strategy.md)

### 4.4 Authentifizierung & Autorisierung

```text
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│  Client  │────→│  OIDC/SAML   │────→│  JWT Token   │
│  (SPA)   │     │  Provider    │     │  tenant_id   │
└──────────┘     └──────────────┘     │  user_id     │
                                      │  role        │
                                      └──────┬───────┘
                                             │
                                      ┌──────▼───────┐
                                      │ Auth-Middle-  │
                                      │ ware          │
                                      │ → validate    │
                                      │ → extract ctx │
                                      │ → check RBAC  │
                                      └──────────────┘
```

- **MVP:** OIDC mit lokalem Provider (oder managed, z.B. Keycloak)
- **Enterprise:** SAML/OIDC Federation, SSO
- **MFA:** Optional, konfigurierbar pro Tenant
- **Session:** Stateless (JWT), configurable Timeout

### 4.5 Audit-Trail

Jede state-verändernde Operation erzeugt einen `AuditEvent`:

| Kategorie | Events |
| --- | --- |
| **Identity** | login, logout, invite, role_change |
| **Content** | clause.create, clause.publish, template.publish, template.deprecate |
| **Contract** | contract.create, contract.update, contract.complete, contract.version_upgrade |
| **Export** | export.request, export.complete, export.fail |
| **Admin** | tenant.settings_change |

- Append-only, immutable, tenant-gescoped
- Retention: konfigurierbar (90d Starter, 365d Pro, unbegrenzt Enterprise)

---

## 5. Technologie-Stack (MVP)

| Schicht | Technologie | Begründung |
| --- | --- | --- |
| **Runtime** | Node.js / TypeScript | Typsicherheit, Ecosystem, Team-Kompetenz |
| **API** | REST (OpenAPI 3.1) | Standardisiert, tooling-freundlich |
| **DB** | PostgreSQL 16+ | RLS-Support, JSONB, bewährt für Multi-Tenant |
| **ORM / Query** | Prisma oder TypeORM | Type-safe queries, Migration-Support |
| **Object Storage** | S3-kompatibel (MinIO On-Prem) | Standardprotokoll, Cloud-agnostisch |
| **Queue** | PostgreSQL-basiert (pgboss) | Kein zusätzlicher Service im MVP |
| **Auth** | Keycloak (oder OIDC-kompatibler Provider) | OIDC/SAML, MFA, User-Federation |
| **DOCX-Generierung** | docxtemplater | Template-basiert, bewährt, aktiv maintained |
| **ODT-Konvertierung** | LibreOffice headless (soffice) | Server-side, isoliert |
| **Frontend** | React + TypeScript | Komponentenbasiert, großes Ecosystem |
| **Testing** | Vitest + Playwright | Unit + E2E, schnell |
| **CI/CD** | GitHub Actions | Repository-nah, einfach |
| **Container** | Docker + Kubernetes | Cloud + On-Prem Support |
| **Monitoring** | Prometheus + Grafana | Open-Source, Kubernetes-nativ |
| **Logging** | Structured JSON → OpenSearch | Zentralisiert, durchsuchbar |

---

## 6. Deployment-Architektur

### 6.1 Cloud (Default)

```text
┌─────────────────────────────────────────────────┐
│                 Kubernetes Cluster                │
│                                                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ API Pods   │  │ Export     │  │ Frontend   │ │
│  │ (2+ repl.) │  │ Worker Pod │  │ (Static/   │ │
│  │            │  │ (1+ repl.) │  │  CDN)      │ │
│  └─────┬──────┘  └─────┬──────┘  └────────────┘ │
│        │               │                          │
│  ┌─────▼───────────────▼──────────────────────┐  │
│  │         Internal Network                    │  │
│  └─────┬───────────────┬──────────────────────┘  │
│        │               │                          │
│  ┌─────▼──────┐  ┌─────▼──────┐                  │
│  │ PostgreSQL │  │ S3 Bucket  │                  │
│  │ (Managed)  │  │            │                  │
│  └────────────┘  └────────────┘                  │
│                                                   │
│  ┌────────────┐  ┌────────────┐                  │
│  │ Keycloak   │  │ Monitoring │                  │
│  │ (Auth)     │  │ Stack      │                  │
│  └────────────┘  └────────────┘                  │
└─────────────────────────────────────────────────┘
```

### 6.2 On-Prem (Enterprise)

```text
┌─────────────────────────────────────────────────┐
│            On-Prem Kubernetes / VM               │
│                                                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ API        │  │ Export     │  │ Frontend   │ │
│  │            │  │ Worker +   │  │ (Nginx)    │ │
│  │            │  │ LibreOffice│  │            │ │
│  └─────┬──────┘  └─────┬──────┘  └────────────┘ │
│        │               │                          │
│  ┌─────▼──────┐  ┌─────▼──────┐  ┌────────────┐ │
│  │ PostgreSQL │  │ MinIO      │  │ Keycloak / │ │
│  │ (lokal)   │  │ (lokal)    │  │ LDAP Bridge│ │
│  └────────────┘  └────────────┘  └────────────┘ │
│                                                   │
│  Besonderheiten:                                  │
│  - DB-per-Tenant möglich (ADR-001)               │
│  - BYOK / HSM Integration                        │
│  - Netzwerk-Isolation (Network Policies)         │
│  - Kein externer Netzwerkzugriff erforderlich    │
└─────────────────────────────────────────────────┘
```

---

## 7. Security-Baseline

| Kontrolle | Implementierung | Owner |
| --- | --- | --- |
| **Encryption in Transit** | TLS 1.2+ (TLS 1.3 bevorzugt), HSTS | Team 07 |
| **Encryption at Rest** | PostgreSQL TDE, S3 SSE | Team 07 |
| **Tenant-spezifische Keys** | SSE-KMS, Key-per-Tenant (Enterprise) | Team 02 + 07 |
| **Auth** | OIDC/SAML via Keycloak, JWT | Team 02 |
| **RBAC** | 3 Rollen (Admin/Editor/User), serverseitig erzwungen | Team 02 |
| **Audit** | Immutable AuditEvents, tenant-gescoped | Team 02 |
| **Input Validation** | Schema-Validation (Zod/Joi) an API-Grenze | Alle |
| **SQL Injection** | Parameterized Queries (ORM), keine Raw-SQL-Nutzereingaben | Alle |
| **XSS** | CSP Headers, Output Encoding im Frontend | Team 04 |
| **CSRF** | SameSite Cookies, CSRF-Token | Team 02 |
| **Rate Limiting** | Per-Tenant, Per-User Limits am API Gateway | Team 07 |
| **Dependency Scanning** | Automated (Dependabot/Snyk) in CI | Team 06 + 07 |
| **Secrets Management** | Vault oder K8s Secrets (encrypted), keine Secrets in Code | Team 07 |

---

## 8. Datenhaltung & Storage

### 8.1 PostgreSQL-Schema (Übersicht)

```text
┌─────────────────────────────────────────────────┐
│                  Platform Schema                 │
│  tenants, users, teams, audit_events            │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│                  Content Schema                  │
│  clauses, clause_versions,                       │
│  templates, template_versions,                   │
│  interview_flows                                 │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│                  Contract Schema                 │
│  contract_instances, law_firm_templates          │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│                  Export Schema                    │
│  export_jobs, style_templates                    │
└─────────────────────────────────────────────────┘

Alle Tabellen: tenant_id + RLS (ADR-001)
```

### 8.2 Object Storage Layout

```text
servanda-office-{env}/
  {tenant_id}/
    exports/{export_job_id}.docx
    exports/{export_job_id}.odt
    styles/{style_template_id}.docx
    attachments/{contract_instance_id}/...
  system/
    styles/default.docx
```

---

## 9. Observability

| Dimension | Tool | Scope |
| --- | --- | --- |
| **Metrics** | Prometheus | API-Latenz, DB-Query-Zeiten, Export-Job-Dauer, Queue-Tiefe |
| **Logging** | Structured JSON → OpenSearch | Request-Logs, Error-Logs, Audit-Events |
| **Tracing** | OpenTelemetry | Request-Tracing über Module-Grenzen |
| **Alerting** | Grafana Alerts | Error-Rate >1%, P95-Latenz >2s, Export-Failure-Rate >5% |
| **Dashboards** | Grafana | Tenant-Metriken, System-Health, Export-Pipeline |

**Logging-Konvention:**

```json
{
  "timestamp": "2026-02-10T14:30:00.000Z",
  "level": "info",
  "service": "contract-module",
  "tenantId": "uuid",
  "userId": "uuid",
  "action": "contract.create",
  "contractId": "uuid",
  "duration_ms": 42,
  "message": "Contract created successfully"
}
```

---

## 10. Modul-Kommunikation

### MVP: Synchrone In-Process-Aufrufe

Im modularen Monolith kommunizieren Module über definierte Interfaces (keine HTTP-Calls):

```text
ContractModule
  .createContract(tenantId, templateId)
       │
       ├── ContentModule.resolvePublishedVersions(templateId)
       │   → { templateVersionId, clauseVersionIds[] }
       │
       ├── InterviewModule.loadFlow(templateVersionId)
       │   → { questions[], conditions[] }
       │
       └── ContractRepository.save(contractInstance)
```

**Interface-Kontrakte:** Jedes Modul exponiert ein TypeScript-Interface. Keine direkten DB-Zugriffe über Modulgrenzen.

### Spätere Evolution: Event-basiert

Bei Bedarf (Skalierung, Service-Extraktion) werden synchrone Aufrufe durch Events ersetzt:

- `TemplatePublished` → Contract Module prüft betroffene Drafts
- `ContractCompleted` → Audit Module loggt Event
- `ExportCompleted` → Notification an Nutzer

---

## 11. ADR-Integration (Zusammenfassung)

| ADR | Architektur-Impact | Betroffene Module |
| --- | --- | --- |
| **ADR-001** (Tenancy) | RLS auf allen Tabellen, Tenant-Context-Middleware, App-Layer Guards | Alle |
| **ADR-002** (Pinning) | ContractInstance speichert immutable Versionsreferenzen, DB-Trigger verhindert Änderung nach Completion | Contract, Content, Export |
| **ADR-003** (Export) | Separater Worker-Prozess, Job-Queue (pgboss), Object Storage für Ergebnisse | Export |
| **ADR-004** (ODT) | LibreOffice headless im Export-Worker, isolierte Execution, Beta-Markierung | Export |

---

## 12. Entscheidungs-Log (Architecture Backbone)

| ID | Entscheidung | Begründung |
| --- | --- | --- |
| BB-001 | Modularer Monolith statt Microservices | MVP-Geschwindigkeit, weniger Infrastruktur, spätere Extraktion möglich |
| BB-002 | PostgreSQL-basierte Queue (pgboss) | Kein zusätzlicher Service im MVP, ausreichend für erwartetes Export-Volumen |
| BB-003 | TypeScript Full-Stack | Einheitliche Sprache, geteilte Typen zwischen API und Frontend |
| BB-004 | REST statt GraphQL | Einfacher für MVP, klare Ressourcen-Modellierung, Migration auf GraphQL möglich |
| BB-005 | Keycloak für Identity | Open-Source, OIDC+SAML, Self-Hosted möglich (On-Prem) |
| BB-006 | docxtemplater für DOCX | Template-basiert, aktiv maintained, gute Performance |
| BB-007 | Schema-basierte Module (nicht DB-per-Module) | Shared DB vereinfacht Joins/Queries im MVP, RLS reicht für Isolation |

---

## 13. Risiken & Mitigationen (Architektur)

| Risiko | Impact | Mitigation |
| --- | --- | --- |
| RLS-Performance bei vielen Tenants | Query-Latenz steigt | Index auf `tenant_id`, regelmäßiges `EXPLAIN ANALYZE`, Monitoring |
| Monolith wird zu groß | Deployment-Zyklen langsamer | Klare Modulgrenzen, Interface-Kontrakte, spätere Extraktion vorbereitet |
| pgboss-Queue Limits | Export-Backlog bei Lastspitzen | Monitoring, Worker-Skalierung, Fallback auf Redis/RabbitMQ |
| LibreOffice headless instabil | ODT-Konvertierung fehlerhaft | Isolierter Container, Timeout, Retry, Beta-Markierung |
| Keycloak-Komplexität | Konfigurationsaufwand | Standard-Realm-Template, Terraform/Helm Automation |
