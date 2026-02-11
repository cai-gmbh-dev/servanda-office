# CI/CD Skeleton v1 — Servanda Office

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 07 (DevOps & On-Prem)
**Referenzen:** QA-Gates CI v1, Deployment-Blueprint v1, Architecture Backbone v1

---

## 1. Überblick

CI/CD-Plattform: **GitHub Actions**
Deployment: **Kustomize + kubectl** (Phase 1), optional **ArgoCD** (Phase 2+)
Container Registry: **GitHub Container Registry (ghcr.io)**
Secrets: **GitHub Actions Secrets** → Kubernetes Secrets (via Sealed Secrets oder External Secrets Operator)

### Pipeline-Architektur

```text
┌──────────────────────────────────────────────────────────────────┐
│  PR Gate                  Main Gate              Deploy Pipeline  │
│                                                                   │
│  Feature Branch ─────→ main ─────────────→ dev (auto)            │
│   │                     │                    │                    │
│   ├─ Lint               ├─ Full Tests        ├─ Build Images     │
│   ├─ Typecheck          ├─ E2E               ├─ Push to Registry │
│   ├─ Unit Tests         ├─ Lighthouse        ├─ Kustomize apply  │
│   ├─ Coverage           ├─ Dep Scan          │                    │
│   ├─ Build              ├─ SBOM              │  Release Tag ──→ stage │
│   ├─ A11y               │                    │   │                │
│   ├─ Security Tests     │                    │   └─ Kustomize     │
│   └─ Bundle Size        │                    │     apply          │
│                          │                    │                    │
│                          │                    │  Manual Approval   │
│                          │                    │   ──→ prod         │
│                          │                    │    │               │
│                          │                    │    └─ Kustomize    │
│                          │                    │      apply         │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Workflow-Dateien

### 2.1 PR Gate (`pr-gate.yml`)

Definiert in [QA-Gates CI v1](qa-gates-ci-v1.md). Zusammenfassung der Jobs:

| Job | Dauer (Ziel) | Parallelisierbar |
| --- | --- | --- |
| `lint-typecheck` | < 1 min | Ja |
| `unit-tests` | < 3 min | Ja |
| `build` | < 2 min | Ja |
| `accessibility` | < 2 min | Ja |
| `security-tenant-isolation` | < 3 min | Ja |
| `security-rls-coverage` | < 2 min | Ja |
| `bundle-size` | < 2 min | Ja |

**Gesamt-Ziel:** < 5 Minuten (alle parallel).

### 2.2 Main Gate (`main-gate.yml`)

Definiert in [QA-Gates CI v1](qa-gates-ci-v1.md). Zusätzliche Jobs:

| Job | Dauer (Ziel) | Parallelisierbar |
| --- | --- | --- |
| `full-test-suite` | < 5 min | Ja |
| `e2e` | < 10 min | Ja |
| `lighthouse` | < 3 min | Ja |
| `dependency-scan` | < 2 min | Ja |
| `sbom` | < 1 min | Ja |

**Gesamt-Ziel:** < 15 Minuten.

### 2.3 Build & Push (`build-push.yml`)

```yaml
name: Build & Push Images

on:
  push:
    branches: [main]
    tags: ['v*', 'rc-*']

permissions:
  contents: read
  packages: write

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ghcr.io/${{ github.repository_owner }}/servanda

jobs:
  build-api:
    name: Build API Image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Docker Meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.IMAGE_PREFIX }}/api
          tags: |
            type=sha,prefix=dev-
            type=semver,pattern={{version}}
            type=ref,event=branch,prefix=rc-
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}

      - uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build & Push API
        uses: docker/build-push-action@v6
        with:
          context: .
          file: Dockerfile.api
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  build-export-worker:
    name: Build Export Worker Image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Docker Meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.IMAGE_PREFIX }}/export-worker
          tags: |
            type=sha,prefix=dev-
            type=semver,pattern={{version}}
            type=ref,event=branch,prefix=rc-
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}

      - uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build & Push Export Worker
        uses: docker/build-push-action@v6
        with:
          context: .
          file: Dockerfile.export-worker
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  build-frontend:
    name: Build Frontend Image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Docker Meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.IMAGE_PREFIX }}/frontend
          tags: |
            type=sha,prefix=dev-
            type=semver,pattern={{version}}
            type=ref,event=branch,prefix=rc-
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}

      - uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build & Push Frontend
        uses: docker/build-push-action@v6
        with:
          context: .
          file: Dockerfile.frontend
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### 2.4 Deploy (`deploy.yml`)

```yaml
name: Deploy

on:
  workflow_run:
    workflows: ["Build & Push Images", "Main Gate"]
    types: [completed]
    branches: [main]

  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        type: choice
        options:
          - dev
          - stage
          - prod
      image_tag:
        description: 'Image tag to deploy'
        required: true
        type: string

permissions:
  contents: read

jobs:
  deploy-dev:
    name: Deploy to Dev
    if: >
      (github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success') ||
      (github.event_name == 'workflow_dispatch' && github.event.inputs.environment == 'dev')
    runs-on: ubuntu-latest
    environment: dev
    steps:
      - uses: actions/checkout@v4

      - name: Set Image Tag
        id: tag
        run: |
          if [ "${{ github.event_name }}" == "workflow_dispatch" ]; then
            echo "tag=${{ github.event.inputs.image_tag }}" >> $GITHUB_OUTPUT
          else
            echo "tag=dev-$(echo ${{ github.sha }} | cut -c1-7)" >> $GITHUB_OUTPUT
          fi

      - name: Setup Kustomize
        uses: imranismail/setup-kustomize@v2

      - name: Update Image Tags
        run: |
          cd k8s/overlays/dev
          kustomize edit set image \
            servanda/api=${{ env.IMAGE_PREFIX }}/api:${{ steps.tag.outputs.tag }} \
            servanda/export-worker=${{ env.IMAGE_PREFIX }}/export-worker:${{ steps.tag.outputs.tag }} \
            servanda/frontend=${{ env.IMAGE_PREFIX }}/frontend:${{ steps.tag.outputs.tag }}

      - name: Deploy to Dev
        run: |
          kustomize build k8s/overlays/dev | kubectl apply -f -
          kubectl -n servanda-dev rollout status deployment/servanda-api --timeout=120s
          kubectl -n servanda-dev rollout status deployment/servanda-export-worker --timeout=120s
        env:
          KUBECONFIG: ${{ secrets.KUBECONFIG_DEV }}

  deploy-stage:
    name: Deploy to Stage
    if: github.event_name == 'workflow_dispatch' && github.event.inputs.environment == 'stage'
    runs-on: ubuntu-latest
    environment: stage
    steps:
      - uses: actions/checkout@v4

      - name: Setup Kustomize
        uses: imranismail/setup-kustomize@v2

      - name: Update Image Tags
        run: |
          cd k8s/overlays/stage
          kustomize edit set image \
            servanda/api=${{ env.IMAGE_PREFIX }}/api:${{ github.event.inputs.image_tag }} \
            servanda/export-worker=${{ env.IMAGE_PREFIX }}/export-worker:${{ github.event.inputs.image_tag }} \
            servanda/frontend=${{ env.IMAGE_PREFIX }}/frontend:${{ github.event.inputs.image_tag }}

      - name: Deploy to Stage
        run: |
          kustomize build k8s/overlays/stage | kubectl apply -f -
          kubectl -n servanda-stage rollout status deployment/servanda-api --timeout=180s
        env:
          KUBECONFIG: ${{ secrets.KUBECONFIG_STAGE }}

  deploy-prod:
    name: Deploy to Production
    if: github.event_name == 'workflow_dispatch' && github.event.inputs.environment == 'prod'
    runs-on: ubuntu-latest
    environment:
      name: prod
      url: https://app.servanda.de
    steps:
      - uses: actions/checkout@v4

      - name: Setup Kustomize
        uses: imranismail/setup-kustomize@v2

      - name: Update Image Tags
        run: |
          cd k8s/overlays/prod
          kustomize edit set image \
            servanda/api=${{ env.IMAGE_PREFIX }}/api:${{ github.event.inputs.image_tag }} \
            servanda/export-worker=${{ env.IMAGE_PREFIX }}/export-worker:${{ github.event.inputs.image_tag }} \
            servanda/frontend=${{ env.IMAGE_PREFIX }}/frontend:${{ github.event.inputs.image_tag }}

      - name: Deploy to Prod
        run: |
          kustomize build k8s/overlays/prod | kubectl apply -f -
          kubectl -n servanda-prod rollout status deployment/servanda-api --timeout=300s
        env:
          KUBECONFIG: ${{ secrets.KUBECONFIG_PROD }}

      - name: Smoke Test
        run: |
          sleep 10
          curl -sf https://app.servanda.de/health/ready || exit 1
```

---

## 3. GitHub Actions Secrets

### 3.1 Repository-Level Secrets

| Secret | Verwendung | Environments |
| --- | --- | --- |
| `KUBECONFIG_DEV` | Kubectl-Zugang dev-Cluster | dev |
| `KUBECONFIG_STAGE` | Kubectl-Zugang stage-Cluster | stage |
| `KUBECONFIG_PROD` | Kubectl-Zugang prod-Cluster | prod |
| `LHCI_GITHUB_APP_TOKEN` | Lighthouse CI GitHub App | Alle |

### 3.2 Environment Protection Rules

| Environment | Schutz | Reviewer |
| --- | --- | --- |
| **dev** | Keine (auto-deploy) | — |
| **stage** | Branch-Schutz (nur main/release/*) | — |
| **prod** | Manuelles Approval erforderlich | Tech Lead + Product Owner (min. 1) |

---

## 4. Container-Image-Scanning

```yaml
# In build-push.yml ergänzen (pro Image)
      - name: Scan Image
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.IMAGE_PREFIX }}/api:${{ steps.meta.outputs.version }}
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'

      - name: Upload Trivy Results
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'
```

---

## 5. Release-Prozess

### 5.1 Versioning (Semantic Versioning)

```text
MAJOR.MINOR.PATCH

MAJOR: Breaking API-Änderungen
MINOR: Neue Features (abwärtskompatibel)
PATCH: Bug-Fixes

Beispiele:
  0.1.0  — MVP Alpha
  0.2.0  — Feature: Export Pipeline
  0.2.1  — Bug Fix: Export Timeout
  1.0.0  — MVP Launch (Production Ready)
```

### 5.2 Release-Flow

```text
1. Release-Branch erstellen:
   git checkout -b release/v0.1.0 main

2. Version-Bump:
   npm version 0.1.0 --no-git-tag-version
   git commit -m "chore: bump version to 0.1.0"

3. Release-Tag erstellen:
   git tag v0.1.0
   git push origin release/v0.1.0 --tags

4. CI baut Images mit Tag v0.1.0
   → Automatischer Deploy auf Stage

5. QA auf Stage validieren
   → E2E + Smoke Tests + Performance

6. Prod-Deploy via workflow_dispatch:
   environment: prod
   image_tag: v0.1.0

7. Post-Deploy:
   - Smoke Tests
   - Monitoring beobachten (15 Min.)
   - GitHub Release erstellen (Changelog)
```

### 5.3 Rollback-Verfahren

```text
Schneller Rollback (< 5 Min.):
  1. workflow_dispatch: Deploy mit vorheriger Version
     environment: prod
     image_tag: v0.0.9  (vorherige stabile Version)
  2. Monitoring bestätigen

DB-Rollback (nur bei Migration-Problem):
  1. Point-in-Time Recovery auf Zeitpunkt vor Deploy
  2. Alte Image-Version deployen
  3. Post-Mortem erstellen
```

---

## 6. Caching-Strategie

### 6.1 GitHub Actions Cache

```yaml
# Wiederverwendbar in allen Workflows
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'          # npm-Cache über Runs hinweg

# Docker Layer Cache (in build-push.yml)
- uses: docker/build-push-action@v6
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

### 6.2 Erwartete Cache-Savings

| Cache | Ohne Cache | Mit Cache | Ersparnis |
| --- | --- | --- | --- |
| npm ci | ~60s | ~10s | 83% |
| Docker Build (API) | ~120s | ~30s | 75% |
| Docker Build (Export Worker) | ~180s | ~45s | 75% |
| Playwright Install | ~45s | ~5s | 89% |

---

## 7. Workflow-Datei-Übersicht

```text
.github/
├── workflows/
│   ├── pr-gate.yml              # PR Checks (QA-Gates CI v1)
│   ├── main-gate.yml            # Post-Merge Checks (QA-Gates CI v1)
│   ├── build-push.yml           # Build + Push Docker Images
│   ├── deploy.yml               # Deploy to dev/stage/prod
│   └── scheduled-security.yml   # Wöchentlicher Dependency Scan
├── dependabot.yml               # Automated Dependency Updates
└── CODEOWNERS                    # Review-Pflicht pro Bereich
```

### 7.1 Scheduled Security Scan

```yaml
# .github/workflows/scheduled-security.yml
name: Scheduled Security Scan

on:
  schedule:
    - cron: '0 6 * * 1'   # Montags 06:00 UTC

jobs:
  dependency-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm audit --audit-level=moderate
      - run: npx audit-ci --moderate

  image-scan:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        image: [api, export-worker, frontend]
    steps:
      - uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/${{ github.repository_owner }}/servanda/${{ matrix.image }}:latest
          format: 'table'
          severity: 'CRITICAL,HIGH'
```

### 7.2 CODEOWNERS

```text
# .github/CODEOWNERS

# Default: Team 01 (Architecture)
* @servanda/team-01

# Security-relevante Änderungen: Team 02 Review Pflicht
src/identity/   @servanda/team-02
src/middleware/  @servanda/team-02
k8s/            @servanda/team-07
prisma/         @servanda/team-01 @servanda/team-02

# QA: Team 06
tests/          @servanda/team-06
docs/qa/        @servanda/team-06

# Export: Team 05
src/export/     @servanda/team-05

# DevOps: Team 07
k8s/            @servanda/team-07
Dockerfile*     @servanda/team-07
.github/        @servanda/team-07
```
