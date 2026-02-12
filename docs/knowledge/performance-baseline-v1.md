# API Performance-Baseline v1 — Servanda Office

**Status:** Final Draft
**Datum:** 2026-02-11
**Owner:** Team 01 (Product Architecture)
**Betroffene Teams:** Alle (01-07)
**Referenzen:** a11y-performance-baseline-v1.md, architecture-backbone-v1.md, deployment-blueprint-v1.md, docx-export-spec-v1.md, ADR-003

---

## 1. Übersicht

Dieses Dokument definiert die API-Performance-Baselines und Messgrößen für die Servanda Office Plattform. Es ergänzt die Frontend-Performance-Ziele aus `a11y-performance-baseline-v1.md` um detaillierte Backend-Latenz-Ziele, Datenbank-Performance-Erwartungen, Export-Pipeline-Metriken, Concurrent-Load-Ziele sowie Monitoring- und Alerting-Spezifikationen.

**Scope:** Alle 4 API-Module (Identity, Content, Contract, Export) mit insgesamt 38+ Endpoints auf dem `/api/v1/` Prefix. PostgreSQL mit RLS als Datenbankschicht. Export-Worker mit pgboss Queue.

---

## 2. Endpoint-Latenz-Ziele (nach Kategorie)

Alle Zeiten gemessen am API-Server (ohne Netzwerk-Latenz zum Client). Messung über `http_request_duration_seconds` Histogram.

### 2.1 Übersichtstabelle

| Kategorie | Beispiel-Endpoints | P50 | P95 | P99 |
|---|---|---|---|---|
| **Read (Simple)** | `GET /health`, `GET /identity/me`, `GET /identity/users/:id` | <10ms | <50ms | <100ms |
| **Read (List)** | `GET /identity/users`, `GET /content/clauses`, `GET /contracts`, `GET /content/templates` | <30ms | <100ms | <200ms |
| **Read (Complex)** | `GET /content/catalog/templates`, `POST /content/clauses/batch-content`, `GET /identity/audit-logs` | <50ms | <200ms | <500ms |
| **Read (Review)** | `GET /content/clauses/:id/versions/:vid/reviews`, `GET /content/clauses/:id/versions/:vid/publishing-gates` | <30ms | <100ms | <200ms |
| **Read (Changelog)** | `GET /content/clauses/:id/changelog`, `GET /content/clauses/:id/versions/:vid/changelog` | <30ms | <100ms | <200ms |
| **Write (Simple)** | `PATCH /contracts/:id` (Auto-Save), `PATCH /identity/users/:id` | <30ms | <100ms | <200ms |
| **Write (Complex)** | `POST /contracts` (Create + Pin), `POST /content/clauses/:id/versions` (Version erstellen) | <100ms | <300ms | <500ms |
| **Write (Status)** | `PATCH /content/clauses/:id/versions/:vid/status` (inkl. Publishing-Gates), `POST /contracts/:id/complete` | <100ms | <300ms | <500ms |
| **Write (Review)** | `POST /content/clauses/:id/versions/:vid/approve`, `/reject`, `/request-changes`, `/assign-reviewer` | <50ms | <150ms | <300ms |
| **Write (Identity)** | `POST /identity/users/invite` (inkl. Keycloak-Sync), `POST /identity/users/:id/activate` | <100ms | <300ms | <500ms |
| **Validation** | `POST /contracts/:id/validate` (Rule-Engine über gepinnte Klauseln) | <50ms | <200ms | <500ms |
| **Export (Trigger)** | `POST /export-jobs` (DB + pgboss enqueue) | <50ms | <100ms | <200ms |
| **Export (E2E)** | Job-Start bis Download-Ready (Worker-Pipeline) | <5s | <10s | <15s |
| **DLQ Management** | `GET /export-jobs/failed`, `GET /export-jobs/stats`, `POST /export-jobs/:id/retry` | <30ms | <100ms | <200ms |
| **Branding CRUD** | `POST /export/style-templates`, `PATCH /export/style-templates/:id` | <30ms | <100ms | <200ms |

### 2.2 Vollständige Endpoint-Zuordnung

#### Identity Module (9 Endpoints, Prefix: `/api/v1/identity`)

| Endpoint | Methode | Kategorie | P50 | P95 | P99 |
|---|---|---|---|---|---|
| `/me` | GET | Read (Simple) | <10ms | <50ms | <100ms |
| `/users/:id` | GET | Read (Simple) | <10ms | <50ms | <100ms |
| `/users` | GET | Read (List) | <30ms | <100ms | <200ms |
| `/audit-logs` | GET | Read (Complex) | <50ms | <200ms | <500ms |
| `/users/invite` | POST | Write (Identity) | <100ms | <300ms | <500ms |
| `/users/:id` | PATCH | Write (Simple) | <30ms | <100ms | <200ms |
| `/users/:id/activate` | POST | Write (Identity) | <100ms | <300ms | <500ms |
| `/users/:id/deactivate` | POST | Write (Identity) | <100ms | <300ms | <500ms |
| `/users/:id` | DELETE | Write (Identity) | <100ms | <300ms | <500ms |

> **Hinweis:** Write-Endpoints im Identity-Modul beinhalten optionale Keycloak Admin API Synchronisation (fire-and-forget). Die Keycloak-Latenz ist nicht in den Zielwerten enthalten, da sie asynchron und non-blocking ist.

#### Content Module (16+ Endpoints, Prefix: `/api/v1/content`)

| Endpoint | Methode | Kategorie | P50 | P95 | P99 |
|---|---|---|---|---|---|
| `/clauses` | GET | Read (List) | <30ms | <100ms | <200ms |
| `/clauses/:id` | GET | Read (Simple) | <10ms | <50ms | <100ms |
| `/templates` | GET | Read (List) | <30ms | <100ms | <200ms |
| `/templates/:id` | GET | Read (Simple) | <10ms | <50ms | <100ms |
| `/catalog/templates` | GET | Read (Complex) | <50ms | <200ms | <500ms |
| `/clauses/batch-content` | POST | Read (Complex) | <50ms | <200ms | <500ms |
| `/clauses/:id/versions/:vid/publishing-gates` | GET | Read (Review) | <30ms | <100ms | <200ms |
| `/templates/:id/versions/:vid/publishing-gates` | GET | Read (Review) | <30ms | <100ms | <200ms |
| `/clauses/:id/versions/:vid/reviews` | GET | Read (Review) | <30ms | <100ms | <200ms |
| `/templates/:id/versions/:vid/reviews` | GET | Read (Review) | <30ms | <100ms | <200ms |
| `/clauses/:id/changelog` | GET | Read (Changelog) | <30ms | <100ms | <200ms |
| `/clauses/:id/versions/:vid/changelog` | GET | Read (Changelog) | <30ms | <100ms | <200ms |
| `/clauses` | POST | Write (Complex) | <100ms | <300ms | <500ms |
| `/clauses/:id/versions` | POST | Write (Complex) | <100ms | <300ms | <500ms |
| `/clauses/:id/versions/:vid/status` | PATCH | Write (Status) | <100ms | <300ms | <500ms |
| `/templates` | POST | Write (Complex) | <100ms | <300ms | <500ms |
| `/templates/:id/versions` | POST | Write (Complex) | <100ms | <300ms | <500ms |
| `/templates/:id/versions/:vid/status` | PATCH | Write (Status) | <100ms | <300ms | <500ms |
| `/clauses/:id/versions/:vid/assign-reviewer` | POST | Write (Review) | <50ms | <150ms | <300ms |
| `/clauses/:id/versions/:vid/approve` | POST | Write (Review) | <50ms | <150ms | <300ms |
| `/clauses/:id/versions/:vid/reject` | POST | Write (Review) | <50ms | <150ms | <300ms |
| `/clauses/:id/versions/:vid/request-changes` | POST | Write (Review) | <50ms | <150ms | <300ms |
| `/clauses/:id/versions/:vid/changelog` | POST | Write (Simple) | <30ms | <100ms | <200ms |
| (Template-Review-Endpoints analog) | POST | Write (Review) | <50ms | <150ms | <300ms |

#### Contract Module (6 Endpoints, Prefix: `/api/v1/contracts`)

| Endpoint | Methode | Kategorie | P50 | P95 | P99 |
|---|---|---|---|---|---|
| `/` | GET | Read (List) | <30ms | <100ms | <200ms |
| `/:id` | GET | Read (Simple) | <10ms | <50ms | <100ms |
| `/` | POST | Write (Complex) | <100ms | <300ms | <500ms |
| `/:id` | PATCH | Write (Simple) | <30ms | <100ms | <200ms |
| `/:id/complete` | POST | Write (Status) | <100ms | <300ms | <500ms |
| `/:id/validate` | POST | Validation | <50ms | <200ms | <500ms |

#### Export Module (12 Endpoints, Prefix: `/api/v1/export-jobs` + `/api/v1/export`)

| Endpoint | Methode | Kategorie | P50 | P95 | P99 |
|---|---|---|---|---|---|
| `/export-jobs` | POST | Export (Trigger) | <50ms | <100ms | <200ms |
| `/export-jobs/:id` | GET | Read (Simple) | <10ms | <50ms | <100ms |
| `/export-jobs/:id/download` | GET | Read (Simple) | <20ms | <80ms | <150ms |
| `/export-jobs/failed` | GET | DLQ Management | <30ms | <100ms | <200ms |
| `/export-jobs/stats` | GET | DLQ Management | <30ms | <100ms | <200ms |
| `/export-jobs/:id/retry` | POST | DLQ Management | <50ms | <150ms | <300ms |
| `/export-jobs/:id/archive` | POST | DLQ Management | <30ms | <100ms | <200ms |
| `/export/style-templates` | POST | Branding CRUD | <30ms | <100ms | <200ms |
| `/export/style-templates` | GET | Read (List) | <30ms | <100ms | <200ms |
| `/export/style-templates/:id` | GET | Read (Simple) | <10ms | <50ms | <100ms |
| `/export/style-templates/:id` | PATCH | Branding CRUD | <30ms | <100ms | <200ms |
| `/export/style-templates/:id` | DELETE | Branding CRUD | <30ms | <100ms | <200ms |

#### Health (1 Endpoint, no Auth)

| Endpoint | Methode | Kategorie | P50 | P95 | P99 |
|---|---|---|---|---|---|
| `/api/v1/health` | GET | Read (Simple) | <10ms | <50ms | <100ms |

---

## 3. Datenbank-Performance

Alle Queries laufen über Prisma mit RLS (`SET LOCAL app.current_tenant_id`). Zeiten gemessen über `db_query_duration_seconds` Histogram.

### 3.1 Query-Latenz-Ziele

| Query-Typ | Beispiel | Ziel (P50) | Grenzwert (P95) |
|---|---|---|---|
| **SELECT by ID** (einfach) | `user.findFirst({ where: { id, tenantId } })` | <5ms | <20ms |
| **SELECT by ID + Include** | `clause.findFirst({ include: { versions } })` | <10ms | <30ms |
| **Paginated List mit RLS** | `clause.findMany({ where: { tenantId }, skip, take })` | <20ms | <50ms |
| **COUNT (tenant-scoped)** | `clause.count({ where: { tenantId } })` | <5ms | <20ms |
| **JOIN-Queries** | Contract + TemplateVersion + ClauseVersions (PIN-Aufloesung) | <50ms | <100ms |
| **Batch-Query (IN-clause)** | `clauseVersion.findMany({ where: { id: { in: [...50] } } })` | <20ms | <50ms |
| **Transaktionen (Create + Pin)** | `contractInstance.create` + `clause.findMany` + Version-Resolution | <100ms | <200ms |
| **Status-Transition + Gates** | `clauseVersion.update` + Publishing-Gate-Validierung | <50ms | <150ms |
| **Audit-Log-Query (paginated)** | `auditEvent.findMany` mit Filtern (action, from, to) | <30ms | <100ms |
| **DLQ Stats (Aggregation)** | 6 parallele COUNT-Queries + findFirst | <30ms | <80ms |

### 3.2 RLS-Overhead

| Aspekt | Erwartung | Grenzwert |
|---|---|---|
| RLS-Policy-Evaluierung pro Query | <2ms | <5ms |
| `SET LOCAL` Statement | <1ms | <2ms |
| Gesamt-Overhead vs. Query ohne RLS | <3ms | <7ms |

### 3.3 Indexing-Anforderungen

Alle folgenden Indizes sind Performance-kritisch und werden durch Prisma-Migrationen verwaltet:

| Tabelle | Index-Spalte(n) | Typ | Begründung |
|---|---|---|---|
| Alle Tabellen | `tenant_id` | B-tree | RLS-Filter |
| `users` | `(tenant_id, email)` | Unique | Login-Lookup, Invite-Duplikat-Check |
| `clauses` | `(tenant_id, updated_at)` | B-tree | Sortierte Listen |
| `clause_versions` | `(clause_id, version_number)` | B-tree | Versions-Auflösung |
| `clause_versions` | `(tenant_id, id)` | B-tree | Batch-Content-Lookup |
| `templates` | `(tenant_id, updated_at)` | B-tree | Sortierte Listen |
| `template_versions` | `(template_id, version_number)` | B-tree | Versions-Auflösung |
| `contract_instances` | `(tenant_id, status, updated_at)` | B-tree | Gefilterte Listen |
| `export_jobs` | `(tenant_id, status)` | B-tree | DLQ-Queries |
| `export_jobs` | `(tenant_id, status, queued_at)` | B-tree | DLQ-Stats-Sortierung |
| `audit_events` | `(tenant_id, created_at)` | B-tree | Zeitbasierte Abfrage |
| `audit_events` | `(tenant_id, action, created_at)` | B-tree | Gefilterte Audit-Queries |
| `style_templates` | `(tenant_id, created_at)` | B-tree | Sortierte Listen |

---

## 4. Frontend-Performance (Lighthouse)

Ergänzend zu `a11y-performance-baseline-v1.md`, Sektion 3. Hier die API-relevanten Budgets:

### 4.1 Lighthouse-Scores

| Kategorie | CI-Gate (Minimum) | Ziel (Launch) |
|---|---|---|
| Performance | >= 85 | >= 90 |
| Accessibility | >= 90 | >= 95 |

### 4.2 Core Web Vitals

| Metrik | CI-Gate | Ziel |
|---|---|---|
| LCP (Largest Contentful Paint) | <2.5s | <2.0s |
| FID (First Input Delay) | <200ms | <100ms |
| INP (Interaction to Next Paint) | <300ms | <200ms |
| CLS (Cumulative Layout Shift) | <0.1 | <0.05 |

### 4.3 Bundle-Budgets (gzip)

| Bundle | Budget |
|---|---|
| Main JS | <250 KB |
| Main CSS | <50 KB |
| Interview-Flow Chunk | <100 KB |
| Total Initial Load | <200 KB |

---

## 5. Export-Performance

Die Export-Pipeline (ADR-003) hat spezifische Performance-Ziele, da sie asynchron laeuft.

### 5.1 Pipeline-Stufen

```text
POST /export-jobs  ──>  pgboss Queue  ──>  Worker  ──>  S3 Upload  ──>  Download-Ready
     <50ms               <100ms          <3-8s         <1s              Total: <5-10s
```

### 5.2 Detaillierte Export-Ziele

| Phase | Ziel (P50) | Grenzwert (P95) | Beschreibung |
|---|---|---|---|
| **Job-Erstellung** (API) | <50ms | <100ms | DB-Write + pgboss enqueue |
| **Queue-Wartezeit** | <100ms | <500ms | pgboss Polling-Intervall |
| **DOCX Rendering** (5 Seiten) | <3s | <5s | docxtemplater Verarbeitung |
| **DOCX Rendering** (20 Seiten) | <5s | <8s | Komplexe Verträge |
| **ODT Konvertierung** | <5s | <8s | LibreOffice headless Konvertierung |
| **ODT Cold-Start** | +3-5s | +5-8s | Erster LibreOffice-Start pro Worker |
| **S3 Upload** | <1s | <2s | Dateigroesse typisch <5 MB |
| **Template-Cache Hit** | <1ms | <5ms | vs. ~50ms ohne Cache |
| **Template-Cache Miss** | <50ms | <100ms | DB-Lookup + Disk-Read |
| **E2E (DOCX, 5 Seiten)** | <5s | <10s | Job-Start bis Download-Ready |
| **E2E (DOCX, 20 Seiten)** | <8s | <15s | Komplexer Vertrag |
| **E2E (ODT, 5 Seiten)** | <10s | <18s | DOCX + LibreOffice Konvertierung |

### 5.3 Worker-Konfiguration

| Parameter | Wert | Begründung |
|---|---|---|
| Worker-Concurrency | 3 Jobs/Worker | docxtemplater ist CPU-bound |
| Max Workers (Cloud) | 5 Pods | HPA-basierte Skalierung |
| Max Workers (On-Prem) | 2 Pods | Ressourcen-Limits |
| LibreOffice Timeout | 30s | Verhindert Hänger bei ODT-Konvertierung |
| Job-Timeout (pgboss) | 120s | Gesamt-Job inkl. S3-Upload |
| Retry-Policy | max 3 Retries | Exponential Backoff (30s, 60s, 120s) |

---

## 6. Concurrent-Load-Ziele

Basierend auf erwarteten Nutzungsprofilen (SME-Kanzleien, 5-50 Nutzer pro Tenant):

### 6.1 Load-Stufen

| Stufe | VUs | P50 | P95 | Beschreibung |
|---|---|---|---|---|
| **Smoke** | 1 VU | <30ms | <100ms | Einzelnutzer-Baseline |
| **Normal** | 10 VU | <50ms | <150ms | Typische Kanzlei-Last |
| **Load** | 20 VU | <100ms | <200ms | Gleichzeitige Benutzer (1 Kanzlei aktiv) |
| **Stress** | 50 VU | <200ms | <500ms | Peak-Last (mehrere Kanzleien gleichzeitig) |
| **Spike** | 100 VU (30s) | <500ms | <1s | Kurzfristiger Lastanstieg |

### 6.2 Modul-spezifische Concurrent-Ziele

| Szenario | Concurrent Users | P95 Target | Begründung |
|---|---|---|---|
| Katalog-Browse | 20 gleichzeitig | <200ms | Häufigstes Read-Pattern |
| Interview-Flow (Auto-Save) | 10 gleichzeitig | <200ms | Frequent PATCH-Calls |
| Contract Validation | 10 gleichzeitig | <300ms | CPU-intensive Rule-Engine |
| Export-Queue | 10 gleichzeitige Jobs | <15s E2E | Worker-Concurrency-Limit |
| Export-Backpressure | ab 50 queued Jobs | Warning-Alert | Queue-Tiefe-Monitoring |
| Audit-Log-Queries | 5 gleichzeitig | <300ms | Admin-Only, seltener |

### 6.3 Throughput-Ziele

| Metrik | Ziel | Grenzwert |
|---|---|---|
| Requests/Sekunde (sustained) | 100 req/s | 200 req/s |
| Export-Jobs/Minute | 20 Jobs/min | 60 Jobs/min |
| DB-Connections (Pool) | 10-20 | max 50 |
| pgboss Queue-Tiefe | <10 Jobs | Warning ab 50 |

---

## 7. Monitoring-Metriken

Alle Metriken werden über Prometheus erfasst und in Grafana-Dashboards visualisiert.

### 7.1 API-Metriken

```typescript
// Prometheus Custom Metrics (Express Middleware)
import { Histogram, Counter, Gauge } from 'prom-client';

// HTTP Request Duration
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code', 'module'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

// HTTP Request Counter
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'module'],
});

// Active Connections
const httpActiveConnections = new Gauge({
  name: 'http_active_connections',
  help: 'Number of active HTTP connections',
});
```

### 7.2 Datenbank-Metriken

```typescript
// Database Query Duration
const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation', 'table', 'tenant_id'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
});

// PostgreSQL-native Metriken (via postgres-exporter):
// - pg_stat_activity: Aktive Connections, wartende Queries
// - pg_stat_user_tables: seq_scan, idx_scan, n_tup_ins/upd/del
// - pg_stat_bgwriter: Checkpoint-Häufigkeit
// - pg_locks: Lock-Contention
```

### 7.3 Export-Metriken

```typescript
// Export Job Duration (E2E)
const exportJobDuration = new Histogram({
  name: 'export_job_duration_seconds',
  help: 'Export job end-to-end duration',
  labelNames: ['format', 'status', 'tenant_id'],
  buckets: [1, 2, 3, 5, 8, 10, 15, 20, 30, 60, 120],
});

// Active Export Jobs
const exportJobsActive = new Gauge({
  name: 'export_jobs_active',
  help: 'Number of currently running export jobs',
  labelNames: ['format'],
});

// Export Queue Depth
const exportQueueDepth = new Gauge({
  name: 'export_queue_depth',
  help: 'Number of queued export jobs',
});

// Export Job Failures
const exportJobFailures = new Counter({
  name: 'export_job_failures_total',
  help: 'Total number of failed export jobs',
  labelNames: ['format', 'error_type'],
});
```

### 7.4 Cache-Metriken

```typescript
// Template Cache
const templateCacheHits = new Counter({
  name: 'template_cache_hits_total',
  help: 'Number of template cache hits',
});

const templateCacheMisses = new Counter({
  name: 'template_cache_misses_total',
  help: 'Number of template cache misses',
});

const templateCacheSize = new Gauge({
  name: 'template_cache_size_bytes',
  help: 'Current size of template cache in bytes',
});
```

### 7.5 Metriken-Zusammenfassung

| Kategorie | Metrik-Name | Typ | Labels |
|---|---|---|---|
| **API** | `http_request_duration_seconds` | Histogram | method, route, status_code, module |
| **API** | `http_requests_total` | Counter | method, route, status_code, module |
| **API** | `http_active_connections` | Gauge | - |
| **DB** | `db_query_duration_seconds` | Histogram | operation, table, tenant_id |
| **DB** | `pg_stat_activity` | (postgres-exporter) | state |
| **DB** | `pg_stat_user_tables` | (postgres-exporter) | relname |
| **Export** | `export_job_duration_seconds` | Histogram | format, status, tenant_id |
| **Export** | `export_jobs_active` | Gauge | format |
| **Export** | `export_queue_depth` | Gauge | - |
| **Export** | `export_job_failures_total` | Counter | format, error_type |
| **Cache** | `template_cache_hits_total` | Counter | - |
| **Cache** | `template_cache_misses_total` | Counter | - |
| **Cache** | `template_cache_size_bytes` | Gauge | - |

---

## 8. Alerting-Schwellwerte

Alerting via Grafana Alerting (Prometheus Datasource). Alert-Routing an PagerDuty/Slack.

### 8.1 API-Alerts

| Alert | Bedingung | Severity | For-Dauer |
|---|---|---|---|
| API Latency Warning | P95 > 500ms | Warning | 5 min |
| API Latency Critical | P95 > 1s | Critical | 5 min |
| API Error Rate Warning | 5xx Rate > 2% | Warning | 2 min |
| API Error Rate Critical | 5xx Rate > 5% | Critical | 2 min |
| API 4xx Spike | 4xx Rate > 20% | Warning | 5 min |
| API Health Endpoint Down | `/health` nicht 200 | Critical | 30s |

### 8.2 Datenbank-Alerts

| Alert | Bedingung | Severity | For-Dauer |
|---|---|---|---|
| DB Connection Pool Exhaustion | Active Connections > 80% Pool-Size | Warning | 2 min |
| DB Connection Pool Critical | Active Connections > 95% Pool-Size | Critical | 1 min |
| DB Query Slow | P95 > 200ms sustained | Warning | 5 min |
| DB Query Very Slow | P95 > 500ms sustained | Critical | 5 min |
| DB Lock Contention | Waiting Locks > 5 | Warning | 2 min |

### 8.3 Export-Alerts

| Alert | Bedingung | Severity | For-Dauer |
|---|---|---|---|
| Export Job Timeout | Einzelner Job > 120s | Warning | sofort |
| Export Queue Backlog | Queue-Tiefe > 50 | Warning | 5 min |
| Export Queue Critical | Queue-Tiefe > 100 | Critical | 2 min |
| Export Failure Rate | Failure-Rate > 10% (letzte 30 Min) | Warning | 5 min |
| Export Failure Rate Critical | Failure-Rate > 25% (letzte 15 Min) | Critical | 2 min |
| Export Worker Down | `export_jobs_active` = 0 und Queue > 0 fuer 5 min | Critical | 5 min |

### 8.4 Grafana Alert-Rules (Beispiel)

```yaml
# prometheus-alert-rules.yaml
groups:
  - name: servanda-api
    rules:
      - alert: ApiLatencyWarning
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API P95 latency above 500ms"
          description: "P95 latency is {{ $value }}s for {{ $labels.route }}"

      - alert: ApiLatencyCritical
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "API P95 latency above 1s"

      - alert: ApiErrorRateCritical
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[2m]))
          / sum(rate(http_requests_total[2m])) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "API 5xx error rate above 5%"

      - alert: ExportQueueBacklog
        expr: export_queue_depth > 50
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Export queue depth above 50 jobs"

      - alert: ExportJobTimeout
        expr: export_job_duration_seconds_bucket{le="120"} == 0
        for: 0m
        labels:
          severity: warning
        annotations:
          summary: "Export job exceeded 120s timeout"
```

---

## 9. Baseline-Messmethode

### 9.1 Tooling

| Tool | Zweck | Phase |
|---|---|---|
| **k6** | Load-Testing, API-Latenz-Messung | CI/CD + Manuell |
| **Prometheus** | Runtime-Metriken-Sammlung | Permanent |
| **Grafana** | Dashboard + Alerting | Permanent |
| **postgres-exporter** | PostgreSQL-Metriken | Permanent |
| **Playwright** | E2E Frontend-Performance (LCP, CLS) | CI |
| **Lighthouse CI** | Frontend-Scores | CI (Main-Gate) |

### 9.2 Seed-Daten (Baseline-Datensatz)

| Entity | Anzahl | Beschreibung |
|---|---|---|
| Tenants | 2 | 1 Vendor, 1 Law Firm |
| Users | 5 | 1 Admin, 2 Editors, 2 Users (verteilt auf Tenants) |
| Clauses | 4 | Mit je 1-2 Versionen (draft/published) |
| Templates | 1 | Mit 1 published Version, 3 Sections, 4 Slots |
| Contracts | 1 | 1 Draft mit gepinnten Versionen |
| Export Jobs | 0 | Werden per Test erzeugt |
| Style Templates | 0 | Werden per Test erzeugt |
| Audit Events | ~10 | Aus Seed-Operationen |

### 9.3 Test-Umgebung

```text
Docker-Compose (docker-compose.yml):
  - api:           Node.js 20 Alpine, 512MB RAM, 0.5 CPU
  - export-worker: Node.js 20 Alpine + LibreOffice, 1GB RAM, 1 CPU
  - postgres:      PostgreSQL 16, 512MB RAM
  - minio:         MinIO (S3-kompatibel), 256MB RAM
  - keycloak:      Keycloak 24, 512MB RAM

Hardware-Referenz (CI):
  - GitHub Actions ubuntu-latest (2 vCPU, 7 GB RAM)
```

### 9.4 k6 Test-Szenarien

```javascript
// k6/performance-baseline.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency', true);

// --- Szenarien ---
export const options = {
  scenarios: {
    // Smoke: Einzelner Benutzer, 30 Sekunden
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      exec: 'apiSmoke',
      tags: { scenario: 'smoke' },
    },

    // Load: 20 gleichzeitige Benutzer, 2 Minuten
    load: {
      executor: 'constant-vus',
      vus: 20,
      duration: '2m',
      startTime: '35s',
      exec: 'apiLoad',
      tags: { scenario: 'load' },
    },

    // Stress: 50 gleichzeitige Benutzer, 4 Minuten (Ramp-Up)
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '2m', target: 50 },
        { duration: '1m', target: 0 },
      ],
      startTime: '3m',
      exec: 'apiStress',
      tags: { scenario: 'stress' },
    },
  },

  thresholds: {
    // Global: P95 < 500ms, Error-Rate < 5%
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    errors: ['rate<0.05'],

    // Scenario-spezifisch
    'http_req_duration{scenario:smoke}': ['p(95)<100'],
    'http_req_duration{scenario:load}': ['p(95)<200'],
    'http_req_duration{scenario:stress}': ['p(95)<500'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api/v1';
const HEADERS = {
  'Content-Type': 'application/json',
  'x-tenant-id': __ENV.TENANT_ID || 'tenant-001',
  'x-user-id': __ENV.USER_ID || 'user-001',
  'x-user-role': 'admin',
};

// --- Smoke Test ---
export function apiSmoke() {
  // Health Check
  let res = http.get(`${BASE_URL}/health`);
  check(res, { 'health 200': (r) => r.status === 200 });
  apiLatency.add(res.timings.duration);

  // Read: Users list
  res = http.get(`${BASE_URL}/identity/users`, { headers: HEADERS });
  check(res, { 'users 200': (r) => r.status === 200 });
  apiLatency.add(res.timings.duration);

  // Read: Clauses list
  res = http.get(`${BASE_URL}/content/clauses`, { headers: HEADERS });
  check(res, { 'clauses 200': (r) => r.status === 200 });
  apiLatency.add(res.timings.duration);

  // Read: Contracts list
  res = http.get(`${BASE_URL}/contracts`, { headers: HEADERS });
  check(res, { 'contracts 200': (r) => r.status === 200 });
  apiLatency.add(res.timings.duration);

  sleep(1);
}

// --- Load Test ---
export function apiLoad() {
  // Simulate typical user flow: browse catalog, view contract, auto-save
  let res = http.get(`${BASE_URL}/content/catalog/templates`, { headers: HEADERS });
  check(res, { 'catalog 200': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);

  res = http.get(`${BASE_URL}/contracts`, { headers: HEADERS });
  check(res, { 'contracts 200': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);

  // Simulate auto-save
  res = http.get(`${BASE_URL}/content/clauses`, { headers: HEADERS });
  check(res, { 'clauses 200': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);

  sleep(0.5);
}

// --- Stress Test ---
export function apiStress() {
  // Mix of reads and writes
  const endpoints = [
    { method: 'GET', url: `${BASE_URL}/health` },
    { method: 'GET', url: `${BASE_URL}/identity/users` },
    { method: 'GET', url: `${BASE_URL}/content/clauses` },
    { method: 'GET', url: `${BASE_URL}/content/templates` },
    { method: 'GET', url: `${BASE_URL}/content/catalog/templates` },
    { method: 'GET', url: `${BASE_URL}/contracts` },
    { method: 'GET', url: `${BASE_URL}/export/style-templates` },
  ];

  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const res = http.get(endpoint.url, { headers: HEADERS });
  check(res, { [`${endpoint.method} ${endpoint.url} ok`]: (r) => r.status === 200 });
  errorRate.add(res.status !== 200);

  sleep(0.2);
}
```

### 9.5 Baseline-Run-Protokoll

| Phase | VUs | Dauer | Erwartete Ergebnisse |
|---|---|---|---|
| **Smoke** | 1 | 30s | P95 < 100ms, 0 Errors |
| **Load** | 20 | 2 min | P95 < 200ms, Error-Rate < 1% |
| **Stress** | 50 (Ramp) | 4 min | P95 < 500ms, Error-Rate < 5% |
| **Soak** (optional) | 10 | 15 min | Keine Memory-Leaks, stabile Latenz |

### 9.6 CI-Integration

```yaml
# .github/workflows/performance-baseline.yml
name: Performance Baseline
on:
  workflow_dispatch:
  schedule:
    - cron: '0 3 * * 1'  # Wöchentlich Montag 03:00 UTC

jobs:
  performance:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: servanda
          POSTGRES_USER: servanda
          POSTGRES_PASSWORD: servanda_test
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci

      # Seed database
      - run: npx prisma migrate deploy && npx prisma db seed
        env:
          DATABASE_URL: postgresql://servanda:servanda_test@localhost:5432/servanda

      # Start API
      - run: npm run start:api &
        env:
          DATABASE_URL: postgresql://servanda:servanda_test@localhost:5432/servanda
          NODE_ENV: test
      - run: npx wait-on http://localhost:3000/api/v1/health

      # Run k6
      - uses: grafana/k6-action@v0.3.1
        with:
          filename: k6/performance-baseline.js
        env:
          API_URL: http://localhost:3000/api/v1
          TENANT_ID: tenant-vendor-001
          USER_ID: user-admin-001

      # Upload results
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: k6-results
          path: k6-results/
```

---

## 10. Performance-Budget-Enforcement

### 10.1 CI-Gate-Integration

| Gate | Bedingung | Wann |
|---|---|---|
| **PR-Gate** | Bundle-Size < Budget (size-limit) | Jeder PR |
| **PR-Gate** | axe-core 0 Violations | Jeder PR |
| **Main-Gate** | Lighthouse >= 85 Performance, >= 90 Accessibility | Jeder Main-Merge |
| **Release-Gate** | k6 Load-Test P95 < 500ms, Error-Rate < 5% | Jeder Release-Kandidat |
| **Weekly** | k6 Full Baseline (Smoke + Load + Stress) | Montag 03:00 UTC |

### 10.2 Regression-Detection

Performance-Regressionen werden erkannt durch:

1. **k6 Threshold-Violations:** Automatischer CI-Failure wenn Schwellwerte überschritten
2. **Grafana Annotations:** Jeder Deploy wird annotiert, Latenz-Spikes sind visuell zuordenbar
3. **size-limit:** Bundle-Groesse-Aenderungen in PR-Comments angezeigt
4. **Lighthouse Budget:** Score-Drops blockieren Main-Merge

---

## 11. Bekannte Einschränkungen & Risiken

| Risiko | Impact | Mitigation | Owner |
|---|---|---|---|
| RLS-Overhead bei vielen Tenants (>100) | +5-10ms pro Query | Index-Monitoring, `EXPLAIN ANALYZE`, ggf. Partitioning | Team 02 + 07 |
| pgboss Queue-Backlog bei Lastspitzen | Export-Wartezeiten >30s | Worker-HPA, Queue-Depth-Alert, Backpressure ab 50 Jobs | Team 05 + 07 |
| LibreOffice Cold-Start bei ODT | +3-8s fuer ersten Job pro Worker | Worker-Warmup, Pre-Start von soffice, Pool-Management | Team 05 + 07 |
| Prisma Connection-Pool-Exhaustion | Timeout-Errors bei hoher Last | Pool-Size tunen (10-20 default), Connection-Monitoring | Team 01 + 07 |
| Keycloak-Sync Latenz bei Identity-Writes | Audit-Log kann Keycloak-Failure zeigen | Fire-and-forget Pattern (bereits implementiert) | Team 02 |
| Batch-Content max 50 IDs | Grosse Templates brauchen ggf. mehrere Calls | Client-seitiges Batching, Limit-Erhöhung evaluieren | Team 04 |

---

## 12. Offene Punkte

| # | Thema | Owner | Ziel-Sprint |
|---|---|---|---|
| 1 | k6 Performance-Baseline Script erstellen und einpflegen | Team 06 + 07 | Sprint 12 |
| 2 | Prometheus Custom Metrics in API-Middleware integrieren | Team 01 + 07 | Sprint 12 |
| 3 | Grafana Performance-Dashboard (API + DB + Export) erstellen | Team 07 | Sprint 12 |
| 4 | Baseline-Run auf Staging-Umgebung durchführen und Werte validieren | Team 06 | Sprint 13 |
| 5 | Soak-Test (15-30 Min) für Memory-Leak-Detection etablieren | Team 06 | Sprint 13 |
| 6 | Real-User-Monitoring (RUM) für Frontend-Performance einrichten | Team 07 | Sprint 14 |
| 7 | Load-Testing mit realistischem Datenvolumen (1000+ Klauseln) | Team 06 | Sprint 14 |
| 8 | ODT-Konvertierung Performance-Optimierung (Worker-Pool) | Team 05 | Sprint 14 |

---

## Anhang A: Grafana Dashboard Layout (Entwurf)

```text
┌─────────────────────────────────────────────────────────┐
│                Servanda Office — API Performance         │
├──────────────────────┬──────────────────────────────────┤
│  Request Rate        │  Error Rate (5xx)                │
│  [Counter/s Graph]   │  [Percentage Graph]              │
├──────────────────────┼──────────────────────────────────┤
│  P50 Latency         │  P95 Latency                     │
│  [per Module Graph]  │  [per Module Graph]              │
├──────────────────────┼──────────────────────────────────┤
│  DB Query Duration   │  DB Connection Pool              │
│  [Histogram]         │  [Gauge + Threshold]             │
├──────────────────────┼──────────────────────────────────┤
│  Export Queue Depth  │  Export Job Duration              │
│  [Gauge + Alert]     │  [Histogram by Format]           │
├──────────────────────┼──────────────────────────────────┤
│  Template Cache      │  Active Exports                  │
│  [Hit/Miss Ratio]    │  [Gauge by Format]               │
└──────────────────────┴──────────────────────────────────┘
```

---

## Anhang B: Vergleich mit a11y-performance-baseline-v1.md

Dieses Dokument ergänzt `a11y-performance-baseline-v1.md` (Sektion 5: API-Performance Baseline) mit:

| Aspekt | a11y-performance-baseline-v1 | performance-baseline-v1 (dieses Dokument) |
|---|---|---|
| Endpoint-Abdeckung | 6 Referenz-Endpoints | Alle 38+ Endpoints kategorisiert |
| Latenz-Kategorien | Pauschal pro Endpoint | 12 Kategorien nach Zugriffsmuster |
| DB-Performance | 4 Query-Typen | 10+ Query-Typen + RLS-Overhead + Indexing |
| Export-Performance | Nicht abgedeckt | Vollständige Pipeline (6 Phasen) |
| Concurrent-Load | Nicht abgedeckt | 5 Load-Stufen + Modul-spezifische Ziele |
| Monitoring-Metriken | 2 Histogramme (Referenz) | 13 Metriken mit Labels und Typen |
| Alerting | Erwähnt in Backbone | 15 Alert-Rules mit Schwellwerten |
| k6 Test-Scripts | Referenziert | Vollständiges Script mit 3 Szenarien |
| CI-Integration | Wöchentlich (Release-Gate) | PR-Gate + Main-Gate + Release-Gate + Weekly |
