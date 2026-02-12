#!/usr/bin/env bash
# =============================================================================
# Servanda Office Helm Chart Validation Script
# =============================================================================
# Validates Helm charts by running lint and template rendering.
# Usage: ./helm/validate.sh
# Exit codes:
#   0 = All validations passed
#   1 = One or more validations failed
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHART_DIR="${SCRIPT_DIR}/servanda-office"
ERRORS=0

# Colors for output (if terminal supports it)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; ERRORS=$((ERRORS + 1)); }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

echo "==========================================================================="
echo "  Servanda Office Helm Chart Validation"
echo "==========================================================================="
echo ""

# --- Check: Helm is installed ---
if ! command -v helm &>/dev/null; then
  fail "Helm CLI is not installed. Please install Helm 3.x."
  exit 1
fi

HELM_VERSION=$(helm version --short 2>/dev/null || echo "unknown")
info "Helm version: ${HELM_VERSION}"
echo ""

# --- Check: Chart.yaml exists ---
if [ -f "${CHART_DIR}/Chart.yaml" ]; then
  pass "Chart.yaml exists"
else
  fail "Chart.yaml not found at ${CHART_DIR}/Chart.yaml"
  exit 1
fi

# --- Check: values.yaml exists ---
if [ -f "${CHART_DIR}/values.yaml" ]; then
  pass "values.yaml exists"
else
  fail "values.yaml not found at ${CHART_DIR}/values.yaml"
fi

# --- Step 1: Helm Lint ---
echo ""
echo "--- Step 1: Helm Lint ---"
if helm lint "${CHART_DIR}" 2>&1; then
  pass "Helm lint passed"
else
  fail "Helm lint failed"
fi

# --- Step 2: Template Rendering (default values) ---
echo ""
echo "--- Step 2: Template Rendering (default values) ---"
if helm template servanda-office "${CHART_DIR}" \
  --values "${CHART_DIR}/values.yaml" \
  > /dev/null 2>&1; then
  pass "Template rendering with default values succeeded"
else
  fail "Template rendering with default values failed"
  echo "  Details:"
  helm template servanda-office "${CHART_DIR}" \
    --values "${CHART_DIR}/values.yaml" 2>&1 || true
fi

# --- Step 3: Template Rendering (HPA disabled) ---
echo ""
echo "--- Step 3: Template Rendering (HPA disabled) ---"
if helm template servanda-office "${CHART_DIR}" \
  --values "${CHART_DIR}/values.yaml" \
  --set hpa.enabled=false \
  > /dev/null 2>&1; then
  pass "Template rendering with HPA disabled succeeded"
else
  fail "Template rendering with HPA disabled failed"
fi

# --- Step 4: Template Rendering (Ingress disabled) ---
echo ""
echo "--- Step 4: Template Rendering (Ingress disabled) ---"
if helm template servanda-office "${CHART_DIR}" \
  --values "${CHART_DIR}/values.yaml" \
  --set ingress.enabled=false \
  > /dev/null 2>&1; then
  pass "Template rendering with Ingress disabled succeeded"
else
  fail "Template rendering with Ingress disabled failed"
fi

# --- Step 5: Template Rendering (OpenSearch enabled) ---
echo ""
echo "--- Step 5: Template Rendering (OpenSearch enabled) ---"
if helm template servanda-office "${CHART_DIR}" \
  --values "${CHART_DIR}/values.yaml" \
  --set opensearch.enabled=true \
  > /dev/null 2>&1; then
  pass "Template rendering with OpenSearch enabled succeeded"
else
  fail "Template rendering with OpenSearch enabled failed"
fi

# --- Step 6: Template Rendering (External Secrets) ---
echo ""
echo "--- Step 6: Template Rendering (External Secrets) ---"
if helm template servanda-office "${CHART_DIR}" \
  --values "${CHART_DIR}/values.yaml" \
  --set secrets.external.enabled=true \
  > /dev/null 2>&1; then
  pass "Template rendering with External Secrets succeeded"
else
  fail "Template rendering with External Secrets failed"
fi

# --- Step 7: Dry-run output (verbose) ---
echo ""
echo "--- Step 7: Full Template Output ---"
OUTPUT_FILE="/tmp/servanda-helm-template-output.yaml"
if helm template servanda-office "${CHART_DIR}" \
  --values "${CHART_DIR}/values.yaml" \
  > "${OUTPUT_FILE}" 2>&1; then
  RESOURCE_COUNT=$(grep -c '^kind:' "${OUTPUT_FILE}" 2>/dev/null || echo 0)
  pass "Full template rendered: ${RESOURCE_COUNT} Kubernetes resources generated"
  info "Output saved to: ${OUTPUT_FILE}"
else
  fail "Full template rendering failed"
fi

# --- Summary ---
echo ""
echo "==========================================================================="
if [ ${ERRORS} -eq 0 ]; then
  echo -e "  ${GREEN}All validations passed!${NC}"
  echo "==========================================================================="
  exit 0
else
  echo -e "  ${RED}${ERRORS} validation(s) failed.${NC}"
  echo "==========================================================================="
  exit 1
fi
