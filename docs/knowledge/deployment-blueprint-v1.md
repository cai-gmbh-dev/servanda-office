# Deployment-Blueprint v1 — Servanda Office

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 07 (DevOps & On-Prem)
**Referenzen:** Architecture Backbone v1, ADR-001, ADR-003, ADR-004, QA-Gates CI v1, Audit-Compliance v1

---

## 1. Umgebungs-Strategie

### 1.1 Übersicht

| Umgebung | Zweck | Promotion-Gate | Daten | Zugang |
| --- | --- | --- | --- | --- |
| **dev** | Feature-Entwicklung, schnelle Iteration | PR merged → auto-deploy | Synthetisch (Seed) | Team-intern |
| **stage** | QA, E2E, Performance, Demo | Main-Gate grün → auto-deploy | Anonymisierter Prod-Snapshot (optional) | Team + Stakeholder |
| **prod** | Live-Betrieb | Release-Gate + manuelles Approval | Echte Mandanten-Daten | Kunden |

### 1.2 Promotion-Flow

```text
Feature Branch → PR Gate (9 Checks)
       │
       ▼
   main Branch → Main Gate (6 Checks)
       │
       ├──→ dev   (auto-deploy on merge)
       │
       ▼
   Release Tag → Release Gate (5 Checks)
       │
       ├──→ stage (auto-deploy on tag)
       │
       ▼
   Manual Approval (Tech Lead + Product Owner)
       │
       └──→ prod  (deploy via CI/CD Pipeline)
```

### 1.3 Branch-Strategie

- **main**: immer deploybar, geschützt (PR-Pflicht + Gate-Checks)
- **feature/***: kurzlebig, Feature-Branches ab `main`
- **release/v***: Release-Kandidat, erstellt von `main`
- **hotfix/***: dringender Fix, merged in `main` + aktiven Release-Branch

---

## 2. Infrastruktur-Komponenten

### 2.1 Komponenten pro Umgebung

| Komponente | dev | stage | prod |
| --- | --- | --- | --- |
| **API Server** | 1 Pod | 2 Pods | 2+ Pods (HPA) |
| **Export Worker** | 1 Pod | 1 Pod | 2+ Pods (HPA) |
| **Frontend** | 1 Pod (Nginx) | 1 Pod (Nginx) | CDN + 2 Pods |
| **PostgreSQL** | 1 Instance (shared) | 1 Instance (managed) | HA-Cluster (managed) |
| **Object Storage** | MinIO (lokal) | MinIO oder S3 | S3 (managed) |
| **Keycloak** | 1 Instance (embedded H2) | 1 Instance (PostgreSQL) | HA-Cluster (PostgreSQL) |
| **pgboss Queue** | In API-DB | In API-DB | In API-DB |
| **Monitoring** | Prometheus + Grafana (shared) | Prometheus + Grafana | Prometheus + Grafana + Alerting |
| **Logging** | stdout → lokale Logs | OpenSearch (shared) | OpenSearch (dediziert) |

### 2.2 Kubernetes-Namespace-Layout

```text
servanda-dev/
  ├── api-deployment
  ├── export-worker-deployment
  ├── frontend-deployment
  ├── postgresql-statefulset
  ├── minio-deployment
  ├── keycloak-deployment
  └── monitoring/

servanda-stage/
  ├── api-deployment
  ├── export-worker-deployment
  ├── frontend-deployment
  ├── keycloak-deployment
  └── monitoring/
  # PostgreSQL + Storage: managed (extern)

servanda-prod/
  ├── api-deployment (HPA)
  ├── export-worker-deployment (HPA)
  ├── frontend-deployment
  ├── keycloak-deployment (HA)
  └── monitoring/
  # PostgreSQL: managed HA, S3: managed
```

---

## 3. Kubernetes-Manifeste (Kern-Workloads)

### 3.1 API Server

```yaml
# k8s/base/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: servanda-api
  labels:
    app: servanda
    component: api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: servanda
      component: api
  template:
    metadata:
      labels:
        app: servanda
        component: api
    spec:
      serviceAccountName: servanda-api
      containers:
        - name: api
          image: servanda/api:latest
          ports:
            - containerPort: 3000
              name: http
          env:
            - name: NODE_ENV
              value: "production"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: servanda-db-credentials
                  key: url
            - name: S3_ENDPOINT
              valueFrom:
                configMapKeyRef:
                  name: servanda-config
                  key: s3-endpoint
            - name: S3_BUCKET
              valueFrom:
                configMapKeyRef:
                  name: servanda-config
                  key: s3-bucket
            - name: KEYCLOAK_URL
              valueFrom:
                configMapKeyRef:
                  name: servanda-config
                  key: keycloak-url
            - name: KEYCLOAK_REALM
              valueFrom:
                configMapKeyRef:
                  name: servanda-config
                  key: keycloak-realm
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 15
            periodSeconds: 30
          securityContext:
            runAsNonRoot: true
            runAsUser: 1000
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false
---
apiVersion: v1
kind: Service
metadata:
  name: servanda-api
spec:
  selector:
    app: servanda
    component: api
  ports:
    - port: 80
      targetPort: http
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: servanda-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: servanda-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### 3.2 Export Worker

```yaml
# k8s/base/export-worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: servanda-export-worker
  labels:
    app: servanda
    component: export-worker
spec:
  replicas: 1
  selector:
    matchLabels:
      app: servanda
      component: export-worker
  template:
    metadata:
      labels:
        app: servanda
        component: export-worker
    spec:
      serviceAccountName: servanda-export-worker
      containers:
        - name: export-worker
          image: servanda/export-worker:latest
          env:
            - name: NODE_ENV
              value: "production"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: servanda-db-credentials
                  key: url
            - name: S3_ENDPOINT
              valueFrom:
                configMapKeyRef:
                  name: servanda-config
                  key: s3-endpoint
            - name: S3_BUCKET
              valueFrom:
                configMapKeyRef:
                  name: servanda-config
                  key: s3-bucket
            - name: S3_ACCESS_KEY
              valueFrom:
                secretKeyRef:
                  name: servanda-s3-credentials
                  key: access-key
            - name: S3_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: servanda-s3-credentials
                  key: secret-key
            - name: EXPORT_JOB_TIMEOUT_MS
              value: "120000"
            - name: EXPORT_CONCURRENCY
              value: "3"
          resources:
            requests:
              cpu: 500m
              memory: 1Gi
            limits:
              cpu: 2000m
              memory: 2Gi
          securityContext:
            runAsNonRoot: true
            runAsUser: 1000
            readOnlyRootFilesystem: false   # LibreOffice benötigt tmp-Schreibzugriff
            allowPrivilegeEscalation: false
          volumeMounts:
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: tmp
          emptyDir:
            sizeLimit: 1Gi
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: servanda-export-worker-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: servanda-export-worker
  minReplicas: 1
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
```

### 3.3 Frontend (Nginx)

```yaml
# k8s/base/frontend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: servanda-frontend
  labels:
    app: servanda
    component: frontend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: servanda
      component: frontend
  template:
    metadata:
      labels:
        app: servanda
        component: frontend
    spec:
      containers:
        - name: frontend
          image: servanda/frontend:latest
          ports:
            - containerPort: 80
              name: http
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 128Mi
          securityContext:
            runAsNonRoot: true
            runAsUser: 101    # nginx user
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false
          volumeMounts:
            - name: nginx-cache
              mountPath: /var/cache/nginx
            - name: nginx-pid
              mountPath: /var/run
      volumes:
        - name: nginx-cache
          emptyDir: {}
        - name: nginx-pid
          emptyDir: {}
```

### 3.4 Ingress

```yaml
# k8s/base/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: servanda-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
    nginx.ingress.kubernetes.io/configuration-snippet: |
      add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
      add_header X-Content-Type-Options nosniff always;
      add_header X-Frame-Options DENY always;
      add_header Referrer-Policy strict-origin-when-cross-origin always;
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - app.servanda.de
      secretName: servanda-tls
  rules:
    - host: app.servanda.de
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: servanda-api
                port:
                  number: 80
          - path: /
            pathType: Prefix
            backend:
              service:
                name: servanda-frontend
                port:
                  number: 80
```

---

## 4. Network Policies

```yaml
# k8s/base/network-policies.yaml

# API kann auf PostgreSQL, S3, Keycloak zugreifen
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-egress
spec:
  podSelector:
    matchLabels:
      component: api
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              component: postgresql
      ports:
        - port: 5432
    - to:
        - podSelector:
            matchLabels:
              component: minio
      ports:
        - port: 9000
    - to:
        - podSelector:
            matchLabels:
              component: keycloak
      ports:
        - port: 8080
    - to:                          # DNS
        - namespaceSelector: {}
      ports:
        - port: 53
          protocol: UDP

---
# Export Worker kann auf PostgreSQL und S3 zugreifen, NICHT auf Keycloak
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: export-worker-egress
spec:
  podSelector:
    matchLabels:
      component: export-worker
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              component: postgresql
      ports:
        - port: 5432
    - to:
        - podSelector:
            matchLabels:
              component: minio
      ports:
        - port: 9000
    - to:
        - namespaceSelector: {}
      ports:
        - port: 53
          protocol: UDP

---
# Frontend hat keinen direkten Backend-Zugriff (alles via Ingress)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: frontend-deny-all-egress
spec:
  podSelector:
    matchLabels:
      component: frontend
  policyTypes:
    - Egress
  egress: []
```

---

## 5. Docker-Images

### 5.1 API & Export Worker

```dockerfile
# Dockerfile.api
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

FROM gcr.io/distroless/nodejs20-debian12
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
USER 1000
EXPOSE 3000
CMD ["dist/server.js"]
```

```dockerfile
# Dockerfile.export-worker
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
USER 1000
CMD ["node", "dist/export-worker.js"]
```

### 5.2 Frontend

```dockerfile
# Dockerfile.frontend
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
USER 101
EXPOSE 80
```

### 5.3 Image-Tagging-Konvention

| Kontext | Tag-Format | Beispiel |
| --- | --- | --- |
| Dev-Build | `dev-<commit-sha>` | `servanda/api:dev-a1b2c3d` |
| Stage-Release | `rc-<version>` | `servanda/api:rc-0.1.0` |
| Prod-Release | `<semver>` | `servanda/api:0.1.0` |
| Latest (dev) | `latest` | `servanda/api:latest` |

---

## 6. Kustomize-Overlays

### 6.1 Verzeichnisstruktur

```text
k8s/
├── base/
│   ├── kustomization.yaml
│   ├── api-deployment.yaml
│   ├── export-worker-deployment.yaml
│   ├── frontend-deployment.yaml
│   ├── ingress.yaml
│   ├── network-policies.yaml
│   ├── configmap.yaml
│   └── service-accounts.yaml
├── overlays/
│   ├── dev/
│   │   ├── kustomization.yaml
│   │   ├── patches/
│   │   │   ├── api-replicas.yaml        # replicas: 1
│   │   │   ├── resources-minimal.yaml    # niedrige Limits
│   │   │   └── ingress-dev.yaml          # dev.servanda.de
│   │   └── configmap-dev.yaml
│   ├── stage/
│   │   ├── kustomization.yaml
│   │   ├── patches/
│   │   │   ├── api-replicas.yaml        # replicas: 2
│   │   │   └── ingress-stage.yaml       # stage.servanda.de
│   │   └── configmap-stage.yaml
│   └── prod/
│       ├── kustomization.yaml
│       ├── patches/
│       │   ├── api-hpa.yaml             # HPA enabled
│       │   ├── ingress-prod.yaml        # app.servanda.de
│       │   └── resources-prod.yaml      # höhere Limits
│       └── configmap-prod.yaml
└── on-prem/
    ├── kustomization.yaml
    ├── patches/
    │   ├── db-per-tenant.yaml           # Optional: DB-per-Tenant
    │   ├── minio-local.yaml             # MinIO statt S3
    │   └── network-isolation.yaml       # Strikte Network Policies
    └── configmap-onprem.yaml
```

### 6.2 Umgebungs-Konfiguration

```yaml
# k8s/overlays/dev/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: servanda-dev
resources:
  - ../../base
patches:
  - path: patches/api-replicas.yaml
  - path: patches/resources-minimal.yaml
  - path: patches/ingress-dev.yaml
configMapGenerator:
  - name: servanda-config
    behavior: merge
    literals:
      - s3-endpoint=http://minio:9000
      - s3-bucket=servanda-dev
      - keycloak-url=http://keycloak:8080
      - keycloak-realm=servanda-dev
      - log-level=debug
images:
  - name: servanda/api
    newTag: latest
  - name: servanda/export-worker
    newTag: latest
  - name: servanda/frontend
    newTag: latest
```

---

## 7. On-Prem Deployment

### 7.1 Architektur

```text
┌─────────────────────────────────────────────────┐
│         Kunden-Netzwerk (Air-Gapped möglich)     │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │         Kubernetes (K3s / RKE2)             │  │
│  │                                              │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐   │  │
│  │  │ API      │ │ Export   │ │ Frontend │   │  │
│  │  │ Server   │ │ Worker + │ │ (Nginx)  │   │  │
│  │  │          │ │ LibreOff.│ │          │   │  │
│  │  └────┬─────┘ └────┬─────┘ └──────────┘   │  │
│  │       │             │                        │  │
│  │  ┌────▼─────┐ ┌────▼─────┐ ┌──────────┐   │  │
│  │  │PostgreSQL│ │ MinIO    │ │ Keycloak │   │  │
│  │  │ (lokal)  │ │ (lokal)  │ │ + LDAP   │   │  │
│  │  └──────────┘ └──────────┘ └──────────┘   │  │
│  │                                              │  │
│  │  ┌──────────────────────────────────────┐   │  │
│  │  │ Monitoring (Prometheus + Grafana)     │   │  │
│  │  └──────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  Besonderheiten:                                  │
│  - Kein Internet-Zugang erforderlich              │
│  - DB-per-Tenant optional (ADR-001)              │
│  - LDAP/AD-Integration via Keycloak              │
│  - Lokale TLS-Zertifikate (selbstsigniert/PKI)  │
│  - Container-Images via Private Registry         │
└─────────────────────────────────────────────────┘
```

### 7.2 On-Prem vs. Cloud Unterschiede

| Aspekt | Cloud | On-Prem |
| --- | --- | --- |
| **Kubernetes** | Managed (EKS/GKE/AKS) | K3s oder RKE2 |
| **PostgreSQL** | Managed (RDS/CloudSQL) | Lokal (StatefulSet oder VM) |
| **Object Storage** | S3 | MinIO |
| **Auth** | Keycloak (managed) | Keycloak + LDAP/AD Bridge |
| **TLS** | Let's Encrypt / ACM | Selbstsigniert oder Kunden-PKI |
| **Image Registry** | Container Registry (ECR/GCR) | Private Registry (Harbor) |
| **Monitoring** | Managed (Datadog/CloudWatch) | Prometheus + Grafana (lokal) |
| **Updates** | Rolling Updates via CI/CD | Offline-Pakete (Helm Charts + Images) |
| **Backup** | Managed Snapshots | Eigenes Backup-Script (pg_dump + MinIO mc) |
| **Tenant-Isolation** | Shared DB + RLS | Optional DB-per-Tenant |

### 7.3 On-Prem Readiness Checklist

- [ ] K3s/RKE2 Installation getestet
- [ ] Air-Gap Image-Bundle erstellt (alle Container-Images)
- [ ] MinIO Storage-Konfiguration dokumentiert
- [ ] LDAP/AD Integration in Keycloak getestet
- [ ] Selbstsignierte TLS-Zertifikate funktionieren
- [ ] Backup/Restore-Prozess dokumentiert und getestet
- [ ] DB-per-Tenant Modus getestet (Feature-Flag)
- [ ] Offline-Update-Prozess dokumentiert
- [ ] Monitoring-Dashboard funktioniert ohne Internet
- [ ] Network Policies greifen (kein ungewollter Egress)

---

## 8. Health Checks & Readiness

### 8.1 API Server

```typescript
// src/health.ts

// Liveness: Prozess lebt
app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'ok' })
})

// Readiness: DB + Keycloak erreichbar
app.get('/health/ready', async (req, res) => {
  try {
    await db.$queryRaw`SELECT 1`
    // Keycloak-Check optional (kein Hard-Dependency)
    res.status(200).json({ status: 'ready', db: 'ok' })
  } catch (error) {
    res.status(503).json({ status: 'not_ready', db: 'error' })
  }
})

// Startup: Migrationen gelaufen
app.get('/health/startup', async (req, res) => {
  const hasMigrations = await checkMigrationsApplied()
  if (hasMigrations) {
    res.status(200).json({ status: 'started' })
  } else {
    res.status(503).json({ status: 'migrating' })
  }
})
```

### 8.2 Export Worker

```typescript
// Export Worker Health (kein HTTP — Heartbeat-Mechanismus)
// pgboss bietet built-in Monitoring:
//   - Job-Queue-Tiefe
//   - Worker-Heartbeat
//   - Failed-Job-Count

// Optional: Sidecar mit HTTP Health-Endpoint
app.get('/health/live', (req, res) => {
  const lastHeartbeat = exportWorker.getLastHeartbeat()
  const healthy = Date.now() - lastHeartbeat < 60_000
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'stale' })
})
```

---

## 9. Observability-Stack

### 9.1 Prometheus-Metriken (Custom)

```typescript
// src/metrics.ts
import { Counter, Histogram, Gauge } from 'prom-client'

export const httpRequestDuration = new Histogram({
  name: 'servanda_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status_code', 'tenant_id'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
})

export const exportJobDuration = new Histogram({
  name: 'servanda_export_job_duration_seconds',
  help: 'Export job processing time',
  labelNames: ['format', 'status', 'tenant_id'],
  buckets: [1, 5, 10, 30, 60, 120]
})

export const exportQueueDepth = new Gauge({
  name: 'servanda_export_queue_depth',
  help: 'Number of pending export jobs'
})

export const activeTenantsGauge = new Gauge({
  name: 'servanda_active_tenants_total',
  help: 'Number of active tenants'
})

export const dbQueryDuration = new Histogram({
  name: 'servanda_db_query_duration_seconds',
  help: 'Database query duration',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
})
```

### 9.2 Alerting-Regeln

```yaml
# monitoring/alerts.yaml
groups:
  - name: servanda-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(servanda_http_request_duration_seconds_count{status_code=~"5.."}[5m]) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate ({{ $value }} errors/sec)"

      - alert: APILatencyHigh
        expr: histogram_quantile(0.95, rate(servanda_http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P95 API latency > 2s"

      - alert: ExportQueueBacklog
        expr: servanda_export_queue_depth > 50
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Export queue backlog ({{ $value }} pending jobs)"

      - alert: ExportFailureRate
        expr: rate(servanda_export_job_duration_seconds_count{status="failed"}[15m]) / rate(servanda_export_job_duration_seconds_count[15m]) > 0.05
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Export failure rate > 5%"

      - alert: DatabaseConnectionPoolExhausted
        expr: servanda_db_pool_active / servanda_db_pool_max > 0.9
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "DB connection pool > 90% utilized"
```

### 9.3 Grafana-Dashboards (vordefiniert)

| Dashboard | Metriken | Zielgruppe |
| --- | --- | --- |
| **System Health** | CPU, Memory, Pods, Uptime | DevOps |
| **API Performance** | Request Rate, Latenz (P50/P95/P99), Error Rate | DevOps + Dev |
| **Export Pipeline** | Queue Depth, Job Duration, Success/Failure Rate | DevOps + Team 05 |
| **Tenant Activity** | Active Tenants, Requests per Tenant, Storage Usage | Product + DevOps |
| **Database** | Query Duration, Connection Pool, Slow Queries | DevOps |
| **Security** | Failed Logins, Role Changes, Cross-Tenant Attempts | Team 02 |

---

## 10. Backup & Recovery

### 10.1 Backup-Strategie

| Komponente | Methode | Frequenz | Retention | Ziel |
| --- | --- | --- | --- | --- |
| **PostgreSQL** | pg_dump (logical) + WAL-Archiving | Täglich (full) + kontinuierlich (WAL) | 30 Tage (full), 7 Tage (WAL) | S3 / separater Storage |
| **Object Storage** | S3 Cross-Region Replication (Cloud) / MinIO mc mirror (On-Prem) | Kontinuierlich | 30 Tage | Sekundärer Bucket / Storage |
| **Keycloak DB** | pg_dump (separate DB) | Täglich | 30 Tage | S3 |
| **K8s Manifeste** | Git (Kustomize Overlays) | Bei jeder Änderung | Unbegrenzt (Git) | Git Repository |
| **Secrets** | Vault Snapshots / Sealed Secrets in Git | Täglich | 30 Tage | Encrypted Backup |

### 10.2 Recovery-Ziele

| Metrik | Ziel (Cloud) | Ziel (On-Prem) |
| --- | --- | --- |
| **RPO** (Recovery Point Objective) | < 1 Stunde (WAL) | < 24 Stunden (daily dump) |
| **RTO** (Recovery Time Objective) | < 1 Stunde | < 4 Stunden |

### 10.3 Recovery-Verfahren

```text
PostgreSQL Recovery:
  1. Neuen PostgreSQL-Instance starten
  2. pg_restore vom letzten Full-Backup
  3. WAL-Replay bis Zielzeitpunkt (PITR)
  4. Keycloak-DB separat restoren
  5. Application Pods neu starten
  6. Health-Checks verifizieren

Object Storage Recovery:
  1. MinIO/S3 Bucket aus Replikation/Backup restoren
  2. Konsistenz-Check: alle Export-Jobs in DB haben korrespondierendes File
  3. Fehlende Exports: Re-Export aus gepinnten Versionen (ADR-002)

Full Disaster Recovery:
  1. Kubernetes-Cluster aufsetzen (Terraform/Ansible)
  2. Kustomize-Manifeste aus Git anwenden
  3. PostgreSQL aus Backup restoren
  4. Object Storage aus Backup restoren
  5. Secrets aus Vault/Sealed Secrets restoren
  6. DNS umschalten
  7. Smoke-Tests durchführen
```

---

## 11. Database-Migration-Strategie

### 11.1 Prisma-Migrationen

```text
Entwicklungsablauf:
  1. Schema ändern → prisma/schema.prisma
  2. Migration erstellen → npx prisma migrate dev --name <name>
  3. Migration prüft automatisch:
     - RLS-Policies auf neuen Tabellen (Migrations-Checkliste ADR-001)
     - FORCE ROW LEVEL SECURITY
     - tenant_id Column vorhanden
  4. PR erstellen → CI prüft RLS-Coverage (Gate G-08)
  5. Deployment → prisma migrate deploy (automatisch im Init-Container)
```

### 11.2 Init-Container für Migrationen

```yaml
# In api-deployment.yaml ergänzen
initContainers:
  - name: migrate
    image: servanda/api:latest
    command: ["npx", "prisma", "migrate", "deploy"]
    env:
      - name: DATABASE_URL
        valueFrom:
          secretKeyRef:
            name: servanda-db-credentials
            key: url
```

### 11.3 Rollback-Strategie

| Situation | Vorgehen |
| --- | --- |
| Migration fehlgeschlagen | Automatischer Rollback durch Prisma (Transaktion) |
| Schema-Inkompatibilität | Blue-Green Deployment: alter Service + neue DB, dann umschalten |
| Daten-Migration-Bug | Point-in-Time Recovery auf Zustand vor Migration |
| Notfall | Rollback auf vorherige Image-Version + vorherige DB-Version |

---

## 12. Ressourcen-Planung

### 12.1 Sizing pro Umgebung

| Umgebung | Nodes | CPU (gesamt) | RAM (gesamt) | Storage |
| --- | --- | --- | --- | --- |
| **dev** | 1 | 4 vCPU | 8 GB | 50 GB |
| **stage** | 2 | 8 vCPU | 16 GB | 100 GB |
| **prod** | 3+ | 16+ vCPU | 32+ GB | 500+ GB |
| **On-Prem (min)** | 2 | 8 vCPU | 16 GB | 200 GB |

### 12.2 Skalierungsgrenzen (MVP)

| Metrik | Startwert | Maximal (MVP) |
| --- | --- | --- |
| Tenants | 10 | 100 |
| Users pro Tenant | 5 | 50 |
| Concurrent API Requests | 50 | 500 |
| Export Jobs / Stunde | 20 | 200 |
| DB-Größe | 1 GB | 50 GB |
| Object Storage | 5 GB | 100 GB |

---

## 13. Rollout-Plan

| Phase | Scope | Zeitrahmen |
| --- | --- | --- |
| **Phase 1 (Sprint 1)** | Dev-Umgebung: K8s Namespace, Base-Manifeste, CI/CD Build | Sofort |
| **Phase 2 (Sprint 2)** | Stage-Umgebung: Managed DB, Keycloak, E2E-Tests gegen Stage | Sprint 2 |
| **Phase 3 (Sprint 3-4)** | Prod-Umgebung: HA, Monitoring, Alerting, Backup | Sprint 3-4 |
| **Phase 4 (Sprint 5+)** | On-Prem: K3s, Air-Gap, LDAP, Kunde-Pilot | Sprint 5+ |
