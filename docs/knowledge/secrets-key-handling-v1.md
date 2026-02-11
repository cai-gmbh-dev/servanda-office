# Secrets & Key-Handling Entwurf v1 — Servanda Office

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 07 (DevOps & On-Prem) + Team 02 (Platform Security)
**Referenzen:** ADR-001, Audit-Compliance v1 (Verschlüsselungskonzept), Deployment-Blueprint v1, RBAC/IAM v1

---

## 1. Übersicht

Dieses Dokument definiert, wie Secrets (Credentials, Keys, Tokens) in allen Umgebungen (dev/stage/prod/on-prem) verwaltet, gespeichert, rotiert und auditiert werden.

### Grundsätze

| Prinzip | Beschreibung |
| --- | --- |
| **Zero Secrets in Code** | Kein Secret in Source-Code, Config-Dateien oder Container-Images |
| **Least Privilege** | Jeder Service erhält nur die Secrets, die er benötigt |
| **Encryption at Rest** | Secrets sind immer verschlüsselt gespeichert |
| **Rotation** | Jedes Secret hat ein definiertes Rotationsintervall |
| **Auditierbarkeit** | Secret-Zugriffe werden geloggt |
| **Parity** | Gleicher Mechanismus in Cloud und On-Prem (soweit möglich) |

---

## 2. Secret-Inventar

### 2.1 Vollständige Secret-Liste

| Secret | Typ | Benutzer | Umgebung | Rotation |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Connection String | API, Export Worker | Alle | 90 Tage |
| `S3_ACCESS_KEY` | Access Key | API, Export Worker | Alle | 90 Tage |
| `S3_SECRET_KEY` | Secret Key | API, Export Worker | Alle | 90 Tage |
| `KEYCLOAK_CLIENT_SECRET` | OIDC Client Secret | API | Alle | 180 Tage |
| `KEYCLOAK_ADMIN_PASSWORD` | Admin-Passwort | Keycloak Init | Alle | 90 Tage |
| `JWT_SIGNING_KEY` | RSA/EC Private Key | Keycloak | Alle | 365 Tage |
| `ENCRYPTION_KEY_DB` | TDE Master Key | PostgreSQL | Prod, On-Prem | 365 Tage |
| `KMS_TENANT_KEY_*` | Per-Tenant Key (Enterprise) | API, Export Worker | Prod (Enterprise) | 365 Tage |
| `SMTP_PASSWORD` | E-Mail-Versand | API (Notifications) | Prod | 180 Tage |
| `SENTRY_DSN` | Error-Tracking | API, Frontend | Alle | Kein (nicht sensitiv) |
| `GITHUB_TOKEN` | CI/CD | GitHub Actions | CI | Automatisch (GitHub) |
| `KUBECONFIG_*` | K8s-Zugang | CI/CD Deploy | CI | 90 Tage |

### 2.2 Secret-Klassifizierung

| Klasse | Beschreibung | Beispiele | Schutzstufe |
| --- | --- | --- | --- |
| **Critical** | Kompromittierung ermöglicht Zugriff auf alle Tenant-Daten | `DATABASE_URL`, `JWT_SIGNING_KEY`, `ENCRYPTION_KEY_DB` | Höchste |
| **High** | Kompromittierung ermöglicht Zugriff auf Storage/Auth | `S3_SECRET_KEY`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_ADMIN_PASSWORD` | Hoch |
| **Medium** | Kompromittierung ermöglicht eingeschränkte Aktionen | `SMTP_PASSWORD`, `KUBECONFIG_*` | Mittel |
| **Low** | Nicht-kritisch, aber nicht öffentlich | `SENTRY_DSN` | Niedrig |

---

## 3. Secret-Storage pro Umgebung

### 3.1 Umgebungs-Matrix

| Umgebung | Primary Storage | Backup | Zugang |
| --- | --- | --- | --- |
| **CI (GitHub Actions)** | GitHub Actions Secrets (encrypted) | — | Repository Admins |
| **dev** | Kubernetes Secrets (etcd encrypted) | — | Dev-Team |
| **stage** | Kubernetes Secrets + Sealed Secrets (Git) | — | DevOps + QA |
| **prod (Cloud)** | External Secrets Operator → AWS Secrets Manager / Azure Key Vault | Sealed Secrets (Git, encrypted) | DevOps (min. 2 Personen) |
| **prod (On-Prem)** | HashiCorp Vault | Encrypted Backup (HSM-Backed) | Kunden-Admin + DevOps |

### 3.2 Kubernetes Secrets (dev/stage)

```yaml
# Erstellt via kubectl oder Sealed Secrets
apiVersion: v1
kind: Secret
metadata:
  name: servanda-db-credentials
  namespace: servanda-dev
type: Opaque
data:
  url: <base64-encoded>  # postgresql://user:pass@host:5432/servanda

---
apiVersion: v1
kind: Secret
metadata:
  name: servanda-s3-credentials
  namespace: servanda-dev
type: Opaque
data:
  access-key: <base64-encoded>
  secret-key: <base64-encoded>

---
apiVersion: v1
kind: Secret
metadata:
  name: servanda-keycloak-credentials
  namespace: servanda-dev
type: Opaque
data:
  client-secret: <base64-encoded>
  admin-password: <base64-encoded>
```

### 3.3 Sealed Secrets (stage/prod Git-Backed)

```yaml
# Sealed Secrets werden im Git eingecheckt (verschlüsselt)
# Nur der Sealed Secrets Controller im Cluster kann sie entschlüsseln

# Installation:
# helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system

# Seal a secret:
# kubeseal --format yaml < secret.yaml > sealed-secret.yaml

apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: servanda-db-credentials
  namespace: servanda-prod
spec:
  encryptedData:
    url: AgBy3i...encrypted...==
```

### 3.4 External Secrets Operator (prod Cloud)

```yaml
# External Secrets synchronisiert Secrets aus Cloud Provider in K8s

apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: servanda-db-credentials
  namespace: servanda-prod
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: servanda-db-credentials
  data:
    - secretKey: url
      remoteRef:
        key: servanda/prod/database-url
```

### 3.5 HashiCorp Vault (On-Prem)

```text
Vault-Pfad-Layout:
  secret/servanda/
    ├── database/
    │   ├── url              # DATABASE_URL
    │   └── credentials      # user + password (dynamisch)
    ├── storage/
    │   ├── access-key       # S3_ACCESS_KEY
    │   └── secret-key       # S3_SECRET_KEY
    ├── keycloak/
    │   ├── client-secret    # KEYCLOAK_CLIENT_SECRET
    │   └── admin-password   # KEYCLOAK_ADMIN_PASSWORD
    ├── encryption/
    │   ├── db-tde-key       # ENCRYPTION_KEY_DB
    │   └── tenant-keys/     # KMS_TENANT_KEY_* (Enterprise)
    └── smtp/
        └── password         # SMTP_PASSWORD
```

**Vault-Integration in K8s (Vault Agent Injector):**

```yaml
# Pod-Annotation für automatische Secret-Injection
apiVersion: apps/v1
kind: Deployment
metadata:
  name: servanda-api
spec:
  template:
    metadata:
      annotations:
        vault.hashicorp.com/agent-inject: "true"
        vault.hashicorp.com/role: "servanda-api"
        vault.hashicorp.com/agent-inject-secret-db: "secret/servanda/database/url"
        vault.hashicorp.com/agent-inject-template-db: |
          {{- with secret "secret/servanda/database/url" -}}
          DATABASE_URL={{ .Data.data.url }}
          {{- end }}
```

---

## 4. Key-Management

### 4.1 Key-Typen und Lifecycle

| Key-Typ | Algorithmus | Erstellung | Storage | Rotation | Verantwortung |
| --- | --- | --- | --- | --- | --- |
| **JWT Signing Key** | RS256 (RSA 2048) oder ES256 (EC P-256) | Keycloak Realm Setup | Keycloak DB | 365 Tage | Team 02 |
| **TLS Certificates** | RSA 2048+ / EC P-256 | Let's Encrypt (Cloud) / PKI (On-Prem) | K8s Secret / cert-manager | 90 Tage (LE) / 365 Tage (PKI) | Team 07 |
| **DB TDE Key** | AES-256 | Cloud KMS / Vault (On-Prem) | KMS / Vault | 365 Tage | Team 07 |
| **S3 SSE Key** | AES-256 | Cloud KMS / MinIO built-in | KMS / MinIO Config | 365 Tage | Team 07 |
| **Tenant Keys (Enterprise)** | AES-256 | Cloud KMS / Vault | KMS / Vault | 365 Tage | Team 02 + 07 |

### 4.2 JWT-Key-Rotation

```text
Keycloak JWT Key Rotation:

1. Neuen Key generieren (Keycloak Admin Console oder API):
   POST /admin/realms/servanda/keys
   { "algorithm": "RS256", "priority": 200 }

2. Alter Key bleibt aktiv für Validierung (grace period: 24h)

3. Nach Grace Period: Alten Key deaktivieren

4. Clients/API validieren beide Keys während Grace Period:
   - Keycloak publiziert JWKS mit beiden Keys
   - API fetcht JWKS periodisch (Caching: 5 Min.)

Automatisierung:
  - Keycloak hat built-in Key-Rotation (Realm → Keys → Providers)
  - Konfiguration: Ablauf in Tagen, automatische Rotation
```

### 4.3 TLS-Zertifikat-Management

```yaml
# cert-manager für automatische TLS-Zertifikate (Cloud)

apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@servanda.de
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            class: nginx

---
# On-Prem: Selbstsignierte CA oder Kunden-PKI
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: internal-ca
spec:
  ca:
    secretName: internal-ca-key-pair
```

### 4.4 Tenant-spezifische Encryption Keys (Enterprise)

```text
Für Enterprise-Kunden mit erhöhten Anforderungen:

1. Tenant wird erstellt → Eigener KMS-Key wird provisioniert
   - Cloud: AWS KMS CreateKey / Azure Key Vault CreateKey
   - On-Prem: Vault Transit Engine → neuer Named Key

2. Object Storage Files werden mit Tenant-Key verschlüsselt:
   - Cloud: SSE-KMS mit Tenant-Key-ARN
   - On-Prem: Vault Transit Encrypt/Decrypt

3. Optional: Field-Level Encryption in DB:
   - Sensitive Felder (z.B. Vertragsinhalte) werden vor dem Schreiben
     mit dem Tenant-Key verschlüsselt
   - Implementierung in der Repository-Schicht

4. Key-Rotation: Jährlich, transparant (KMS verwaltet Versionen)
```

---

## 5. Rotation-Strategie

### 5.1 Rotations-Matrix

| Secret | Intervall | Methode | Downtime |
| --- | --- | --- | --- |
| `DATABASE_URL` (Passwort) | 90 Tage | Dual-Credentials: neues PW setzen → Config updaten → altes PW entfernen | Zero |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | 90 Tage | Neuen Key erstellen → Config updaten → alten Key löschen | Zero |
| `KEYCLOAK_CLIENT_SECRET` | 180 Tage | Neues Secret in Keycloak → Config updaten | Zero (Grace Period) |
| `JWT_SIGNING_KEY` | 365 Tage | Keycloak Key-Rotation (JWKS mit beiden Keys) | Zero |
| `TLS Certificates` | 90 Tage (LE) | cert-manager automatisch | Zero |
| `DB TDE Key` | 365 Tage | KMS Key-Rotation (transparant) | Zero |
| `KUBECONFIG_*` | 90 Tage | Neue kubeconfig generieren → GitHub Secret updaten | Zero |

### 5.2 Rotations-Verfahren (DB-Credentials Beispiel)

```text
DB-Passwort-Rotation (Zero-Downtime):

1. Neues Passwort generieren:
   NEW_PASSWORD=$(openssl rand -base64 32)

2. PostgreSQL: Neues Passwort setzen (altes bleibt aktiv):
   ALTER ROLE servanda_app PASSWORD 'NEW_PASSWORD';

3. Kubernetes Secret updaten:
   kubectl create secret generic servanda-db-credentials \
     --from-literal=url="postgresql://servanda_app:NEW_PASSWORD@db:5432/servanda" \
     --dry-run=client -o yaml | kubectl apply -f -

4. Rolling Restart der Pods (neue Connection mit neuem PW):
   kubectl rollout restart deployment/servanda-api -n servanda-prod
   kubectl rollout restart deployment/servanda-export-worker -n servanda-prod

5. Verifizieren, dass alle Pods mit neuem PW connecten

6. Optional: Altes PW invalidieren (nur wenn doppelt angelegt)
```

### 5.3 Rotations-Monitoring

```yaml
# Prometheus Alert für ausstehende Rotationen
groups:
  - name: secret-rotation
    rules:
      - alert: SecretRotationOverdue
        expr: servanda_secret_last_rotation_seconds > (90 * 24 * 3600)
        labels:
          severity: warning
        annotations:
          summary: "Secret {{ $labels.secret_name }} not rotated in 90+ days"
```

---

## 6. Access Control für Secrets

### 6.1 Kubernetes RBAC für Secrets

```yaml
# Nur servanda-api Service Account darf DB-Secrets lesen
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: servanda-api-secrets
  namespace: servanda-prod
rules:
  - apiGroups: [""]
    resources: ["secrets"]
    resourceNames: ["servanda-db-credentials", "servanda-keycloak-credentials"]
    verbs: ["get"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: servanda-api-secrets-binding
  namespace: servanda-prod
subjects:
  - kind: ServiceAccount
    name: servanda-api
roleRef:
  kind: Role
  name: servanda-api-secrets
  apiGroup: rbac.authorization.k8s.io

---
# Export Worker: DB + S3, kein Keycloak
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: servanda-export-worker-secrets
  namespace: servanda-prod
rules:
  - apiGroups: [""]
    resources: ["secrets"]
    resourceNames: ["servanda-db-credentials", "servanda-s3-credentials"]
    verbs: ["get"]
```

### 6.2 Vault Policies (On-Prem)

```hcl
# vault/policies/servanda-api.hcl
path "secret/data/servanda/database/*" {
  capabilities = ["read"]
}

path "secret/data/servanda/keycloak/*" {
  capabilities = ["read"]
}

path "secret/data/servanda/storage/*" {
  capabilities = ["read"]
}

# Export Worker: kein Zugriff auf Keycloak-Secrets
# vault/policies/servanda-export-worker.hcl
path "secret/data/servanda/database/*" {
  capabilities = ["read"]
}

path "secret/data/servanda/storage/*" {
  capabilities = ["read"]
}

# Admin: Vollzugriff für Rotation
# vault/policies/servanda-admin.hcl
path "secret/data/servanda/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
```

---

## 7. Audit & Compliance

### 7.1 Secret-Access-Logging

| Umgebung | Logging-Methode | Was wird geloggt |
| --- | --- | --- |
| **Kubernetes** | Audit-Policy (API Server) | Secret-Reads, Secret-Updates |
| **Vault** | Vault Audit Log | Alle Secret-Zugriffe mit Accessor-ID |
| **AWS Secrets Manager** | CloudTrail | GetSecretValue, RotateSecret |
| **Azure Key Vault** | Azure Monitor | Secret-Operationen |
| **GitHub Actions** | Audit Log | Secret-Verwendung in Workflows |

### 7.2 Kubernetes Audit Policy für Secrets

```yaml
# k8s/audit-policy.yaml
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
  # Log alle Secret-Zugriffe
  - level: Metadata
    resources:
      - group: ""
        resources: ["secrets"]
    namespaces: ["servanda-prod", "servanda-stage"]

  # Log Secret-Änderungen mit Request-Body
  - level: RequestResponse
    resources:
      - group: ""
        resources: ["secrets"]
    verbs: ["create", "update", "patch", "delete"]
    namespaces: ["servanda-prod"]
```

### 7.3 Compliance-Nachweis

| Anforderung | Evidence | Referenz |
| --- | --- | --- |
| Keine Secrets in Code | Git-Scanning (gitleaks in CI) | DS-09 |
| Encryption at Rest | K8s etcd encryption / Vault seal | DS-10 |
| Secret-Rotation dokumentiert | Rotation-Logs + Monitoring | IH-05 |
| Least Privilege | K8s RBAC / Vault Policies | AA-04 |
| Audit-Trail für Secret-Zugriffe | K8s Audit Log / Vault Audit Log | AU-09 |

---

## 8. Git-Leaks-Prävention

### 8.1 Pre-Commit Hook

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks
```

### 8.2 CI-Check

```yaml
# In pr-gate.yml ergänzen
  secret-scan:
    name: Secret Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 8.3 .gitignore Pflichteinträge

```text
# Secrets / Credentials
.env
.env.*
*.pem
*.key
*credentials*
*secret*
kubeconfig*
```

---

## 9. Notfall-Verfahren

### 9.1 Secret-Kompromittierung

```text
Sofort-Massnahmen (< 15 Min.):
  1. Betroffenes Secret identifizieren
  2. Secret sofort rotieren (neues Passwort/Key generieren)
  3. Alte Credentials invalidieren
  4. Betroffene Services restarten
  5. Incident-Team benachrichtigen

Analyse (< 1 Stunde):
  6. Audit-Logs prüfen: Wann wurde das Secret exponiert?
  7. Zugriffslogs prüfen: Wurde das Secret missbraucht?
  8. Blast Radius bestimmen: Welche Daten sind betroffen?

Nachbereitung:
  9. Post-Mortem erstellen
  10. Betroffene Tenants informieren (falls Datenzugriff)
  11. Security-Checklist aktualisieren
  12. Präventionsmassnahmen implementieren
```

### 9.2 Key-Recovery

| Szenario | Verfahren | RTO |
| --- | --- | --- |
| Vault Sealed | Unseal mit Shamir-Keys (3 von 5) | < 30 Min. |
| KMS Key gelöscht | Key-Recovery aus Backup (7-Tage Grace Period bei AWS) | < 1 Stunde |
| TLS-Cert abgelaufen | cert-manager automatisch oder manuell via Let's Encrypt / PKI | < 15 Min. |
| Keycloak Signing Key verloren | Neuen Key generieren, alle Tokens invalidiert (Nutzer re-login) | < 30 Min. |
| DB-Credentials unbekannt | PostgreSQL: Reset via superuser, oder Restore aus Backup | < 1 Stunde |

---

## 10. Checkliste MVP-Launch

### Secret Infrastructure

- [ ] Kubernetes etcd Encryption at Rest aktiviert
- [ ] Sealed Secrets Controller installiert (stage/prod)
- [ ] External Secrets Operator installiert (prod Cloud) oder Vault (On-Prem)
- [ ] cert-manager installiert und konfiguriert
- [ ] gitleaks in CI aktiv (PR-Gate)

### Secret Provisioning

- [ ] DATABASE_URL provisioniert und in K8s Secret
- [ ] S3 Credentials provisioniert und in K8s Secret
- [ ] Keycloak Client Secret provisioniert
- [ ] JWT Signing Key generiert (RS256/ES256)
- [ ] TLS Certificates ausgestellt (Let's Encrypt oder PKI)

### Access Control

- [ ] K8s RBAC: API und Export Worker haben nur benötigte Secrets
- [ ] GitHub Actions: Environment Secrets korrekt konfiguriert
- [ ] Prod-Deploy erfordert manuelles Approval

### Rotation

- [ ] Rotationsintervalle dokumentiert und im Kalender
- [ ] Rotations-Runbook getestet
- [ ] Monitoring-Alert für überfällige Rotationen

### Audit

- [ ] K8s Audit Policy für Secrets aktiviert
- [ ] Secret-Access-Logs an zentrales Logging angebunden
