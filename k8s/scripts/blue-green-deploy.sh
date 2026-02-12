#!/usr/bin/env bash
# =============================================================================
# Blue/Green Deployment Script — Sprint 12 (Team 07)
#
# Performs a zero-downtime Blue/Green deployment for the Servanda Office API.
# Detects the active color (blue/green), deploys the new version to the
# inactive color, runs smoke tests, switches traffic, and cleans up.
#
# Usage:
#   ./blue-green-deploy.sh <image-tag> [namespace]
#
# Arguments:
#   image-tag   Docker image tag to deploy (e.g., sha-abc1234, v1.2.0)
#   namespace   Kubernetes namespace (default: servanda-office)
#
# Exit codes:
#   0  Deployment successful
#   1  Rollback executed (smoke-test or health-check failed)
#   2  Fatal error (cannot recover)
#
# Prerequisites:
#   - kubectl configured with cluster access
#   - k8s/base/blue-green/ manifests applied (api-deployment-blue.yaml,
#     api-deployment-green.yaml, api-service.yaml)
#   - k8s/scripts/smoke-test.sh available
#
# Environment variables:
#   KUBECONFIG           Path to kubeconfig (optional)
#   SMOKE_TEST_TIMEOUT   Timeout for smoke test in seconds (default: 120)
#   ROLLOUT_TIMEOUT      Timeout for rollout in seconds (default: 300)
#   CLEANUP_DELAY        Delay before cleaning up old deployment in seconds (default: 600)
#   HEALTH_CHECK_ROUNDS  Number of post-switch health checks (default: 30)
#   DRY_RUN              Set to "true" to print commands without executing (default: false)
# =============================================================================

set -euo pipefail

# --- Constants ---
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly IMAGE_REGISTRY="ghcr.io/cai-gmbh-dev/servanda-office/api"
readonly SERVICE_NAME="servanda-api"
readonly DEPLOYMENT_PREFIX="servanda-api"
readonly VERSION_LABEL="app.kubernetes.io/version"

# --- Defaults ---
NAMESPACE="${2:-servanda-office}"
IMAGE_TAG="${1:-}"
SMOKE_TEST_TIMEOUT="${SMOKE_TEST_TIMEOUT:-120}"
ROLLOUT_TIMEOUT="${ROLLOUT_TIMEOUT:-300}"
CLEANUP_DELAY="${CLEANUP_DELAY:-600}"
HEALTH_CHECK_ROUNDS="${HEALTH_CHECK_ROUNDS:-30}"
DRY_RUN="${DRY_RUN:-false}"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# --- Logging ---
log() {
  local level="$1"
  shift
  local timestamp
  timestamp="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  case "$level" in
    INFO)  echo -e "${CYAN}[$timestamp]${NC} ${BOLD}[INFO]${NC}  $*" ;;
    OK)    echo -e "${CYAN}[$timestamp]${NC} ${GREEN}[OK]${NC}    $*" ;;
    WARN)  echo -e "${CYAN}[$timestamp]${NC} ${YELLOW}[WARN]${NC}  $*" ;;
    ERROR) echo -e "${CYAN}[$timestamp]${NC} ${RED}[ERROR]${NC} $*" ;;
    STEP)  echo -e "${CYAN}[$timestamp]${NC} ${BOLD}${CYAN}[STEP]${NC}  $*" ;;
  esac
}

# --- Usage ---
usage() {
  echo "Usage: $0 <image-tag> [namespace]"
  echo ""
  echo "Arguments:"
  echo "  image-tag   Docker image tag to deploy (e.g., sha-abc1234, v1.2.0)"
  echo "  namespace   Kubernetes namespace (default: servanda-office)"
  echo ""
  echo "Environment variables:"
  echo "  SMOKE_TEST_TIMEOUT   Timeout for smoke test (default: 120s)"
  echo "  ROLLOUT_TIMEOUT      Timeout for rollout (default: 300s)"
  echo "  CLEANUP_DELAY        Delay before cleanup (default: 600s)"
  echo "  HEALTH_CHECK_ROUNDS  Post-switch health checks (default: 30)"
  echo "  DRY_RUN              Print commands without executing (default: false)"
  exit 2
}

# --- Validate arguments ---
if [[ -z "$IMAGE_TAG" ]]; then
  log ERROR "Missing required argument: image-tag"
  usage
fi

# --- kubectl wrapper ---
kc() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY RUN] kubectl -n $NAMESPACE $*"
    return 0
  fi
  kubectl -n "$NAMESPACE" "$@"
}

# =============================================================================
# STEP 0: Detect active color
# =============================================================================
detect_active_color() {
  log STEP "Step 0/10: Detecting active color..."

  local active_color
  active_color=$(kubectl -n "$NAMESPACE" get service "$SERVICE_NAME" \
    -o jsonpath="{.spec.selector.app\.kubernetes\.io/version}" 2>/dev/null || echo "")

  if [[ -z "$active_color" || "$active_color" == "null" ]]; then
    # No version selector found — assume blue is active (initial deployment)
    log WARN "No version selector found on service. Assuming 'blue' is active (initial deployment)."
    active_color="blue"
  fi

  if [[ "$active_color" != "blue" && "$active_color" != "green" ]]; then
    log ERROR "Unknown active color: '$active_color'. Expected 'blue' or 'green'."
    exit 2
  fi

  echo "$active_color"
}

# =============================================================================
# STEP 1: Create Green deployment (new version)
# =============================================================================
deploy_inactive_color() {
  local inactive_color="$1"
  local image_tag="$2"
  local full_image="${IMAGE_REGISTRY}:${image_tag}"

  log STEP "Step 1/10: Creating ${inactive_color} deployment with image ${full_image}..."

  local deployment_name="${DEPLOYMENT_PREFIX}-${inactive_color}"

  # Scale up the inactive deployment
  kc scale deployment "$deployment_name" --replicas=3

  # Set the new image
  kc set image "deployment/$deployment_name" \
    "servanda-api=${full_image}"

  log OK "${inactive_color} deployment created with image ${full_image}"
}

# =============================================================================
# STEP 2: Wait for rollout
# =============================================================================
wait_for_rollout() {
  local color="$1"
  local deployment_name="${DEPLOYMENT_PREFIX}-${color}"

  log STEP "Step 2/10: Waiting for ${color} deployment rollout (timeout: ${ROLLOUT_TIMEOUT}s)..."

  if [[ "$DRY_RUN" == "true" ]]; then
    log INFO "[DRY RUN] Would wait for rollout of $deployment_name"
    return 0
  fi

  if ! kubectl -n "$NAMESPACE" rollout status "deployment/$deployment_name" \
    --timeout="${ROLLOUT_TIMEOUT}s"; then
    log ERROR "Rollout of ${deployment_name} timed out after ${ROLLOUT_TIMEOUT}s"
    return 1
  fi

  # Verify all pods are ready
  local ready_pods
  ready_pods=$(kubectl -n "$NAMESPACE" get deployment "$deployment_name" \
    -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

  local desired_pods
  desired_pods=$(kubectl -n "$NAMESPACE" get deployment "$deployment_name" \
    -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")

  if [[ "$ready_pods" -lt "$desired_pods" ]]; then
    log ERROR "Only ${ready_pods}/${desired_pods} pods ready for ${deployment_name}"
    return 1
  fi

  log OK "All ${ready_pods} pods ready for ${deployment_name}"
}

# =============================================================================
# STEP 3: Smoke test against inactive color
# =============================================================================
run_smoke_test() {
  local color="$1"
  local smoke_service="${SERVICE_NAME}-${color}"

  log STEP "Step 3/10: Running smoke test against ${color} service (${smoke_service})..."

  if [[ "$DRY_RUN" == "true" ]]; then
    log INFO "[DRY RUN] Would run smoke test against ${smoke_service}"
    return 0
  fi

  # Use port-forward to reach the internal service
  local local_port=13000
  kubectl -n "$NAMESPACE" port-forward "svc/${smoke_service}" "${local_port}:3000" &
  local pf_pid=$!

  # Wait for port-forward to be ready
  sleep 3

  local smoke_exit=0
  if [[ -f "${SCRIPT_DIR}/smoke-test.sh" ]]; then
    # Run smoke test with internal host
    "${SCRIPT_DIR}/smoke-test.sh" \
      --namespace "$NAMESPACE" \
      --host "http://localhost:${local_port}" \
      || smoke_exit=$?
  else
    # Fallback: simple health check
    log WARN "smoke-test.sh not found, falling back to simple health check"
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
      "http://localhost:${local_port}/api/v1/health" 2>/dev/null || echo "000")

    if [[ "$status" != "200" ]]; then
      log ERROR "Health check returned HTTP ${status} (expected 200)"
      smoke_exit=1
    fi
  fi

  # Clean up port-forward
  kill "$pf_pid" 2>/dev/null || true
  wait "$pf_pid" 2>/dev/null || true

  if [[ "$smoke_exit" -ne 0 ]]; then
    log ERROR "Smoke test FAILED for ${color} deployment"
    return 1
  fi

  log OK "Smoke test PASSED for ${color} deployment"
}

# =============================================================================
# STEP 4: DB Migration (if needed)
# =============================================================================
run_db_migration() {
  local color="$1"
  local deployment_name="${DEPLOYMENT_PREFIX}-${color}"

  log STEP "Step 4/10: Checking for pending DB migrations..."

  if [[ "$DRY_RUN" == "true" ]]; then
    log INFO "[DRY RUN] Would check and run DB migrations"
    return 0
  fi

  # Get a pod name from the new deployment
  local pod_name
  pod_name=$(kubectl -n "$NAMESPACE" get pods \
    -l "app=servanda,component=api,${VERSION_LABEL}=${color}" \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

  if [[ -z "$pod_name" ]]; then
    log WARN "No pod found for migration check. Skipping."
    return 0
  fi

  # Check if there are pending migrations
  local pending
  pending=$(kubectl -n "$NAMESPACE" exec "$pod_name" -- \
    npx prisma migrate status 2>/dev/null | grep -c "Following migration" || echo "0")

  if [[ "$pending" -gt 0 ]]; then
    log INFO "Running ${pending} pending migration(s)..."
    kubectl -n "$NAMESPACE" exec "$pod_name" -- \
      npx prisma migrate deploy

    if [[ $? -ne 0 ]]; then
      log ERROR "DB migration FAILED"
      return 1
    fi
    log OK "DB migration completed successfully"
  else
    log OK "No pending migrations"
  fi
}

# =============================================================================
# STEP 5: Switch service selector
# =============================================================================
switch_traffic() {
  local target_color="$1"

  log STEP "Step 5/10: Switching service selector to ${target_color}..."

  kc patch service "$SERVICE_NAME" --type=merge \
    -p "{\"spec\":{\"selector\":{\"app.kubernetes.io/version\":\"${target_color}\"}}}"

  log OK "Service ${SERVICE_NAME} now routing to ${target_color}"
}

# =============================================================================
# STEP 6: Health check against live traffic
# =============================================================================
health_check_live() {
  log STEP "Step 6/10: Running health checks against live traffic (${HEALTH_CHECK_ROUNDS} rounds)..."

  if [[ "$DRY_RUN" == "true" ]]; then
    log INFO "[DRY RUN] Would run ${HEALTH_CHECK_ROUNDS} health check rounds"
    return 0
  fi

  # Detect the live URL from Ingress
  local live_host
  live_host=$(kubectl -n "$NAMESPACE" get ingress -o jsonpath='{.items[0].spec.rules[0].host}' 2>/dev/null || echo "")

  local live_url
  if [[ -n "$live_host" && "$live_host" != "null" ]]; then
    live_url="https://${live_host}"
  else
    # Fallback: port-forward
    local local_port=13001
    kubectl -n "$NAMESPACE" port-forward "svc/${SERVICE_NAME}" "${local_port}:3000" &
    local pf_pid=$!
    sleep 3
    live_url="http://localhost:${local_port}"
  fi

  local failures=0
  for i in $(seq 1 "$HEALTH_CHECK_ROUNDS"); do
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
      "${live_url}/api/v1/health" 2>/dev/null || echo "000")

    if [[ "$status" != "200" ]]; then
      failures=$((failures + 1))
      log WARN "Health check round ${i}/${HEALTH_CHECK_ROUNDS}: HTTP ${status}"

      # Allow max 3 consecutive failures
      if [[ "$failures" -ge 3 ]]; then
        log ERROR "Health check FAILED: ${failures} consecutive failures"
        # Clean up port-forward if used
        kill "${pf_pid:-}" 2>/dev/null || true
        return 1
      fi
    else
      failures=0  # Reset on success
    fi

    sleep 1
  done

  # Clean up port-forward if used
  kill "${pf_pid:-}" 2>/dev/null || true

  log OK "All health checks passed"
}

# =============================================================================
# STEP 7: Rollback (called on failure)
# =============================================================================
rollback() {
  local rollback_to="$1"
  local failed_color="$2"

  log ERROR "============================================================"
  log ERROR "  ROLLBACK: Switching back to ${rollback_to}"
  log ERROR "============================================================"

  # Switch service selector back
  kubectl -n "$NAMESPACE" patch service "$SERVICE_NAME" --type=merge \
    -p "{\"spec\":{\"selector\":{\"app.kubernetes.io/version\":\"${rollback_to}\"}}}" \
    2>/dev/null || true

  log OK "Service selector reverted to ${rollback_to}"

  # Scale down failed deployment
  kubectl -n "$NAMESPACE" scale "deployment/${DEPLOYMENT_PREFIX}-${failed_color}" \
    --replicas=0 2>/dev/null || true

  log OK "Failed deployment ${failed_color} scaled to 0"
  log ERROR "Rollback completed. Please investigate the ${failed_color} deployment."
}

# =============================================================================
# STEP 8: Cleanup old deployment
# =============================================================================
cleanup_old_deployment() {
  local old_color="$1"
  local deployment_name="${DEPLOYMENT_PREFIX}-${old_color}"

  log STEP "Step 8/10: Scheduling cleanup of ${old_color} deployment (delay: ${CLEANUP_DELAY}s)..."

  if [[ "$DRY_RUN" == "true" ]]; then
    log INFO "[DRY RUN] Would scale down ${deployment_name} after ${CLEANUP_DELAY}s"
    return 0
  fi

  # Run cleanup in background
  (
    sleep "$CLEANUP_DELAY"
    kubectl -n "$NAMESPACE" scale "deployment/${deployment_name}" --replicas=0 2>/dev/null
    log OK "Cleanup: ${deployment_name} scaled to 0 replicas"
  ) &

  log OK "Cleanup scheduled in background (PID: $!)"
}

# =============================================================================
# STEP 9 & 10: Summary
# =============================================================================
print_summary() {
  local new_color="$1"
  local old_color="$2"
  local image_tag="$3"

  echo ""
  echo -e "${BOLD}${CYAN}============================================================${NC}"
  echo -e "${BOLD}${GREEN}  BLUE/GREEN DEPLOYMENT SUCCESSFUL${NC}"
  echo -e "${BOLD}${CYAN}============================================================${NC}"
  echo -e "  ${BOLD}Active:${NC}    ${new_color} (${IMAGE_REGISTRY}:${image_tag})"
  echo -e "  ${BOLD}Inactive:${NC}  ${old_color} (will be scaled down in ${CLEANUP_DELAY}s)"
  echo -e "  ${BOLD}Namespace:${NC} ${NAMESPACE}"
  echo -e "  ${BOLD}Timestamp:${NC} $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo -e "${CYAN}------------------------------------------------------------${NC}"
  echo -e "  ${YELLOW}Step 10: Monitor metrics for 30 minutes:${NC}"
  echo -e "    - HTTP 5xx Error-Rate < 1%"
  echo -e "    - API Response P95 < 2s"
  echo -e "    - Export Job Failure-Rate < 5%"
  echo -e "    - Pod Restarts < 2 in 5min"
  echo -e "${CYAN}============================================================${NC}"
  echo ""
}

# =============================================================================
# MAIN
# =============================================================================
main() {
  echo ""
  echo -e "${BOLD}${CYAN}============================================================${NC}"
  echo -e "${BOLD}${CYAN}  Servanda Office - Blue/Green Deployment${NC}"
  echo -e "${BOLD}${CYAN}============================================================${NC}"
  echo -e "  Image Tag:  ${BOLD}${IMAGE_TAG}${NC}"
  echo -e "  Namespace:  ${BOLD}${NAMESPACE}${NC}"
  echo -e "  Timestamp:  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "  Mode:       ${YELLOW}DRY RUN${NC}"
  fi
  echo ""

  # Verify kubectl connectivity
  if ! kubectl cluster-info > /dev/null 2>&1; then
    log ERROR "Cannot connect to Kubernetes cluster"
    exit 2
  fi

  # Verify namespace exists
  if ! kubectl get namespace "$NAMESPACE" > /dev/null 2>&1; then
    log ERROR "Namespace '${NAMESPACE}' not found"
    exit 2
  fi

  # Step 0: Detect active color
  local active_color
  active_color=$(detect_active_color)
  local inactive_color
  if [[ "$active_color" == "blue" ]]; then
    inactive_color="green"
  else
    inactive_color="blue"
  fi

  log INFO "Active: ${active_color} | Deploying to: ${inactive_color}"
  echo ""

  # Step 1: Deploy new version to inactive color
  if ! deploy_inactive_color "$inactive_color" "$IMAGE_TAG"; then
    log ERROR "Failed to create ${inactive_color} deployment"
    exit 2
  fi

  # Step 2: Wait for rollout
  if ! wait_for_rollout "$inactive_color"; then
    log ERROR "Rollout failed. Scaling down ${inactive_color}."
    kc scale "deployment/${DEPLOYMENT_PREFIX}-${inactive_color}" --replicas=0 2>/dev/null || true
    exit 1
  fi

  # Step 3: Smoke test
  if ! run_smoke_test "$inactive_color"; then
    log ERROR "Smoke test failed. Scaling down ${inactive_color}."
    kc scale "deployment/${DEPLOYMENT_PREFIX}-${inactive_color}" --replicas=0 2>/dev/null || true
    exit 1
  fi

  # Step 4: DB Migration
  if ! run_db_migration "$inactive_color"; then
    log ERROR "DB migration failed. Scaling down ${inactive_color}."
    kc scale "deployment/${DEPLOYMENT_PREFIX}-${inactive_color}" --replicas=0 2>/dev/null || true
    exit 1
  fi

  # Step 5: Switch traffic
  switch_traffic "$inactive_color"

  # Step 6: Health check
  if ! health_check_live; then
    # Step 7: Rollback on failure
    rollback "$active_color" "$inactive_color"
    exit 1
  fi

  log STEP "Step 7/10: No rollback needed — deployment healthy"

  # Step 8: Schedule cleanup of old deployment
  cleanup_old_deployment "$active_color"

  # Step 9 & 10: Summary
  log STEP "Step 9/10: ${inactive_color} is now the active deployment"
  log STEP "Step 10/10: Monitor metrics for error-rate and latency"

  print_summary "$inactive_color" "$active_color" "$IMAGE_TAG"

  exit 0
}

# Run main
main
