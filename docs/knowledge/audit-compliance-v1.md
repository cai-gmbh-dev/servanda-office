# Audit-Event-Katalog & Compliance-Checkliste v1

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 02 (Platform Security & Identity)
**Referenzen:** Domain Model v1, Architecture Backbone v1, ADR-001

---

# Teil 1: Audit-Event-Katalog

## 1. Überblick

**Prinzipien:**

- **Immutable:** Audit-Events werden nie geändert oder gelöscht (nur Retention-basiert archiviert).
- **Tenant-gescoped:** Jedes Event gehört zu genau einem Tenant.
- **Append-only:** Nur INSERT, kein UPDATE/DELETE auf die Audit-Tabelle.
- **Automatisch:** Events werden vom System erzeugt, nicht vom Client.

---

## 2. Event-Schema

```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "actorId": "uuid | null",
  "actorEmail": "string (for display, anonymizable)",
  "action": "string (category.verb)",
  "objectType": "string (entity type)",
  "objectId": "uuid",
  "details": {
    "description": "Human-readable summary",
    "changes": { "field": { "old": "...", "new": "..." } },
    "metadata": {}
  },
  "severity": "info | warning | critical",
  "ipAddress": "string | null",
  "userAgent": "string | null",
  "timestamp": "ISO 8601 timestamp"
}
```

---

## 3. Event-Katalog

### Identity-Events

| Action | Trigger | Severity | Required Details |
| --- | --- | --- | --- |
| `user.login` | Erfolgreicher Login | info | `{ method: "password\|mfa\|sso" }` |
| `user.login_failed` | Fehlgeschlagener Login | warning | `{ reason: "invalid_password\|account_locked\|mfa_failed" }` |
| `user.logout` | Expliziter Logout | info | — |
| `user.invite` | Admin lädt Nutzer ein | info | `{ email, role }` |
| `user.activate` | Nutzer akzeptiert Einladung | info | — |
| `user.role_change` | Rollenänderung | critical | `{ oldRole, newRole, changedBy }` |
| `user.deactivate` | Admin deaktiviert Nutzer | warning | `{ reason }` |
| `user.delete` | Nutzer-Löschung (DSGVO) | critical | `{ anonymizedFields }` |
| `user.password_change` | Passwort geändert | info | `{ initiatedBy: "self\|admin\|reset" }` |
| `user.mfa_enable` | MFA aktiviert | info | `{ method: "totp\|webauthn" }` |
| `user.mfa_disable` | MFA deaktiviert | warning | `{ disabledBy }` |

### Content-Events (Vendor)

| Action | Trigger | Severity | Required Details |
| --- | --- | --- | --- |
| `clause.create` | Neue Klausel erstellt | info | `{ clauseId, title }` |
| `clause_version.create` | Neue Version erstellt | info | `{ clauseId, versionNumber }` |
| `clause_version.submit_review` | Zur Review eingereicht | info | `{ versionId, reviewerId }` |
| `clause_version.approve` | Version genehmigt | info | `{ versionId, reviewerId }` |
| `clause_version.reject` | Version abgelehnt | info | `{ versionId, reviewerId, reason }` |
| `clause_version.publish` | Version veröffentlicht | critical | `{ versionId, versionNumber }` |
| `clause_version.deprecate` | Version deprecated | warning | `{ versionId, reason, affectedContracts }` |
| `template.create` | Neues Template erstellt | info | `{ templateId, title }` |
| `template_version.create` | Neue Template-Version | info | `{ templateId, versionNumber }` |
| `template_version.publish` | Template veröffentlicht | critical | `{ versionId, clauseCount }` |
| `template_version.deprecate` | Template deprecated | warning | `{ versionId, reason }` |

### Contract-Events

| Action | Trigger | Severity | Required Details |
| --- | --- | --- | --- |
| `contract.create` | Vertrag erstellt (draft) | info | `{ templateVersionId, clauseCount }` |
| `contract.update` | Vertrag bearbeitet (answers/slots) | info | `{ changedFields[] }` |
| `contract.version_upgrade` | Draft auf neue Version aktualisiert | warning | `{ oldTemplateVersionId, newTemplateVersionId, migrationReport }` |
| `contract.complete` | Vertrag fertiggestellt | info | `{ validationState }` |
| `contract.archive` | Vertrag archiviert | info | `{ reason }` |
| `contract.delete` | Vertrag gelöscht | critical | `{ title, retentionCheck }` |
| `contract.clone_as_template` | Vertrag als Kanzlei-Template abgeleitet | info | `{ lawFirmTemplateId }` |

### Export-Events

| Action | Trigger | Severity | Required Details |
| --- | --- | --- | --- |
| `export.request` | Export angefordert | info | `{ contractId, format: "docx\|odt", styleTemplateId }` |
| `export.complete` | Export erfolgreich | info | `{ jobId, format, fileSize, duration_ms }` |
| `export.fail` | Export fehlgeschlagen | warning | `{ jobId, errorMessage }` |
| `export.download` | Export-Datei heruntergeladen | info | `{ jobId }` |

### Admin-Events

| Action | Trigger | Severity | Required Details |
| --- | --- | --- | --- |
| `tenant.settings_change` | Tenant-Einstellungen geändert | warning | `{ changedSettings: { field: { old, new } } }` |
| `tenant.mfa_policy_change` | MFA-Policy geändert | critical | `{ oldPolicy, newPolicy }` |
| `team.create` | Team erstellt | info | `{ teamName }` |
| `team.member_add` | Mitglied hinzugefügt | info | `{ userId, teamId }` |
| `team.member_remove` | Mitglied entfernt | info | `{ userId, teamId }` |
| `style_template.create` | Style-Template erstellt | info | `{ name }` |
| `style_template.update` | Style-Template aktualisiert | info | `{ name, changedFields }` |

### System-Events (actorId = null)

| Action | Trigger | Severity | Required Details |
| --- | --- | --- | --- |
| `system.retention_cleanup` | Retention-Policy ausgeführt | info | `{ deletedCount, retentionDays }` |
| `system.export_timeout` | Export-Job Timeout | warning | `{ jobId, timeout_ms }` |

---

## 4. Speicherung & Retention

### 4.1 DB-Schema

```sql
CREATE TABLE audit_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  actor_id    UUID REFERENCES users(id),
  actor_email VARCHAR(255),
  action      VARCHAR(100) NOT NULL,
  object_type VARCHAR(100) NOT NULL,
  object_id   UUID NOT NULL,
  details     JSONB,
  severity    VARCHAR(20) NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  ip_address  VARCHAR(45),
  user_agent  TEXT,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON audit_events
  FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Nur INSERT erlaubt (Immutability)
CREATE POLICY audit_insert ON audit_events
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Kein UPDATE/DELETE Policy = implizit verboten durch RLS

-- Indices
CREATE INDEX idx_audit_tenant_time ON audit_events(tenant_id, timestamp DESC);
CREATE INDEX idx_audit_tenant_action ON audit_events(tenant_id, action);
CREATE INDEX idx_audit_tenant_object ON audit_events(tenant_id, object_type, object_id);

-- Partitioning (nach Monat, für Performance bei großen Datenmengen)
-- Implementierung via pg_partman oder native PARTITION BY RANGE
```

### 4.2 Retention-Policies

| Paket | Retention | Archivierung | Löschung |
| --- | --- | --- | --- |
| Starter | 90 Tage | Keine | Nach 90 Tagen gelöscht |
| Team | 90 Tage | Keine | Nach 90 Tagen gelöscht |
| Pro | 365 Tage | Cold Storage nach 365 Tagen | Nach 730 Tagen gelöscht |
| Enterprise | Unbegrenzt (DB) | Optional Cold Storage | Nur auf Anfrage |

**Archivierungs-Mechanismus:**

- Cronjob prüft täglich Retention-Deadlines pro Tenant.
- Events jenseits der Retention werden in Object Storage archiviert (JSON-Lines).
- Archivierte Events werden aus der DB gelöscht.
- Löschung wird als `system.retention_cleanup` Event protokolliert.

### 4.3 DSGVO-Löschung

Bei User-Löschung (Art. 17):

- `actor_email` wird auf `anonymized` gesetzt.
- `ip_address` wird auf `null` gesetzt.
- `user_agent` wird auf `null` gesetzt.
- `actor_id` bleibt als UUID (nicht personenbezogen).
- Event-Inhalt (action, object, details) bleibt erhalten (fachliche Nachvollziehbarkeit).

---

## 5. Abfrage & Darstellung

### 5.1 API-Endpoints

```yaml
GET /api/v1/tenants/{tenantId}/audit-logs
  Query-Parameter:
    from: ISO date (default: 30 Tage zurück)
    to: ISO date (default: jetzt)
    action: string (Filter, z.B. "user.login")
    actorId: uuid (Filter)
    objectType: string (Filter)
    objectId: uuid (Filter)
    severity: string (Filter)
    limit: integer (default: 50, max: 200)
    offset: integer (default: 0)
  Response:
    total: integer
    events: AuditEvent[]

GET /api/v1/tenants/{tenantId}/audit-logs/export
  Query-Parameter: (gleich wie oben)
  Accept: text/csv | application/json
  Response: File-Download (CSV oder JSON)
```

### 5.2 UI-Anforderungen

- Admin-Dashboard mit Audit-Log-Tabelle.
- Filter: Zeitraum, Aktion, Akteur, Objekt-Typ, Severity.
- Sortierung nach Timestamp (neueste zuerst).
- Detail-Ansicht pro Event (JSON-Details aufgeklappt).
- Export-Button (CSV/JSON).
- Severity-Badges (info=grau, warning=gelb, critical=rot).

---

# Teil 2: Compliance-Checkliste

## 6. DSGVO-Compliance-Matrix

| Artikel | Anforderung | Implementierung | Status | Owner |
| --- | --- | --- | --- | --- |
| **Art. 5** | Datenminimierung, Zweckbindung | Nur notwendige personenbezogene Daten (Name, E-Mail); Vertragsinhalte sind fachlich, nicht personenbezogen | Geplant | Team 02 |
| **Art. 6** | Rechtsgrundlage für Verarbeitung | Auftragsverarbeitung (Art. 28) + berechtigtes Interesse (Plattformbetrieb) | Geplant | Team 02 |
| **Art. 17** | Recht auf Löschung | User-Löschung anonymisiert personenbezogene Daten; Audit-Events werden anonymisiert, nicht gelöscht | Spezifiziert | Team 02 |
| **Art. 20** | Datenportabilität | Tenant-Datenexport (Verträge, Templates, Metadaten) als JSON/CSV | Geplant (Epic 7) | Team 05 |
| **Art. 25** | Privacy by Design | Tenant-Isolation (RLS), Verschlüsselung, minimale Daten | Spezifiziert | Team 01, 02 |
| **Art. 28** | Auftragsverarbeitung | AVV-Template bereitstellen, TOMs dokumentieren | Geplant | Team 02 |
| **Art. 30** | Verzeichnis der Verarbeitungstätigkeiten | Automatisch aus Domain Model + Audit-Katalog ableitbar | Geplant | Team 02 |
| **Art. 32** | Sicherheit der Verarbeitung | TLS, Encryption at Rest, RBAC, Audit-Logs, Backup | Spezifiziert | Team 02, 07 |
| **Art. 33** | Meldung von Datenschutzverletzungen | Incident-Response-Plan, Monitoring + Alerting | Geplant | Team 02, 07 |
| **Art. 35** | Datenschutz-Folgenabschätzung | DSFA-Dokument für Multi-Tenant-Verarbeitung juristischer Daten | Geplant | Team 02 |

---

## 7. Datenschutz-Konzepte

### 7.1 Personenbezogene Daten im System

| Datum | Entity | Zweck | Löschbar |
| --- | --- | --- | --- |
| E-Mail | User | Login, Einladung | Ja (Anonymisierung) |
| Anzeigename | User | UI-Darstellung | Ja (Anonymisierung) |
| IP-Adresse | AuditEvent | Sicherheits-Audit | Ja (Nulling) |
| User-Agent | AuditEvent | Sicherheits-Audit | Ja (Nulling) |

**Nicht personenbezogen** (fachliche Daten): Verträge, Klauseln, Templates, Antworten, Rules, Export-Dateien — diese gehören dem Tenant, nicht dem User.

### 7.2 Löschkonzept

```text
User-Löschung (Art. 17):
  1. User.email → "deleted-{hash}@anonymized.local"
  2. User.displayName → "Gelöschter Nutzer"
  3. User.status → "deleted"
  4. AuditEvent.actorEmail → "anonymized"
  5. AuditEvent.ipAddress → null
  6. AuditEvent.userAgent → null
  7. Keycloak: User-Account gelöscht
  8. AuditEvent: user.delete protokolliert

Tenant-Löschung:
  1. Alle User des Tenants → anonymisiert (wie oben)
  2. Alle Verträge → gelöscht (oder archiviert, je nach Vereinbarung)
  3. Alle Exports → aus Object Storage gelöscht
  4. Audit-Events → archiviert (Retention-Policy), dann gelöscht
  5. DB-Rows → gelöscht (CASCADE auf tenant_id)
  6. Object Storage → Tenant-Prefix gelöscht
```

### 7.3 Portabilität (Art. 20)

**Export-Umfang pro Tenant:**

| Daten | Format | Enthalten |
| --- | --- | --- |
| Nutzer | JSON | ID, Name, E-Mail, Rolle, Teams |
| Verträge | JSON + DOCX | Metadaten + letzte Export-Datei |
| Kanzlei-Templates | JSON | Metadaten + Custom-Answers |
| Audit-Logs | CSV/JSON | Alle Events im Retention-Zeitraum |
| Style-Templates | DOCX | Template-Dateien |

---

## 8. Verschlüsselungskonzept

| Schicht | Technologie | Scope |
| --- | --- | --- |
| **In Transit** | TLS 1.2+ (1.3 bevorzugt), HSTS | Alle Verbindungen (Client↔API, API↔DB, API↔Storage) |
| **DB at Rest** | PostgreSQL TDE (Transparent Data Encryption) | Gesamte Datenbank |
| **Object Storage** | SSE-S3 (Default), SSE-KMS (Enterprise) | Alle Dateien |
| **Tenant-Keys** | SSE-KMS mit per-Tenant Key (Enterprise) | Object Storage + optionale Field-Level Encryption |
| **Secrets** | Kubernetes Secrets (encrypted etcd) oder Vault | API-Keys, DB-Credentials, Keycloak-Secrets |

**Key Rotation:**

| Key-Typ | Rotationsintervall | Automatisiert |
| --- | --- | --- |
| TLS-Zertifikate | 90 Tage (Let's Encrypt) oder 1 Jahr | Ja |
| DB-Credentials | 90 Tage | Ja (Vault/K8s) |
| KMS Master Key | 1 Jahr | Ja (KMS-managed) |
| Keycloak Signing Key | 1 Jahr | Manuell (Realm Settings) |
| Tenant-spezifische Keys | 1 Jahr | Ja (KMS-managed) |

---

## 9. Security-Checkliste (MVP Launch)

### Authentifizierung & Autorisierung

- [ ] OIDC-Login via Keycloak funktional und getestet
- [ ] JWT-Signatur-Validierung (RS256/ES256, kein HS256)
- [ ] Token-Expiry erzwungen (15 Min. Access, 8 Std. Refresh)
- [ ] RBAC serverseitig für alle Endpoints erzwungen
- [ ] Vier-Augen-Prinzip für Publish-Workflow (Author ≠ Reviewer)
- [ ] MFA optional konfigurierbar pro Tenant

### Tenant-Isolation

- [ ] RLS-Policies auf allen tenant-gescoped Tabellen aktiv
- [ ] `FORCE ROW LEVEL SECURITY` auf allen Tabellen
- [ ] Cross-Tenant-Access-Tests in CI (grün)
- [ ] App-Layer Guards: tenantId Pflichtparameter in allen Repositories
- [ ] Object-Storage-Pfad-Validierung (Tenant-Prefix)

### Verschlüsselung

- [ ] TLS 1.2+ auf allen Verbindungen
- [ ] HSTS-Header konfiguriert
- [ ] DB Encryption at Rest aktiviert
- [ ] Object Storage SSE aktiviert
- [ ] Keine Secrets in Code/Config-Dateien (Vault/K8s Secrets)

### Audit & Logging

- [ ] Audit-Event-Katalog vollständig implementiert (alle 30+ Events)
- [ ] Audit-Tabelle: kein UPDATE/DELETE möglich
- [ ] Structured JSON Logging mit tenantId
- [ ] Keine personenbezogenen Daten in Application-Logs
- [ ] Retention-Policy konfiguriert und getestet

### Input-Validierung & Härtung

- [ ] Schema-Validierung (Zod/Joi) auf allen API-Endpoints
- [ ] Parameterized Queries (kein Raw-SQL mit User-Input)
- [ ] CSP-Header konfiguriert
- [ ] CORS auf erlaubte Origins beschränkt
- [ ] Rate Limiting aktiv (per Tenant, per User)
- [ ] File-Upload-Validierung (Typ, Größe, Malware-Scan)

### Dependency & Build Security

- [ ] Dependency Scanning (Dependabot/Snyk) in CI aktiv
- [ ] Keine bekannten Critical/High Vulnerabilities
- [ ] SBOM generiert
- [ ] Docker-Images auf minimaler Base (distroless/alpine)

### Backup & Recovery

- [ ] DB-Backup-Strategie dokumentiert und getestet
- [ ] Object-Storage-Backup/Replication konfiguriert
- [ ] Recovery-Test durchgeführt (Restore von Backup)
- [ ] Incident-Response-Plan dokumentiert

---

## 10. Review-Zyklus

| Event | Aktion | Owner |
| --- | --- | --- |
| Neuer Audit-Event-Typ benötigt | Katalog erweitern, PR-Review durch Team 02 | Alle Teams |
| Quartals-Review | Compliance-Checkliste prüfen, Risiken aktualisieren | Team 02 |
| Security Incident | Post-Mortem, Checkliste erweitern | Team 02 + 07 |
| Vor Major Release | Vollständiger Compliance-Check + Pentest | Team 02 + 06 |
| DSGVO-Anfrage (Löschung/Export) | Prozess-Review, Dokumentation aktualisieren | Team 02 |
