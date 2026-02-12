# Module Boundaries v1 -- Servanda Office

> **Status:** Approved | **Sprint:** 9 | **Owner:** Team 01 (Product Architecture)
> **Letzte Aktualisierung:** 2026-02-11
> **Basis:** Prisma Schema v1, ADR-001 (RLS), ADR-002 (Version Pinning), ADR-003 (Export)

---

## 1. Modulare Architektur

### 1.1 Architektur-Paradigma

Servanda Office ist als **Modularer Monolith** implementiert: Alle Module laufen im selben Node.js-Prozess, werden als Express-Router gemountet und teilen eine einzige Prisma-Client-Instanz. Die Module sind durch klare Bounded Contexts getrennt, kommunizieren aber in-process ueber den gemeinsamen Prisma-Client.

Der Export-Worker laeuft als **separater Prozess** mit eigener PrismaClient-Instanz und laedt Daten direkt aus der Datenbank.

### 1.2 Bounded Contexts (4 Kontexte)

```
+-------------------------------------------------------------------+
|                     Servanda Office API                            |
|                                                                    |
|  +------------------+  +------------------+  +-----------------+   |
|  |    PLATFORM      |  |     CONTENT      |  |    CONTRACT     |   |
|  |                  |  |                  |  |                 |   |
|  |  Identity-Modul  |  |  Content-Modul   |  | Contract-Modul  |   |
|  |  Audit-Service   |  |  Publishing-Gates|  |                 |   |
|  +------------------+  +------------------+  +-----------------+   |
|                                                                    |
|  +------------------+                                              |
|  |     EXPORT       |                                              |
|  |                  |                                              |
|  |  Export-API      |  +------------------+                        |
|  |  Branding-API    |  | Export-Worker    |  (separater Prozess)   |
|  |  DLQ-Management  |  | Data-Loader     |                        |
|  +------------------+  +------------------+                        |
+-------------------------------------------------------------------+
```

| Bounded Context | Module                     | Router-Prefix            | Verantwortliches Team |
|-----------------|----------------------------|--------------------------|-----------------------|
| **Platform**    | Identity                   | `/v1/identity`           | Team 02               |
| **Platform**    | Audit (Cross-Cutting)      | (kein eigener Router)    | Team 02               |
| **Content**     | Content (Clauses/Templates)| `/v1/content`            | Team 03               |
| **Contract**    | Contract Builder           | `/v1/contracts`          | Team 04               |
| **Export**      | Export API + DLQ           | `/v1/exports`            | Team 05               |
| **Export**      | Branding (StyleTemplates)  | `/v1/exports`            | Team 05               |
| **Export**      | Export Worker              | (separater Prozess)      | Team 05               |

---

## 2. Prisma-Tabellen nach Bounded Context

### 2.1 Tabellen-Uebersicht

| DB-Tabelle (Prisma Model) | Bounded Context | Primaerer Owner    |
|----------------------------|-----------------|---------------------|
| `Tenant`                   | Platform        | Identity            |
| `User`                     | Platform        | Identity            |
| `Team`                     | Platform        | Identity            |
| `AuditEvent`               | Platform        | Audit (querschnitt) |
| `Clause`                   | Content         | Content             |
| `ClauseVersion`            | Content         | Content             |
| `Template`                 | Content         | Content             |
| `TemplateVersion`          | Content         | Content             |
| `InterviewFlow`            | Content         | Content             |
| `ContractInstance`         | Contract        | Contract            |
| `LawFirmTemplate`         | Contract        | Contract            |
| `ExportJob`                | Export          | Export              |
| `StyleTemplate`            | Export          | Export/Branding     |

### 2.2 Modul-zu-Tabellen-Matrix (Read/Write)

#### Identity-Modul (`identity/routes.ts`)

| Tabelle        | Read | Write | Bemerkung                              |
|----------------|------|-------|----------------------------------------|
| `User`         | ja   | ja    | CRUD, Invite, Activate, Deactivate, Delete |
| `AuditEvent`   | ja   | --    | Query via `auditService.query()`       |

> Identity schreibt AuditEvents **indirekt** ueber den AuditService (nicht via eigenen DB-Zugriff).

#### Content-Modul (`content/routes.ts`, `publishing-gates.ts`)

| Tabelle            | Read | Write | Bemerkung                                    |
|--------------------|------|-------|----------------------------------------------|
| `Clause`           | ja   | ja    | CRUD + currentPublishedVersionId Update       |
| `ClauseVersion`    | ja   | ja    | Create, Status-Transition, Batch-Content      |
| `Template`         | ja   | ja    | CRUD + currentPublishedVersionId Update       |
| `TemplateVersion`  | ja   | ja    | Create, Status-Transition                     |
| `InterviewFlow`    | --   | --    | Referenziert via FK in TemplateVersion         |
| `Tenant`           | ja   | --    | Catalog-Endpoint: Filter `tenant.type='vendor'` |

> Content greift im Catalog-Endpoint auf `Tenant.type` zu (cross-tenant Read fuer Published Content).

#### Contract-Modul (`contract/routes.ts`)

| Tabelle              | Read | Write | Bemerkung                                      |
|----------------------|------|-------|-------------------------------------------------|
| `ContractInstance`   | ja   | ja    | CRUD, Auto-Save, Complete, Validate             |
| `TemplateVersion`    | ja   | --    | **Cross-Module Read**: Laden bei Contract-Erstellung |
| `Clause`             | ja   | --    | **Cross-Module Read**: Resolve currentPublishedVersionId |
| `ClauseVersion`      | ja   | --    | **Cross-Module Read**: Laden fuer Regel-Validierung |

> Contract liest Content-Tabellen (`TemplateVersion`, `Clause`, `ClauseVersion`) fuer Version-Pinning und Regel-Validierung. Dies ist ein **bewusst erlaubter** Cross-Module-Zugriff (ADR-002).

#### Export-API (`export/routes.ts`, `dlq-routes.ts`, `branding-routes.ts`)

| Tabelle              | Read | Write | Bemerkung                                          |
|----------------------|------|-------|-----------------------------------------------------|
| `ExportJob`          | ja   | ja    | Create, Status-Abfrage, DLQ Retry/Archive, Stats   |
| `ContractInstance`   | ja   | --    | **Cross-Module Read**: Existenz-Check bei Job-Erstellung |
| `StyleTemplate`      | ja   | ja    | CRUD (Branding), Referenz-Check bei Delete          |

#### Export-Worker (`export-worker/data/data-loader.ts`, `handlers/export-handler.ts`)

| Tabelle              | Read | Write | Bemerkung                                           |
|----------------------|------|-------|------------------------------------------------------|
| `ContractInstance`   | ja   | --    | **Cross-Module Read**: Antworten, Slots, Pinned IDs |
| `TemplateVersion`    | ja   | --    | **Cross-Module Read**: Structure (Sections/Slots)   |
| `ClauseVersion`      | ja   | --    | **Cross-Module Read**: Content der gepinnten Versionen |
| `StyleTemplate`      | ja   | --    | StyleTemplate-Pfad fuer Branding                    |
| `ExportJob`          | --   | ja    | Status-Update nach Rendering (done/failed)          |

#### Audit-Service (`services/audit.service.ts`)

| Tabelle        | Read | Write | Bemerkung                                        |
|----------------|------|-------|---------------------------------------------------|
| `AuditEvent`   | ja   | ja    | Append-Only Log + Query, Fallback-Queue mit Retry |

> AuditService ist ein **Cross-Cutting Concern** -- alle Module rufen `auditService.log()` auf, nur Identity exponiert `auditService.query()` via `/audit-logs`.

---

## 3. Erlaubte Cross-Module-Zugriffe

Die folgenden Cross-Module-Zugriffe sind architektonisch genehmigt und dokumentiert:

### 3.1 Contract --> Content (Version-Pinning)

```
Contract-Modul                    Content-Tabellen
+---------------------+          +--------------------+
| POST /contracts     | -------> | TemplateVersion    |  (Read: Structure laden)
|                     | -------> | Clause             |  (Read: currentPublishedVersionId)
+---------------------+          +--------------------+
| POST /:id/validate  | -------> | ClauseVersion      |  (Read: Rules laden)
+---------------------+          +--------------------+
```

**Begruendung:** ADR-002 (Version Pinning) erfordert, dass ContractInstance beim Erstellen die aktuell publizierten ClauseVersions einfriert. Bei Validierung muessen die Regeln der gepinnten Versionen geladen werden.

**Art des Zugriffs:** Prisma Read-Only (kein Write auf Content-Tabellen).

### 3.2 Export --> Contract + Content (Daten-Aggregation)

```
Export-Worker                     Contract-Tabelle        Content-Tabellen
+---------------------+          +------------------+    +--------------------+
| loadExportData()    | -------> | ContractInstance  |    | TemplateVersion    |
|                     | -------> |                  | -> | ClauseVersion      |
|                     |          +------------------+    | StyleTemplate      |
+---------------------+                                  +--------------------+
```

**Begruendung:** ADR-003 (Export) definiert den Export als Aggregation von Contract-Daten (Antworten, Slots) plus Content-Daten (Template-Structure, Klausel-Inhalte). Der Data-Loader laeuft im separaten Worker-Prozess und liest alle Daten in einem einzigen Durchlauf.

**Art des Zugriffs:** Prisma Read-Only (kein Write auf Contract/Content-Tabellen). Der Worker schreibt nur `ExportJob.status`.

### 3.3 Export-API --> Contract (Existenz-Validierung)

```
Export-API                        Contract-Tabelle
+---------------------+          +--------------------+
| POST /exports       | -------> | ContractInstance    |  (Read: Existenz-Check)
+---------------------+          +--------------------+
```

**Begruendung:** Vor dem Erstellen eines ExportJobs wird validiert, dass die ContractInstance existiert und zum Tenant gehoert.

**Art des Zugriffs:** Prisma Read-Only.

### 3.4 Audit --> Alle Module (Cross-Cutting)

```
Alle Module                       Audit-Service            Platform-Tabelle
+---------------------+          +------------------+     +--------------------+
| Content-Modul       | -------> |                  |     |                    |
| Contract-Modul      | -------> | auditService     | --> | AuditEvent         |
| Export-Modul        | -------> |   .log()         |     |   (append-only)    |
| Identity-Modul      | -------> |                  |     |                    |
+---------------------+          +------------------+     +--------------------+
```

**Begruendung:** Audit-Logging ist ein Compliance-Requirement (DSGVO, Revision). Der AuditService ist als Singleton-Instanz implementiert, wird von allen Modulen importiert und schreibt ausschliesslich in die `AuditEvent`-Tabelle.

**Eigenschaften:**
- **Append-Only:** Keine Updates, keine Deletes
- **Fehler-Isolation:** Audit-Fehler blockieren nie die Haupt-Operation
- **Fallback-Queue:** In-Memory-Buffer (max 1000 Events, 30s Flush-Intervall)

### 3.5 Content --> Platform (Catalog)

```
Content-Modul                     Platform-Tabelle
+---------------------+          +--------------------+
| GET /catalog/       | -------> | Tenant             |  (Read: tenant.type = 'vendor')
|     templates       |          |                    |
+---------------------+          +--------------------+
```

**Begruendung:** Der Published-Catalog zeigt Templates von Vendor-Tenants an. Dafuer muss der Content-Modul den Tenant-Typ pruefen.

**Art des Zugriffs:** Prisma Read-Only (Prisma-Include/Where auf Tenant-Relation).

### 3.6 Export Branding --> Export (Referenz-Integritaet)

```
Branding-Routes                   Export-Tabelle
+---------------------+          +--------------------+
| DELETE /style-      | -------> | ExportJob          |  (Read: Count referenzierender Jobs)
|   templates/:id     |          |                    |
+---------------------+          +--------------------+
```

**Begruendung:** Vor dem Loeschen eines StyleTemplates wird geprueft, ob ExportJobs dieses referenzieren.

---

## 4. Verbotene Zugriffe (Anti-Patterns)

Die folgenden Cross-Module-Zugriffe sind **ausdruecklich verboten** und muessen in Code-Reviews durchgesetzt werden:

### 4.1 Content --> Contract

```
VERBOTEN:
Content-Modul  -X->  ContractInstance / LawFirmTemplate
```

**Regel:** Content-Module (Clauses, Templates, InterviewFlows) duerfen **niemals** auf Contract-Tabellen zugreifen. Content ist unabhaengig von konkreten Vertraegen -- es stellt den Baukasten bereit, nicht die Instanzen.

**Durchsetzung:** Code-Review, Lint-Rule (geplant Sprint 10).

### 4.2 Content --> Export

```
VERBOTEN:
Content-Modul  -X->  ExportJob / StyleTemplate
```

**Regel:** Content hat keine Kenntnis vom Export-Prozess. Templates/Klauseln wissen nicht, ob sie exportiert werden.

### 4.3 Identity --> Content / Contract / Export (Fachliche Tabellen)

```
VERBOTEN:
Identity-Modul  -X->  Clause / Template / ContractInstance / ExportJob
```

**Regel:** Identity verwaltet Users, Teams und Audit-Logs. Es greift **nicht** auf fachliche Tabellen zu. Identity kennt nur `User`, `Team` und `AuditEvent`.

**Ausnahme:** `User`-Tabelle wird von anderen Modulen ueber FK-Relationen referenziert (z.B. `ClauseVersion.authorId`, `ContractInstance.creatorId`), aber die Module greifen auf Users nur via Prisma-Includes zu, nicht via Identity-Modul-Logik.

### 4.4 Contract --> Export

```
VERBOTEN:
Contract-Modul  -X->  ExportJob / StyleTemplate
```

**Regel:** Contract weiss nicht, ob ein Export laeuft. Der Export-Prozess ist ein separater Downstream-Consumer.

### 4.5 Zusammenfassung der Zugriffsmatrix

| Schreiber/Leser | Identity | Content | Contract | Export | Audit |
|-----------------|----------|---------|----------|--------|-------|
| **Identity**    | R/W      | --      | --       | --     | R*    |
| **Content**     | R**      | R/W     | --       | --     | W*    |
| **Contract**    | --       | R       | R/W      | --     | W*    |
| **Export API**   | --       | --      | R        | R/W    | W*    |
| **Export Worker**| --       | R       | R        | W***   | --    |

Legende:
- `R/W` = Read + Write auf eigene Tabellen
- `R` = Erlaubter Cross-Module Read
- `W*` = Schreibt indirekt via AuditService
- `R*` = Liest via AuditService.query()
- `R**` = Nur Tenant.type im Catalog-Endpoint
- `W***` = Nur ExportJob.status Update
- `--` = Kein Zugriff (verboten)

---

## 5. Cross-Module-Kommunikation

### 5.1 Aktueller Zustand: Direct Prisma Import (In-Process)

```
┌──────────────────────────────────────────┐
│              API-Prozess                 │
│                                          │
│  content/routes.ts                       │
│       │                                  │
│       ├── import { prisma } from db      │
│       ├── prisma.clause.create(...)      │  (eigene Tabellen)
│       └── prisma.tenant.findMany(...)    │  (Cross-Module Read)
│                                          │
│  contract/routes.ts                      │
│       │                                  │
│       ├── import { prisma } from db      │
│       ├── prisma.contractInstance.create  │  (eigene Tabellen)
│       ├── prisma.templateVersion.find... │  (Cross-Module Read)
│       └── prisma.clauseVersion.findMany  │  (Cross-Module Read)
│                                          │
│  Shared: auditService.log() --> prisma   │
└──────────────────────────────────────────┘
```

**Merkmale:**
- Alle Module importieren denselben `prisma`-Client aus `shared/db`
- Cross-Module-Zugriffe sind **direkte Prisma-Queries** (kein Service-Layer-Indirektion)
- RLS-Kontext wird pro Transaction via `setTenantContext(tx, tenantId)` gesetzt
- Der Export-Worker hat eine **eigene PrismaClient-Instanz** (separater Prozess)

### 5.2 Zukunft: Event-basierte Kommunikation (Phase 2+)

Geplante Entkopplung fuer spaetere Phasen:

```
┌──────────────┐     Domain Events     ┌──────────────────┐
│   Content    │ ─── clause.published ──> │   Contract       │
│              │ ─── template.published ─> │   (Invalidation) │
└──────────────┘                         └──────────────────┘
                                               │
┌──────────────┐     Domain Events     ┌──────────────────┐
│   Contract   │ ─── contract.completed ─> │   Export         │
│              │                           │   (Auto-Queue)   │
└──────────────┘                           └──────────────────┘
                                               │
┌──────────────┐     Domain Events     ┌──────────────────┐
│   Alle       │ ─── *.action ──────────> │   Audit          │
│   Module     │                          │   (Event-Log)    │
└──────────────┘                          └──────────────────┘
```

**Geplante Events:**
| Event                    | Producer | Consumer(s)          | Zweck                                |
|--------------------------|----------|----------------------|--------------------------------------|
| `clause.published`       | Content  | Contract (optional)  | Cache-Invalidierung fuer Validierung |
| `template.published`     | Content  | Contract (optional)  | Neue Template-Versionen signalisieren|
| `contract.completed`     | Contract | Export (optional)     | Auto-Export-Trigger                  |
| `export.completed`       | Export   | Notification         | User-Benachrichtigung                |
| `user.invited`           | Identity | Notification         | Einladungs-E-Mail                    |

**Voraussetzungen fuer Event-Migration:**
- Event-Bus-Infrastruktur (pgboss Events oder Redis Streams)
- Idempotente Consumer
- Eventual-Consistency-Handling im UI

---

## 6. Datenfluss-Diagramme

### 6.1 Kern-Flow: Template --> Interview --> Contract --> Export

```
                        CONTENT CONTEXT                          CONTRACT CONTEXT                    EXPORT CONTEXT
                 ┌──────────────────────────┐            ┌────────────────────────┐          ┌──────────────────────┐
                 │                          │            │                        │          │                      │
  Editor         │  1. Clause erstellen     │            │                        │          │                      │
  ─────────────> │     (Clause + Versions)  │            │                        │          │                      │
                 │          │                │            │                        │          │                      │
                 │          v                │            │                        │          │                      │
                 │  2. Template erstellen    │            │                        │          │                      │
                 │     (Structure + Slots)   │            │                        │          │                      │
                 │          │                │            │                        │          │                      │
                 │          v                │            │                        │          │                      │
                 │  3. Publish               │            │                        │          │                      │
                 │     (draft->review->      │            │                        │          │                      │
                 │      approved->published) │            │                        │          │                      │
                 │                          │            │                        │          │                      │
                 └──────────┬───────────────┘            │                        │          │                      │
                            │                            │                        │          │                      │
                            │ Published Template +       │                        │          │                      │
                            │ ClauseVersions             │                        │          │                      │
                            │                            │                        │          │                      │
  Anwalt/User               v                            │                        │          │                      │
  ─────────────────────────────────────────────────────> │  4. Contract erstellen │          │                      │
                                                         │     pinnt Versionen    │          │                      │
                            Cross-Module Read:           │     (ADR-002)          │          │                      │
                            TemplateVersion.structure     │          │             │          │                      │
                            Clause.currentPublishedVer.  │          v             │          │                      │
                                                         │  5. Interview          │          │                      │
                                                         │     Q&A ausfuellen    │          │                      │
                                                         │     (answers + slots)  │          │                      │
                                                         │          │             │          │                      │
                                                         │          v             │          │                      │
                            Cross-Module Read:           │  6. Validierung        │          │                      │
                            ClauseVersion.rules          │     (Konfliktregeln)   │          │                      │
                                                         │          │             │          │                      │
                                                         │          v             │          │                      │
                                                         │  7. Complete           │          │                      │
                                                         │     (immutable pin)    │          │                      │
                                                         │                        │          │                      │
                                                         └────────┬───────────────┘          │                      │
                                                                  │                          │                      │
                                                                  │ contractInstanceId       │                      │
                                                                  │                          │                      │
  Anwalt/User                                                     v                          │                      │
  ──────────────────────────────────────────────────────────────────────────────────────────> │  8. Export-Job       │
                                                                                             │     erstellen        │
                                                                  Cross-Module Read:         │       │              │
                                                                  ContractInstance           │       v              │
                                                                  (Existenz-Check)           │  9. Worker           │
                                                                                             │     pickt Job auf    │
                                                                                             │       │              │
                                                                  Cross-Module Reads:        │       v              │
                                                                  ContractInstance.answers    │  10. Data-Loader     │
                                                                  TemplateVersion.structure   │      laed alles      │
                                                                  ClauseVersion.content       │       │              │
                                                                  StyleTemplate.templateFile  │       v              │
                                                                                             │  11. DOCX Rendering  │
                                                                                             │       │              │
                                                                                             │       v              │
                                                                                             │  12. S3 Upload       │
                                                                                             │       │              │
                                                                                             │       v              │
                                                                                             │  13. Status = done   │
                                                                                             │                      │
                                                                                             └──────────────────────┘
```

### 6.2 Version-Pinning-Fluss (ADR-002)

```
POST /v1/contracts
        │
        v
┌─── Contract-Modul ────────────────────────────────────────────────────────┐
│                                                                           │
│  1. templateVersion = tx.templateVersion.findUnique(templateVersionId)    │
│     ─────────────> Content-Tabelle: template_versions (Cross-Module Read) │
│                                                                           │
│  2. clauseIds = templateVersion.structure.flatMap(slots.clauseId)         │
│                                                                           │
│  3. clauses = tx.clause.findMany({ id: { in: clauseIds } })              │
│     ─────────────> Content-Tabelle: clauses (Cross-Module Read)           │
│                                                                           │
│  4. clauseVersionIds = clauses.map(c => c.currentPublishedVersionId)     │
│                                                                           │
│  5. tx.contractInstance.create({                                          │
│       templateVersionId,      // <-- Pinned                              │
│       clauseVersionIds,       // <-- Pinned                              │
│     })                                                                    │
│     ─────────────> Contract-Tabelle: contract_instances (eigene Tabelle)  │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Audit-Event-Fluss

```
  Jeder API-Handler
        │
        v
  await auditService.log(ctx, { action, objectType, objectId, details })
        │
        ├── Erfolg ──> prisma.auditEvent.create(...)
        │               ─────────────> audit_events Tabelle
        │
        └── Fehler ──> fallbackQueue.push(event)
                              │
                              v  (alle 30s)
                        flushQueue() ──> prisma.auditEvent.create(...)
                              │
                              └── Fehler ──> re-queue (max 1000)
```

---

## 7. RLS-Kontext und Tenant-Isolation

Jeder DB-Zugriff -- egal ob eigene oder Cross-Module-Tabelle -- laeuft innerhalb einer Prisma-Transaction mit gesetztem RLS-Kontext:

```typescript
await prisma.$transaction(async (tx) => {
  await setTenantContext(tx, ctx.tenantId);  // SET LOCAL app.current_tenant_id = '...'
  // ... alle Queries hier sind tenant-isoliert
});
```

**Ausnahme:** Der Export-Worker setzt RLS manuell via `$executeRawUnsafe()`:
```typescript
await prisma.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
```

**Cross-Tenant-Ausnahme:** Der Catalog-Endpoint (`GET /catalog/templates`) liest Templates von Vendor-Tenants. Dies ist durch die RLS-Policy fuer Published Content abgedeckt.

---

## 8. Enforcement-Strategie

### 8.1 Aktuell (Sprint 9)

| Massnahme                | Status        | Beschreibung                                          |
|--------------------------|---------------|-------------------------------------------------------|
| Code-Review              | aktiv         | PR-Reviews pruefen Cross-Module-Zugriffe              |
| Diese Dokumentation      | aktiv         | Referenz fuer erlaubte/verbotene Zugriffe             |
| Service-Interface-Typen  | aktiv         | `packages/shared/src/services.ts` definiert Contracts |

### 8.2 Geplant (Sprint 10+)

| Massnahme                     | Prioritaet | Beschreibung                                          |
|-------------------------------|-----------|-------------------------------------------------------|
| ESLint Import-Boundaries      | hoch      | `eslint-plugin-boundaries` mit Modul-Zonen             |
| ArchUnit-artige Tests         | mittel    | Tests die Prisma-Model-Imports pro Modul validieren   |
| Module-Facade-Pattern         | niedrig   | Service-Layer zwischen Modulen statt Direct-Prisma    |

### 8.3 Beispiel fuer geplante ESLint-Regel

```javascript
// eslint.config.mjs (geplant)
{
  rules: {
    'boundaries/element-types': ['error', {
      default: 'disallow',
      rules: [
        // Contract darf Content-Tabellen lesen
        { from: 'contract', allow: ['content'], importKind: 'value' },
        // Export darf Contract + Content lesen
        { from: 'export', allow: ['contract', 'content'], importKind: 'value' },
        // Audit ist ueberall erlaubt
        { from: '*', allow: ['audit'], importKind: 'value' },
      ],
    }],
  },
}
```

---

## 9. Entscheidungslog

| Datum      | Entscheidung                                             | Begruendung                                    |
|------------|----------------------------------------------------------|-------------------------------------------------|
| Sprint 4   | Shared Prisma Client statt Module-eigene DB-Connections  | Einfachheit, Performance, Transaction-Sharing   |
| Sprint 5   | Direct Prisma Import fuer Cross-Module Reads             | Pragmatisch; Event-basiert ist Overengineering fuer MVP |
| Sprint 5   | AuditService als Singleton, nicht als Middleware          | Flexibilitaet: Module loggen an verschiedenen Stellen |
| Sprint 5   | Export-Worker als separater Prozess                       | Isolation: CPU-intensive Rendering blockiert nicht API |
| Sprint 7   | Publishing-Gates im Content-Modul, nicht als Middleware   | Domain-Logik gehoert zum Owner-Modul            |
| Sprint 9   | Module-Boundaries-Dokumentation formalisiert              | Vorbereitung fuer ESLint-Enforcement             |

---

## 10. Referenzen

- [ADR-001: Multi-Tenant Isolation](adr-001-multi-tenant-isolation.md) -- RLS-Strategie
- [ADR-002: Version Pinning](adr-002-version-pinning.md) -- Immutable Versions, Pinning bei Contract
- [Domain Model v1](domain-model-v1.md) -- Entity-Beziehungen
- [Architecture Backbone v1](architecture-backbone-v1.md) -- System-Architektur
- [Module Service Interfaces](../../packages/shared/src/services.ts) -- TypeScript-Contracts
- [Prisma Schema](../../apps/api/prisma/schema.prisma) -- Datenbank-Schema
