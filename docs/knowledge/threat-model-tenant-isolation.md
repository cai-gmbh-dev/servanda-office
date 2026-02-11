# Threat Model: Tenant-Isolation

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 02 (Platform Security & Identity)
**Referenzen:** ADR-001, Domain Model v1, Architecture Backbone v1

---

## 1. Scope & Ziel

**Schutzobjekt:** Vollständige Isolation aller Mandantendaten (Verträge, Klauseln, Nutzer, Audit-Logs, Exporte) zwischen Tenants.

**Angreifer-Profile:**

| Profil | Beschreibung | Motivation |
| --- | --- | --- |
| **Neugieriger Kanzlei-Nutzer** | Authentifizierter User einer Kanzlei | Daten anderer Kanzleien einsehen |
| **Kompromittierter Account** | Valider JWT, aber von Angreifer kontrolliert | Laterale Bewegung über Tenant-Grenzen |
| **Malicious Insider (Vendor)** | Verlag-Redakteur mit Vendor-Tenant | Zugriff auf Kanzlei-Verträge |
| **Externer Angreifer** | Kein gültiger Account | Unautorisierter Zugriff auf beliebige Tenant-Daten |
| **Privilegierter Angreifer** | Kompromittierter Platform-Admin | Zugriff auf alle Tenants |

---

## 2. Trust Boundaries

```text
┌─────────────────────────────────────────────────────────────┐
│  TRUST BOUNDARY 1: Client ↔ API                            │
│  ─────────────────────────────────────────────────          │
│  Client (Browser/SPA) ist UNTRUSTED.                        │
│  Alle Eingaben werden serverseitig validiert.               │
│  JWT wird bei jedem Request verifiziert.                    │
│                                                             │
│  TRUST BOUNDARY 2: API ↔ DB                                │
│  ─────────────────────────────────────────────────          │
│  API-Layer setzt Tenant-Context auf DB-Connection.          │
│  RLS-Policies filtern automatisch.                          │
│  App-Layer prüft zusätzlich (Defense in Depth).             │
│                                                             │
│  TRUST BOUNDARY 3: Tenant A ↔ Tenant B                     │
│  ─────────────────────────────────────────────────          │
│  Kein Tenant darf Daten eines anderen lesen/schreiben.      │
│  Ausnahme: Published Vendor-Content (Read-only).            │
│                                                             │
│  TRUST BOUNDARY 4: API ↔ Object Storage                    │
│  ─────────────────────────────────────────────────          │
│  Presigned URLs mit Tenant-Scope. Pfad-Validierung.         │
│  Server-side Encryption.                                    │
│                                                             │
│  TRUST BOUNDARY 5: Export Worker ↔ Core API                 │
│  ─────────────────────────────────────────────────          │
│  Worker hat keinen direkten DB-Write (außer Job-Status).    │
│  Worker erhält nur gepinnte Versionen + Tenant-Scope.       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Datenfluss mit Tenant-Kontext

```text
Browser (Tenant A User)
    │ HTTPS + JWT (tenant_id=A, role=user)
    ▼
API Gateway
    │ 1. JWT-Validierung (Signatur, Expiry, Claims)
    │ 2. tenant_id extrahiert
    │ 3. RBAC-Check (role × action × resource)
    ▼
Tenant-Context Middleware
    │ SET LOCAL app.current_tenant_id = 'A'
    ▼
Service Layer
    │ tenantId als expliziter Parameter
    ▼
Repository Layer
    │ Query mit tenantId-Parameter (App-Layer Guard)
    ▼
PostgreSQL + RLS
    │ RLS Policy: WHERE tenant_id = current_setting(...)
    │ → Nur Tenant-A-Daten zurückgegeben
    ▼
Response (nur Tenant-A-Daten)
```

---

## 4. STRIDE-Analyse

### 4.1 Spoofing (Identitätsvortäuschung)

| Bedrohung | Mitigation | Status |
| --- | --- | --- |
| JWT-Fälschung (anderer tenant_id) | JWT-Signaturvalidierung (RS256/ES256), kein HS256 | Geplant |
| Session-Hijacking | Secure/HttpOnly Cookies, kurze Token-TTL (15 Min.) | Geplant |
| Tenant-ID-Manipulation in Request-Body | tenant_id wird **nur aus JWT** extrahiert, nie aus Request-Body | Spezifiziert (ADR-001) |
| Replay-Angriff mit abgelaufenem Token | Token-Expiry-Validierung, optional Token-Blacklist bei Logout | Geplant |

### 4.2 Tampering (Datenmanipulation)

| Bedrohung | Mitigation | Status |
| --- | --- | --- |
| SQL-Injection mit `WHERE tenant_id = 'B'` | RLS filtert unabhängig von Query-Inhalt + Parameterized Queries | Spezifiziert (ADR-001) |
| Direkte DB-Manipulation (Bypass API) | `FORCE ROW LEVEL SECURITY` auch für Table-Owner, DB-Credentials rotieren | Spezifiziert (ADR-001) |
| Object-Storage-Pfad-Manipulation (`../tenant-b/`) | Server-side Pfadvalidierung: `path.startsWith(tenantId)`, keine User-generierten Pfade | Spezifiziert (ADR-001) |
| Manipulation von Audit-Events | Audit-Tabelle: kein UPDATE/DELETE erlaubt (DB-Policy), separate DB-Rolle | Geplant |

### 4.3 Repudiation (Abstreitbarkeit)

| Bedrohung | Mitigation | Status |
| --- | --- | --- |
| Nutzer bestreitet Aktion (Export, Löschung) | Immutable AuditEvent mit actorId, timestamp, IP | Spezifiziert (Domain Model v1) |
| Admin bestreitet Rollenwechsel | AuditEvent `user.role_change` mit details (old/new) | Spezifiziert |
| Fehlende Zuordnung bei System-Events | System-Events: actorId = NULL, aber action + objectId traceable | Spezifiziert |

### 4.4 Information Disclosure (Datenleck)

| Bedrohung | Mitigation | Status |
| --- | --- | --- |
| Cross-Tenant-Query liefert fremde Daten | RLS-Policy + App-Layer Guard (doppelte Prüfung) | Spezifiziert (ADR-001) |
| Error-Messages leaken Tenant-B-Daten | Generische Fehlermeldungen, keine Entity-IDs anderer Tenants in Responses | Geplant |
| Logs enthalten Tenant-B-Daten | Structured Logging mit tenantId-Scope, Log-Aggregation per Tenant | Geplant |
| Vendor sieht Kanzlei-Verträge | RLS: Vendor-Tenant hat keinen Zugriff auf Contract-Tabellen anderer Tenants | Spezifiziert (ADR-001) |
| Object-Storage-URL erraten | Presigned URLs mit 15 Min. Expiry + Tenant-Scope, UUIDs statt vorhersagbare IDs | Spezifiziert (ADR-001) |
| Timing-Angriff (Existenz einer Entity prüfen) | Einheitliche Antwortzeiten, generische 404 für alle "nicht gefunden" | Geplant |

### 4.5 Denial of Service

| Bedrohung | Mitigation | Status |
| --- | --- | --- |
| Ein Tenant überlastet DB (teure Queries) | Per-Tenant Rate Limiting, Query-Timeout, Connection-Pool-Limits | Geplant |
| Export-Queue-Flooding | Per-Tenant Export-Job-Limit (z.B. max. 5 concurrent), Queue-Priorität | Geplant |
| Massenregistrierung von Tenants | Tenant-Erstellung nur durch Platform-Admin, Rate Limiting | Geplant |
| Storage-Erschöpfung durch einen Tenant | Per-Tenant Storage-Quota (konfigurierbar), Monitoring | Geplant |

### 4.6 Elevation of Privilege

| Bedrohung | Mitigation | Status |
| --- | --- | --- |
| User ändert eigene Rolle auf Admin | Rollen nur durch Admin änderbar, Server-side Enforcement | Geplant |
| JWT-Claim-Manipulation (role: admin) | JWT-Signaturvalidierung, Claims aus Auth-Provider, nicht Client | Geplant |
| Cross-Tenant-Admin (Admin von Tenant A agiert in Tenant B) | tenant_id im JWT ist unveränderlich, kein Tenant-Switch ohne Re-Auth | Spezifiziert (ADR-001) |
| Platform-Admin Missbrauch | Audit-Trail für Platform-Admin, Vier-Augen-Prinzip für kritische Ops | Geplant |

---

## 5. Bedrohungsszenarien (konkret)

| # | Szenario | Likelihood | Impact | Risk | Mitigation |
| --- | --- | --- | --- | --- | --- |
| T-01 | Kanzlei-User manipuliert JWT tenant_id | Low | Critical | High | JWT-Signaturvalidierung (RS256), tenant_id nur aus verifiziertem Token |
| T-02 | SQL-Injection umgeht RLS | Low | Critical | High | Parameterized Queries (ORM), RLS als Safety-Net, kein Raw-SQL mit User-Input |
| T-03 | API-Endpoint vergisst Tenant-Scoping | Medium | Critical | Critical | App-Layer Guard (tenantId Pflichtparameter), Code-Review-Pflicht, CI-Test |
| T-04 | Export-Worker liefert Dokument an falschen Tenant | Low | Critical | High | Worker validiert tenantId aus Job-Record, Object-Storage-Pfad enthält tenantId |
| T-05 | Vendor-Redakteur greift auf Kanzlei-Verträge zu | Low | High | Medium | RLS: Strict-Tenant-Policy auf contract_instances, keine Publisher-Content-Ausnahme |
| T-06 | Abgelaufener JWT wird wiederverwendet | Medium | High | High | Token-Expiry (15 Min.), Refresh-Token-Rotation, optional Token-Blacklist |
| T-07 | Platform-Admin liest Kanzlei-Daten unbefugt | Low | High | Medium | Audit-Trail für Admin-Zugriffe, Vier-Augen-Prinzip, Alert bei Admin-Queries |
| T-08 | Object-Storage-Pfad Traversal (`../../tenant-b/`) | Medium | Critical | High | Server-side Pfad-Normalisierung + Prefix-Check, keine User-generierten Pfade |
| T-09 | Neue DB-Tabelle ohne RLS-Policy | Medium | Critical | Critical | Migrations-Checkliste (ADR-001), CI-Check: alle Tabellen mit RLS |
| T-10 | Error-Response leakt Daten eines anderen Tenants | Medium | Medium | Medium | Generische Fehlermeldungen, keine Entity-Details in 403/404 |
| T-11 | Concurrent-Session-Exploit (Nutzer in zwei Tenants) | Low | Medium | Low | Ein JWT pro Tenant-Session, kein Tenant-Switch ohne Re-Auth |
| T-12 | Audit-Event gelöscht/manipuliert | Low | High | Medium | Append-only Policy (kein UPDATE/DELETE), separate DB-Rolle für Audit-Writer |

**Risk-Rating:** Critical > High > Medium > Low

---

## 6. Residual Risks

| # | Risiko | Verbleibendes Level | Akzeptanz-Begründung |
| --- | --- | --- | --- |
| R-01 | RLS-Bug in PostgreSQL | Very Low | PostgreSQL RLS ist produktionsbewährt; regelmäßige Updates mitigieren |
| R-02 | Platform-Admin-Missbrauch | Low | Audit-Trail + Alerting; organisatorische Kontrolle (Hiring, NDA) |
| R-03 | Zero-Day in Keycloak/Auth-Provider | Low | Regelmäßige Updates, WAF, Security-Monitoring |
| R-04 | Side-Channel-Angriffe (Timing, Cache) | Low | Akzeptiert für MVP; Phase 2: Hardening |
| R-05 | Insider-Threat (Entwickler mit DB-Zugriff) | Low | Prod-DB nur via bastion, minimale Rechte, Audit |

---

## 7. Testing-Anforderungen

### Automatisierte Security-Tests (CI-Pflicht)

| Test | Beschreibung | Frequenz |
| --- | --- | --- |
| Cross-Tenant-Access | Tenant A erstellt Daten → Tenant B kann nicht zugreifen | Jeder PR |
| RLS-Enforcement | Raw-SQL mit fremder tenant_id liefert 0 Rows | Jeder PR |
| JWT-Manipulation | Modifizierter JWT wird abgelehnt (401) | Jeder PR |
| Missing-Tenant-ID | Request ohne tenant_id im JWT → 401 | Jeder PR |
| Role-Escalation | User-Role kann keine Admin-Actions ausführen (403) | Jeder PR |
| Object-Storage-Path-Traversal | Pfad mit `../` wird blockiert | Jeder PR |
| Audit-Immutability | UPDATE/DELETE auf audit_events schlägt fehl | Jeder PR |
| RLS-on-all-Tables | CI prüft: jede Tabelle hat `ENABLE ROW LEVEL SECURITY` | Jeder PR |

### Manuelle Penetration-Tests

| Test | Scope | Frequenz |
| --- | --- | --- |
| Tenant-Isolation Pentest | Vollständiger Cross-Tenant-Angriff (API + DB + Storage) | Vor MVP-Launch |
| Auth-Bypass Assessment | JWT-Manipulation, Session-Attacks, OIDC-Misconfig | Vor MVP-Launch |
| OWASP Top 10 Scan | SQL Injection, XSS, CSRF, etc. | Vierteljährlich |

---

## 8. Review-Zyklus

| Event | Aktion |
| --- | --- |
| Neues ADR/Architekturänderung | Threat Model reviewen und ggf. aktualisieren |
| Neuer Bounded Context / Modul | STRIDE-Analyse für neuen Context |
| Security Incident | Post-Mortem → Threat Model erweitern |
| Vierteljährlich | Scheduled Review durch Team 02 |
| Vor jedem Major Release | Vollständiger Review + Pentest |
