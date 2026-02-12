# GitOps Evaluation v1 — Servanda Office

**Team:** 07 (DevOps & On-Prem)
**Sprint:** 13
**Status:** Approved
**Date:** 2026-02-12

---

## 1. Context

Servanda Office currently deploys using Kustomize overlays (`k8s/base/` + `k8s/overlays/{dev,staging,prod,onprem}`) applied manually via `kubectl apply -k`. With the introduction of Helm Charts (Sprint 13), we need a GitOps strategy to automate deployments, ensure drift detection, and support both cloud and on-prem scenarios.

### Current Deployment Model

| Environment | Method | Trigger |
|---|---|---|
| Dev | `kubectl apply -k k8s/overlays/dev/` | Manual / CI on main push |
| Staging | `kubectl apply -k k8s/overlays/staging/` | Tag-based CI trigger |
| Production | `kubectl apply -k k8s/overlays/prod/` | Manual approval |
| On-Prem | `kubectl apply -k k8s/overlays/onprem/` | Manual (customer site) |

### Goals

1. Automated deployment from Git (single source of truth)
2. Drift detection and self-healing
3. Multi-environment support (dev, staging, prod)
4. On-prem-friendly (air-gap capable)
5. Helm chart support (new in Sprint 13)
6. Auditability (who deployed what, when)

---

## 2. Options Evaluated

### Option A: ArgoCD

**Overview:** ArgoCD is the most popular GitOps tool for Kubernetes. It provides a rich web UI, SSO integration, RBAC, multi-cluster support, and native Helm/Kustomize rendering.

**Pros:**
- Rich web UI for deployment visualization and management
- Native Helm chart support (renders templates server-side)
- Native Kustomize support (can use existing overlays during migration)
- SSO/OIDC integration (works with our Keycloak setup)
- RBAC with project-level access control
- Multi-cluster management from a single control plane
- ApplicationSets for templating across environments
- Sync waves and hooks for ordered deployments
- Diff visualization before sync
- Health status monitoring for all resources
- Large ecosystem: notifications, image updater, rollouts
- Active CNCF graduated project, large community

**Cons:**
- Heavier footprint (API server + repo server + application controller + Redis + Dex)
- Requires ~512Mi-1Gi RAM minimum
- Learning curve for advanced features (ApplicationSets, sync waves)
- UI can be overkill for simple deployments
- On-prem air-gap requires pre-pulling ArgoCD images

**Resource Requirements:**
- Minimum: 2 CPU, 2Gi RAM (all components)
- Recommended: 4 CPU, 4Gi RAM (with multiple Applications)

### Option B: Flux v2

**Overview:** Flux v2 is a lightweight GitOps toolkit built on Kubernetes controllers. It uses native Kubernetes CRDs and is deeply integrated with the Kubernetes API.

**Pros:**
- Lightweight (uses Kubernetes controllers, no separate API server)
- Lower resource footprint (~256Mi-512Mi RAM)
- Native Kubernetes experience (everything is a CRD)
- GitOps Toolkit: modular components (source-controller, kustomize-controller, helm-controller, notification-controller)
- Multi-tenancy built-in (Flux manages itself per namespace)
- Helm chart support via HelmRelease CRD
- Kustomize support via Kustomization CRD
- Image automation (auto-update image tags in Git)
- CNCF graduated project

**Cons:**
- No built-in web UI (requires Weave GitOps or third-party UI)
- Less intuitive for non-Kubernetes-native teams
- Debugging requires `kubectl` and CRD knowledge
- Multi-cluster requires Flux installation on each cluster
- Smaller ecosystem compared to ArgoCD
- Less visual feedback for deployment status

**Resource Requirements:**
- Minimum: 1 CPU, 512Mi RAM (all controllers)
- Recommended: 2 CPU, 1Gi RAM

### Option C: Manual kubectl/Kustomize (Current Approach)

**Overview:** Continue with the current approach of manual `kubectl apply` commands triggered by CI pipelines or human operators.

**Pros:**
- No additional infrastructure required
- Simple to understand
- No learning curve
- Works in any environment

**Cons:**
- No drift detection (manual changes in cluster go unnoticed)
- No self-healing (manual intervention required for rollback)
- No deployment visualization
- No audit trail beyond CI logs
- Error-prone (wrong context, wrong overlay)
- Scaling issues with multiple environments
- No multi-cluster orchestration

---

## 3. Evaluation Matrix

| Criterion | Weight | ArgoCD | Flux v2 | Manual |
|---|---|---|---|---|
| **Ease of Setup** | 10% | 7/10 | 8/10 | 10/10 |
| **Learning Curve** | 10% | 6/10 | 7/10 | 10/10 |
| **Helm Support** | 15% | 10/10 | 9/10 | 5/10 |
| **Kustomize Support** | 10% | 10/10 | 10/10 | 10/10 |
| **Multi-Environment** | 10% | 10/10 | 9/10 | 5/10 |
| **Multi-Cluster** | 10% | 10/10 | 7/10 | 3/10 |
| **On-Prem Friendly** | 15% | 8/10 | 9/10 | 10/10 |
| **Drift Detection** | 10% | 10/10 | 10/10 | 0/10 |
| **UI/Visibility** | 5% | 10/10 | 4/10 | 2/10 |
| **Resource Overhead** | 5% | 6/10 | 9/10 | 10/10 |
| **Weighted Score** | 100% | **8.65** | **8.35** | **5.85** |

---

## 4. Recommendation

### Primary: ArgoCD for Cloud Deployments

ArgoCD is the recommended GitOps solution for Servanda Office cloud deployments (dev, staging, production) because:

1. **Best Helm support**: Native server-side rendering, values overlay, diff preview
2. **Deployment visibility**: Web UI provides deployment status, health, and history
3. **Keycloak SSO integration**: Fits our existing OIDC identity stack
4. **Multi-environment management**: ApplicationSets template deployments across environments
5. **Migration path**: Supports Kustomize natively, allowing gradual migration from current overlays to Helm

### Secondary: ArgoCD for On-Prem (Recommended over Flux)

While Flux v2 is slightly more lightweight for on-prem, the operational benefits of a unified toolchain outweigh the marginal resource savings:

1. **Single tool to learn**: Operations team only needs to know ArgoCD
2. **Consistent workflows**: Same deployment model across cloud and on-prem
3. **Customer visibility**: ArgoCD UI helps on-prem customers verify deployment status
4. **Air-gap support**: ArgoCD images can be pre-pulled into private registries

For extremely resource-constrained on-prem environments (< 2Gi spare RAM), Flux v2 remains a viable alternative.

---

## 5. ArgoCD Architecture for Servanda Office

```
Git Repository (github.com/cai-gmbh-dev/servanda-office)
    |
    +-- helm/servanda-office/     (Helm chart)
    +-- k8s/argocd/               (ArgoCD Application manifests)
    |
    v
ArgoCD (installed in argocd namespace)
    |
    +-- Application: servanda-dev      --> helm/ with values-dev.yaml
    +-- Application: servanda-staging  --> helm/ with values-staging.yaml
    +-- Application: servanda-prod     --> helm/ with values-prod.yaml
    |
    v
Kubernetes Cluster(s)
    +-- Namespace: servanda-office-dev
    +-- Namespace: servanda-office-staging
    +-- Namespace: servanda-office (prod)
```

---

## 6. Example ArgoCD Application Manifest

See `k8s/argocd/application.yaml` for the complete manifest.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: servanda-office
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/cai-gmbh-dev/servanda-office.git
    targetRevision: main
    path: helm/servanda-office
    helm:
      valueFiles:
        - values.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: servanda-office
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

---

## 7. Migration Path

### Phase 1: Install ArgoCD (Sprint 14)
1. Install ArgoCD in dedicated `argocd` namespace
2. Configure OIDC SSO with Keycloak
3. Create ArgoCD Project for Servanda Office
4. Deploy `servanda-dev` Application pointing to Helm chart

### Phase 2: Environment Rollout (Sprint 15)
1. Create environment-specific values files (`values-dev.yaml`, `values-staging.yaml`, `values-prod.yaml`)
2. Create ArgoCD Applications for staging and production
3. Configure sync policies (auto for dev, manual for prod)
4. Set up ArgoCD notifications (Slack/Teams webhook)

### Phase 3: Retire Manual Deployments (Sprint 16)
1. Remove manual `kubectl apply` from CI pipelines
2. Use ArgoCD Image Updater for automatic image tag updates on dev
3. Implement promotion workflow: dev -> staging -> prod
4. Document operational runbook for ArgoCD

### Phase 4: On-Prem (Sprint 17+)
1. Create on-prem ArgoCD installation playbook
2. Pre-pull ArgoCD images for air-gap environments
3. Create `values-onprem.yaml` with on-prem specific configuration
4. Document customer-facing ArgoCD setup guide

---

## 8. ArgoCD Installation Quick Reference

```bash
# Install ArgoCD (latest stable)
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Get initial admin password
argocd admin initial-password -n argocd

# Port-forward to access UI
kubectl port-forward svc/argocd-server -n argocd 8443:443

# Login via CLI
argocd login localhost:8443 --insecure

# Add Servanda Office Application
kubectl apply -f k8s/argocd/application.yaml
```

---

## 9. Security Considerations

- **RBAC**: ArgoCD supports project-level RBAC; limit who can sync to production
- **SSO**: Integrate with Keycloak via OIDC (same identity provider as the app)
- **Secrets**: ArgoCD does not store secrets; use External Secrets Operator or Sealed Secrets
- **Network**: ArgoCD only needs outbound access to Git and the K8s API server
- **Audit**: ArgoCD logs all sync operations with user attribution

---

## 10. Cost/Benefit Summary

| Factor | Manual | ArgoCD |
|---|---|---|
| Drift detection | None | Continuous |
| Rollback time | 5-15 min (manual) | < 1 min (auto) |
| Deployment visibility | CI logs only | Web UI + API |
| Audit trail | Git + CI logs | Git + ArgoCD events |
| Multi-env management | Script-based | Declarative |
| Initial setup cost | None | ~4h installation + config |
| Ongoing ops cost | Higher (manual work) | Lower (automated) |

**Conclusion:** ArgoCD adoption is recommended starting Sprint 14. The initial setup investment (~4h) pays off quickly through automated drift detection, self-healing, and reduced operational overhead.
