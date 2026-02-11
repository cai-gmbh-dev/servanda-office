# Audit Logging E2E Spezifikation v1

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 02 (Platform Security & Identity) + Team 07 (DevOps & On-Prem)
**Betroffene Teams:** 01, 02, 04, 05, 07
**Referenzen:** Audit-Compliance v1, Architecture Backbone v1, Deployment-Blueprint v1, Secrets/Key-Handling v1

---

## 1. Übersicht

Dieses Dokument spezifiziert die End-to-End-Implementierung des Audit-Logging-Systems: von der Event-Erzeugung in den Service-Modulen über die Middleware-Integration bis zur Abfrage-API und dem Monitoring. Es ergänzt den Audit-Event-Katalog (audit-compliance-v1.md) um die technische Implementierung.

---

## 2. Architektur

```
┌──────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                          │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Identity │  │ Content  │  │ Contract │  │ Export   │    │
│  │ Module   │  │ Module   │  │ Module   │  │ Module   │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │              │              │              │           │
│       └──────────────┴──────────────┴──────────────┘           │
│                              │                                 │
│                    ┌─────────▼──────────┐                     │
│                    │   Audit Service    │                     │
│                    │   (Central)        │                     │
│                    └─────────┬──────────┘                     │
│                              │                                 │
└──────────────────────────────┼─────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   PostgreSQL        │
                    │   audit_events      │
                    │   (Append-Only)     │
                    │   + RLS             │
                    │   + Partitioning    │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   OpenSearch        │
                    │   (Phase 2:         │
                    │    Volltext +       │
                    │    Analytics)       │
                    └─────────────────────┘
```

---

## 3. Audit Service Implementation

### 3.1 Core Interface

```typescript
interface AuditService {
  /**
   * Erzeugt ein Audit-Event.
   * Wird automatisch von Middlewares und Services aufgerufen.
   */
  log(event: AuditEventInput): Promise<void>;

  /**
   * Erzeugt mehrere Events in einer Transaktion.
   */
  logBatch(events: AuditEventInput[]): Promise<void>;
}

interface AuditEventInput {
  tenantId: string;
  actorId: string | null;       // null bei System-Events
  actorEmail?: string;
  action: AuditAction;
  objectType: string;
  objectId: string;
  details?: Record<string, unknown>;
  severity?: 'info' | 'warning' | 'critical';
  ipAddress?: string;
  userAgent?: string;
}

type AuditAction =
  // Identity
  | 'user.login' | 'user.login_failed' | 'user.logout'
  | 'user.invite' | 'user.activate' | 'user.role_change'
  | 'user.deactivate' | 'user.delete'
  | 'user.password_change' | 'user.mfa_enable' | 'user.mfa_disable'
  // Content
  | 'clause.create' | 'clause_version.create'
  | 'clause_version.submit_review' | 'clause_version.approve'
  | 'clause_version.reject' | 'clause_version.publish'
  | 'clause_version.deprecate'
  | 'template.create' | 'template_version.create'
  | 'template_version.publish' | 'template_version.deprecate'
  // Contract
  | 'contract.create' | 'contract.update'
  | 'contract.version_upgrade' | 'contract.complete'
  | 'contract.archive' | 'contract.delete'
  | 'contract.clone_as_template'
  // Export
  | 'export.request' | 'export.complete' | 'export.fail'
  | 'export.download'
  // Admin
  | 'tenant.settings_change' | 'tenant.mfa_policy_change'
  | 'team.create' | 'team.member_add' | 'team.member_remove'
  | 'style_template.create' | 'style_template.update'
  // System
  | 'system.retention_cleanup' | 'system.export_timeout';
```

### 3.2 Implementation

```typescript
class AuditServiceImpl implements AuditService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly logger: Logger,
  ) {}

  async log(event: AuditEventInput): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO audit_events
         (tenant_id, actor_id, actor_email, action, object_type, object_id,
          details, severity, ip_address, user_agent, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
        [
          event.tenantId,
          event.actorId,
          event.actorEmail,
          event.action,
          event.objectType,
          event.objectId,
          JSON.stringify(event.details ?? {}),
          event.severity ?? 'info',
          event.ipAddress,
          event.userAgent,
        ]
      );
    } catch (error) {
      // Audit-Fehler dürfen Hauptoperation NICHT blockieren
      this.logger.error('Failed to write audit event', {
        action: event.action,
        objectId: event.objectId,
        error: error.message,
      });
      // Optional: In Fallback-Queue schreiben
    }
  }

  async logBatch(events: AuditEventInput[]): Promise<void> {
    // Batch-INSERT für Performance
    const values = events.map((e, i) => {
      const offset = i * 10;
      return `($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5},
              $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9}, $${offset+10}, now())`;
    }).join(', ');

    const params = events.flatMap(e => [
      e.tenantId, e.actorId, e.actorEmail, e.action, e.objectType,
      e.objectId, JSON.stringify(e.details ?? {}), e.severity ?? 'info',
      e.ipAddress, e.userAgent,
    ]);

    await this.db.query(
      `INSERT INTO audit_events
       (tenant_id, actor_id, actor_email, action, object_type, object_id,
        details, severity, ip_address, user_agent, timestamp)
       VALUES ${values}`,
      params
    );
  }
}
```

### 3.3 Fehlerbehandlungs-Prinzip

**Audit-Fehler dürfen die Hauptoperation NICHT blockieren.**

```
Nutzer erstellt Vertrag
       │
       ├─ ContractService.create() → Erfolg
       │
       └─ AuditService.log() → Fehler?
              │
              ├─ Ja → Logger.error(), Fallback-Queue
              │        Hauptoperation bleibt erfolgreich
              │
              └─ Nein → Normal fortfahren
```

**Fallback-Queue:** Bei DB-Fehler werden Events in eine In-Memory-Queue geschrieben und asynchron nachgeholt (max 1000 Events, 5 Min. Buffer).

---

## 4. Middleware-Integration

### 4.1 Request-Context Middleware

```typescript
/**
 * Extrahiert Audit-relevante Daten aus dem Request
 * und stellt sie dem AuditService bereit.
 */
function auditContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  req.auditContext = {
    tenantId: req.tenantContext.tenantId,
    actorId: req.user?.id ?? null,
    actorEmail: req.user?.email,
    ipAddress: req.ip || req.headers['x-forwarded-for']?.toString(),
    userAgent: req.headers['user-agent'],
  };
  next();
}
```

### 4.2 Auto-Audit Decorator

```typescript
/**
 * Decorator für Service-Methoden, der automatisch
 * ein Audit-Event erzeugt.
 */
function Audited(action: AuditAction, objectType: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const original = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await original.apply(this, args);

      // Audit-Event asynchron (nicht await)
      this.auditService.log({
        ...this.auditContext,
        action,
        objectType,
        objectId: result.id,
        details: { method: propertyKey },
      }).catch(() => {}); // Fehler in log() behandelt

      return result;
    };
  };
}

// Verwendung:
class ContractService {
  @Audited('contract.create', 'ContractInstance')
  async createContract(tenantId: string, templateId: string) {
    // ... Business-Logik
    return contractInstance;
  }
}
```

### 4.3 Login-Audit (Keycloak Event Listener)

Login-Events kommen von Keycloak, nicht von der Applikation direkt:

```
Keycloak                          Servanda API
────────                          ────────────

User loggt ein
       │
       ▼
Keycloak Event:
LOGIN_SUCCESS / LOGIN_ERROR
       │
       ▼
Event Listener (SPI)
oder Webhook
       │
       ▼
POST /api/internal/auth-events
  {
    event: "LOGIN_SUCCESS",
    userId: "uuid",
    tenantId: "uuid",
    ipAddress: "...",
    userAgent: "..."
  }
       │
       ▼
AuditService.log({
  action: "user.login",
  ...
})
```

**Alternative (MVP):** Login-Audit im API-Gateway bei Token-Validierung:

```typescript
// Auth-Middleware: Login-Event beim ersten Request nach Token-Erstellung
if (isNewSession(req.token)) {
  auditService.log({
    ...req.auditContext,
    action: 'user.login',
    objectType: 'Session',
    objectId: req.token.sessionId,
    details: { method: req.token.authMethod },
  });
}
```

---

## 5. Datenbank-Optimierung

### 5.1 Partitioning

```sql
-- Monatliche Partitionierung für Performance
CREATE TABLE audit_events (
  id          UUID DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  actor_id    UUID,
  actor_email VARCHAR(255),
  action      VARCHAR(100) NOT NULL,
  object_type VARCHAR(100) NOT NULL,
  object_id   UUID NOT NULL,
  details     JSONB,
  severity    VARCHAR(20) NOT NULL DEFAULT 'info',
  ip_address  VARCHAR(45),
  user_agent  TEXT,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id, timestamp)  -- Partition Key muss im PK sein
) PARTITION BY RANGE (timestamp);

-- Partitionen erstellen (automatisiert per Cronjob/pg_partman)
CREATE TABLE audit_events_2026_01 PARTITION OF audit_events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_events_2026_02 PARTITION OF audit_events
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- ... weitere Monate

-- RLS auf Parent-Tabelle (propagiert zu Partitionen)
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_read ON audit_events
  FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_insert ON audit_events
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Kein UPDATE/DELETE Policy → implizit verboten

-- Indices (auf jeder Partition)
CREATE INDEX idx_ae_tenant_time ON audit_events(tenant_id, timestamp DESC);
CREATE INDEX idx_ae_tenant_action ON audit_events(tenant_id, action);
CREATE INDEX idx_ae_tenant_object ON audit_events(tenant_id, object_type, object_id);
CREATE INDEX idx_ae_severity ON audit_events(severity) WHERE severity != 'info';
```

### 5.2 Automatische Partition-Verwaltung

```sql
-- pg_partman Konfiguration
SELECT partman.create_parent(
  p_parent_table := 'public.audit_events',
  p_control := 'timestamp',
  p_type := 'range',
  p_interval := '1 month',
  p_premake := 3  -- 3 Monate im Voraus
);

-- Retention-Policy (automatisches Detach/Drop alter Partitionen)
UPDATE partman.part_config
SET retention = '24 months',
    retention_keep_table = false
WHERE parent_table = 'public.audit_events';
```

### 5.3 Performance-Erwartungen

| Abfrage | Ohne Partitioning | Mit Partitioning |
|---------|-------------------|------------------|
| Letzte 100 Events eines Tenants | ~30ms | ~10ms |
| Events eines Monats (1M Rows gesamt) | ~200ms | ~30ms |
| Events eines Jahres | ~2s | ~300ms |
| COUNT(*) pro Tenant | ~500ms | ~100ms |

---

## 6. Retention-Implementation

### 6.1 Retention-Service

```typescript
interface RetentionService {
  /**
   * Prüft und löscht/archiviert abgelaufene Events.
   * Wird täglich per Cronjob aufgerufen.
   */
  executeRetention(): Promise<RetentionResult>;
}

interface RetentionResult {
  tenantsProcessed: number;
  eventsArchived: number;
  eventsDeleted: number;
  errors: string[];
}
```

### 6.2 Retention-Ablauf

```
Cronjob (täglich 02:00 UTC)
       │
       ▼
┌──────────────────────────────────┐
│ 1. Alle Tenants laden            │
│    mit Retention-Config          │
└──────────┬───────────────────────┘
           │
           ▼ (für jeden Tenant)
┌──────────────────────────────────┐
│ 2. Retention-Deadline berechnen  │
│    deadline = now() - retention  │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ 3. Events vor Deadline:          │
│    ┌──────────────────────────┐  │
│    │ Pro/Enterprise?          │  │
│    │  Ja → Archivieren        │  │
│    │       (S3 JSON-Lines)    │  │
│    │  Nein → Direkt löschen   │  │
│    └──────────────────────────┘  │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ 4. Audit-Event erzeugen:        │
│    system.retention_cleanup      │
│    { deletedCount, retentionDays}│
└──────────────────────────────────┘
```

### 6.3 Archivierungs-Format

```json
// S3: {tenantId}/audit-archive/2026-01.jsonl
{"id":"uuid","tenantId":"uuid","action":"user.login","timestamp":"2026-01-01T10:00:00Z",...}
{"id":"uuid","tenantId":"uuid","action":"contract.create","timestamp":"2026-01-01T11:00:00Z",...}
```

---

## 7. Abfrage-API

### 7.1 Endpunkte

```yaml
# Audit-Logs abfragen
GET /api/v1/tenants/{tenantId}/audit-logs
  Query:
    from?: ISO date (default: -30 Tage)
    to?: ISO date (default: jetzt)
    action?: string (z.B. "user.login", "contract.*")
    actorId?: uuid
    objectType?: string
    objectId?: uuid
    severity?: "info" | "warning" | "critical"
    limit?: integer (default: 50, max: 200)
    offset?: integer (default: 0)
  Headers:
    Authorization: Bearer {jwt}
  Preconditions:
    - Caller.role = "admin"
  Response:
    total: integer
    events: AuditEvent[]
    pagination: { limit, offset, hasMore }

# Audit-Logs exportieren
GET /api/v1/tenants/{tenantId}/audit-logs/export
  Query: (gleich wie oben, kein limit/offset)
  Accept: text/csv | application/json
  Response: Streaming-Download

# Event-Statistiken (Dashboard)
GET /api/v1/tenants/{tenantId}/audit-logs/stats
  Query:
    from?: ISO date
    to?: ISO date
  Response:
    totalEvents: number
    byAction: Record<string, number>
    bySeverity: Record<string, number>
    byDay: { date: string, count: number }[]
```

### 7.2 Wildcard-Filter

`action`-Parameter unterstützt Wildcards:

| Filter | Ergebnis |
|--------|---------|
| `user.login` | Nur Login-Events |
| `user.*` | Alle User-Events |
| `contract.*` | Alle Contract-Events |
| `*.publish` | Alle Publish-Events (clause + template) |

Implementation: SQL `LIKE` mit `%`:
```sql
WHERE action LIKE replace($1, '*', '%')
```

---

## 8. UI-Spezifikation

### 8.1 Admin-Dashboard: Audit-Log

```
┌──────────────────────────────────────────────────────────────┐
│  Audit-Log                                    [CSV] [JSON]   │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Filter:                                                      │
│  Zeitraum: [Letzte 7 Tage ▼]  Aktion: [Alle ▼]              │
│  Akteur: [Alle ▼]  Severity: [Alle ▼]  [Filtern]            │
│                                                               │
│  ┌────────────┬──────────┬──────────────┬───────┬──────────┐ │
│  │ Zeitpunkt  │ Akteur   │ Aktion       │ Sev.  │ Objekt   │ │
│  ├────────────┼──────────┼──────────────┼───────┼──────────┤ │
│  │ 10.02. 15:45│ M.Müller│ contract.    │ ℹ     │ Vertrag  │ │
│  │            │          │ complete     │       │ AV-042   │ │
│  ├────────────┼──────────┼──────────────┼───────┼──────────┤ │
│  │ 10.02. 15:30│ M.Müller│ export.      │ ℹ     │ Export   │ │
│  │            │          │ request      │       │ EJ-015   │ │
│  ├────────────┼──────────┼──────────────┼───────┼──────────┤ │
│  │ 10.02. 14:00│ A.Admin │ user.role_   │ 🔴    │ User     │ │
│  │            │          │ change       │       │ S.Schmidt│ │
│  ├────────────┼──────────┼──────────────┼───────┼──────────┤ │
│  │ 10.02. 12:15│ System  │ clause_ver.  │ 🔴    │ Klausel  │ │
│  │            │          │ publish      │       │ Haftung  │ │
│  └────────────┴──────────┴──────────────┴───────┴──────────┘ │
│                                                               │
│  Zeige 1-50 von 234  [← Zurück]  [Weiter →]                 │
└──────────────────────────────────────────────────────────────┘
```

### 8.2 Event-Detail-Ansicht

```
┌──────────────────────────────────────────────────────────────┐
│  Event: user.role_change                                      │
│  ID: ae-2026-02-10-001                                       │
│  Severity: 🔴 Critical                                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Zeitpunkt:   10.02.2026, 14:00:15 UTC                       │
│  Akteur:      A. Admin (admin@kanzlei.de)                    │
│  IP-Adresse:  192.168.1.42                                   │
│  User-Agent:  Chrome 120 / Windows                           │
│                                                               │
│  Objekt:                                                      │
│    Typ:  User                                                │
│    ID:   s.schmidt@kanzlei.de                                │
│                                                               │
│  Details:                                                     │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ {                                                     │    │
│  │   "oldRole": "user",                                  │    │
│  │   "newRole": "editor",                                │    │
│  │   "changedBy": "admin@kanzlei.de"                     │    │
│  │ }                                                     │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  [Schließen]                                                  │
└──────────────────────────────────────────────────────────────┘
```

---

## 9. Monitoring & Alerting

### 9.1 Prometheus-Metriken

```typescript
// Audit-spezifische Metriken
const auditEventsTotal = new Counter({
  name: 'audit_events_total',
  help: 'Total audit events',
  labelNames: ['action', 'severity', 'tenant_id'],
});

const auditWriteErrors = new Counter({
  name: 'audit_write_errors_total',
  help: 'Failed audit event writes',
  labelNames: ['reason'],
});

const auditWriteDuration = new Histogram({
  name: 'audit_write_duration_seconds',
  help: 'Audit event write duration',
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1],
});

const auditQueryDuration = new Histogram({
  name: 'audit_query_duration_seconds',
  help: 'Audit log query duration',
  labelNames: ['endpoint'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1],
});
```

### 9.2 Alert-Regeln

| Alert | Bedingung | Severity | Aktion |
|-------|----------|----------|--------|
| Audit-Write-Fehler | `audit_write_errors_total` > 10 in 5 Min. | Critical | PagerDuty / Slack |
| Viele Fehlgeschlagene Logins | `audit_events_total{action="user.login_failed"}` > 20 in 10 Min. (pro Tenant) | Warning | Slack-Notification |
| Critical Events | `audit_events_total{severity="critical"}` > 5 in 1 Min. | Warning | Slack-Notification |
| Retention fehlgeschlagen | `system.retention_cleanup` nicht in 48h | Warning | Slack-Notification |
| Hohe Query-Latenz | `audit_query_duration_seconds{p95}` > 1s | Warning | Grafana-Dashboard |

### 9.3 Grafana-Dashboard

**Audit-Log Overview:**
- Events/Stunde (Zeitreihe, nach Severity)
- Top 10 Aktionen (Balkendiagramm)
- Failed Logins/Stunde (Zeitreihe, nach Tenant)
- Critical Events (Tabelle, letzte 24h)
- Retention-Status (Gauge)

---

## 10. E2E-Tests

### 10.1 Test-Szenarien

| # | Szenario | Beschreibung | Erwartung |
|---|----------|-------------|-----------|
| T-01 | Login erzeugt Audit-Event | User loggt ein → `user.login` Event | Event in DB mit korrektem Tenant, Actor, IP |
| T-02 | Vertrag erstellen erzeugt Event | Contract.create → `contract.create` Event | Details enthalten templateVersionId, clauseCount |
| T-03 | Publish erzeugt Critical-Event | ClauseVersion.publish → severity=critical | Severity korrekt, publishedAt gesetzt |
| T-04 | Export-Lifecycle komplett | request→complete→download → 3 Events | Korrekte Reihenfolge, jobId konsistent |
| T-05 | Tenant-Isolation | Tenant A Events für Tenant B unsichtbar | GET audit-logs gibt 0 Ergebnisse für fremden Tenant |
| T-06 | Immutability | UPDATE/DELETE auf audit_events | SQL-Fehler (RLS blockiert) |
| T-07 | Retention-Cleanup | Events jenseits Retention → gelöscht | Gelöschte Events, Cleanup-Event erzeugt |
| T-08 | DSGVO-Anonymisierung | User löschen → Audit-Events anonymisiert | actorEmail="anonymized", ip=null |
| T-09 | Fehlgeschlagener Login | 5 Fehlversuche → 5 warning-Events | severity=warning, korrekte Fehlergründe |
| T-10 | Filter-API | action=user.*, from/to, severity | Korrekte Filterung, Pagination |
| T-11 | CSV-Export | GET audit-logs/export Accept:text/csv | Valide CSV-Datei mit allen Feldern |
| T-12 | Audit-Fehler blockiert nicht | AuditService.log() wirft Fehler | Hauptoperation erfolgreich, Fehler geloggt |

### 10.2 Playwright E2E-Tests

```typescript
test.describe('Audit Logging E2E', () => {
  test('contract creation generates audit event', async ({ page }) => {
    // 1. Login als Editor
    await loginAsEditor(page);

    // 2. Vertrag erstellen
    await page.goto('/contracts/new');
    await page.click('[data-testid="template-arbeitsvertrag"]');
    await page.click('[data-testid="create-contract"]');

    // 3. Audit-Log prüfen (als Admin)
    await loginAsAdmin(page);
    await page.goto('/admin/audit-log');

    // 4. Event verifizieren
    const eventRow = page.locator('[data-action="contract.create"]').first();
    await expect(eventRow).toBeVisible();
    await expect(eventRow.locator('[data-severity]')).toHaveText('info');
  });

  test('tenant isolation for audit events', async ({ request }) => {
    // Tenant A Events erstellen
    const tenantAToken = await getToken('tenant-a-admin');
    await request.post('/api/v1/tenants/tenant-a/contracts', {
      headers: { Authorization: `Bearer ${tenantAToken}` },
      data: { templateId: 'template-1' },
    });

    // Tenant B versucht Tenant A Events zu lesen
    const tenantBToken = await getToken('tenant-b-admin');
    const response = await request.get('/api/v1/tenants/tenant-a/audit-logs', {
      headers: { Authorization: `Bearer ${tenantBToken}` },
    });
    expect(response.status()).toBe(403);
  });
});
```

---

## 11. Structured Logging (Application Logs vs. Audit Events)

### 11.1 Abgrenzung

| Aspekt | Application Logs | Audit Events |
|--------|-----------------|--------------|
| **Zweck** | Debugging, Operations | Compliance, Nachvollziehbarkeit |
| **Speicherung** | OpenSearch (kurzlebig) | PostgreSQL (langlebig) |
| **Retention** | 30 Tage | 90-365+ Tage |
| **Zugriff** | DevOps-Team | Tenant-Admin |
| **Personenbezogene Daten** | Keine (anonymisiert) | Ja (mit Löschkonzept) |
| **Immutability** | Nein | Ja (append-only) |

### 11.2 Application-Log-Format

```json
{
  "timestamp": "2026-02-10T14:00:00.000Z",
  "level": "info",
  "service": "contract-module",
  "tenantId": "uuid",
  "requestId": "uuid",
  "method": "POST",
  "path": "/api/v1/tenants/xxx/contracts",
  "status": 201,
  "duration_ms": 42,
  "message": "Contract created"
}
```

**Regeln:**
- Keine E-Mail-Adressen in Application Logs.
- Keine Passwörter, Tokens oder Secrets.
- `tenantId` und `requestId` für Korrelation.
- `userId` nur als UUID (nicht als E-Mail).

---

## 12. Offene Punkte

| # | Thema | Owner | Ziel-Sprint |
|---|-------|-------|-------------|
| 1 | OpenSearch-Integration für Audit-Volltext-Suche | Team 07 | Phase 2 |
| 2 | Real-time Audit-Stream (WebSocket für Admin-Dashboard) | Team 02 | Phase 2 |
| 3 | Automated Anomaly Detection (ungewöhnliche Muster) | Team 02 | Phase 2 |
| 4 | Compliance-Report-Generator (PDF) | Team 02 + 05 | Sprint 6 |
| 5 | SIEM-Integration (Splunk, ELK) | Team 07 | Enterprise |
