# RBAC/IAM-Modell v1

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 02 (Platform Security & Identity)
**Referenzen:** Domain Model v1, Architecture Backbone v1, ADR-001

---

## 1. Überblick

Dieses Dokument definiert das Identity & Access Management (IAM) für Servanda Office MVP. Es umfasst Rollenmodell, Authentifizierung, Autorisierung und User-Lifecycle.

**Prinzipien:**

- Least Privilege: Nutzer erhalten nur die minimal nötigen Rechte.
- Serverseitige Enforcement: Client-Berechtigungen sind nur UX-Hints, nie Security-Grenze.
- Tenant-Scoping: Jeder Auth-Kontext ist an genau einen Tenant gebunden.
- Auditierbarkeit: Jede Rechteänderung wird als AuditEvent protokolliert.

---

## 2. Rollenmodell

### 2.1 Rollen nach Tenant-Typ

#### Vendor-Tenant (Verlag)

| Rolle | Beschreibung | Typische Nutzer |
| --- | --- | --- |
| `vendor_admin` | Verlag-Administration, Nutzerverwaltung, Muster-Freigabe | Verlagsleitung |
| `author` | Klauseln/Muster erstellen und bearbeiten | Juristische Autoren |
| `reviewer` | Inhalte reviewen und freigeben | Senior-Redakteure |

#### Lawfirm-Tenant (Kanzlei)

| Rolle | Beschreibung | Typische Nutzer |
| --- | --- | --- |
| `admin` | Kanzlei-Administration, Nutzerverwaltung, Settings | Kanzlei-Inhaber/IT |
| `editor` | Verträge + Kanzlei-Templates erstellen/verwalten | Anwälte (Senior) |
| `user` | Verträge erstellen und exportieren | Anwälte, Assistenz |

#### Platform-Level

| Rolle | Beschreibung | Typische Nutzer |
| --- | --- | --- |
| `platform_admin` | Systembetrieb, Tenant-Verwaltung, Monitoring | DevOps/Support |

### 2.2 Berechtigungsmatrix — Lawfirm-Tenant

| Ressource / Aktion | `admin` | `editor` | `user` |
| --- | --- | --- | --- |
| **Tenant** | | | |
| Tenant-Einstellungen lesen | ✓ | – | – |
| Tenant-Einstellungen ändern | ✓ | – | – |
| **Nutzer** | | | |
| Nutzer einladen | ✓ | – | – |
| Nutzer deaktivieren/löschen | ✓ | – | – |
| Rollen zuweisen | ✓ | – | – |
| Eigenes Profil bearbeiten | ✓ | ✓ | ✓ |
| **Teams** | | | |
| Teams erstellen/verwalten | ✓ | – | – |
| Team-Mitgliedschaft sehen | ✓ | ✓ | ✓ |
| **Verträge** | | | |
| Vertrag erstellen | ✓ | ✓ | ✓ |
| Eigene Verträge lesen/bearbeiten | ✓ | ✓ | ✓ |
| Team-Verträge lesen | ✓ | ✓ | ✓ |
| Team-Verträge bearbeiten | ✓ | ✓ | – |
| Vertrag löschen/archivieren | ✓ | ✓ (eigene) | – |
| **Export** | | | |
| DOCX exportieren | ✓ | ✓ | ✓ |
| ODT exportieren (Beta) | ✓ | ✓ | ✓ |
| **Kanzlei-Templates** | | | |
| Template erstellen (Clone) | ✓ | ✓ | – |
| Template verwalten | ✓ | ✓ | – |
| Template nutzen (Vertrag erstellen) | ✓ | ✓ | ✓ |
| **Styles** | | | |
| Style-Templates verwalten | ✓ | ✓ | – |
| Style-Template auswählen | ✓ | ✓ | ✓ |
| **Audit** | | | |
| Audit-Logs einsehen | ✓ | – | – |
| Audit-Logs exportieren | ✓ | – | – |

### 2.3 Berechtigungsmatrix — Vendor-Tenant

| Ressource / Aktion | `vendor_admin` | `author` | `reviewer` |
| --- | --- | --- | --- |
| **Klauseln** | | | |
| Klausel erstellen | ✓ | ✓ | – |
| Klausel bearbeiten (Draft) | ✓ | ✓ | – |
| Rules definieren | ✓ | ✓ | – |
| Submit for Review | ✓ | ✓ | – |
| Review + Approve | ✓ | – | ✓ |
| Publish | ✓ | – | – |
| Deprecate | ✓ | – | – |
| **Templates** | | | |
| Template erstellen | ✓ | ✓ | – |
| Template-Struktur bearbeiten | ✓ | ✓ | – |
| Interview-Flow definieren | ✓ | ✓ | – |
| Review + Approve | ✓ | – | ✓ |
| Publish | ✓ | – | – |
| **Nutzer** | | | |
| Nutzer einladen/verwalten | ✓ | – | – |
| Reviewer zuweisen | ✓ | – | – |
| **Audit** | | | |
| Audit-Logs einsehen | ✓ | – | – |

### 2.4 Rollenhierarchie

```text
Platform-Admin (Superuser — nur für Systembetrieb)
    │
    ├── Vendor-Tenant
    │   └── vendor_admin → author + reviewer (erbt alle Rechte)
    │       ├── author
    │       └── reviewer
    │
    └── Lawfirm-Tenant
        └── admin → editor + user (erbt alle Rechte)
            └── editor → user (erbt alle Rechte)
                └── user
```

**Vier-Augen-Prinzip:** Ein `author` kann seine eigenen Inhalte nicht selbst reviewen. `review` → `approved` erfordert einen anderen Nutzer mit `reviewer`-Rolle.

---

## 3. Identity-Architektur

### 3.1 Keycloak Realm-Struktur

```text
Keycloak
└── Realm: servanda-office
    ├── Client: servanda-spa (Public, PKCE)
    ├── Client: servanda-api (Confidential, Service Account)
    │
    ├── User Federation (Phase 2: LDAP/AD)
    │
    ├── Roles (Realm-Level):
    │   └── platform_admin
    │
    ├── Groups (= Tenants):
    │   ├── tenant-{uuid-a} (attributes: type=lawfirm)
    │   │   ├── Roles: admin, editor, user
    │   │   └── Members: user-1 (admin), user-2 (editor), ...
    │   │
    │   └── tenant-{uuid-b} (attributes: type=vendor)
    │       ├── Roles: vendor_admin, author, reviewer
    │       └── Members: user-3 (vendor_admin), ...
    │
    └── Authentication Flows:
        ├── Browser Flow (Standard + optional MFA)
        └── Direct Grant (disabled in Production)
```

**Entscheidung:** Ein Realm für die gesamte Plattform. Tenants werden als Keycloak-Groups mit Tenant-spezifischen Rollen modelliert.

### 3.2 JWT Token-Struktur

```json
{
  "iss": "https://auth.servanda.office/realms/servanda-office",
  "sub": "user-uuid",
  "aud": "servanda-api",
  "exp": 1739200000,
  "iat": 1739199100,

  "tenant_id": "tenant-uuid",
  "tenant_type": "lawfirm",
  "role": "editor",
  "permissions": ["contract.create", "contract.read", "contract.export", "template.manage"],

  "email": "anwalt@kanzlei.de",
  "name": "Max Mustermann",

  "session_state": "session-uuid",
  "acr": "1"
}
```

**Custom Claims** (via Keycloak Protocol Mapper):

| Claim | Quelle | Beschreibung |
| --- | --- | --- |
| `tenant_id` | Group Attribute | Aktiver Tenant des Users |
| `tenant_type` | Group Attribute | `vendor` oder `lawfirm` |
| `role` | Group Role | Rolle im aktiven Tenant |
| `permissions` | Derived from Role | Aufgelöste Berechtigungen |

### 3.3 Token-Lifecycle

| Parameter | Wert | Konfigurierbar |
| --- | --- | --- |
| Access Token TTL | 15 Minuten | Ja (per Tenant, Enterprise) |
| Refresh Token TTL | 8 Stunden | Ja |
| Refresh Token Rotation | Enabled (One-Time-Use) | Fest |
| Offline Token | Disabled (MVP) | — |
| Session Idle Timeout | 30 Minuten | Ja (per Tenant) |
| Session Max Lifespan | 10 Stunden | Ja |

---

## 4. Tenant-Kontext im Auth-Flow

### 4.1 Login-Flow

```text
User navigiert zu app.servanda.office
    │
    ▼
SPA prüft: gültiger Access Token vorhanden?
    │
    ├── Ja → API-Requests mit JWT
    │
    └── Nein → Redirect zu Keycloak Login
              │
              ▼
         Keycloak Login-Page
              │ User gibt Credentials ein
              │ (optional: MFA)
              ▼
         Keycloak prüft: User in wie vielen Tenants?
              │
              ├── 1 Tenant → Auto-Select, JWT mit tenant_id
              │
              └── N Tenants → Tenant-Auswahl-Screen
                   │ User wählt aktiven Tenant
                   ▼
              JWT wird ausgestellt (tenant_id = gewählter Tenant)
              │
              ▼
         Redirect zurück zu SPA mit Authorization Code
              │
              ▼
         SPA tauscht Code gegen Access + Refresh Token (PKCE)
```

### 4.2 Multi-Tenant-User

Ein User kann Mitglied mehrerer Tenants sein (z.B. Anwalt in zwei Kanzleien):

- **Login:** User wählt aktiven Tenant bei Login.
- **Tenant-Switch:** Erfordert Re-Auth (neuer JWT mit anderem tenant_id).
- **Kein gleichzeitiger Zugriff** auf mehrere Tenants in einer Session.
- **Rollen sind Tenant-spezifisch:** Admin in Kanzlei A, User in Kanzlei B.

---

## 5. Session-Management

| Aspekt | Implementierung |
| --- | --- |
| **Typ** | Stateless (JWT) — kein Server-side Session Store |
| **Storage Client** | Access Token: Memory; Refresh Token: HttpOnly Secure Cookie |
| **Idle Timeout** | Konfigurierbar per Tenant (Default: 30 Min.) |
| **Absolute Timeout** | Konfigurierbar (Default: 10 Std.) |
| **Concurrent Sessions** | Erlaubt (MVP), Limit pro User optional (Enterprise) |
| **Logout** | Client löscht Tokens + Keycloak Logout Endpoint (Invalidiert Refresh Token) |
| **Force Logout (Admin)** | Admin kann User-Sessions in Keycloak invalidieren |

---

## 6. MFA-Konzept

| Aspekt | Implementierung |
| --- | --- |
| **Verfügbarkeit** | Optional, pro Tenant konfigurierbar |
| **Admin-Enforcement** | Tenant-Admin kann MFA für alle Nutzer erzwingen |
| **Methoden** | TOTP (Google Authenticator etc.), WebAuthn/FIDO2 (Phase 2) |
| **Enrollment** | Bei erstem Login nach Aktivierung, Setup-Wizard |
| **Recovery** | Backup-Codes (einmalig bei Enrollment generiert) |
| **Erzwungen für** | Platform-Admin (immer), Vendor-Admin (empfohlen) |

---

## 7. Enterprise SSO (Phase 2)

| Feature | Beschreibung | Status |
| --- | --- | --- |
| SAML 2.0 Federation | Kanzlei-eigener IdP (AD FS, Okta, Azure AD) | Phase 2 |
| OIDC Federation | Alternative zu SAML | Phase 2 |
| SCIM Provisioning | Automatische User-Synchronisation aus IdP | Phase 2 |
| JIT User Creation | User wird bei erstem Login automatisch angelegt | Phase 2 |
| IdP-initiated Login | Login direkt aus Kanzlei-Portal | Phase 2 |

**Vorbereitung im MVP:**

- Keycloak Identity Provider Broker ist vorkonfiguriert.
- User-Modell unterstützt `externalId` (IdP-Reference).
- Kein harter Lock-in auf lokale Credentials.

---

## 8. User-Lifecycle

### 8.1 Invitation Flow

```text
Admin klickt "Nutzer einladen"
    │ Eingabe: E-Mail, Rolle
    ▼
System erstellt User (status: invited)
    │ Sendet Einladungs-E-Mail mit Link
    ▼
AuditEvent: user.invite
    │
    ▼
Nutzer klickt Link
    │ Registrierungsformular (Name, Passwort)
    ▼
User (status: active)
    │
    ▼
AuditEvent: user.activate
```

### 8.2 Deaktivierung / Löschung

| Aktion | Effekt | Reversibel | DSGVO |
| --- | --- | --- | --- |
| **Deaktivieren** | Login blockiert, Daten bleiben | Ja (Admin reaktiviert) | — |
| **Löschen** | Personenbezogene Daten entfernt, User-Referenzen anonymisiert | Nein | Art. 17 |

**DSGVO-Löschung (Art. 17):**

- `email`, `displayName`, `ipAddress` werden gelöscht/anonymisiert.
- `actorId` in AuditEvents wird auf `anonymized-{hash}` gesetzt.
- Verträge/Templates bleiben (fachliche Daten, kein Personenbezug).
- Löschung wird als AuditEvent protokolliert.

### 8.3 Passwort-Policy

| Regel | Wert | Konfigurierbar |
| --- | --- | --- |
| Mindestlänge | 12 Zeichen | Ja (min. 8) |
| Komplexität | Mind. 1 Großbuchstabe, 1 Zahl, 1 Sonderzeichen | Ja |
| Passwort-History | Letzte 5 Passwörter nicht wiederverwendbar | Fest |
| Max. Login-Versuche | 5 (dann 15 Min. Lock) | Ja |
| Rotation | Nicht erzwungen (Best Practice laut NIST) | Ja |

---

## 9. API-Autorisierung

### 9.1 Middleware-Chain

```text
Request
  │
  ▼
1. Auth-Middleware
   → JWT validieren (Signatur, Expiry)
   → 401 bei ungültigem/fehlendem Token
  │
  ▼
2. Tenant-Context-Middleware
   → tenant_id aus JWT extrahieren
   → SET LOCAL app.current_tenant_id auf DB-Connection
  │
  ▼
3. RBAC-Middleware
   → Route-spezifische Permission prüfen
   → Rolle × Permission Matrix
   → 403 bei fehlender Berechtigung
  │
  ▼
4. Handler (Business Logic)
   → tenantId als expliziter Parameter an Service/Repository
```

### 9.2 Permission-Deklaration (pro Endpoint)

```text
POST   /api/v1/contracts          → requires: contract.create
GET    /api/v1/contracts           → requires: contract.read
GET    /api/v1/contracts/:id       → requires: contract.read + ownership/team check
POST   /api/v1/contracts/:id/export → requires: contract.export
DELETE /api/v1/contracts/:id       → requires: contract.delete

POST   /api/v1/users/invite       → requires: user.manage (admin only)
PUT    /api/v1/users/:id/role      → requires: user.manage (admin only)

GET    /api/v1/audit-logs          → requires: audit.read (admin only)

POST   /api/v1/clauses             → requires: clause.create (vendor only)
POST   /api/v1/clauses/:id/publish → requires: clause.publish (vendor_admin only)
```

### 9.3 Ownership-Check (Resource-Level)

Zusätzlich zu RBAC: Für bestimmte Ressourcen wird geprüft, ob der User Zugriff hat:

| Ressource | Regel |
| --- | --- |
| Contract (private) | Nur creator oder admin |
| Contract (team) | Team-Mitglieder + admin |
| LawFirmTemplate (private) | Nur creator oder admin |
| LawFirmTemplate (team) | Team-Mitglieder + admin |

---

## 10. Testing-Anforderungen

| Test | Beschreibung | CI-Pflicht |
| --- | --- | --- |
| **Auth-Bypass** | Request ohne JWT → 401 | Ja |
| **Expired-Token** | Abgelaufener JWT → 401 | Ja |
| **Invalid-Signature** | Manipulierter JWT → 401 | Ja |
| **Role-Escalation** | User-Role ruft Admin-Endpoint → 403 | Ja |
| **Cross-Tenant-Auth** | JWT Tenant-A, Request auf Tenant-B-Daten → 0 Results (RLS) | Ja |
| **Ownership-Check** | User-A liest private Contract von User-B → 403 | Ja |
| **Invite-Flow** | Einladung → Registrierung → Login → korrekte Rolle | Ja |
| **MFA-Enforcement** | Tenant mit MFA-Pflicht → Login ohne MFA scheitert | Ja |
| **Concurrent-Session** | Zwei Sessions gleichzeitig → beide funktional | Ja |
| **Logout** | Nach Logout → Refresh Token ungültig | Ja |
