# Servanda Office -- DevOps & Admin Guide

Umfassende Anleitung fuer Entwicklungsumgebung, CI/CD, Kubernetes-Deployment und Betrieb.

---

## 1. Voraussetzungen

| Tool              | Version    | Hinweis                                   |
|-------------------|------------|-------------------------------------------|
| Node.js           | >= 20 LTS  | `node -v` pruefen                         |
| npm               | >= 10      | Wird mit Node 20 mitgeliefert             |
| Docker Desktop    | >= 4.25    | WSL2-Backend aktivieren (Windows)         |
| Git               | >= 2.40    | SSH-Key oder HTTPS-Token konfigurieren    |
| kubectl           | >= 1.28    | Nur fuer K8s-Deployment                   |
| kustomize         | >= 5.3     | `kubectl kustomize` ist ebenfalls nutzbar |

**Windows-spezifisch:** Docker Desktop muss mit WSL2-Integration laufen. In Docker Desktop unter Settings > Resources > WSL Integration die gewuenschte Distribution aktivieren.

---

## 2. Lokale Entwicklung

### 2.1 Repository klonen und Abhaengigkeiten installieren

```bash
git clone git@github.com:cai-gmbh-dev/servanda-office.git
cd servanda-office
npm install
```

### 2.2 Umgebungsvariablen

```bash
cp .env.example .env
```

Die Standardwerte in `.env.example` sind fuer lokale Entwicklung vorkonfiguriert. Wichtige Variablen:

| Variable              | Default                         | Beschreibung                  |
|-----------------------|---------------------------------|-------------------------------|
| `DATABASE_URL`        | `postgresql://servanda:servanda_dev@localhost:5433/servanda_office` | Lokaler PG ueber Docker (Port 5433) |
| `S3_ENDPOINT`         | `http://localhost:9000`         | MinIO API                     |
| `OIDC_ISSUER_URL`     | `http://localhost:8080/realms/servanda` | Keycloak Realm          |
| `VITE_API_URL`        | `http://localhost:3000/api`     | Frontend -> API               |
| `FEATURE_ODT_EXPORT`  | `false`                         | ODT-Export Feature-Flag       |

**Hinweis:** `DATABASE_URL` in `.env` muss Port `5433` verwenden (Host-seitig), da Docker den Container-Port 5432 auf 5433 mappt.

### 2.3 Infrastruktur starten

```bash
# PostgreSQL, MinIO, Keycloak starten (Default-Profil)
npm run docker:up

# Status pruefen
docker compose -f docker/docker-compose.yml ps
```

### 2.4 Datenbank initialisieren

```bash
# Prisma-Client generieren + Schema auf DB anwenden
npm run db:generate
npx -w apps/api prisma db push

# Seed-Daten laden (Demo-Tenants, Benutzer, Klauseln)
npm run db:seed
```

### 2.5 Applikationen starten

```bash
# Alle Apps parallel (API + Web + Worker)
npm run dev

# Oder einzeln:
npm run dev:api      # Express API auf Port 3000
npm run dev:web      # Vite Dev-Server auf Port 5173
npm run dev:worker   # Export-Worker (pgboss)
```

### 2.6 Port-Uebersicht

| Service         | Port  | URL                                |
|-----------------|-------|------------------------------------|
| API (Express)   | 3000  | `http://localhost:3000/api`        |
| Web (Vite)      | 5173  | `http://localhost:5173`            |
| PostgreSQL      | 5433  | `localhost:5433` (Host-Port)       |
| MinIO API       | 9000  | `http://localhost:9000`            |
| MinIO Console   | 9001  | `http://localhost:9001`            |
| Keycloak        | 8080  | `http://localhost:8080`            |

---

## 3. Docker Compose

### 3.1 Service-Architektur

Die Datei `docker/docker-compose.yml` definiert drei Profile:

| Profil          | Services                                    | Startbefehl                                         |
|-----------------|---------------------------------------------|-----------------------------------------------------|
| *(default)*     | postgres, minio, minio-init, keycloak       | `docker compose -f docker/docker-compose.yml up -d` |
| `app`           | api, web, export-worker                     | `docker compose -f docker/docker-compose.yml --profile app up -d` |
| `observability` | prometheus, grafana, postgres-exporter      | `docker compose -f docker/docker-compose.yml --profile observability up -d` |

**Typischer Workflow:** Default-Profil starten, Apps lokal via `npm run dev` ausfuehren. Das `app`-Profil wird nur benoetigt, wenn die Container-Builds getestet werden sollen.

### 3.2 Persistente Volumes

| Volume            | Zweck                          |
|-------------------|--------------------------------|
| `postgres_data`   | PostgreSQL-Datenverzeichnis    |
| `minio_data`      | MinIO Object Storage           |
| `prometheus_data`  | Prometheus TSDB (7d Retention) |
| `grafana_data`    | Grafana-Konfiguration          |

### 3.3 Troubleshooting

**Port-Konflikte:**
```bash
# Pruefen, ob Port 5433 bereits belegt ist
netstat -ano | findstr :5433          # Windows
lsof -i :5433                         # Linux/macOS

# Alternative: Port in docker-compose.yml aendern
```

**WSL2-Speicherprobleme:**
```powershell
# .wslconfig in %USERPROFILE% anlegen/anpassen:
# [wsl2]
# memory=8GB
# processors=4
wsl --shutdown
# Docker Desktop neu starten
```

**Container-Logs pruefen:**
```bash
docker compose -f docker/docker-compose.yml logs postgres
docker compose -f docker/docker-compose.yml logs keycloak
```

**Vollstaendiger Reset:**
```bash
npm run docker:down
docker volume rm servanda-office_postgres_data servanda-office_minio_data
npm run docker:up
```

---

## 4. Datenbank

### 4.1 Schema-Verwaltung mit Prisma

Das Prisma-Schema liegt unter `apps/api/prisma/schema.prisma`. RLS-Policies werden separat via raw SQL verwaltet (nicht Prisma-managed).

```bash
# Schema-Aenderungen auf die DB anwenden (Development)
npx -w apps/api prisma db push

# Prisma-Client neu generieren (nach Schema-Aenderungen)
npm run db:generate

# Formale Migration erstellen (Staging/Prod)
npx -w apps/api prisma migrate dev --name <migration-name>

# Migration in Prod ausfuehren
npx -w apps/api prisma migrate deploy
```

### 4.2 RLS-Policies

Die Tenant-Isolation basiert auf PostgreSQL Row-Level Security (ADR-001). Die Funktion `current_tenant_id()` liest den Session-Parameter `app.current_tenant_id`:

```sql
-- Tenant-Kontext setzen (wird von der API-Middleware automatisch gemacht)
SET LOCAL app.current_tenant_id = '<tenant-uuid>';

-- RLS-Policy-Beispiel (in init-db.sql bzw. Migrationen)
ALTER TABLE clauses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clauses
  USING (tenant_id = current_tenant_id());
```

Die DB hat folgende Schemas (Modular Monolith):
- `platform` -- Tenants, Users, Teams
- `content` -- Clauses, Templates, Versions
- `contract` -- ContractInstances, Answers
- `export` -- ExportJobs
- `keycloak` -- Keycloak-interne Tabellen

### 4.3 Seed-Daten

```bash
npm run db:seed
```

Erstellt Demo-Daten: Vendor-Tenant, Lawfirm-Tenant, Benutzer (Admin/Editor/User), Muster-Klauseln und Templates.

### 4.4 DB-Reset

```bash
npx -w apps/api prisma db push --force-reset
npm run db:seed
```

**Achtung:** `--force-reset` loescht alle Daten. Nur in der Entwicklung verwenden.

---

## 5. Keycloak

### 5.1 Realm-Import

Keycloak startet mit `--import-realm` und laedt automatisch `docker/keycloak/realm-export.json`. Dieser konfiguriert:

- Realm `servanda` mit OIDC-Client `servanda-office`
- Rollen: `admin`, `editor`, `user`
- Dev-Benutzer fuer lokale Tests

### 5.2 Admin-Konsole

| URL                              | Benutzer | Passwort |
|----------------------------------|----------|----------|
| `http://localhost:8080/admin`    | `admin`  | `admin`  |

### 5.3 Dev-Mode vs. Production

**Dev-Mode (lokal):** Die API akzeptiert Header-basierte Authentifizierung, wenn `NODE_ENV=development`:

```bash
curl -H "x-tenant-id: <uuid>" \
     -H "x-user-id: <uuid>" \
     -H "x-user-role: admin" \
     http://localhost:3000/api/v1/clauses
```

**Production:** Ausschliesslich JWT-Tokens via Keycloak OIDC. Die Dev-Headers werden ignoriert. Client-Config:

| Parameter          | Wert                                        |
|--------------------|---------------------------------------------|
| `OIDC_ISSUER_URL`  | `https://<keycloak-host>/realms/servanda`   |
| `OIDC_CLIENT_ID`   | `servanda-office`                           |
| `OIDC_CLIENT_SECRET` | Aus Vault / External Secrets              |

---

## 6. CI/CD Pipelines

Alle Workflows liegen unter `.github/workflows/`.

### 6.1 PR Gate (`pr-gate.yml`)

Laeuft bei jedem Pull Request gegen `main`. Alle Jobs muessen bestehen:

| Job            | Pruefung                                      |
|----------------|-----------------------------------------------|
| `lint`         | ESLint -- 0 Errors                            |
| `typecheck`    | TypeScript `tsc --noEmit` -- 0 Errors         |
| `test`         | Vitest mit Coverage >= 80%                     |
| `build`        | Vollstaendiger Build aller Workspaces          |
| `bundle-size`  | Bundle-Size-Check (Web)                        |
| `a11y`         | axe-core Component-Level-Checks                |

### 6.2 Main Gate (`main-gate.yml`)

Laeuft nach Merge auf `main`:

| Job            | Pruefung                                       |
|----------------|------------------------------------------------|
| `test-full`    | Volle Test-Suite mit PostgreSQL Service-Container |
| `build`        | Docker-Image-Build                              |
| `lighthouse`   | Performance >= 85, Accessibility >= 90          |
| `security`     | `npm audit` + Trivy Container-Scan              |

### 6.3 Build & Push (`build-push.yml`)

Laeuft bei Push auf `main` und bei Tags (`v*`):

- Baut Docker-Images fuer `api`, `web`, `export-worker`
- Pusht nach `ghcr.io/<org>/servanda-office-<app>`
- Tags: Branch-Name, Git-SHA, Semver (bei Tags)
- Trivy-Scan aller Images mit SARIF-Upload zu GitHub Security

---

## 7. Kubernetes Deployment

### 7.1 Kustomize-Struktur

```
k8s/
  base/                          # Gemeinsame Basis-Manifeste
    kustomization.yaml
    namespace.yaml
    configmap.yaml
    api-deployment.yaml
    api-service.yaml
    web-deployment.yaml
    web-service.yaml
    export-worker-deployment.yaml
    postgres-statefulset.yaml
    postgres-service.yaml
    network-policy-*.yaml        # Default-Deny + Service-spezifisch
  overlays/
    dev/                         # Minimale Ressourcen, Namespace servanda-dev
    staging/                     # Sealed Secrets, erhoehte Ressourcen
    prod/                        # External Secrets, HPA, Ingress mit TLS
    onprem/                      # Erweitert Prod: MinIO, Static Secrets
```

### 7.2 Overlay-Uebersicht

| Overlay    | Secrets              | Replicas    | Extras                             |
|------------|----------------------|-------------|------------------------------------|
| `dev`      | Inline/ConfigMap     | 1           | Reduzierte CPU/Memory-Limits       |
| `staging`  | Sealed Secrets       | 1-2         | Sealed Secrets Controller noetig   |
| `prod`     | External Secrets     | 3-10 (HPA)  | Ingress, TLS, HPA, Rate-Limiting  |
| `onprem`   | Static Secrets       | 3-10 (HPA)  | MinIO StatefulSet, LDAP-Config     |

### 7.3 Deployment ausfuehren

```bash
# Dev-Umgebung
kubectl apply -k k8s/overlays/dev

# Staging
kubectl apply -k k8s/overlays/staging

# Production
kubectl apply -k k8s/overlays/prod

# On-Premises
kubectl apply -k k8s/overlays/onprem
```

### 7.4 Secrets-Management

**Production (External Secrets Operator):**
Secrets werden aus HashiCorp Vault geladen. Ein `SecretStore` namens `vault-backend` muss im Cluster existieren. Verwaltete Secrets:

- `servanda-db-credentials` -- DB-Host, Port, User, Password, URL
- `servanda-s3-credentials` -- S3 Endpoint, Access Key, Secret Key, Bucket
- `servanda-oidc-credentials` -- OIDC Issuer URL, Client ID, Client Secret

**On-Premises (Static Secrets):**
Secrets werden als Kubernetes Secrets manuell angelegt oder via `static-secrets.yaml` deployed. Werte vor Deployment ersetzen:

```bash
# Secret-Werte Base64-kodieren
echo -n 'mein-passwort' | base64

# In k8s/overlays/onprem/static-secrets.yaml eintragen
kubectl apply -k k8s/overlays/onprem
```

### 7.5 Ingress & TLS (Production)

Production verwendet NGINX Ingress Controller mit cert-manager:

- Host: `servanda.example.com` (in `ingress.yaml` anpassen)
- TLS via Let's Encrypt (`letsencrypt-prod` ClusterIssuer)
- Rate-Limiting: 20 req/s, 300 req/min, max 10 gleichzeitige Verbindungen
- Routing: `/api` -> API-Service (Port 3000), `/` -> Web-Service (Port 80)

---

## 8. Monitoring

### 8.1 Stack starten (lokal)

```bash
docker compose -f docker/docker-compose.yml --profile observability up -d
```

| Service            | Port  | URL                             |
|--------------------|-------|---------------------------------|
| Prometheus         | 9090  | `http://localhost:9090`         |
| Grafana            | 3001  | `http://localhost:3001`         |
| postgres-exporter  | 9187  | Nur intern (Prometheus Target)  |

**Grafana-Login:** `admin` / `admin`

### 8.2 Prometheus Scrape-Targets

| Job                      | Target                    | Intervall | Pfad           |
|--------------------------|---------------------------|-----------|----------------|
| `servanda-api`           | `api:3000`                | 10s       | `/api/metrics` |
| `servanda-export-worker` | `export-worker:9090`      | 30s       | `/metrics`     |
| `postgres-exporter`      | `postgres-exporter:9187`  | 30s       | `/metrics`     |

### 8.3 Wichtige Metriken

- **API:** `http_request_duration_seconds`, `http_requests_total`, `nodejs_heap_used_bytes`
- **Export Worker:** `export_jobs_total`, `export_job_duration_seconds`, `export_dlq_size`
- **PostgreSQL:** `pg_stat_activity_count`, `pg_stat_database_tup_fetched`, `pg_locks_count`

### 8.4 Alerting (Production)

Grafana-Dashboards werden via Provisioning unter `docker/grafana/provisioning/` automatisch geladen. Fuer Production-Alerting Grafana-Alerting oder Alertmanager konfigurieren.

---

## 9. Troubleshooting

### Haeufige Probleme

| Problem | Ursache | Loesung |
|---------|---------|---------|
| `ECONNREFUSED :5433` | PostgreSQL-Container nicht gestartet | `docker compose -f docker/docker-compose.yml ps` pruefen, ggf. `npm run docker:up` |
| `Prisma: P1001 Can't reach database` | Falscher Port in DATABASE_URL | `.env` pruefen: Port muss `5433` sein (Host-Mapping) |
| `OIDC Discovery failed` | Keycloak noch nicht bereit | Keycloak braucht ca. 30-60s nach Start. `docker compose logs keycloak` pruefen |
| `S3: NoSuchBucket` | MinIO-Init nicht gelaufen | `docker compose -f docker/docker-compose.yml up minio-init` |
| `pino-pretty not found` | Dev-Dependency fehlt | `npm install` im Root ausfuehren |
| Export-Worker haengt | pgboss-Tabellen fehlen | `npm run db:seed` -- pgboss erstellt Tabellen beim ersten Start |
| `EPERM` unter Windows | Docker Volume-Permissions | Docker Desktop > Settings > General > "Use WSL 2 based engine" aktivieren |
| K8s Pods im CrashLoopBackOff | Fehlende Secrets oder DB nicht erreichbar | `kubectl logs <pod>` und `kubectl describe pod <pod>` pruefen |

### Diagnose-Befehle

```bash
# Docker-Container-Status
docker compose -f docker/docker-compose.yml ps

# API-Health-Check
curl http://localhost:3000/api/health

# DB-Verbindung testen
docker exec servanda-postgres psql -U servanda -d servanda_office -c "SELECT 1;"

# Kubernetes-Status
kubectl -n servanda-office get pods
kubectl -n servanda-office logs deployment/servanda-api --tail=50

# Prometheus Targets pruefen
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health}'
```
