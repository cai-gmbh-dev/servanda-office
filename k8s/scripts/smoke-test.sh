#!/bin/bash
# =============================================================================
# Smoke-Test for Servanda Office K8s Deployment
# Team 07 — DevOps & On-Prem | Sprint 11
#
# Validates that a Servanda Office Kubernetes deployment is healthy:
#   - Namespace, Deployments, Services, StatefulSets
#   - Health endpoint, seed data, export pipeline
#   - Network policies, secrets, HPA, Ingress, TLS certificates
#
# Usage:
#   ./smoke-test.sh [OPTIONS]
#
# Options:
#   -n, --namespace   Namespace (default: servanda-office)
#   -h, --host        API host for HTTP checks (default: auto-detect from Ingress)
#   --skip-http       Skip HTTP-based checks (health, seed, export)
#   --kubeconfig      Path to kubeconfig file
#   --help            Show this help message
#
# Exit codes:
#   0  All checks passed
#   1  One or more checks failed
# =============================================================================

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# --- Defaults ---
NAMESPACE="servanda-office"
API_HOST=""
SKIP_HTTP=false
KUBECONFIG_FLAG=""

# --- Counters ---
TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0

# --- Parse Arguments ---
while [[ $# -gt 0 ]]; do
  case $1 in
    -n|--namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    -h|--host)
      API_HOST="$2"
      shift 2
      ;;
    --skip-http)
      SKIP_HTTP=true
      shift
      ;;
    --kubeconfig)
      KUBECONFIG_FLAG="--kubeconfig=$2"
      shift 2
      ;;
    --help)
      head -25 "$0" | tail -20
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# --- Helper: kubectl wrapper ---
kc() {
  kubectl $KUBECONFIG_FLAG -n "$NAMESPACE" "$@"
}

kc_global() {
  kubectl $KUBECONFIG_FLAG "$@"
}

# --- Test Runner ---
run_check() {
  local description="$1"
  local check_fn="$2"
  TOTAL=$((TOTAL + 1))

  printf "  %-55s " "$description"

  local output
  if output=$(eval "$check_fn" 2>&1); then
    echo -e "[${GREEN}PASS${NC}]"
    PASSED=$((PASSED + 1))
  else
    echo -e "[${RED}FAIL${NC}]"
    if [[ -n "$output" ]]; then
      echo -e "    ${RED}-> $output${NC}"
    fi
    FAILED=$((FAILED + 1))
  fi
}

skip_check() {
  local description="$1"
  local reason="$2"
  TOTAL=$((TOTAL + 1))
  SKIPPED=$((SKIPPED + 1))
  printf "  %-55s " "$description"
  echo -e "[${YELLOW}SKIP${NC}] $reason"
}

# =============================================================================
# CHECK FUNCTIONS
# =============================================================================

check_namespace() {
  kc_global get namespace "$NAMESPACE" -o name > /dev/null
}

check_deployment_ready() {
  local deploy_name="$1"
  local ready
  ready=$(kc get deployment "$deploy_name" -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
  local desired
  desired=$(kc get deployment "$deploy_name" -o jsonpath='{.spec.replicas}' 2>/dev/null)

  if [[ -z "$ready" || "$ready" == "null" ]]; then
    echo "Deployment $deploy_name: 0 ready replicas (desired: ${desired:-unknown})"
    return 1
  fi

  if [[ "$ready" -lt "$desired" ]]; then
    echo "Deployment $deploy_name: $ready/$desired replicas ready"
    return 1
  fi
}

check_service_exists() {
  local svc_name="$1"
  local expected_port="$2"
  local port
  port=$(kc get service "$svc_name" -o jsonpath='{.spec.ports[0].port}' 2>/dev/null)

  if [[ "$port" != "$expected_port" ]]; then
    echo "Service $svc_name: expected port $expected_port, got ${port:-not found}"
    return 1
  fi
}

check_statefulset_ready() {
  local sts_name="$1"
  local ready
  ready=$(kc get statefulset "$sts_name" -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
  local desired
  desired=$(kc get statefulset "$sts_name" -o jsonpath='{.spec.replicas}' 2>/dev/null)

  if [[ -z "$ready" || "$ready" == "null" || "$ready" -lt "$desired" ]]; then
    echo "StatefulSet $sts_name: ${ready:-0}/$desired replicas ready"
    return 1
  fi
}

check_health_endpoint() {
  local url="$1"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url/api/v1/health" 2>/dev/null)

  if [[ "$status" != "200" ]]; then
    echo "Health endpoint returned HTTP $status (expected 200)"
    return 1
  fi
}

check_seed_data() {
  local url="$1"
  local token="$2"
  local response
  response=$(curl -s --max-time 10 \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    "$url/api/v1/content/clauses" 2>/dev/null)

  local count
  count=$(echo "$response" | grep -o '"id"' | wc -l)

  if [[ "$count" -lt 1 ]]; then
    echo "No seed clauses found in response"
    return 1
  fi
}

check_export_job() {
  local url="$1"
  local token="$2"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -X POST \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d '{"contractId":"smoke-test-contract","format":"docx"}' \
    "$url/api/v1/export" 2>/dev/null)

  # Accept 201 (created), 202 (accepted), or 400 (validation error = endpoint works)
  if [[ "$status" != "201" && "$status" != "202" && "$status" != "400" ]]; then
    echo "Export endpoint returned HTTP $status (expected 201/202/400)"
    return 1
  fi
}

check_network_policies() {
  local count
  count=$(kc get networkpolicies --no-headers 2>/dev/null | wc -l)

  if [[ "$count" -lt 1 ]]; then
    echo "No NetworkPolicies found in namespace $NAMESPACE"
    return 1
  fi
}

check_secret_exists() {
  local secret_name="$1"
  kc get secret "$secret_name" -o name > /dev/null 2>&1
  if [[ $? -ne 0 ]]; then
    echo "Secret $secret_name not found"
    return 1
  fi
}

check_hpa_exists() {
  local count
  count=$(kc get hpa --no-headers 2>/dev/null | wc -l)

  if [[ "$count" -lt 1 ]]; then
    echo "No HorizontalPodAutoscalers found"
    return 1
  fi
}

check_ingress_exists() {
  local count
  count=$(kc get ingress --no-headers 2>/dev/null | wc -l)

  if [[ "$count" -lt 1 ]]; then
    echo "No Ingress resources found"
    return 1
  fi
}

check_certificates() {
  # Check for cert-manager Certificate resources
  local count
  count=$(kc get certificates --no-headers 2>/dev/null | wc -l)

  if [[ "$count" -lt 1 ]]; then
    # Fallback: check for TLS secrets (in case cert-manager CRDs not installed)
    count=$(kc get secrets --field-selector type=kubernetes.io/tls --no-headers 2>/dev/null | wc -l)
    if [[ "$count" -lt 1 ]]; then
      echo "No Certificate resources or TLS secrets found"
      return 1
    fi
  fi
}

# =============================================================================
# AUTO-DETECT API HOST
# =============================================================================
detect_api_host() {
  if [[ -n "$API_HOST" ]]; then
    echo "$API_HOST"
    return
  fi

  # Try to get host from Ingress
  local ingress_host
  ingress_host=$(kc get ingress -o jsonpath='{.items[0].spec.rules[0].host}' 2>/dev/null || true)

  if [[ -n "$ingress_host" && "$ingress_host" != "null" ]]; then
    # Check if TLS is configured
    local tls_host
    tls_host=$(kc get ingress -o jsonpath='{.items[0].spec.tls[0].hosts[0]}' 2>/dev/null || true)
    if [[ -n "$tls_host" && "$tls_host" != "null" ]]; then
      echo "https://$ingress_host"
    else
      echo "http://$ingress_host"
    fi
    return
  fi

  # Fallback: try port-forward URL
  echo "http://localhost:3000"
}

# Try to get a service account token or use provided token
get_auth_token() {
  # Check for SMOKE_TEST_TOKEN env var
  if [[ -n "${SMOKE_TEST_TOKEN:-}" ]]; then
    echo "$SMOKE_TEST_TOKEN"
    return
  fi

  # Try to get a token from a ServiceAccount
  local sa_secret
  sa_secret=$(kc get sa default -o jsonpath='{.secrets[0].name}' 2>/dev/null || true)

  if [[ -n "$sa_secret" && "$sa_secret" != "null" ]]; then
    kc get secret "$sa_secret" -o jsonpath='{.data.token}' 2>/dev/null | base64 -d
    return
  fi

  # Fallback: empty token (health check still works without auth)
  echo ""
}

# =============================================================================
# MAIN
# =============================================================================

echo ""
echo -e "${BOLD}${CYAN}============================================================${NC}"
echo -e "${BOLD}${CYAN}  Servanda Office - K8s Deployment Smoke Test${NC}"
echo -e "${BOLD}${CYAN}============================================================${NC}"
echo -e "  Namespace:  ${BOLD}$NAMESPACE${NC}"
echo -e "  Timestamp:  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

# --- Prerequisites ---
if ! command -v kubectl &> /dev/null; then
  echo -e "${RED}Error: kubectl not found in PATH${NC}"
  exit 1
fi

if ! kubectl $KUBECONFIG_FLAG cluster-info > /dev/null 2>&1; then
  echo -e "${RED}Error: Cannot connect to Kubernetes cluster${NC}"
  exit 1
fi

echo -e "${BOLD}[1/5] Core Resources${NC}"
echo -e "${CYAN}------------------------------------------------------------${NC}"

run_check "Namespace '$NAMESPACE' exists" "check_namespace"
run_check "Deployment 'servanda-api' ready" "check_deployment_ready servanda-api"
run_check "Deployment 'servanda-web' ready" "check_deployment_ready servanda-web"
run_check "Deployment 'servanda-export-worker' ready" "check_deployment_ready servanda-export-worker"
run_check "Service 'servanda-api' on port 3000" "check_service_exists servanda-api 3000"
run_check "Service 'servanda-web' on port 80" "check_service_exists servanda-web 80"
run_check "PostgreSQL StatefulSet ready" "check_statefulset_ready servanda-postgres"

echo ""
echo -e "${BOLD}[2/5] HTTP Endpoint Checks${NC}"
echo -e "${CYAN}------------------------------------------------------------${NC}"

if [[ "$SKIP_HTTP" == "true" ]]; then
  skip_check "Health endpoint (GET /api/v1/health)" "--skip-http flag set"
  skip_check "Seed data (GET /api/v1/content/clauses)" "--skip-http flag set"
  skip_check "Export job (POST /api/v1/export)" "--skip-http flag set"
else
  DETECTED_HOST=$(detect_api_host)
  AUTH_TOKEN=$(get_auth_token)
  echo -e "  ${YELLOW}Target: $DETECTED_HOST${NC}"
  echo ""

  run_check "Health endpoint (GET /api/v1/health -> 200)" "check_health_endpoint $DETECTED_HOST"

  if [[ -n "$AUTH_TOKEN" ]]; then
    run_check "Seed data present (GET /api/v1/content/clauses)" "check_seed_data $DETECTED_HOST $AUTH_TOKEN"
    run_check "Export endpoint reachable (POST /api/v1/export)" "check_export_job $DETECTED_HOST $AUTH_TOKEN"
  else
    skip_check "Seed data present (GET /api/v1/content/clauses)" "No auth token available"
    skip_check "Export endpoint reachable (POST /api/v1/export)" "No auth token available"
  fi
fi

echo ""
echo -e "${BOLD}[3/5] Network & Security${NC}"
echo -e "${CYAN}------------------------------------------------------------${NC}"

run_check "NetworkPolicies active" "check_network_policies"
run_check "Secret 'db-credentials' exists" "check_secret_exists db-credentials"
run_check "Secret 's3-credentials' exists" "check_secret_exists s3-credentials"

echo ""
echo -e "${BOLD}[4/5] Scaling & Ingress${NC}"
echo -e "${CYAN}------------------------------------------------------------${NC}"

run_check "HorizontalPodAutoscaler configured" "check_hpa_exists"
run_check "Ingress configured" "check_ingress_exists"

echo ""
echo -e "${BOLD}[5/5] TLS & Certificates${NC}"
echo -e "${CYAN}------------------------------------------------------------${NC}"

run_check "TLS Certificate ready" "check_certificates"

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo -e "${BOLD}${CYAN}============================================================${NC}"
echo -e "${BOLD}  SUMMARY${NC}"
echo -e "${CYAN}------------------------------------------------------------${NC}"

EFFECTIVE_TOTAL=$((TOTAL - SKIPPED))

if [[ $FAILED -eq 0 && $SKIPPED -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}ALL CHECKS PASSED: $PASSED/$TOTAL${NC}"
elif [[ $FAILED -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}PASSED: $PASSED/$EFFECTIVE_TOTAL${NC} (${YELLOW}$SKIPPED skipped${NC})"
else
  echo -e "  ${RED}${BOLD}FAILED: $FAILED/$EFFECTIVE_TOTAL checks failed${NC}"
  echo -e "  ${GREEN}Passed: $PASSED${NC} | ${RED}Failed: $FAILED${NC} | ${YELLOW}Skipped: $SKIPPED${NC}"
fi

echo -e "${CYAN}============================================================${NC}"
echo ""

if [[ $FAILED -gt 0 ]]; then
  exit 1
fi

exit 0
