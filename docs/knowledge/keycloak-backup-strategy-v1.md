# Keycloak Backup-Strategie v1

> Sprint 12 -- Team 02 (Platform Security & Identity)

## 1. Realm-Export-Automatisierung

Keycloak-Realm-Konfigurationen werden taglich automatisiert exportiert, um eine vollstandige Wiederherstellung zu ermoglichen.

### Export-Mechanismus

Ein Kubernetes CronJob (`keycloak-backup-cronjob.yaml`) fuhrt taglich um 03:00 UTC den Realm-Export aus:

```bash
# Authentifizierung am Keycloak Admin CLI
/opt/keycloak/bin/kcadm.sh config credentials \
  --server http://keycloak:8080 \
  --realm master \
  --user $KEYCLOAK_ADMIN \
  --password $KEYCLOAK_ADMIN_PASSWORD

# Realm-Export als JSON
/opt/keycloak/bin/kcadm.sh get realms/servanda > /tmp/realm-export.json
```

Der Export wird anschliessend komprimiert und nach S3 hochgeladen.

### CronJob-Konfiguration

- **Schedule**: `0 3 * * *` (taglich 03:00 UTC, 1 Stunde nach dem DB-Backup)
- **Container**: Keycloak-Image (enthalt `kcadm.sh`)
- **Resource-Limits**: 256Mi Memory / 250m CPU
- **Concurrency**: `Forbid` (keine parallelen Jobs)
- **Retention**: 30 Tage (altere Exports werden geloscht)
- **Manifest**: `k8s/base/keycloak-backup-cronjob.yaml`

## 2. Was wird gesichert

### Realm-Export (JSON)

| Bestandteil | Enthalten | Anmerkung |
|---|---|---|
| Realm-Konfiguration | Ja | Name, Display Name, Token-Lifetimes, SSL, Password Policy |
| Clients | Ja | `servanda-office` Client inkl. Redirect-URIs, Protocol Mappers |
| Realm Roles | Ja | `admin`, `editor`, `user` |
| Client Roles | Ja | Client-spezifische Rollen |
| Authentication Flows | Ja | `servanda-browser`, Conditional OTP fur Admins |
| Authenticator Config | Ja | Admin-Role-Condition fur MFA |
| Required Actions | Ja | CONFIGURE_TOTP, UPDATE_PASSWORD, VERIFY_EMAIL |
| OTP Policy | Ja | TOTP-Konfiguration (HmacSHA1, 6 Digits, 30s Period) |
| Identity Providers | Ja | Externe SAML/OIDC Provider (falls konfiguriert) |
| Scope Mappings | Ja | Client-Scope-Zuordnungen |

### Keycloak-DB (PostgreSQL)

| Bestandteil | Enthalten | Anmerkung |
|---|---|---|
| User-Entitaten | Ja | Benutzername, E-Mail, Attribute |
| User-Credentials | Ja | Gehashte Passworter, TOTP-Secrets |
| User-Sessions | Ja | Aktive Login-Sessions (transient) |
| User-Consent | Ja | DSGVO-Einwilligungen |
| Events | Ja | Login-Events, Admin-Events |
| Realm-Config (DB) | Ja | Vollstandige Realm-Daten |

## 3. Was wird NICHT gesichert (nur im Realm-Export)

| Bestandteil | Grund |
|---|---|
| User-Credentials (Passworter) | Sicherheitsrisiko -- Passworter werden nie im Klartext exportiert |
| User-Sessions | Transient -- werden bei Keycloak-Neustart ohnehin invalidiert |
| TOTP-Secrets | Sicherheitsrisiko -- nur in der Keycloak-DB gespeichert |
| Event-Log | Zu gross -- wird uber die Keycloak-DB gesichert |

**Wichtig**: Fur eine vollstandige Wiederherstellung (inkl. User-Credentials) ist das PostgreSQL-DB-Backup erforderlich, nicht nur der Realm-Export.

## 4. Backup-Strategie (3-Saulen-Modell)

### Saule 1: Realm-Export (Configuration as Code)

- **Was**: Realm-Konfiguration, Clients, Roles, Auth Flows
- **Wie**: CronJob mit `kcadm.sh` -> gzip -> S3
- **Frequenz**: Taglich 03:00 UTC
- **Retention**: 30 Tage
- **Zweck**: Schnelle Wiederherstellung der Konfiguration in neuem Keycloak

### Saule 2: Keycloak-DB Backup (PostgreSQL)

- **Was**: Kompletter Keycloak-Datenbankinhalt inkl. User-Credentials
- **Wie**: `pg_dump` via bestehenden `postgres-backup` CronJob
- **Frequenz**: Taglich 02:00 UTC (1h vor Realm-Export)
- **Retention**: 30 Tage
- **Zweck**: Vollstandige Wiederherstellung inkl. aller User-Daten

### Saule 3: Infrastructure as Code (Git)

- **Was**: `docker/keycloak/realm-export.json` im Repository
- **Wie**: Manuell aktualisiert bei Konfigurationsanderungen
- **Frequenz**: Bei jeder Anderung (PR-basiert)
- **Retention**: Git-History (unbegrenzt)
- **Zweck**: Reproduzierbare Basis-Konfiguration fur neue Environments

## 5. Restore-Prozedur

### Szenario A: Konfiguration wiederherstellen (neues Keycloak)

Wenn Keycloak neu aufgesetzt wird und nur die Konfiguration importiert werden soll:

```bash
# Option 1: Beim Start via Startup-Parameter
/opt/keycloak/bin/kc.sh start \
  --import-realm \
  --file=/tmp/realm-export.json

# Option 2: Via Admin CLI
/opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password $KEYCLOAK_ADMIN_PASSWORD

/opt/keycloak/bin/kcadm.sh create realms \
  -f /tmp/realm-export.json

# Option 3: Via Admin REST API
curl -X POST "http://localhost:8080/admin/realms" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d @realm-export.json
```

**Anschliessend**: Users mussen neu angelegt werden oder aus dem DB-Backup wiederhergestellt werden.

### Szenario B: Vollstandige Wiederherstellung (DB-Restore)

Wenn sowohl Konfiguration als auch User-Daten wiederhergestellt werden sollen:

```bash
# 1. Aktuellstes DB-Backup von S3 herunterladen
aws s3 cp s3://servanda-backups/keycloak/YYYYMMDD-HHMMSS.dump /tmp/keycloak-backup.dump \
  --endpoint-url $S3_ENDPOINT

# 2. Keycloak stoppen
kubectl scale deployment keycloak -n servanda-office --replicas=0

# 3. Datenbank wiederherstellen
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --dbname=keycloak \
  /tmp/keycloak-backup.dump

# 4. Keycloak neu starten
kubectl scale deployment keycloak -n servanda-office --replicas=1
```

### Szenario C: Einzelne Konfiguration aktualisieren

Fur gezielte Anderungen an Clients, Roles oder Auth Flows:

```bash
# Client aktualisieren
/opt/keycloak/bin/kcadm.sh update clients/$CLIENT_UUID \
  -r servanda \
  -f client-update.json

# Role hinzufugen
/opt/keycloak/bin/kcadm.sh create roles \
  -r servanda \
  -s name=new-role \
  -s description="New role description"
```

## 6. Monitoring & Alerting

### Backup-Uberwachung

| Metrik | Schwellenwert | Alert |
|---|---|---|
| Letzter erfolgreicher Realm-Export | > 25 Stunden | Warning |
| Letzter erfolgreicher DB-Backup | > 25 Stunden | Warning |
| Backup-Dateigrosse | < 1 KB | Critical (leerer Export) |
| S3-Upload-Fehler | > 0 in letzten 24h | Warning |

### CronJob-Monitoring

Der CronJob setzt Exit-Code 0 bei Erfolg und != 0 bei Fehler. Kubernetes-native Monitoring uber:

```yaml
# Prometheus-Metrik via kube-state-metrics
kube_job_status_succeeded{job_name=~"keycloak-backup-.*"}
kube_job_status_failed{job_name=~"keycloak-backup-.*"}
```

## 7. Sicherheitshinweise

1. **Realm-Exports enthalten keine Passworter** -- sie sind sicher fur S3-Speicherung, sollten aber dennoch verschlusselt werden (S3 SSE)
2. **DB-Backups enthalten gehashte Passworter** -- S3-Bucket muss verschlusselt und zugriffsbeschrankt sein
3. **Admin-Credentials** fur den CronJob kommen aus Kubernetes Secrets (External Secrets Operator)
4. **S3-Credentials** werden uber `servanda-keycloak-credentials` Secret injiziert
5. **Network Policy** erlaubt dem CronJob-Pod nur Zugriff auf Keycloak und S3

## 8. Verwandte Dokumente

- [ADR-001: Multi-Tenant Isolation](adr-001-multi-tenant-isolation.md) -- Tenant-Isolation gilt auch fur Keycloak
- [RBAC/IAM Model](rbac-iam-model-v1.md) -- Role-Konfiguration in Keycloak
- [Deployment Blueprint](deployment-blueprint-v1.md) -- K8s-Deployment-Architektur
- [Secrets/Key Handling](secrets-key-handling-v1.md) -- Credential-Management
- K8s-Manifest: `k8s/base/keycloak-backup-cronjob.yaml`
