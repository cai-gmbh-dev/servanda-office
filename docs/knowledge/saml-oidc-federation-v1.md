# SAML/OIDC Federation Design v1

> **Sprint 13 — Team 02 (Platform Security & Identity)**
> **Status:** Approved for implementation
> **Date:** 2026-02-12
> **Author:** Team 02

---

## 1. Overview

Enterprise law firms require integration with their existing identity infrastructure.
Servanda Office must support federated authentication via SAML 2.0 and OpenID Connect
(OIDC) so that:

- Users authenticate through their organization's existing Identity Provider (IdP)
- No separate password management is needed for Servanda Office
- User provisioning can be automated (JIT or SCIM)
- Tenant administrators can configure their IdP without Servanda support intervention

This document specifies how Keycloak Identity Brokering is used to implement per-tenant
SSO federation, tenant discovery, JIT provisioning, and role mapping.

---

## 2. Architecture

### High-Level Flow

```
┌──────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│  Browser  │────▶│ Servanda App │────▶│   Keycloak     │────▶│ Customer IdP │
│           │     │ (SPA)        │     │ (Identity      │     │ (Azure AD,   │
│           │◀────│              │◀────│  Broker)       │◀────│  Okta, ADFS) │
└──────────┘     └──────────────┘     └────────────────┘     └──────────────┘
                                            │
                                            ▼
                                      ┌──────────┐
                                      │ Servanda │
                                      │ API      │
                                      └──────────┘
```

### Authentication Flow (Step by Step)

1. User navigates to Servanda Office login page
2. User enters their email address
3. **Tenant Discovery:** Application extracts email domain and looks up the configured IdP
4. If a federated IdP is found:
   a. Redirect to Keycloak with `kc_idp_hint` parameter (IdP alias)
   b. Keycloak redirects to the external IdP (SAML or OIDC)
   c. User authenticates at their organization's IdP
   d. IdP sends assertion/token back to Keycloak
   e. Keycloak validates assertion, maps attributes, and issues a Servanda JWT
   f. **JIT Provisioning:** If user does not exist locally, auto-create from IdP claims
5. If no federated IdP is found:
   a. Fall back to local Keycloak authentication (username/password)
6. Servanda SPA receives JWT and uses it for API calls

---

## 3. Keycloak Identity Brokering Configuration

### 3.1 Identity Provider Setup (per Tenant)

Each tenant that requires SSO federation gets a dedicated Identity Provider configuration
in the `servanda` Keycloak realm. The IdP alias follows a naming convention:

```
idp-<tenantId>-<protocol>
```

Examples:
- `idp-kanzlei-mueller-saml` (SAML 2.0)
- `idp-kanzlei-schmidt-oidc` (OIDC)

### 3.2 SAML 2.0 Identity Provider Configuration

```json
{
  "alias": "idp-kanzlei-mueller-saml",
  "displayName": "Kanzlei Mueller SSO",
  "providerId": "saml",
  "enabled": true,
  "trustEmail": true,
  "storeToken": false,
  "addReadTokenRoleOnCreate": false,
  "firstBrokerLoginFlowAlias": "servanda-first-broker-login",
  "config": {
    "entityId": "https://auth.servanda.de/realms/servanda",
    "singleSignOnServiceUrl": "https://login.kanzlei-mueller.de/saml/sso",
    "singleLogoutServiceUrl": "https://login.kanzlei-mueller.de/saml/slo",
    "nameIDPolicyFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    "principalType": "ATTRIBUTE",
    "principalAttribute": "email",
    "signatureAlgorithm": "RSA_SHA256",
    "xmlSigKeyInfoKeyNameTransformer": "KEY_ID",
    "wantAuthnRequestsSigned": "true",
    "wantAssertionsSigned": "true",
    "wantAssertionsEncrypted": "false",
    "forceAuthn": "false",
    "validateSignature": "true",
    "signingCertificate": "<base64-encoded-idp-cert>",
    "allowCreate": "true",
    "syncMode": "FORCE"
  }
}
```

### 3.3 OIDC Identity Provider Configuration

```json
{
  "alias": "idp-kanzlei-schmidt-oidc",
  "displayName": "Kanzlei Schmidt SSO",
  "providerId": "oidc",
  "enabled": true,
  "trustEmail": true,
  "storeToken": false,
  "firstBrokerLoginFlowAlias": "servanda-first-broker-login",
  "config": {
    "authorizationUrl": "https://login.kanzlei-schmidt.de/oauth2/authorize",
    "tokenUrl": "https://login.kanzlei-schmidt.de/oauth2/token",
    "userInfoUrl": "https://login.kanzlei-schmidt.de/oauth2/userinfo",
    "logoutUrl": "https://login.kanzlei-schmidt.de/oauth2/logout",
    "clientId": "servanda-office",
    "clientSecret": "<encrypted-secret>",
    "issuer": "https://login.kanzlei-schmidt.de",
    "defaultScope": "openid email profile",
    "validateSignature": "true",
    "useJwksUrl": "true",
    "jwksUrl": "https://login.kanzlei-schmidt.de/.well-known/jwks.json",
    "pkceEnabled": "true",
    "pkceMethod": "S256",
    "syncMode": "FORCE"
  }
}
```

### 3.4 Attribute / Claim Mapping

Keycloak Identity Provider Mappers translate external IdP attributes to Keycloak
user attributes and JWT claims.

#### SAML Attribute Mappers

| External Attribute         | Mapper Type              | Keycloak Target      |
|----------------------------|--------------------------|----------------------|
| `email` / `mail`          | SAML Attribute → Email   | `email`              |
| `displayName` / `cn`      | SAML Attribute → First Name | `firstName`       |
| `sn` / `surname`          | SAML Attribute → Last Name | `lastName`          |
| `groups` / `memberOf`     | SAML Attribute → Custom  | `user.attribute.groups` |
| `role` / `servandaRole`   | SAML Attribute → Custom  | `user.attribute.servanda_role` |

#### OIDC Claim Mappers

| External Claim             | Mapper Type              | Keycloak Target      |
|----------------------------|--------------------------|----------------------|
| `email`                    | Claim → Email            | `email`              |
| `name`                     | Claim → Full Name        | `firstName + lastName` |
| `groups`                   | Claim → Custom           | `user.attribute.groups` |
| `roles` / `servandaRole`  | Claim → Custom           | `user.attribute.servanda_role` |

---

## 4. Tenant Discovery Flow

### 4.1 Email Domain to IdP Mapping

When a user enters their email address on the login page, the application performs
tenant discovery to determine which IdP to use.

**Database schema extension:**

```prisma
model TenantIdpConfig {
  id              String   @id @default(uuid())
  tenantId        String
  protocol        String   // "saml" | "oidc"
  idpAlias        String   // Keycloak IdP alias
  emailDomains    String[] // e.g. ["kanzlei-mueller.de", "mueller-law.com"]
  enabled         Boolean  @default(true)
  /// SAML: IdP metadata URL or raw XML
  metadataUrl     String?
  /// OIDC: Discovery URL
  discoveryUrl    String?
  /// Display name shown on login page
  displayName     String
  /// IdP-specific configuration (encrypted in Phase 2)
  config          Json?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  tenant          Tenant   @relation(fields: [tenantId], references: [id])

  @@unique([idpAlias])
  @@index([tenantId])
}

// Add index for fast domain lookups
// @@index on emailDomains requires PostgreSQL GIN index (raw SQL migration)
```

### 4.2 Discovery API Endpoint

```
GET /api/v1/auth/discover?email=user@kanzlei-mueller.de
```

**Response (federated):**
```json
{
  "federated": true,
  "idpAlias": "idp-kanzlei-mueller-saml",
  "protocol": "saml",
  "displayName": "Kanzlei Mueller SSO",
  "loginUrl": "https://auth.servanda.de/realms/servanda/protocol/openid-connect/auth?kc_idp_hint=idp-kanzlei-mueller-saml&client_id=servanda-office&redirect_uri=..."
}
```

**Response (local auth):**
```json
{
  "federated": false,
  "loginUrl": "https://auth.servanda.de/realms/servanda/protocol/openid-connect/auth?client_id=servanda-office&redirect_uri=..."
}
```

### 4.3 Discovery Algorithm

```
1. Extract domain from email: user@example.com → example.com
2. Query TenantIdpConfig WHERE emailDomains @> ARRAY['example.com'] AND enabled = true
3. If found:
   a. Return federated=true with IdP details
   b. Generate Keycloak auth URL with kc_idp_hint=<idpAlias>
4. If not found:
   a. Return federated=false
   b. Generate standard Keycloak auth URL (local login form)
5. Security: Rate-limit discovery endpoint (10 req/min per IP)
```

---

## 5. Just-in-Time (JIT) Provisioning

### 5.1 Overview

When a user authenticates via a federated IdP for the first time, they do not yet exist
in the Servanda Office database. JIT provisioning automatically creates the user record
on first login, eliminating the need for manual user creation.

### 5.2 Custom First Broker Login Flow

Keycloak supports custom authentication flows for first-time federated logins.
We configure a custom flow: `servanda-first-broker-login`.

**Flow steps:**
1. **Review Profile** — Auto-accept (trust email from IdP)
2. **Create User If Unique** — Creates Keycloak user if email does not exist
3. **Servanda JIT Authenticator** — Custom SPI that:
   a. Determines the tenant from the IdP alias (idp-<tenantId>-<protocol>)
   b. Creates the user in Servanda's PostgreSQL database
   c. Sets the tenant_id claim on the JWT
   d. Maps roles from IdP claims
   e. Logs audit event

### 5.3 JIT Provisioning Logic (Servanda API Side)

If Keycloak handles JIT via a custom authenticator SPI, the Servanda API also provides
a fallback JIT mechanism in the JWT auth middleware.

```typescript
// In apps/api/src/middleware/auth.ts — after JWT validation

// JIT Provisioning: Check if user exists in local DB
const existingUser = await prisma.user.findFirst({
  where: { tenantId: decoded.tenant_id, email: decoded.email },
});

if (!existingUser && decoded.idp_alias) {
  // First login via federated IdP — auto-create user
  const newUser = await prisma.user.create({
    data: {
      tenantId: decoded.tenant_id,
      email: decoded.email,
      displayName: `${decoded.given_name ?? ''} ${decoded.family_name ?? ''}`.trim() || decoded.email,
      role: mapIdpRoleToServandaRole(decoded),
      status: 'active',
      keycloakId: decoded.sub,
    },
  });

  await auditService.log(
    { tenantId: decoded.tenant_id, userId: newUser.id, role: newUser.role },
    {
      action: 'user.invite',
      objectType: 'user',
      objectId: newUser.id,
      details: { source: 'jit', idpAlias: decoded.idp_alias },
    },
  );
}
```

### 5.4 JIT Attribute Sync

On subsequent logins (not just first login), attributes from the IdP are synchronized:

| IdP Attribute        | Servanda Field     | Sync Behavior                   |
|----------------------|--------------------|----------------------------------|
| `email`              | `user.email`       | Update on every login            |
| `displayName`        | `user.displayName` | Update on every login            |
| `groups` / `roles`   | `user.role`        | Update if role-mapping configured|
| `active` / `enabled` | `user.status`      | Deactivate if IdP says disabled  |

---

## 6. Role Mapping from External IdP Claims

### 6.1 Role Mapping Configuration

Each tenant can configure how external IdP roles/groups map to Servanda roles.
This is stored in the `TenantIdpConfig.config` JSON field:

```json
{
  "roleMapping": {
    "source": "groups",
    "mappings": [
      { "external": "ServandaAdmins", "internal": "admin" },
      { "external": "ServandaEditors", "internal": "editor" },
      { "external": "ServandaUsers", "internal": "user" }
    ],
    "defaultRole": "user",
    "claimPath": "groups"
  }
}
```

### 6.2 Mapping Algorithm

```
function mapIdpRoleToServandaRole(decoded, tenantConfig):
  1. Extract role claim from JWT (e.g., decoded.groups or decoded.roles)
  2. Load tenant's role mapping configuration
  3. For each mapping in config.roleMapping.mappings:
     a. If external value appears in user's claims → return internal role
  4. Apply priority: admin > editor > user (highest matching wins)
  5. If no mapping matches → return config.roleMapping.defaultRole ?? 'user'
```

### 6.3 Keycloak Token Mapper

To ensure the `tenant_id` claim is present in JWTs issued after federated login,
a custom Keycloak Protocol Mapper is configured:

```json
{
  "name": "tenant-id-mapper",
  "protocol": "openid-connect",
  "protocolMapper": "oidc-hardcoded-claim-mapper",
  "config": {
    "claim.name": "tenant_id",
    "claim.value": "<resolved-tenant-id>",
    "jsonType.label": "String",
    "id.token.claim": "true",
    "access.token.claim": "true",
    "userinfo.token.claim": "true"
  }
}
```

For dynamic tenant resolution, a **Script Mapper** or **Custom SPI Mapper** is used:

```javascript
// Keycloak Script Protocol Mapper
// Resolves tenant_id from the user's IdP link
var idpLinks = user.getFederatedIdentities();
if (idpLinks.size() > 0) {
  var idpAlias = idpLinks.get(0).getIdentityProvider();
  // Extract tenant from alias: idp-<tenantId>-<protocol>
  var parts = idpAlias.split('-');
  parts.shift(); // remove 'idp'
  parts.pop();   // remove protocol
  var tenantId = parts.join('-');
  exports = tenantId;
} else {
  // Local user: tenant_id from user attribute
  exports = user.getFirstAttribute('tenant_id');
}
```

---

## 7. Fallback to Local Authentication

### 7.1 When Fallback Applies

- Email domain has no configured IdP
- Configured IdP is disabled (`enabled = false`)
- IdP is unreachable (after timeout)
- User explicitly requests local login

### 7.2 Fallback Behavior

1. **No IdP configured:** Standard Keycloak login form (username/password)
2. **IdP disabled:** Same as no IdP — standard Keycloak login
3. **IdP unreachable:** After 10-second timeout, show error with option to retry or
   fall back to local login (if user has a local password)
4. **Admin override:** Tenant admins always have the option to log in locally
   (bypass federation) via a special URL parameter: `?local=true`

### 7.3 Security Considerations

- Local fallback should NOT be available for tenants that enforce SSO-only (`ssoEnforced: true`)
- If `ssoEnforced` is true and the IdP is unreachable, show error (no fallback)
- Emergency access: A super-admin can temporarily disable SSO enforcement

---

## 8. Tenant Settings Schema Extension

```prisma
// Extension to existing Tenant model

model Tenant {
  // ... existing fields ...

  /// SSO / Federation settings
  ssoEnforced       Boolean  @default(false)  // If true, local login is disabled
  allowedDomains    String[] @default([])     // Email domains allowed for this tenant
  jitEnabled        Boolean  @default(true)   // Auto-create users on first federated login
  jitDefaultRole    String   @default("user") // Default role for JIT-provisioned users

  // Relations
  idpConfigs        TenantIdpConfig[]
}
```

---

## 9. Keycloak Realm Configuration Changes

### 9.1 Realm Settings

```json
{
  "realm": "servanda",
  "enabled": true,
  "registrationAllowed": false,
  "resetPasswordAllowed": true,
  "loginWithEmailAllowed": true,
  "duplicateEmailsAllowed": false,
  "verifyEmail": true,
  "bruteForceProtected": true,
  "maxFailureWaitSeconds": 900,
  "failureFactor": 5,
  "permanentLockout": false,
  "sslRequired": "external",
  "identityProviders": [],
  "identityProviderMappers": [],
  "authenticationFlows": [
    {
      "alias": "servanda-first-broker-login",
      "description": "Custom flow for first-time federated login with JIT provisioning",
      "providerId": "basic-flow",
      "topLevel": true,
      "builtIn": false,
      "authenticationExecutions": [
        {
          "authenticator": "idp-review-profile",
          "requirement": "DISABLED",
          "priority": 10
        },
        {
          "authenticator": "idp-create-user-if-unique",
          "requirement": "ALTERNATIVE",
          "priority": 20
        },
        {
          "authenticator": "idp-auto-link",
          "requirement": "ALTERNATIVE",
          "priority": 30
        }
      ]
    }
  ]
}
```

### 9.2 Client Configuration

The `servanda-office` client must be configured to support `kc_idp_hint`:

```json
{
  "clientId": "servanda-office",
  "protocol": "openid-connect",
  "publicClient": true,
  "standardFlowEnabled": true,
  "implicitFlowEnabled": false,
  "directAccessGrantsEnabled": false,
  "redirectUris": [
    "https://app.servanda.de/*",
    "http://localhost:5173/*"
  ],
  "webOrigins": [
    "https://app.servanda.de",
    "http://localhost:5173"
  ],
  "defaultClientScopes": [
    "openid",
    "email",
    "profile",
    "tenant_id"
  ],
  "protocolMappers": [
    {
      "name": "tenant-id",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-attribute-mapper",
      "config": {
        "user.attribute": "tenant_id",
        "claim.name": "tenant_id",
        "jsonType.label": "String",
        "id.token.claim": "true",
        "access.token.claim": "true"
      }
    },
    {
      "name": "idp-alias",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usersessionmodel-note-mapper",
      "config": {
        "user.session.note": "identity_provider",
        "claim.name": "idp_alias",
        "jsonType.label": "String",
        "id.token.claim": "true",
        "access.token.claim": "true"
      }
    }
  ]
}
```

---

## 10. Admin API for IdP Management

Tenant administrators can manage their SSO configuration through the Servanda API.
These endpoints are planned for Sprint 14.

```
POST   /api/v1/identity/sso/config          — Create IdP configuration
GET    /api/v1/identity/sso/config           — List IdP configurations
GET    /api/v1/identity/sso/config/:id       — Get IdP configuration
PATCH  /api/v1/identity/sso/config/:id       — Update IdP configuration
DELETE /api/v1/identity/sso/config/:id       — Delete IdP configuration
POST   /api/v1/identity/sso/config/:id/test  — Test IdP connectivity
GET    /api/v1/identity/sso/metadata          — Download SP metadata (SAML)
```

**Create IdP Config request:**
```json
{
  "protocol": "saml",
  "displayName": "Our Company SSO",
  "emailDomains": ["company.de", "company-law.com"],
  "metadataUrl": "https://login.company.de/federationmetadata/2007-06/federationmetadata.xml",
  "roleMapping": {
    "source": "groups",
    "mappings": [
      { "external": "ServandaAdmins", "internal": "admin" },
      { "external": "ServandaEditors", "internal": "editor" }
    ],
    "defaultRole": "user"
  }
}
```

The Servanda API will:
1. Validate the metadata/discovery URL
2. Create the Keycloak Identity Provider via Admin REST API
3. Configure attribute/claim mappers
4. Store the configuration in `TenantIdpConfig`
5. Return the configuration with connection status

---

## 11. Security Considerations

### 11.1 Authentication Security

- All SAML assertions must be signed (wantAssertionsSigned: true)
- SAML requests are signed (wantAuthnRequestsSigned: true)
- OIDC uses PKCE (S256) for authorization code flow
- No implicit grant flow
- Token lifetimes: access token 5min, refresh token 30min

### 11.2 Tenant Isolation

- Each tenant's IdP is a separate Keycloak Identity Provider entity
- `tenant_id` claim is derived from the IdP alias — cannot be forged
- Users from IdP A cannot access IdP B's tenant data
- Domain ownership verification (planned Phase 2): DNS TXT record check

### 11.3 Account Linking Protection

- Auto-linking by email requires `trustEmail: true` on the IdP
- Only enabled when the IdP is known to verify email addresses
- For untrusted IdPs, manual linking via admin is required

### 11.4 Session Management

- Federated sessions are subject to the same session hardening as local sessions
- Single Logout (SLO) is supported for SAML IdPs
- OIDC back-channel logout is supported where the IdP implements it

---

## 12. Migration Path for Existing Tenants

1. Existing tenants using local authentication continue to work unchanged
2. Admin configures IdP through SSO settings page
3. System auto-discovers IdP metadata and creates Keycloak configuration
4. Existing users are linked to federated identity on next login (email match)
5. Admin can optionally enforce SSO (`ssoEnforced: true`) after verification
6. Users who only exist in IdP (not in Servanda) are created via JIT on first login

---

## 13. Testing Strategy

| Test Scenario                              | Type         | Team   |
|--------------------------------------------|--------------|--------|
| SAML assertion parsing + validation         | Unit         | 02     |
| OIDC token exchange flow                    | Unit         | 02     |
| Tenant discovery by email domain            | Integration  | 02     |
| JIT provisioning on first federated login   | Integration  | 02, 06 |
| Role mapping from IdP claims                | Unit         | 02     |
| Fallback to local auth when IdP unavailable | Integration  | 02     |
| Tenant isolation (cross-tenant access)      | Security     | 06     |
| SSO enforcement (no local login bypass)     | Security     | 06     |
| SAML metadata import                        | E2E          | 06     |
| OIDC discovery URL import                   | E2E          | 06     |

---

## 14. Implementation Timeline

| Phase    | Scope                                         | Sprint  |
|----------|-----------------------------------------------|---------|
| Phase 1  | Keycloak IdP Brokering (manual setup)         | 14      |
| Phase 1  | Tenant discovery API                          | 14      |
| Phase 1  | JIT Provisioning                              | 14      |
| Phase 2  | Admin API for IdP management                  | 15      |
| Phase 2  | Role mapping configuration UI                 | 15      |
| Phase 2  | Domain ownership verification                 | 16      |
| Phase 3  | SSO enforcement + emergency access            | 16      |
| Phase 3  | SLO (Single Logout) support                   | 17      |

---

## 15. References

- [SAML 2.0 Technical Overview (OASIS)](https://docs.oasis-open.org/security/saml/Post2.0/sstc-saml-tech-overview-2.0.html)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [Keycloak Identity Brokering](https://www.keycloak.org/docs/latest/server_admin/#_identity_broker)
- [Keycloak First Login Flow](https://www.keycloak.org/docs/latest/server_admin/#_first_login_flow)
- [RFC 7644 — SCIM Protocol](https://www.rfc-editor.org/rfc/rfc7644)
- [ADR-001 — Multi-Tenant Isolation](../knowledge/adr-001-multi-tenant-isolation.md)
- [RBAC/IAM Model v1](../knowledge/rbac-iam-model-v1.md)
