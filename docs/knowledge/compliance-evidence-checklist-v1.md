# Compliance Evidence Checklist v1

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 06 (QA & Compliance)
**Referenzen:** Audit-Compliance v1, Threat Model, ADR-001, RBAC/IAM v1, QA-Gates CI v1, Test-Strategy v1

---

## 1. Zweck

Diese Checklist verknüpft jede Compliance-Anforderung (DSGVO, Security, Audit) mit konkretem, testbarem **Evidence** — d.h. automatisierten Tests, CI-Checks, Konfigurationen oder Dokumenten, die den Nachweis erbringen.

**Evidence-Typen:**

| Typ | Beschreibung | Beispiel |
| --- | --- | --- |
| **Automated Test** | CI-Test der bei jedem PR/Merge läuft | `tests/security/tenant-isolation.test.ts` |
| **CI Check** | GitHub Actions Job | `pr-gate.yml#security-rls-coverage` |
| **Configuration** | Konfigurationsdatei oder Infrastruktur-Setting | `keycloak.json`, `postgresql.conf` |
| **Document** | Architektur-Dokument oder Policy | `threat-model-tenant-isolation.md` |
| **Manual Review** | Manuelle Prüfung (Pentest, Code-Review) | Pentest-Report |
| **Audit Log** | Systemgenerierter Nachweis | `audit_events` Tabelle |

---

## 2. Tenant-Isolation Evidence

Referenz: ADR-001, Threat Model T-01..T-12

| # | Anforderung | Evidence-Typ | Evidence-Quelle | CI-Gate | Status |
| --- | --- | --- | --- | --- | --- |
| TI-01 | RLS-Policy auf allen Tenant-Tabellen | Automated Test | `tests/security/rls-enforcement.test.ts` → "All tables have RLS enabled" | G-08 (PR) | Spezifiziert |
| TI-02 | `FORCE ROW LEVEL SECURITY` auf allen Tabellen | Automated Test | `tests/security/rls-enforcement.test.ts` → "RLS is FORCED" | G-08 (PR) | Spezifiziert |
| TI-03 | Cross-Tenant-Zugriff auf Contracts blockiert | Automated Test | `tests/security/tenant-isolation.test.ts` → T-03 | G-07 (PR) | Spezifiziert |
| TI-04 | Cross-Tenant-Zugriff auf Templates blockiert | Automated Test | `tests/security/tenant-isolation.test.ts` → T-03 | G-07 (PR) | Spezifiziert |
| TI-05 | Vendor kann Kanzlei-Verträge nicht lesen | Automated Test | `tests/security/tenant-isolation.test.ts` → T-05 | G-07 (PR) | Spezifiziert |
| TI-06 | Published Vendor-Content ist cross-tenant lesbar | Automated Test | `tests/security/tenant-isolation.test.ts` → "Published content" | G-07 (PR) | Spezifiziert |
| TI-07 | tenant_id nur aus JWT, nie aus Request-Body | Automated Test + Code Review | `tests/security/jwt-security.test.ts` + PR Review Checklist | G-07 (PR) | Spezifiziert |
| TI-08 | Object-Storage Pfad-Traversal blockiert | Automated Test | `tests/security/path-traversal.test.ts` → T-08 | G-07 (PR) | Spezifiziert |
| TI-09 | SQL-Injection umgeht RLS nicht | Automated Test | `tests/security/rls-enforcement.test.ts` → T-02 | G-08 (PR) | Spezifiziert |
| TI-10 | Neue DB-Tabelle ohne RLS wird von CI blockiert | CI Check | `pr-gate.yml#security-rls-coverage` (SQL-Query gegen pg_class) | G-08 (PR) | Spezifiziert |

---

## 3. Authentication & Authorization Evidence

Referenz: RBAC/IAM v1, Threat Model T-01, T-06, T-11

| # | Anforderung | Evidence-Typ | Evidence-Quelle | CI-Gate | Status |
| --- | --- | --- | --- | --- | --- |
| AA-01 | JWT-Signatur-Validierung (RS256/ES256) | Automated Test | `tests/security/jwt-security.test.ts` → T-01 | G-07 (PR) | Spezifiziert |
| AA-02 | Abgelaufene JWTs werden abgelehnt (401) | Automated Test | `tests/security/jwt-security.test.ts` → T-06 | G-07 (PR) | Spezifiziert |
| AA-03 | Fehlender tenant_id-Claim → 401 | Automated Test | `tests/security/jwt-security.test.ts` → "Missing tenant_id" | G-07 (PR) | Spezifiziert |
| AA-04 | RBAC: User kann keine Admin-Actions ausführen | Automated Test | `tests/security/jwt-security.test.ts` → "Role escalation" | G-07 (PR) | Spezifiziert |
| AA-05 | Kein Tenant-Switch ohne Re-Auth | Automated Test | `tests/security/jwt-security.test.ts` → T-11 | G-07 (PR) | Spezifiziert |
| AA-06 | Token-TTL: Access 15 Min., Refresh 8 Std. | Configuration | Keycloak Realm Settings | — | Geplant |
| AA-07 | Refresh-Token-Rotation aktiv | Configuration | Keycloak Realm Settings | — | Geplant |
| AA-08 | MFA optional pro Tenant konfigurierbar | Configuration + Test | Keycloak + E2E | — | Geplant |
| AA-09 | OIDC-Login funktional | E2E Test | `tests/e2e/user-management.spec.ts` | G-11 (Main) | Geplant |
| AA-10 | Vier-Augen-Prinzip für Publishing (Author != Reviewer) | Automated Test | `tests/integration/content-publishing/` | G-10 (Main) | Geplant |

---

## 4. Version Pinning Evidence

Referenz: ADR-002

| # | Anforderung | Evidence-Typ | Evidence-Quelle | CI-Gate | Status |
| --- | --- | --- | --- | --- | --- |
| VP-01 | ContractInstance pinnt TemplateVersion + ClauseVersions | Automated Test | `tests/domain/version-pinning.test.ts` → Pin on creation | G-17 (Release) | Spezifiziert |
| VP-02 | Completed Contract ist immutable (kein Pin-Change) | Automated Test | `tests/domain/version-pinning.test.ts` → Immutability | G-17 (Release) | Spezifiziert |
| VP-03 | DB-Trigger verhindert Pin-Änderung nach Complete | Automated Test | `tests/integration/version-pinning/` → DB Trigger | G-10 (Main) | Spezifiziert |
| VP-04 | Draft kann Versionen upgraden | Automated Test | `tests/domain/version-pinning.test.ts` → Upgrade | G-10 (Main) | Spezifiziert |
| VP-05 | Export referenziert exakte gepinnte Versionen | Automated Test | `tests/domain/export-validation.test.ts` | G-10 (Main) | Spezifiziert |
| VP-06 | Vollständiger Contract-Creation-Journey | E2E Test | `tests/e2e/contract-creation.spec.ts` | G-11 (Main) | Geplant |

---

## 5. Audit & Logging Evidence

Referenz: Audit-Compliance v1

| # | Anforderung | Evidence-Typ | Evidence-Quelle | CI-Gate | Status |
| --- | --- | --- | --- | --- | --- |
| AU-01 | Audit-Tabelle: kein UPDATE erlaubt | Automated Test | `tests/security/audit-immutability.test.ts` → T-12 | G-07 (PR) | Spezifiziert |
| AU-02 | Audit-Tabelle: kein DELETE erlaubt | Automated Test | `tests/security/audit-immutability.test.ts` → T-12 | G-07 (PR) | Spezifiziert |
| AU-03 | Audit-Events haben tenant_id Scoping (RLS) | Automated Test | `tests/security/rls-enforcement.test.ts` | G-08 (PR) | Spezifiziert |
| AU-04 | Identity-Events (login, role_change, etc.) | Automated Test | `tests/integration/audit/identity-events.test.ts` | G-10 (Main) | Geplant |
| AU-05 | Content-Events (create, publish, deprecate) | Automated Test | `tests/integration/audit/content-events.test.ts` | G-10 (Main) | Geplant |
| AU-06 | Contract-Events (create, complete, archive) | Automated Test | `tests/integration/audit/contract-events.test.ts` | G-10 (Main) | Geplant |
| AU-07 | Export-Events (request, complete, fail) | Automated Test | `tests/integration/audit/export-events.test.ts` | G-10 (Main) | Geplant |
| AU-08 | Admin-Events (settings_change, mfa_policy_change) | Automated Test | `tests/integration/audit/admin-events.test.ts` | G-10 (Main) | Geplant |
| AU-09 | Structured JSON Logging mit tenantId | Configuration | Logging-Config (pino/winston) | — | Geplant |
| AU-10 | Keine PII in Application-Logs | Manual Review | Code-Review + Log-Audit | — | Geplant |
| AU-11 | Retention-Policy konfiguriert und getestet | Automated Test | `tests/integration/audit/retention.test.ts` | G-10 (Main) | Geplant |
| AU-12 | Audit-Log UI für Admins | E2E Test | `tests/e2e/audit-log.spec.ts` | G-11 (Main) | Geplant |

---

## 6. DSGVO Evidence

Referenz: Audit-Compliance v1, Teil 2

| # | DSGVO-Artikel | Anforderung | Evidence-Typ | Evidence-Quelle | Status |
| --- | --- | --- | --- | --- | --- |
| DS-01 | Art. 5 | Datenminimierung | Document | Domain Model v1 (nur Email/Name als PII) | Dokumentiert |
| DS-02 | Art. 6 | Rechtsgrundlage dokumentiert | Document | AVV-Template (geplant) | Geplant |
| DS-03 | Art. 17 | User-Löschung anonymisiert PII | Automated Test | `tests/integration/gdpr/user-deletion.test.ts` | Geplant |
| DS-04 | Art. 17 | Audit-Events werden anonymisiert, nicht gelöscht | Automated Test | `tests/integration/gdpr/audit-anonymization.test.ts` | Geplant |
| DS-05 | Art. 20 | Tenant-Datenexport (JSON/CSV) | Automated Test | `tests/integration/gdpr/data-export.test.ts` | Geplant |
| DS-06 | Art. 25 | Privacy by Design (Tenant-Isolation) | Automated Test | TI-01..TI-10 (Cross-Reference) | Spezifiziert |
| DS-07 | Art. 28 | AVV-Template bereitgestellt | Document | AVV-Vorlage | Geplant |
| DS-08 | Art. 30 | Verarbeitungsverzeichnis | Document | Ableitbar aus Domain Model + Audit-Katalog | Geplant |
| DS-09 | Art. 32 | TLS auf allen Verbindungen | Configuration | Ingress/Load-Balancer TLS-Config | Geplant |
| DS-10 | Art. 32 | DB Encryption at Rest | Configuration | PostgreSQL TDE / Cloud Provider Setting | Geplant |
| DS-11 | Art. 32 | Object Storage SSE | Configuration | MinIO/S3 SSE-Config | Geplant |
| DS-12 | Art. 33 | Incident-Response-Plan | Document | IR-Plan (geplant, Owner: Team 02+07) | Geplant |
| DS-13 | Art. 35 | Datenschutz-Folgenabschätzung | Document | DSFA-Dokument (geplant) | Geplant |

---

## 7. Input-Validierung & Härtung Evidence

Referenz: Security-Checkliste (Audit-Compliance v1, Abschnitt 9)

| # | Anforderung | Evidence-Typ | Evidence-Quelle | CI-Gate | Status |
| --- | --- | --- | --- | --- | --- |
| IH-01 | Schema-Validierung auf allen API-Endpoints | Automated Test | `tests/integration/api/` → Schema-Validation | G-10 (Main) | Geplant |
| IH-02 | Parameterized Queries (kein Raw-SQL mit User-Input) | Code Review + Linting | ESLint custom rule / PR Review | G-01 (PR) | Geplant |
| IH-03 | CSP-Header konfiguriert | Configuration + Test | Helmet.js Config + `tests/integration/api/headers.test.ts` | — | Geplant |
| IH-04 | CORS auf erlaubte Origins beschränkt | Configuration + Test | CORS-Config + Header-Test | — | Geplant |
| IH-05 | Rate Limiting aktiv | Configuration + Test | Rate-Limit-Config + Load-Test | — | Geplant |
| IH-06 | File-Upload-Validierung | Automated Test | `tests/integration/api/upload.test.ts` | G-10 (Main) | Geplant |

---

## 8. Dependency & Build Security Evidence

| # | Anforderung | Evidence-Typ | Evidence-Quelle | CI-Gate | Status |
| --- | --- | --- | --- | --- | --- |
| DB-01 | Dependency Scanning in CI | CI Check | `main-gate.yml#dependency-scan` (`npm audit`) | G-14 (Main) | Spezifiziert |
| DB-02 | Keine High/Critical CVEs | CI Check | `npm audit --audit-level=high` | G-14 (Main) | Spezifiziert |
| DB-03 | SBOM generiert | CI Check | `main-gate.yml#sbom` (CycloneDX) | G-15 (Main) | Spezifiziert |
| DB-04 | Docker-Images minimal (distroless/alpine) | Configuration | Dockerfile | — | Geplant |
| DB-05 | Dependabot aktiv | Configuration | `.github/dependabot.yml` | — | Spezifiziert |

---

## 9. Accessibility Evidence

| # | Anforderung | Evidence-Typ | Evidence-Quelle | CI-Gate | Status |
| --- | --- | --- | --- | --- | --- |
| A11Y-01 | axe-core 0 Violations auf allen Komponenten | Automated Test | `npm run test:a11y` | G-06 (PR) | Spezifiziert |
| A11Y-02 | Lighthouse Accessibility >= 90 | CI Check | `main-gate.yml#lighthouse` | G-13 (Main) | Spezifiziert |
| A11Y-03 | Keyboard-only Navigation | Manual Review | PR Review Checklist | — | Geplant |
| A11Y-04 | Screen Reader Compatibility | Manual Review | PR Review Checklist | — | Geplant |
| A11Y-05 | Farben nicht einziges Unterscheidungsmerkmal | Manual Review | PR Review Checklist | — | Geplant |

---

## 10. Performance Evidence

| # | Anforderung | Evidence-Typ | Evidence-Quelle | CI-Gate | Status |
| --- | --- | --- | --- | --- | --- |
| PF-01 | Lighthouse Performance >= 90 | CI Check | `main-gate.yml#lighthouse` | G-12 (Main) | Spezifiziert |
| PF-02 | Bundle Size < 200 KB (JS gzip) | CI Check | `pr-gate.yml#bundle-size` (size-limit) | G-09 (PR, Warning) | Spezifiziert |
| PF-03 | Render 1000 Fragen < 500 ms | Automated Test | `tests/unit/components/performance.test.ts` | G-03 (PR) | Geplant |
| PF-04 | Contract Creation API < 200 ms | Automated Test | `tests/integration/api/performance.test.ts` | G-10 (Main) | Geplant |
| PF-05 | First Contentful Paint < 1.5 s | CI Check | Lighthouse CI | G-12 (Main) | Spezifiziert |

---

## 11. Evidence-Reifegradmodell

### Status-Definitionen

| Status | Bedeutung | Nächster Schritt |
| --- | --- | --- |
| **Dokumentiert** | Anforderung ist in Architektur-Docs beschrieben | Test spezifizieren |
| **Spezifiziert** | Test/Check ist im QA-Gates-Dokument definiert | Implementieren |
| **Implementiert** | Test/Check läuft in CI | Validieren |
| **Validiert** | Evidence ist geprüft und freigegeben | Maintenance |

### Fortschritts-Zusammenfassung

| Kategorie | Gesamt | Dokumentiert | Spezifiziert | Implementiert | Validiert |
| --- | --- | --- | --- | --- | --- |
| Tenant Isolation (TI) | 10 | 0 | 10 | 0 | 0 |
| Auth & Authorization (AA) | 10 | 0 | 5 | 0 | 0 |
| Version Pinning (VP) | 6 | 0 | 5 | 0 | 0 |
| Audit & Logging (AU) | 12 | 0 | 3 | 0 | 0 |
| DSGVO (DS) | 13 | 2 | 1 | 0 | 0 |
| Input/Härtung (IH) | 6 | 0 | 0 | 0 | 0 |
| Dependencies (DB) | 5 | 0 | 4 | 0 | 0 |
| Accessibility (A11Y) | 5 | 0 | 2 | 0 | 0 |
| Performance (PF) | 5 | 0 | 3 | 0 | 0 |
| **Gesamt** | **72** | **2** | **33** | **0** | **0** |

**Ziel MVP-Launch:** >= 90% der Evidence auf Status "Implementiert" oder "Validiert".

---

## 12. Review-Zyklus

| Event | Aktion | Owner |
| --- | --- | --- |
| Sprint-Ende | Status-Update der Evidence-Matrix, neue Checks "Implementiert" markieren | Team 06 |
| Neues Feature | Evidence-Anforderungen ergänzen (Security, DSGVO, A11Y) | Feature-Team + Team 06 |
| Neuer Threat-Scenario | TI/AA-Evidence ergänzen | Team 02 + Team 06 |
| Vor Release | Vollständiger Evidence-Review, alle "Spezifiziert" auf "Implementiert" prüfen | Team 06 + Team 02 |
| Quartals-Review | DSGVO-Evidence-Vollständigkeit prüfen, Audit-Log-Stichprobe | Team 06 + Team 02 |
| Audit/Zertifizierung | Evidence-Paket zusammenstellen (Tests + Reports + Configs + Docs) | Team 06 |
