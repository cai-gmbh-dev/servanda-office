# Updates – Platform Security & Identity

## Initial

- Team aufgesetzt.
- Kernanforderungen aus EPIC 1 priorisiert.

## 2026-02-09

- Start Phase 0–1 Orchestrierung.
- Deliverables diese Woche: Threat Model Tenant-Isolation, RBAC/IAM v1, Audit-Event-Katalog v0.1.
- Abhängigkeiten: ADR-001 (RLS vs DB-per-Tenant) Entscheidungsvorlage an Team 01.
- Owner Matrix bestätigt: `docs/plan/sprint-status.md`.

## 2026-02-10

**Sprint-1 Deliverables abgeschlossen.**

Erstellte Artefakte:

- **Threat Model Tenant-Isolation** (`docs/knowledge/threat-model-tenant-isolation.md`)
  STRIDE-Analyse über 6 Bedrohungskategorien, 5 Trust Boundaries, 12 konkrete Bedrohungsszenarien mit Risk-Rating, Mitigationen (verknüpft mit ADR-001), 5 Residual Risks, automatisierte Security-Tests (8 CI-Pflicht-Tests), Pentest-Anforderungen.
- **RBAC/IAM-Modell v1** (`docs/knowledge/rbac-iam-model-v1.md`)
  Rollenmodell für Vendor (vendor_admin, author, reviewer) und Lawfirm (admin, editor, user), vollständige Berechtigungsmatrizen, Keycloak Realm-Struktur, JWT Token-Claims, Token-Lifecycle, Multi-Tenant-User, Session-Management, MFA-Konzept, User-Lifecycle, API-Autorisierung.
- **Audit-Event-Katalog + Compliance-Checkliste** (`docs/knowledge/audit-compliance-v1.md`)
  30+ Audit-Events über 6 Kategorien, Event-Schema, DB-Schema mit RLS + Immutability, Retention-Policies, DSGVO-Compliance-Matrix (Art. 5-35), Löschkonzept, Verschlüsselungskonzept, Security-Checkliste (25+ Checkpunkte).

Input-Quellen:

- ADR-001 Implementation Spec (operationalisiert durch Team 01)
- Domain Model v1 (finalisiert durch Team 01)
- Architecture Backbone v1 (erstellt durch Team 01)

Nächste Schritte Team 02:

- Sprint 2: RBAC-Implementation in Keycloak umsetzen.
- Audit-Event-Infrastruktur implementieren (E7.S0).
- Security-Checkliste als CI-Gates mit Team 06 abstimmen.
- Threat Model Review nach Pentest-Ergebnissen.

## 2026-02-10 (Sprint 3)

**Sprint-3 Deliverables abgeschlossen.**

Erstellte Artefakte:

- **Audit Logging E2E Spezifikation** (`docs/knowledge/audit-logging-e2e-v1.md`) — gemeinsam mit Team 07
  AuditService-Interface und Implementation (TypeScript). Error-Handling-Prinzip: Audit-Fehler dürfen Hauptoperationen NICHT blockieren. Fallback-Queue (In-Memory, max 1000 Events, 5 Min Puffer). Request-Context-Middleware (Tenant/Actor/IP/UA). Auto-Audit-Decorator für Service-Methoden. Keycloak Login-Event-Integration (SPI oder Webhook). DB: Monatliche Partitionierung via pg_partman. Retention-Service: Täglicher Cronjob, Archivierung nach S3 JSON-Lines (Pro/Enterprise), Löschung (Starter/Team). Query-API mit Wildcard-Filtern (user.*, contract.*). Admin-Dashboard-UI mit Event-Detail-Ansicht. Prometheus-Metriken + Alert-Rules. 12 E2E-Testszenarien (Playwright). Strukturierte Trennung: Audit-Events vs. Application-Logging.

Input-Quellen:

- Audit-Event-Katalog + Compliance-Checkliste (Team 02, Sprint 1)
- Deployment-Blueprint v1 (Team 07)
- Architecture Backbone v1 (Team 01)

Nächste Schritte Team 02:

- Sprint 4: AuditService implementieren (Append-Only, RLS, Partitionierung).
- Keycloak SPI für Login-Events konfigurieren.
- Retention-Service implementieren und mit DSGVO-Löschkonzept abstimmen.
- Alert-Rules in Prometheus/Grafana einrichten (mit Team 07).

## 2026-02-11 (Sprint 4)

**Sprint-4 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Prisma Schema v1** (`apps/api/prisma/schema.prisma`)
  12 Tabellen über 4 Bounded Contexts: Platform (Tenant, User, Team, AuditEvent), Content (Clause, ClauseVersion, Template, TemplateVersion, InterviewFlow), Contract (ContractInstance, LawFirmTemplate), Export (ExportJob, StyleTemplate). Vollständige Indexierung, JSONB-Felder für Rules/Questions/Answers.

- **RLS Migration v1** (`apps/api/prisma/migrations/00001_enable_rls/migration.sql`)
  RLS auf allen 12 tenant-scoped Tabellen. Cross-Tenant Content-Zugriff (published vendor content für lawfirms). Schreib-Policies (INSERT/UPDATE nur eigener Tenant). Immutability-Trigger: Pin-Schutz nach Completion (ADR-002), Content-Schutz nach Draft-Phase, Audit-Events unveränderbar.

- **Tenant-Context-Middleware** (`apps/api/src/middleware/tenant-context.ts`)
  Extrahiert tenant_id/user_id/role aus Request-Headers (Dev-Mode). `getTenantContext()` Helper. TODO: JWT-Validierung gegen Keycloak (Sprint 5).

- **Error-Handler-Middleware** (`apps/api/src/middleware/error-handler.ts`)
  AppError-Hierarchie (NotFoundError, ForbiddenError, ConflictError), Zod-Validation-Mapping, strukturierte API-Error-Responses.

Nächste Schritte Team 02:

- Sprint 5: JWT-Validierung gegen Keycloak OIDC implementieren.
- AuditService-Klasse implementieren (Append-Only, Fallback-Queue).
- Keycloak Realm-Konfiguration + User-Provisioning.
- Identity-API-Endpunkte (Users CRUD, Audit-Logs Query).

## 2026-02-11 (Sprint 5)

**Sprint-5 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **JWT Auth Middleware** (`apps/api/src/middleware/auth.ts`)
  `authenticate()`: Async Middleware validiert JWT Bearer Tokens via Keycloak JWKS (jwks-rsa mit 10min Cache + Rate-Limiting). Extrahiert tenantId, userId, role aus Token-Claims. Dev-Fallback: x-tenant-id/x-user-id/x-user-role Headers. `requireRole(...allowedRoles)`: Factory für RBAC-Middleware. Ersetzt `tenantContext` in main.ts.

- **AuditService** (`apps/api/src/services/audit.service.ts`)
  `AuditServiceImpl` Singleton mit `log()` (RLS-Transaction, nie throws, Error-Isolation) und `query()` (paginiert, Filter nach action/objectType/objectId/from/to). In-Memory-Fallback-Queue (max 1000 Events, 30s Flush-Timer). `shutdown()` für graceful Process-Exit.

- **Identity API** (`apps/api/src/modules/identity/routes.ts`)
  GET /users (paginiert, RLS-scoped). POST /users/invite (Admin-only, Zod-Validation, Conflict-Check, Audit-Log). PATCH /users/:id (Admin-only, Role-Update, Audit-Log). GET /audit-logs (Admin-only, Filter-Parameters).

Nächste Schritte Team 02:

- Sprint 6: Keycloak Realm-Konfiguration automatisieren (realm-export.json).
- User-Provisioning API (Keycloak Admin API Integration).
- MFA-Konfiguration (TOTP) für Admin-Rollen.
- Security-Headers-Review und CORS-Policy-Hardening.

## 2026-02-11 (Sprint 6)

**Sprint-6 Deliverables abgeschlossen (gemeinsam mit Team 07).**

Erstellte Artefakte:

- **Keycloak Realm-Automation** (`docker/keycloak/realm-export.json`)
  Realm "servanda" mit Auto-Import via `--import-realm`. Client `servanda-office` (public SPA): redirectUris für localhost:8081/5173, directAccessGrants, tenant-id-Mapper (Hardcoded Claim → Lawfirm-Tenant UUID). 3 Realm-Rollen + 3 Client-Rollen (admin/editor/user). 3 Dev-Users: admin@musterkanzlei.de, editor@musterkanzlei.de, user@musterkanzlei.de mit vorgesetzten Passwörtern. Docker-Compose aktualisiert: `start-dev --import-realm` + Volume-Mount.

Nächste Schritte Team 02:

- Sprint 7: User-Provisioning API (Keycloak Admin API Integration).
- MFA-Konfiguration (TOTP) für Admin-Rollen.
- Security-Headers-Review und CORS-Policy-Hardening.
- Passwort-Policies im Realm konfigurieren.

## 2026-02-11 (Sprint 7)

**Sprint 7 — keine Team-02-spezifischen Code-Deliverables.** Security-Review und Beratung.

Sprint-7 Aktivitäten:

- Review der K8s Network Policies auf Security-Konformität (mit Team 07).
- Review der Sealed Secrets Staging-Konfiguration (mit Team 07).
- Beratung zu Publishing-Gates-Integration (Vier-Augen-Prinzip in PG-C04/PG-T04).

Nächste Schritte Team 02:

- Sprint 8: User-Provisioning API (Keycloak Admin API Integration).
- MFA-Konfiguration (TOTP) für Admin-Rollen.
- Security-Headers-Review und CORS-Policy-Hardening.
- Passwort-Policies im Realm konfigurieren.
- CSRF-Token-Handling für SPA evaluieren.

## 2026-02-11 (Sprint 8)

**Sprint-8 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **User-Provisioning API erweitert** (`apps/api/src/modules/identity/routes.ts`, ~352 Zeilen)
  Neue Endpoints: GET /users/:id (Einzelbenutzer), GET /me (aktueller Benutzer), POST /users/:id/activate (Admin-only, Status invited→active), POST /users/:id/deactivate (Admin-only, Self-Guard), DELETE /users/:id (Admin-only, Self-Guard). PATCH /users/:id erweitert um displayName-Feld. `formatUser()` Helper für konsistente Response-Struktur inkl. mfaEnabled und lastLoginAt.

- **Security-Headers gehärtet** (über Team 01 in `apps/api/src/main.ts`)
  Helmet CSP mit expliziten Direktiven (defaultSrc, scriptSrc, styleSrc, imgSrc, connectSrc, fontSrc, objectSrc='none', frameAncestors='none'). Cross-Origin-Embedder-Policy, Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy. Referrer-Policy: strict-origin-when-cross-origin. CORS: explizite Methods/Headers, credentials, maxAge 86400.

Nächste Schritte Team 02:

- Sprint 9: Keycloak Admin API Integration (User-Provisioning in Keycloak synchronisieren).
- MFA-Konfiguration (TOTP) für Admin-Rollen im Realm.
- Passwort-Policies im Realm konfigurieren (Länge, Komplexität, Ablauf).
- CSRF-Token-Handling für SPA evaluieren.
- Rate-Limiting für Auth-Endpoints implementieren.

## 2026-02-11 (Sprint 9)

**Sprint-9 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Keycloak Admin API Service** (`apps/api/src/services/keycloak-admin.ts`, ~290 Zeilen)
  `KeycloakAdminService` Klasse als Wrapper um die Keycloak Admin REST API. Verwendet nativen `fetch` (keine zusätzlichen Dependencies). Admin-Token-Beschaffung via Resource Owner Password Credentials Grant gegen Master-Realm mit automatischem Caching (minus 30s Sicherheitspuffer). User-CRUD: `createUser()` (gibt Keycloak-ID zurück, parsed Location-Header), `updateUser()`, `deleteUser()`, `enableUser()`, `disableUser()`. MFA: `requireMfa()` setzt CONFIGURE_TOTP Required Action (liest bestehende Actions, merged). Role-Mapping: `assignRealmRole()` (Zwei-Schritt: Role-Lookup nach ID, dann Role-Mapping POST). Error-Isolation: Alle Methoden fangen Fehler ab und loggen via pino — Keycloak-Sync blockiert nie die Hauptoperation. Konfiguration über 5 Env-Vars mit Dev-Defaults. Singleton-Export `keycloakAdmin`.

- **MFA TOTP-Konfiguration** (`docker/keycloak/realm-export.json` erweitert)
  OTP Policy: TOTP mit HmacSHA1, 6 Digits, 30s Intervall, LookAhead 1, Code nicht wiederverwendbar. Required Actions: CONFIGURE_TOTP (Priorität 10, enabled), UPDATE_PASSWORD, UPDATE_PROFILE, VERIFY_EMAIL, TERMS_AND_CONDITIONS (disabled). Custom Authentication Flow `servanda-browser`: Cookie-Check (ALTERNATIVE) → Forms-Sub-Flow (ALTERNATIVE) mit Username/Password (REQUIRED) → Conditional OTP Sub-Flow (CONDITIONAL) mit `conditional-user-role` Authenticator (config: condUserRole=admin, negate=false) + OTP-Form (REQUIRED). Realm-Level `browserFlow` auf `servanda-browser` gesetzt. Dev-Admin-User (`admin@musterkanzlei.de`) hat `requiredActions: ["CONFIGURE_TOTP"]` — wird beim nächsten Login zur TOTP-Einrichtung aufgefordert.

Nächste Schritte Team 02:

- Sprint 10: Keycloak Admin API in Identity-Routes integrieren (Sync bei invite/activate/deactivate/delete).
- Passwort-Policies im Realm konfigurieren (Länge, Komplexität, Ablauf).
- CSRF-Token-Handling für SPA evaluieren.
- Rate-Limiting für Auth-Endpoints implementieren.
- Keycloak Admin API Unit-Tests schreiben (Mock-fetch).

## 2026-02-11 (Sprint 10)

**Sprint-10 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Keycloak Admin API in Identity-Routes integriert** (`apps/api/src/modules/identity/routes.ts`)
  Alle User-Lifecycle-Operationen synchronisieren jetzt mit Keycloak: POST /users/invite ruft `keycloakAdmin.createUser()` + `assignRealmRole()`. PATCH /users/:id (Role-Change) ruft `keycloakAdmin.assignRealmRole()`. POST /users/:id/activate ruft `keycloakAdmin.enableUser()`. POST /users/:id/deactivate ruft `keycloakAdmin.disableUser()`. DELETE /users/:id ruft `keycloakAdmin.deleteUser()`. Alle Sync-Aufrufe sind error-isolated (Keycloak-Fehler blockieren nicht die DB-Operation). `keycloakId` wird beim Invite in der DB gespeichert.

- **Rate-Limiting Middleware** (`apps/api/src/middleware/rate-limit.ts`)
  In-Memory Rate-Limiter: `authRateLimiter` (20 Requests/Minute für Auth-Endpoints), `apiRateLimiter` (200 Requests/Minute für allgemeine API). Sliding-Window pro IP. Cleanup-Intervall (60s) für abgelaufene Einträge. HTTP 429 mit Retry-After-Header.

- **Passwort-Policies im Realm** (`docker/keycloak/realm-export.json`)
  `passwordPolicy`: Mindestlänge 12 Zeichen, 1 Großbuchstabe, 1 Kleinbuchstabe, 1 Ziffer, 1 Sonderzeichen, kein Username, Passwort-History (3 letzte Passwörter).

- **Prisma-Schema erweitert** (`apps/api/prisma/schema.prisma`)
  `keycloakId String? @map("keycloak_id") @db.VarChar(255)` zum User-Model hinzugefügt für Keycloak↔DB-Mapping.

Nächste Schritte Team 02:

- Session-Management-Härtung (Token-Rotation, Logout-Propagation).
- Audit-Service-Integration für Rate-Limit-Events.

## 2026-02-11 (Sprint 11)

**Sprint-11 Deliverables abgeschlossen.**

Erstellte Artefakte:

- **Keycloak Admin API Unit-Tests** (`apps/api/src/services/__tests__/keycloak-admin.test.ts`)
  Vollständige Test-Suite mit Mock-fetch: Token-Beschaffung + Caching, createUser (Location-Header-Parsing), updateUser, deleteUser, enableUser, disableUser, requireMfa (CONFIGURE_TOTP Required Action), assignRealmRole (Zwei-Schritt: Role-Lookup + Mapping). Error-Isolation-Tests (Keycloak-Fehler blockieren nicht Hauptoperation).

- **CSRF-Evaluierung** (`docs/knowledge/csrf-evaluation-v1.md`)
  Analyse: SameSite=Lax Cookies (Browser-Default seit Chrome 80) + Bearer-Token-Authentifizierung machen explizite CSRF-Tokens für SPAs überflüssig. Empfehlung: Kein CSRF-Token-Handling implementieren, stattdessen SameSite-Cookie-Policy sicherstellen und CORS-Konfiguration als Defense-in-Depth.

Nächste Schritte Team 02:

- Session-Management-Härtung (Token-Rotation, Logout-Propagation).
- Audit-Service-Integration für Rate-Limit-Events.
- Keycloak Backup-Strategie (Realm-Export-Automatisierung).

## 2026-02-11 (Sprint 12)

**Sprint-12 Deliverables abgeschlossen.**

Erstellte Artefakte:

- **Session-Hardening Middleware** (`apps/api/src/middleware/session-hardening.ts`, ~600 Zeilen)
  Token-Fingerprinting: SHA-256 aus User-Agent + /24-Subnet, `sid_fp`-Claim-Validierung. Idle-Timeout: 30min konfigurierbar (SESSION_IDLE_TIMEOUT_MS). Concurrent-Session-Limiting: Max 3 aktive Sessions pro User. Logout-Handler mit Keycloak-Propagation. Backchannel-Logout-Handler für Keycloak-Webhook (logout_token JWT). In-Memory Session-Stores mit periodischem Cleanup.

- **Keycloak Backup-Strategie** (`docs/knowledge/keycloak-backup-strategy-v1.md`)
  Realm-Export-Automatisierung: K8s CronJob täglicher Export um 03:00 UTC via `kcadm.sh`. S3-Upload mit Komprimierung. Recovery-Playbook. Retention: 30 Tage täglich, 1 Jahr monatlich.
