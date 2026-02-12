# Updates – DevOps & On-Prem

## Initial
- Team aufgesetzt.
- Fokus auf Betriebsmodell und Compliance-taugliche Deployments.

## 2026-02-09
- Start Phase 0–1 Orchestrierung.
- Deliverables diese Woche: CI/CD Skeleton, Deployment-Blueprint v1, Secrets/Key-Handling Entwurf.
- Abhängigkeiten: ADR-001 (Tenancy), ADR-003 (Export-Service), Input von Team 02 (Security Baseline).
- Referenzen: `docs/knowledge/adr-001-multi-tenant-isolation.md`, `docs/knowledge/adr-003-export-engine-service.md`, `docs/knowledge/domain-model-v0.1.md`.
- Architektur-Übersicht: `docs/knowledge/architecture-summary.md`.
- Owner Matrix bestätigt: `docs/plan/sprint-status.md`.

## 2026-02-10
- **Sprint-1 Deliverables abgeschlossen:**
  1. **Deployment-Blueprint v1** (`docs/knowledge/deployment-blueprint-v1.md`)
     - 3 Umgebungen: dev (auto-deploy) → stage (tag-deploy) → prod (manual approval)
     - Kubernetes-Manifeste: API Server (HPA), Export Worker (HPA + LibreOffice), Frontend (Nginx)
     - Kustomize-Overlays: base + dev/stage/prod/on-prem
     - Network Policies: API→DB+S3+KC, Worker→DB+S3, Frontend→nichts
     - Docker-Images: distroless (API), node-slim+LibreOffice (Worker), nginx-alpine (Frontend)
     - On-Prem: K3s/RKE2, MinIO, LDAP/AD, Air-Gap-Support, DB-per-Tenant optional
     - Backup: pg_dump+WAL, S3 Replication, RPO <1h (Cloud), RTO <1h (Cloud)
     - Observability: Prometheus+Grafana, Custom-Metriken, Alerting-Regeln
     - DB-Migration: Prisma + Init-Container, Rollback via PITR
     - Sizing: dev(1N/4CPU), stage(2N/8CPU), prod(3+N/16+CPU)
  2. **CI/CD Skeleton v1** (`docs/knowledge/cicd-skeleton-v1.md`)
     - 4 Workflows: pr-gate, main-gate, build-push, deploy
     - Container Registry: ghcr.io (GitHub Container Registry)
     - Image-Scanning: Trivy (CRITICAL+HIGH)
     - Promotion: Feature→main→dev(auto)→stage(tag)→prod(approval)
     - Release-Prozess: SemVer, Release-Branch, Tag-basiert
     - Caching: npm + Docker Layer (GHA Cache)
     - CODEOWNERS: Team-basierte Review-Pflicht
     - Scheduled Security Scan: Wöchentlich (Dependencies + Images)
  3. **Secrets/Key-Handling v1** (`docs/knowledge/secrets-key-handling-v1.md`)
     - 12 Secrets inventarisiert mit Klassifizierung (Critical/High/Medium/Low)
     - Storage: K8s Secrets (dev) → Sealed Secrets (stage) → External Secrets/Vault (prod)
     - Key-Management: JWT (RS256, 365d), TLS (cert-manager, 90d), DB TDE, S3 SSE
     - Tenant-Keys (Enterprise): KMS/Vault per-Tenant, Field-Level Encryption optional
     - Rotation: Zero-Downtime für alle Secrets, Monitoring-Alert für überfällige Rotation
     - Access Control: K8s RBAC (Least Privilege), Vault Policies
     - Audit: K8s Audit Policy, Vault Audit Log, CloudTrail
     - Git-Leaks: gitleaks Pre-Commit + CI-Check
     - Notfall: Kompromittierungs-Runbook, Key-Recovery-Verfahren
- Abhängigkeiten: ADR-001 (Team 01), ADR-003 (Team 01+05), Audit-Compliance v1 (Team 02), QA-Gates CI v1 (Team 06).

## 2026-02-11 (Sprint 4)

**Sprint-4 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Docker-Compose Dev-Environment** (`docker/docker-compose.yml`) — gemeinsam mit Team 01
  PostgreSQL 16-alpine (Health-Check, Volume-Persistenz), MinIO (S3-kompatibel, Console auf :9001, Bucket-Init via mc), Keycloak 24 (Start-Dev-Mode, OIDC-Provider). Init-DB-Script (`docker/init-db.sql`): Extensions (uuid-ossp, pgcrypto), 5 Schemas (platform, content, contract, export, keycloak), `servanda_app`-Rolle, `current_tenant_id()` RLS-Funktion.

- **CI Pipeline v1 GitHub Actions** (`.github/workflows/`) — gemeinsam mit Team 06
  PR-Gate (6 Jobs: lint, typecheck, test mit Coverage ≥80%, build, bundle-size, a11y). Main-Gate (4 Jobs: full test suite mit PostgreSQL Service-Container, Docker-Image-Build, Lighthouse CI, Dependency-Security-Scan). Lighthouse-Konfiguration (`lighthouserc.json`): 3 Runs, Desktop-Preset, Assertions ≥85 Perf / ≥90 A11y.

- **Environment-Konfiguration** (`.env.example`, `.gitignore`)
  Alle Umgebungsvariablen dokumentiert: DATABASE_URL, S3_*, OIDC_*, EXPORT_*, FEATURE_ODT_EXPORT. .gitignore mit Ausschlüssen für node_modules, dist, .env, coverage, prisma, docker-data.

Nächste Schritte Team 07:

- Sprint 5: Kubernetes-Manifeste (Kustomize base + dev overlay) erstellen.
- Docker-Images für API, Web, Export-Worker bauen und in ghcr.io pushen.
- Secrets-Management für dev-Umgebung einrichten (K8s Secrets).
- Observability-Stack aufsetzen (Prometheus + Grafana).

## 2026-02-11 (Sprint 5)

**Sprint-5 Deliverables abgeschlossen (gemeinsam mit Team 06).**

Erstellte Code-Artefakte:

- **Dockerfiles** (`apps/*/Dockerfile`) — gemeinsam mit Team 06
  3 Multi-Stage Dockerfiles: API (node:20-slim + openssl, Prisma), Web (nginx:1.27-alpine), Export-Worker (node:20-slim + LibreOffice headless). Alle mit optimierten Layer-Caching (package.json first, dann Code).

- **Docker-Compose App Services** (`docker/docker-compose.yml`)
  api (Port 3000), web (Port 8081→80), export-worker Services hinzugefügt. `profiles: [app]` für optionalen App-Start. Environment-Konfiguration für alle Services. Dependencies: postgres (healthy), minio-init (completed_successfully).

Nächste Schritte Team 07:

- Sprint 6: Kubernetes-Manifeste (Kustomize base + dev overlay) erstellen.
- Docker-Images bauen und in ghcr.io pushen (build-push Workflow aktivieren).
- Keycloak Realm-Export für Dev-Automatisierung (realm-export.json).
- Observability: Prometheus + Grafana Stack im Docker-Compose ergänzen.

## 2026-02-11 (Sprint 6)

**Sprint-6 Deliverables abgeschlossen (teilweise gemeinsam mit Team 02 + 06).**

Erstellte Artefakte:

- **Kubernetes-Manifeste (Kustomize)** (`k8s/`)
  - `base/`: 10 Manifeste — Namespace (servanda-office), ConfigMap, API Deployment+Service (HPA-ready, health-probes), Web Deployment+Service, Export-Worker Deployment, PostgreSQL StatefulSet+Service (10Gi PVC). Resources-Limits definiert. Secrets referenziert (servanda-db-credentials, servanda-s3-credentials).
  - `overlays/dev/`: Reduzierte Resource-Limits für Dev-Umgebung, environment=dev Label.

- **Keycloak Realm-Automation** (`docker/keycloak/realm-export.json`) — gemeinsam mit Team 02
  Docker-Compose aktualisiert: `command: start-dev --import-realm`, Volume-Mount für realm-export.json.

- **Observability Stack** (`docker/prometheus/`, `docker/grafana/`)
  - `prometheus.yml`: Scrape-Configs für API (10s), Export-Worker (30s), Postgres-Exporter (30s).
  - Grafana Provisioning: Datasource (Prometheus), Dashboard-Provider (file-based).
  - `servanda-overview.json`: Dashboard mit 5 Panels (Request Rate, Response Time P95, Export Jobs, DB Connections, Error Rate).
  - Docker-Compose: prometheus, grafana (Port 3001), postgres-exporter Services unter `profiles: [observability]`. Volumes für Persistenz.

Nächste Schritte Team 07:

- Sprint 7: Kubernetes-Manifeste gegen K3s validieren.
- build-push Workflow aktivieren (Docker-Images → ghcr.io).
- Network Policies erstellen (API→DB+S3+KC, Worker→DB+S3).
- Staging-Overlay mit Sealed Secrets erstellen.

## 2026-02-11 (Sprint 7)

**Sprint-7 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **K8s Network Policies** (`k8s/base/`)
  - `network-policy-default-deny.yaml`: Default-Deny für alle Ingress/Egress im Namespace.
  - `network-policy-api.yaml`: API Ingress Port 3000, Egress zu Postgres:5432, MinIO:9000, Keycloak:8080.
  - `network-policy-worker.yaml`: Kein Ingress, Egress zu Postgres:5432, MinIO:9000.
  - `network-policy-web.yaml`: Ingress Port 80, kein Egress.
  - `kustomization.yaml` aktualisiert mit 4 Network-Policy-Ressourcen.

- **Staging-Overlay** (`k8s/overlays/staging/`)
  - `kustomization.yaml`: Referenziert base, Patches, Sealed Secrets, commonLabels environment: staging.
  - `namespace-patch.yaml`: environment: staging Label.
  - `resource-patch.yaml`: Mittlere Ressourcen (API 512Mi/500m, Worker 1Gi/750m, Web 128Mi/200m).
  - `sealed-secrets.yaml`: Bitnami SealedSecret Platzhalter für db-credentials und s3-credentials.

- **build-push Workflow** (`.github/workflows/build-push.yml`)
  Matrix-Build für 3 Docker-Images (api, web, export-worker). Push zu ghcr.io. Docker Metadata Action für Tags (SHA, Branch, SemVer). Trivy Security Scan (CRITICAL+HIGH). Trigger auf main-Push und Tags.

Nächste Schritte Team 07:

- Sprint 8: K8s-Manifeste gegen K3s validieren (lokaler Test).
- Prod-Overlay mit External Secrets Operator erstellen.
- Ingress-Controller-Konfiguration (NGINX Ingress + TLS).
- On-Prem Overlay (K3s/RKE2, MinIO, LDAP-Integration).

## 2026-02-11 (Sprint 8)

**Sprint-8 Deliverables abgeschlossen.**

Erstellte Artefakte:

- **Prod-Overlay** (`k8s/overlays/prod/`)
  - `kustomization.yaml` — Referenziert base, 3 Patches, External Secrets, HPAs, Ingress. commonLabels environment: production.
  - `namespace-patch.yaml` — environment: production Label.
  - `resource-patch.yaml` — Produktions-Resources (API 1Gi/1000m, Worker 2Gi/1000m, Web 256Mi/500m).
  - `replica-patch.yaml` — API 3 Replicas, Worker 2, Web 2.
  - `external-secrets.yaml` — ExternalSecret CRDs für db-credentials, s3-credentials, oidc-credentials (ClusterSecretStore Referenz).
  - `hpa-api.yaml` — HPA min 3, max 10, CPU 70%.
  - `hpa-worker.yaml` — HPA min 2, max 8, CPU 80%.
  - `ingress.yaml` — NGINX Ingress, TLS via cert-manager (Let's Encrypt), Rate-Limiting Annotations.

- **On-Prem Overlay** (`k8s/overlays/onprem/`)
  - `kustomization.yaml` — Referenziert base, MinIO StatefulSet, statische Secrets, Config-Patch.
  - `minio-statefulset.yaml` — MinIO StatefulSet mit 20Gi PVC.
  - `static-secrets.yaml` — Kubernetes Secrets (Platzhalter für DB, S3, OIDC).
  - `onprem-config-patch.yaml` — LDAP-Konfiguration, lokale MinIO-Endpoint-Referenz.

Nächste Schritte Team 07:

- Sprint 9: cert-manager + Let's Encrypt ClusterIssuer.

## 2026-02-11 (Sprint 9)

**Sprint-9 Deliverables abgeschlossen.**

Erstellte Artefakte:

- **cert-manager + Let's Encrypt ClusterIssuer** (`k8s/overlays/prod/cert-manager-issuer.yaml`, `k8s/overlays/staging/cert-manager-issuer.yaml`)
  - Prod: ClusterIssuer `letsencrypt-prod` mit ACME HTTP01-Solver (nginx Ingress-Class). E-Mail für Zertifikats-Benachrichtigungen. Referenziert in bestehender Ingress-Konfiguration (`cert-manager.io/cluster-issuer` Annotation).
  - Staging: ClusterIssuer `letsencrypt-staging` für Test-Zertifikate (Let's Encrypt Staging-API). Kustomization aktualisiert.
  - Voraussetzung: cert-manager CRDs müssen im Cluster installiert sein (`kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.0/cert-manager.yaml`).

Nächste Schritte Team 07:

- Sprint 10: K8s-Manifeste gegen K3s validieren (lokaler Test).
- External Secrets Operator Setup für Cloud-Deployments.
- Backup-CronJob für PostgreSQL + S3-Replikation.
- Monitoring-Alerting: PagerDuty/Opsgenie Integration für Prod.

## 2026-02-11 (Sprint 10)

**Sprint-10 Deliverables abgeschlossen.**

Erstellte Artefakte:

- **Backup-CronJob PostgreSQL** (`k8s/base/backup-cronjob.yaml`, `k8s/base/backup-configmap.yaml`)
  Kubernetes CronJob: Täglicher pg_dump um 02:00 UTC. Backup-Script mit Timestamp-basiertem Dateinamen. Upload nach S3 (MinIO/AWS). Retention: 30 Tage (konfigurierbar via ConfigMap). Erfolgs-/Fehler-Benachrichtigung via Annotations. Resource-Limits (256Mi/250m). Kustomization aktualisiert.

- **External Secrets Operator Setup** (`k8s/overlays/prod/external-secrets-operator.yaml`, `k8s/overlays/prod/external-secrets-sync.yaml`)
  ClusterSecretStore mit AWS Secrets Manager Backend. ExternalSecret CRDs für 3 Secret-Gruppen: db-credentials (host, port, user, password, database), s3-credentials (endpoint, accessKey, secretKey, bucket), oidc-credentials (issuerUrl, clientId, clientSecret). Refresh-Intervall 1h. Prod-Kustomization aktualisiert.

Nächste Schritte Team 07:

- Monitoring-Alerting: PagerDuty/Opsgenie Integration für Prod.
- Blue/Green Deployment-Strategie für Zero-Downtime-Updates.

## 2026-02-11 (Sprint 11)

**Sprint-11 Deliverables abgeschlossen.**

Erstellte Artefakte:

- **Loki Log-Aggregation** (`docker/loki/loki-config.yaml`, `docker/promtail/promtail-config.yaml`)
  Loki: auth disabled (single-tenant dev), BoltDB-Shipper für Index, Filesystem-Storage. Retention 168h (7 Tage). Promtail: Docker-Container-Log-Scraping, Labels (container_name, compose_service, compose_project). Pipeline-Stages: Docker-Log-Parsing, Timestamp-Extraction. Docker-Compose: loki (Port 3100) + promtail Services unter `profiles: [observability]`.

- **Alerting-Rules** (`docker/prometheus/alerting-rules.yml`)
  5 Alert-Gruppen: API (HighErrorRate >5%, HighLatency P95 >2s, HighMemory >80%), Export (ExportFailureRate >10%, ExportQueueBacklog >50), Database (DBConnectionPoolExhausted >80%, DBHighLatency >100ms), Infrastructure (ContainerRestarting >3/5min, HighCpuUsage >85%), Business (NoExportsInLastHour, HighDlqCount >10). Severity-Labels (critical, warning, info).

- **K8s Smoke-Test Script** (`k8s/scripts/smoke-test.sh`)
  Bash-Script für K3s/K8s-Cluster-Validierung: Namespace-Check, Deployment-Rollout-Status, Service-Endpoints, Pod-Health, API-Health-Endpoint, PostgreSQL-Connectivity, RLS-Validation, ConfigMap/Secret-Existenz. Exit-Code 0/1 für CI-Integration. Konfigurierbar via NAMESPACE und TIMEOUT.

Nächste Schritte Team 07:

- Monitoring-Alerting: PagerDuty/Opsgenie Integration für Prod.
- Blue/Green Deployment-Strategie für Zero-Downtime-Updates.
- Horizontal Pod Autoscaler Tuning (Lasttest-basiert).

## 2026-02-11 (Sprint 12)

**Sprint-12 Deliverables abgeschlossen.**

Erstellte Artefakte:

- **Blue/Green Deployment Script** (`k8s/scripts/blue-green-deploy.sh`)
  Zero-Downtime-Deployment: Blue/Green Slot-Wechsel. Health-Check, Service-Label-Switch, Rollback via `--rollback` Flag. Konfigurierbar: Namespace, Timeout, Health-URL. CI-Integration via Exit-Codes.

- **HPA-Tuning** (`k8s/overlays/prod/hpa-tuned.yaml`, `hpa-api.yaml`, `hpa-worker.yaml`)
  Optimierte HorizontalPodAutoscaler basierend auf k6 Load-Tests. API: min 2, max 8, CPU 70%, Memory 80%. Worker: min 1, max 4, CPU 60%. Scale-Down-Stabilisierung 300s, Scale-Up 60s.

## 2026-02-12 (Sprint 13)

**Sprint-13 Deliverables abgeschlossen.**

Erstellte Artefakte:

- **Helm Charts v1** (`helm/servanda-office/`)
  - `Chart.yaml`: appVersion 1.0.0, Typ application, Maintainer Team 07.
  - `values.yaml`: Vollständige Konfiguration für alle Szenarien (dev, staging, prod, on-prem). Global-Settings (namespace, imagePullPolicy, imageTag). API (2 Replicas, Health-Probes, OIDC, S3). Web (2 Replicas, nginx). ExportWorker (1 Replica, pgboss-Concurrency). PostgreSQL (enabled/disabled für dev vs. prod). Keycloak (enabled, Realm-Import). MinIO (enabled für dev/onprem). OpenSearch (disabled by default, Phase 2). Ingress (nginx, TLS, Rate-Limiting). HPA (API min 2/max 8 CPU 70%, Worker min 1/max 4 CPU 80%). Monitoring (Prometheus ServiceMonitor, Grafana Dashboards). Secrets (in-chart base64 oder External Secrets Operator).
  - `templates/_helpers.tpl`: Standard Helm-Helpers (name, fullname, chart, labels, selectorLabels, component-spezifische Labels, Image-Helper, Namespace-Helper, Secret/ConfigMap-Name-Helper).
  - `templates/api-deployment.yaml`: API Deployment mit ConfigMap/Secret-Refs, Health-Probes, SecurityContext, Checksum-Annotations für Rolling Updates.
  - `templates/api-service.yaml`: ClusterIP Service Port 3000.
  - `templates/web-deployment.yaml`: Web Deployment mit nginx, SecurityContext.
  - `templates/web-service.yaml`: ClusterIP Service Port 80.
  - `templates/export-worker-deployment.yaml`: Worker Deployment mit DB/S3-Secrets, SecurityContext.
  - `templates/ingress.yaml`: Conditional Ingress mit TLS, nginx-Annotations, API/Web-Routing.
  - `templates/hpa-api.yaml`: Conditional HPA mit CPU/Memory-Metrics, Scale-Down/Up-Behavior.
  - `templates/hpa-worker.yaml`: Conditional HPA für Export Worker.
  - `templates/configmap.yaml`: Shared ConfigMap (NODE_ENV, PORT, S3_BUCKET, FEATURE_ODT_EXPORT, OIDC_ISSUER_URL).
  - `templates/secrets.yaml`: Conditional Secrets (DB URL, S3 Credentials, OIDC Secret) — nur wenn External Secrets disabled.
  - `templates/NOTES.txt`: Post-Install-Anweisungen mit Komponenten-Übersicht, Quick-Check-Commands.

- **Helm Chart Tests** (`helm/servanda-office/tests/`)
  - `test-api-deployment.yaml`: Helm Test-Pod, prüft API Health-Endpoint via wget (60s Timeout, 12 Retries).
  - `test-web-deployment.yaml`: Helm Test-Pod, prüft Web Frontend-Erreichbarkeit.

- **Helm Validation Script** (`helm/validate.sh`)
  Bash-Script: Helm lint, Template-Rendering mit Default-Values, HPA disabled, Ingress disabled, OpenSearch enabled, External Secrets. 7 Validierungsschritte. Exit-Code 0/1 für CI.

- **OpenSearch Docker-Compose Integration**
  - `docker/opensearch/docker-compose.opensearch.yml`: Standalone Compose-Datei mit OpenSearch 2.11.0 (Single-Node, Security disabled), OpenSearch Dashboards, Index-Initialisierung (3 Indizes: servanda-clauses, servanda-templates, servanda-contracts mit German Analyzer).
  - `docker/docker-compose.yml` aktualisiert: OpenSearch + Dashboards unter `profiles: [opensearch]`, Volume opensearch_data.

- **GitOps Evaluation v1** (`docs/knowledge/gitops-evaluation-v1.md`)
  Vergleich: ArgoCD vs. Flux v2 vs. Manual kubectl. Evaluation-Matrix (10 Kriterien, gewichtet). Empfehlung: ArgoCD für Cloud + On-Prem (einheitliches Tooling). Migrations-Pfad in 4 Phasen (Sprint 14-17). Security-Considerations (RBAC, SSO, Secrets). Cost/Benefit-Analyse.

- **ArgoCD Application Manifest** (`k8s/argocd/application.yaml`)
  AppProject mit RBAC (admin + readonly Rollen). Application mit Helm-Source, Prod-Parameter-Overrides, Automated Sync (prune + selfHeal), Retry-Policy (3 Versuche), ignoreDifferences für HPA-managed Replicas. ServerSideApply aktiviert.

Nächste Schritte Team 07:

- Sprint 14: ArgoCD Installation + Keycloak-SSO-Integration.
- Environment-spezifische Values-Files (values-dev.yaml, values-staging.yaml, values-prod.yaml).
- OpenSearch K8s-Manifeste (StatefulSet + Service) für Helm Chart ergänzen.
- Helm Chart in CI/CD-Pipeline integrieren (lint + template als PR-Gate).
