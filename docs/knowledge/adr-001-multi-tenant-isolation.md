# ADR-001: Multi-Tenant Isolation serverseitig erzwingen (RLS vs. DB-per-Tenant)

**Status:** Accepted → **Operationalisiert**
**Datum:** 2026-02-09 | **Operationalisiert:** 2026-02-10
**Betroffene Teams:** 01, 02, 07

## Kontext
Servanda Office muss strikte Mandanten-Isolation garantieren (DSGVO, Kanzlei-Compliance).
Es gibt zwei sinnvolle Strategien: Shared DB mit Row-Level Security (RLS) oder DB-per-Tenant.
Enterprise/On-Prem benötigt ggf. maximale Isolation, SME-Cloud benötigt Effizienz.

## Entscheidung
Default: **Shared DB + Tenant-ID auf allen Objekten + Postgres RLS** als technisch bevorzugte Isolation.
Option: **DB-per-Tenant** als Enterprise/On-Prem Konfiguration (Feature-Flag).
Zugriffe werden zusätzlich **im Applikationslayer** geprüft (Defense in Depth).

## Konsequenzen
- RLS erfordert klare Tenant-Kontexte in allen Queries und striktes Policy-Management.
- Migrationen müssen RLS-Policies einschließen.
- DB-per-Tenant erhöht Betriebsaufwand, bietet aber stärkere Isolation für Enterprise.

## Alternativen
- Nur Applikationslayer-Isolation (weniger robust, höheres Risiko).
- Physische Trennung pro Tenant als Default (teuer, komplex).

---

## Implementation Specification (Operationalisierung)

### 1. Tenant-Kontext-Propagation

Jeder API-Request muss den Tenant-Kontext tragen. Die Propagation erfolgt in drei Schichten:

```
HTTP Request
  │ Authorization Header → JWT mit tenant_id Claim
  ▼
API Gateway / Middleware
  │ Extrahiert tenant_id aus Token
  │ Setzt PostgreSQL Session-Variable
  ▼
PostgreSQL Session
  │ SET app.current_tenant_id = '{uuid}'
  │ RLS-Policies greifen automatisch
  ▼
Query-Ergebnis (nur Tenant-Daten)
```

**Ablauf im Detail:**
1. **Auth-Middleware** validiert JWT und extrahiert `tenant_id` Claim.
2. **Tenant-Context-Middleware** setzt per DB-Connection:
   ```sql
   SET LOCAL app.current_tenant_id = '{tenant_id}';
   ```
   (`SET LOCAL` gilt nur für die aktuelle Transaktion.)
3. **RLS-Policies** filtern automatisch auf `tenant_id = current_setting('app.current_tenant_id')::uuid`.
4. **App-Layer Guard** prüft zusätzlich, dass `tenantId` an jede Repository-Methode übergeben wird (Defense in Depth).

### 2. RLS-Policy-Template

Für jede tenant-gescoped Tabelle wird ein einheitliches Policy-Muster angewandt:

```sql
-- Beispiel: Tabelle "contract_instances"
ALTER TABLE contract_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_instances FORCE ROW LEVEL SECURITY;

-- Default: Deny All
-- Tenant-Isolation Policy
CREATE POLICY tenant_isolation ON contract_instances
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Insert Policy (gleicher Tenant)
CREATE POLICY tenant_insert ON contract_instances
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**Sonderfall: Publisher-Content (Cross-Tenant Read)**
```sql
-- Kanzleien dürfen Published-Versionen von Verlagen lesen
CREATE POLICY vendor_content_read ON clause_versions
  FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    OR (status = 'published' AND EXISTS (
      SELECT 1 FROM tenants
      WHERE tenants.id = clause_versions.tenant_id
      AND tenants.type = 'vendor'
    ))
  );
```

### 3. Tabellen-Klassifikation

| Kategorie | Tabellen | RLS-Policy |
|-----------|----------|------------|
| **Strict Tenant** | `contract_instances`, `law_firm_templates`, `export_jobs`, `users`, `teams` | Nur eigener Tenant |
| **Publisher Content** | `clause_versions`, `template_versions`, `interview_flows` | Eigener Tenant + Published von Vendors |
| **Publisher Admin** | `clauses`, `templates` | Nur eigener Tenant (Vendor verwaltet) |
| **System** | `style_templates` (type=system) | Globale Leseberechtigung |
| **Audit** | `audit_events` | Nur eigener Tenant |

### 4. App-Layer Guards (Defense in Depth)

Zusätzlich zu RLS werden folgende App-Layer-Checks erzwungen:

```
Repository Interface Konvention:
  Jede Query-Methode erhält tenantId als ersten Parameter.
  Repository-Basisklasse validiert tenantId ≠ null.

Beispiel:
  findContractsByTenant(tenantId: UUID, filters: ...): ContractInstance[]
  createContract(tenantId: UUID, data: ...): ContractInstance

VERBOTEN:
  findAllContracts() ← kein tenantId = Compile-Fehler / Review-Block
```

**Service-Layer:**
- Jeder Service extrahiert `tenantId` aus dem authentifizierten Request-Context.
- `tenantId` wird explizit an Repository-Methoden durchgereicht (kein impliziter Scope).
- Logging: Jeder DB-Zugriff loggt `tenantId` für Audit-Nachvollziehbarkeit.

### 5. Migrations-Strategie

Jede DB-Migration muss folgende Checkliste erfüllen:

- [ ] Neue Tabelle hat `tenant_id UUID NOT NULL` Spalte (FK → tenants).
- [ ] `ENABLE ROW LEVEL SECURITY` und `FORCE ROW LEVEL SECURITY` gesetzt.
- [ ] Passende RLS-Policy erstellt (strict / publisher-content / system).
- [ ] Index auf `tenant_id` vorhanden (Performance).
- [ ] Composite-Index `(tenant_id, ...)` für häufige Queries.
- [ ] Migration-Review durch Team 02 (Security) bestätigt.

### 6. Testing-Anforderungen

**Unit-Tests (pro Repository):**
- Tenant A erstellt Daten → Tenant B kann diese **nicht** lesen/schreiben/löschen.
- Query ohne `tenantId` wird vom App-Layer abgelehnt.

**Integration-Tests (CI-Pflicht):**
```
test("Cross-Tenant-Zugriff wird blockiert"):
  1. Erstelle Tenant A + Tenant B
  2. Erstelle ContractInstance für Tenant A
  3. Setze Session auf Tenant B
  4. SELECT auf contract_instances → Ergebnis: 0 Rows
  5. UPDATE auf Tenant-A-Daten → Ergebnis: 0 Rows affected
  6. DELETE auf Tenant-A-Daten → Ergebnis: 0 Rows affected

test("Publisher-Content ist cross-tenant lesbar"):
  1. Erstelle Vendor-Tenant + ClauseVersion (status: published)
  2. Setze Session auf Lawfirm-Tenant
  3. SELECT auf clause_versions → Published-Versionen des Vendors sichtbar
  4. UPDATE auf Vendor-ClauseVersion → Ergebnis: 0 Rows affected (kein Schreibzugriff)

test("RLS erzwingt Isolation auch bei direktem SQL"):
  1. Setze Session auf Tenant A
  2. Führe raw SQL aus: SELECT * FROM contract_instances WHERE tenant_id = '{tenant_b_id}'
  3. Ergebnis: 0 Rows (RLS filtert trotz expliziter WHERE-Clause)
```

**Performance-Tests:**
- RLS-Overhead bei 100 Tenants / 10.000 Verträge: Query-Latenz < 50ms (P95).
- Index-Validierung: `EXPLAIN ANALYZE` für Hauptqueries zeigt Index-Scan (kein Seq-Scan).

### 7. DB-per-Tenant (Enterprise/On-Prem Feature-Flag)

**Aktivierung:**
- Konfigurationsflag: `TENANT_ISOLATION_MODE=database` (Default: `rls`).
- Tenant-Routing via Connection-Pool (Tenant-ID → DB-Connection-String Mapping).

**Entscheidungskriterien für DB-per-Tenant:**
| Kriterium | Schwellwert |
|-----------|------------|
| Compliance-Anforderung | Regulatorisch vorgeschrieben (z.B. bestimmte Kammern) |
| Deployment-Modell | On-Prem (physische Isolation gewünscht) |
| Datenvolumen | >100.000 Verträge pro Tenant |
| SLA-Level | Enterprise-SLA mit dediziertem Backup/Restore |

**Operativer Mehraufwand:**
- Separate Backup/Restore-Zyklen pro Tenant-DB.
- Schema-Migrationen müssen über alle Tenant-DBs ausgerollt werden (Migrations-Orchestrator).
- Monitoring pro Tenant-DB (Connection-Pool, Storage, Performance).

### 8. Object Storage Isolation

```
Bucket-Layout (RLS-Modus):
  servanda-office-{env}/
    {tenant_id}/exports/...
    {tenant_id}/styles/...
    {tenant_id}/attachments/...

Bucket-Layout (DB-per-Tenant):
  servanda-office-{env}-{tenant_id}/
    exports/...
    styles/...
    attachments/...
```

**Zugriffskontrolle:**
- Presigned URLs mit Tenant-Scope (max. 15 Min. Gültigkeit).
- Server-side Encryption (SSE-S3 Default, SSE-KMS für Enterprise).
- App-Layer validiert: `requestedPath.startsWith(authenticatedTenantId)`.

---

## Offene Punkte (aktualisiert)
- ~~Entscheidungskriterium für DB-per-Tenant~~ → Entschieden (siehe Abschnitt 7).
- Zugriffsmuster für Reporting/Analytics in Shared DB (Owner: Team 01 + 07, Ziel: Sprint 2).
- SIEM-Export-Format für Audit-Events (Owner: Team 02, Ziel: Phase 2).
