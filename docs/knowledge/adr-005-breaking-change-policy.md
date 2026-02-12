# ADR-005: Breaking-Change-Policy für API, DB-Schema und Realm-Konfiguration

**Status:** Accepted
**Datum:** 2026-02-11
**Betroffene Teams:** 01, 02, 03, 04, 05, 07

## Kontext

Servanda Office ist eine Multi-Tenant-Plattform mit mehreren Konsumenten der API-Schnittstellen:
das React-Frontend, der Export-Worker, Keycloak-Integrationen und potenziell externe API-Nutzer
(z.B. Kanzlei-eigene Automatisierungen). Mit der Einführung des API-v1-Prefix in Sprint 8
existieren Legacy-Routes (`/api/...`) und versionierte Routes (`/api/v1/...`) parallel.

In einem Multi-Tenant-Umfeld mit Rolling Updates, On-Prem-Deployments und unterschiedlichen
Update-Zyklen der Mandanten ist eine unkontrollierte API-Evolution nicht tragbar. Breaking Changes
ohne Vorwarnung führen zu:

- Ausfällen bei Mandanten, die nicht sofort aktualisieren können (On-Prem).
- Inkonsistenzen zwischen Frontend und Backend bei gestaffelten Deployments.
- Vertrauensverlust bei externen Integratoren.
- Datenbank-Migrationen, die Rollbacks unmöglich machen.

Eine formale Breaking-Change-Policy stellt sicher, dass alle Änderungen vorhersagbar,
kommuniziert und migrierbar sind.

## Entscheidung

### 1. API-Versionierung: Semantic Versioning

API-Versionen folgen dem Schema `v{major}` im URL-Prefix: `/api/v1/...`, `/api/v2/...`.

- **Major-Version (v1 → v2):** Erlaubt Breaking Changes. Neue Major-Version wird parallel
  zur vorherigen betrieben.
- **Minor/Patch:** Werden nicht im URL abgebildet. Non-Breaking-Erweiterungen und Bugfixes
  landen in der bestehenden Major-Version.

### 2. Definition: Breaking vs. Non-Breaking

| Kategorie | Beispiele | Einordnung |
|-----------|-----------|------------|
| **Breaking** | Entfernung eines Endpoints | Major |
| **Breaking** | Umbenennung eines Endpoints oder Pfads | Major |
| **Breaking** | Entfernung oder Umbenennung eines Response-Feldes | Major |
| **Breaking** | Änderung eines Response-Typs (z.B. `string` → `number`) | Major |
| **Breaking** | Entfernung oder Umbenennung von Enum-Werten | Major |
| **Breaking** | Pflichtfeld in Request-Body hinzufügen (ohne Default) | Major |
| **Breaking** | Änderung von HTTP-Statuscodes für bestehende Szenarien | Major |
| Non-Breaking | Neuer optionaler Query-Parameter | Patch |
| Non-Breaking | Neues optionales Feld im Request-Body | Patch |
| Non-Breaking | Neues Feld im Response-Body | Patch |
| Non-Breaking | Neuer Endpoint | Minor |
| Non-Breaking | Bugfix (Verhalten entspricht Dokumentation) | Patch |
| Non-Breaking | Performance-Verbesserung ohne Verhaltensänderung | Patch |

### 3. Deprecation-Zeitraum

Breaking Changes werden **mindestens 2 Sprints** vor der Entfernung angekündigt.

```
Sprint N:    Deprecation-Notice wird veröffentlicht
             → X-Deprecated Header auf betroffenen Endpoints
             → Changelog-Eintrag mit Migration Guide
Sprint N+1:  Erinnerung im Changelog, Monitoring der Nutzung
Sprint N+2:  Frühester Zeitpunkt für Entfernung in neuer Major-Version
```

### 4. Deprecation-Signalisierung: `X-Deprecated` Header

Deprecated Endpoints liefern den Response-Header:

```
X-Deprecated: true
X-Deprecated-Since: 2026-02-11
X-Deprecated-Sunset: 2026-03-25
X-Deprecated-See: /api/v2/tenants/{tenantId}/contracts
```

Frontend und Export-Worker loggen `X-Deprecated`-Header als Warnings.
Monitoring-Dashboards aggregieren Deprecation-Hits pro Endpoint.

### 5. DB-Schema: Additive Migrationen

Prisma-Migrationen müssen **immer additiv** sein:

| Erlaubt (Non-Breaking) | Verboten ohne Migration-Script |
|------------------------|-------------------------------|
| Neue Spalte mit `DEFAULT` oder `NULL` | `DROP COLUMN` |
| Neuer Index | `DROP TABLE` |
| Neuer Enum-Wert (`ALTER TYPE ... ADD VALUE`) | `ALTER COLUMN ... TYPE` (Typwechsel) |
| Neue Tabelle | Umbenennung von Spalten/Tabellen |
| Neuer Constraint (sofern bestehende Daten valide) | Entfernung von Enum-Werten |

**Destruktive DB-Änderungen** erfordern:
1. Migration-Script mit Daten-Migration (Up + Down).
2. Rollback-Plan, verifiziert in Staging.
3. Review durch Team 01 (Architecture) und Team 02 (Security).
4. Ankündigung im Changelog mindestens 1 Sprint vorher.
5. Ausführung nur in einem Maintenance-Window.

### 6. Keycloak Realm-Konfiguration

- `realm-export.json` wird versioniert im Repository (`docker/keycloak/`).
- Realm-Updates müssen **backward-compatible** sein:
  - Neue Rollen/Scopes dürfen hinzugefügt werden.
  - Bestehende Rollen/Scopes dürfen nicht entfernt oder umbenannt werden, ohne
    den Deprecation-Prozess (2 Sprints) zu durchlaufen.
  - Client-Konfigurationen (Redirect-URIs, Scopes) werden additiv erweitert.
- Breaking Realm-Änderungen erfordern einen Migration-Guide für On-Prem-Betreiber.

## Prozess

### Schritt-für-Schritt

```
1. RFC erstellen
   → Autor beschreibt geplante Änderung im Team-01-Review
   → Betroffene Teams werden identifiziert

2. ADR schreiben (wenn Major-Version oder DB-Destruction)
   → Entscheidung wird dokumentiert
   → Review durch betroffene Teams

3. Deprecation Notice (Sprint N)
   → X-Deprecated Header aktivieren
   → Changelog-Eintrag mit Migration Guide
   → Betroffene Teams und On-Prem-Betreiber informieren

4. Migration Guide bereitstellen
   → Code-Beispiele für alten → neuen Aufruf
   → Automatisierte Codemods wo möglich

5. Entfernung (frühestens Sprint N+2)
   → Alter Endpoint / Feld / Enum wird entfernt
   → Neue Major-Version wird Default
   → Changelog-Eintrag: "Removed"
```

### Changelog-Pflicht

Jede API-Version erhält Changelog-Einträge im Format:

```markdown
## v1.x — Sprint 9

### Added
- `GET /api/v1/tenants/{tenantId}/clauses/batch` — Batch-Clause-Content-Endpoint

### Deprecated
- `GET /api/clauses/:id` — Use `GET /api/v1/tenants/{tenantId}/clauses/{clauseId}` instead
  Sunset: Sprint 11

### Removed
- (none)
```

## Konsequenzen

**Positiv:**
- Vorhersagbare API-Evolution für alle Konsumenten (Frontend, Worker, Externe).
- On-Prem-Mandanten haben ausreichend Zeit für Updates.
- Rollback-Fähigkeit bei DB-Änderungen bleibt gewährleistet.
- Keycloak-Realm-Änderungen sind nachvollziehbar und migrierbar.
- Erhöhtes Vertrauen externer Integratoren in die Plattform-Stabilität.

**Negativ / Trade-offs:**
- Höherer Aufwand pro Breaking Change (RFC, ADR, Migration Guide, 2-Sprint-Vorlauf).
- Parallelbetrieb zweier API-Versionen erhöht Wartungsaufwand temporär.
- Strikte DB-Migrations-Regeln können Feature-Entwicklung verlangsamen.

## Alternativen

- **Keine formale Policy:** Schnellere Entwicklung, aber unvorhersagbare Ausfälle bei Mandanten.
- **Longer Deprecation (4+ Sprints):** Sicherer für On-Prem, aber bremst Innovation.
- **URL-basierte Minor-Versionen (`/api/v1.2/`):** Höhere Granularität, aber komplexeres Routing.
- **GraphQL statt REST-Versionierung:** Intrinsisch non-breaking durch Schema-Erweiterung,
  aber erheblicher Umbau des bestehenden REST-API-Stacks.

---

## Offene Punkte

- Automatisiertes Deprecation-Monitoring-Dashboard (Owner: Team 07, Ziel: Sprint 10).
- Codemod-Tooling für Frontend-Migration bei Major-Versionen (Owner: Team 04, Ziel: bei Bedarf).
- Formales SLA für On-Prem-Update-Zyklen (Owner: Team 01 + 07, Ziel: Phase 2).
